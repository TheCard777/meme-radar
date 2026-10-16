import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ME = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const BLOCKHASH = "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N";
const MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

// Base factice : chaque table renvoie une ligne fixe, quelle que soit la chaîne de filtres.
const tables: Record<string, unknown> = {};
const updates: { table: string; patch: Record<string, unknown> }[] = [];
const inserts: { table: string; row: Record<string, unknown> }[] = [];
function chain(table: string): unknown {
  const p: unknown = new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === "then")
          return (ok: (v: unknown) => void) => ok({ data: tables[table] ?? null, error: null });
        return (arg: Record<string, unknown>) => {
          if (prop === "update") updates.push({ table, patch: arg });
          if (prop === "insert") inserts.push({ table, row: arg });
          return p;
        };
      },
    },
  );
  return p;
}
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (t: string) => chain(t) },
}));
vi.mock("./market.server", () => ({
  fetchMarketMetrics: async (mints: string[]) =>
    new Map(mints.map((m) => [m, { priceUsd: 0.001 }])),
}));
vi.mock("@turnkey/api-key-stamper", () => ({
  ApiKeyStamper: class {
    async stamp() {
      return { stampHeaderName: "X-Stamp", stampHeaderValue: "test" };
    }
  },
}));

const rpcCalls: string[] = [];
let turnkeyReply: (unsignedHex: string) => { status: number; body: unknown };
const signedOk = (hex: string) => ({
  status: 200,
  body: {
    activity: {
      status: "ACTIVITY_STATUS_COMPLETED",
      result: { signTransactionResult: { signedTransaction: hex } },
    },
  },
});
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  rpcCalls.length = 0;
  updates.length = 0;
  inserts.length = 0;
  tables["bot_settings"] = { live_kill_switch: false, live_trading_armed: true };
  tables["trade_positions"] = [];
  vi.stubEnv("SOLANA_RPC_URL", "https://rpc.test");
  vi.stubEnv("TURNKEY_SIGN_WITH", ME);
  vi.stubEnv("LIVE_TRADING_ENABLED", "false");
  turnkeyReply = signedOk;
  vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (String(url).includes("turnkey")) {
      const r = turnkeyReply(body.parameters.unsignedTransaction);
      return json(r.status, r.body);
    }
    rpcCalls.push(body.method);
    if (body.method === "getLatestBlockhash")
      return json(200, { result: { value: { blockhash: BLOCKHASH } } });
    if (body.method === "simulateTransaction")
      return json(200, { result: { value: { err: "AccountNotFound" } } });
    return json(200, { result: "SIGNATURE" });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("test de signature Turnkey", () => {
  it("signe, simule, n'envoie jamais ; compte non financé = non concluant", async () => {
    const { testTurnkeySignature } = await import("./live-trading.server");
    const r = await testTurnkeySignature();
    expect(r.signature.ok).toBe(true);
    expect(r.simulation.ok).toBeNull();
    expect(r.simulation.detail).toMatch(/non financé/);
    expect(rpcCalls).not.toContain("sendTransaction");
    expect(rpcCalls.filter((m) => m === "simulateTransaction")).toHaveLength(1);
  });

  it("signale une policy qui laisse signer un virement externe", async () => {
    const { testTurnkeySignature } = await import("./live-trading.server");
    expect((await testTurnkeySignature()).externalTransfer.refused).toBe(false);
  });

  it("reconnaît une policy qui refuse le virement externe", async () => {
    // 3 comptes dans le message = virement vers une autre adresse.
    turnkeyReply = (hex) =>
      hex.slice(130, 138) === "01000103"
        ? { status: 200, body: { activity: { status: "ACTIVITY_STATUS_REJECTED" } } }
        : signedOk(hex);
    const { testTurnkeySignature } = await import("./live-trading.server");
    const r = await testTurnkeySignature();
    expect(r.signature.ok).toBe(true);
    expect(r.externalTransfer.refused).toBe(true);
  });

  it("une erreur hors policy reste indéterminée", async () => {
    turnkeyReply = () => ({ status: 500, body: {} });
    const { testTurnkeySignature } = await import("./live-trading.server");
    const r = await testTurnkeySignature();
    expect(r.signature.ok).toBe(false);
    expect(r.simulation.ok).toBeNull();
    expect(r.externalTransfer.refused).toBeNull();
  });

  it("bloqué par l'arrêt d'urgence", async () => {
    tables["bot_settings"] = { live_kill_switch: true, live_trading_armed: false };
    const { testTurnkeySignature } = await import("./live-trading.server");
    await expect(testTurnkeySignature()).rejects.toThrow(/urgence/);
    expect(rpcCalls).toHaveLength(0);
  });
});

const ORDER_ID = "00000000-0000-4000-8000-000000000001";
const order = () => ({
  id: ORDER_ID,
  side: "buy",
  mint: MINT,
  symbol: "TST",
  usd_amount: 5,
  expected_out_raw: "5000000000",
  out_decimals: 6,
  price_usd: 0.001,
  liquidity_usd: 25_000,
  slippage_bps: 300,
  price_impact_pct: 0.5,
  fee_lamports: 100_000,
  unsigned_tx: "AQAB",
  expires_at: new Date(Date.now() + 30_000).toISOString(),
});

/** Simulation réussie ; `statuses` répond à getSignatureStatuses. */
function stubNetwork(statuses: () => Response = () => json(200, { result: { value: [null] } })) {
  const base = globalThis.fetch;
  vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (body.method === "simulateTransaction") {
      rpcCalls.push(body.method);
      return json(200, { result: { value: { err: null } } });
    }
    if (body.method === "getSignatureStatuses") return statuses();
    return base(url, init);
  });
}

describe("validation d'ordre avec LIVE_TRADING_ENABLED=false", () => {
  it("signe et simule à blanc, sans sendTransaction", async () => {
    tables["trade_orders"] = order();
    stubNetwork();
    const { confirmOrder } = await import("./live-trading.server");
    const r = await confirmOrder(ORDER_ID);
    expect(r.status).toBe("dry_run");
    expect(r.message).toMatch(/LIVE_TRADING_ENABLED/);
    expect(rpcCalls.filter((m) => m === "simulateTransaction")).toHaveLength(1);
    expect(rpcCalls).not.toContain("sendTransaction");
    expect(updates.at(-1)?.patch).toMatchObject({ status: "cancelled" });
    expect(inserts).toHaveLength(0);
  });
});

describe("envoi réel : suivi de la confirmation", () => {
  beforeEach(() => {
    vi.stubEnv("LIVE_TRADING_ENABLED", "true");
    tables["trade_orders"] = order();
    vi.useFakeTimers({ toFake: ["setTimeout"] });
  });
  afterEach(() => vi.useRealTimers());

  async function confirm() {
    const { confirmOrder } = await import("./live-trading.server");
    const p = confirmOrder(ORDER_ID);
    let done = false;
    void p.finally(() => (done = true));
    while (!done) await vi.advanceTimersByTimeAsync(2_000);
    return p;
  }

  it("achat non confirmé en 30 s : position enregistrée par prudence", async () => {
    stubNetwork();
    const r = await confirm();
    expect(rpcCalls).toContain("sendTransaction");
    expect(r.status).toBe("sent");
    expect(r.message).toMatch(/position enregistrée/);
    expect(inserts).toEqual([
      {
        table: "trade_positions",
        row: expect.objectContaining({ mint: MINT, buy_signature: "SIGNATURE" }),
      },
    ]);
  });

  it("erreur RPC pendant le suivi : pas marqué échoué, position enregistrée", async () => {
    stubNetwork(() => json(200, { error: { message: "rate limited" } }));
    const r = await confirm();
    expect(r.status).toBe("sent");
    expect(inserts).toHaveLength(1);
  });

  it("achat confirmé : position enregistrée", async () => {
    stubNetwork(() =>
      json(200, { result: { value: [{ confirmationStatus: "confirmed", err: null }] } }),
    );
    const r = await confirm();
    expect(r.message).toBe("Transaction confirmée.");
    expect(inserts).toHaveLength(1);
  });

  it("transaction rejetée par le réseau : aucune position", async () => {
    stubNetwork(() =>
      json(200, { result: { value: [{ err: { InstructionError: [0, "Custom"] } }] } }),
    );
    const r = await confirm();
    expect(r.status).toBe("failed");
    expect(inserts).toHaveLength(0);
  });
});
