import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ME = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const BLOCKHASH = "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N";
const MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

// Base factice : chaque table renvoie une ligne fixe, quelle que soit la chaîne de filtres.
const tables: Record<string, unknown> = {};
const updates: { table: string; patch: Record<string, unknown> }[] = [];
function chain(table: string): unknown {
  const p: unknown = new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === "then")
          return (ok: (v: unknown) => void) => ok({ data: tables[table] ?? null, error: null });
        return (arg: Record<string, unknown>) => {
          if (prop === "update") updates.push({ table, patch: arg });
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

describe("validation d'ordre avec LIVE_TRADING_ENABLED=false", () => {
  it("signe et simule à blanc, sans sendTransaction", async () => {
    tables["trade_orders"] = {
      id: "00000000-0000-4000-8000-000000000001",
      side: "buy",
      mint: MINT,
      symbol: "TST",
      usd_amount: 5,
      expected_out_raw: "5000000000",
      out_decimals: 6,
      price_usd: 0.001,
      slippage_bps: 300,
      price_impact_pct: 0.5,
      fee_lamports: 100_000,
      unsigned_tx: "AQAB",
      expires_at: new Date(Date.now() + 30_000).toISOString(),
    };
    rpcCalls.length = 0;
    const sim = vi.fn(() => json(200, { result: { value: { err: null } } }));
    const base = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (body.method === "simulateTransaction") {
        rpcCalls.push(body.method);
        return sim();
      }
      return base(url, init);
    });
    const { confirmOrder } = await import("./live-trading.server");
    const r = await confirmOrder("00000000-0000-4000-8000-000000000001");
    expect(r.status).toBe("dry_run");
    expect(r.message).toMatch(/LIVE_TRADING_ENABLED/);
    expect(sim).toHaveBeenCalledOnce();
    expect(rpcCalls).not.toContain("sendTransaction");
    expect(updates.at(-1)?.patch).toMatchObject({ status: "cancelled" });
  });
});
