import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Préparation du trading réel — LECTURE SEULE.
 * Aucune signature, aucun envoi de transaction. LIVE_EXECUTION_ENABLED est
 * une constante littérale false : aucun chemin d'envoi n'existe dans ce code.
 */
export const LIVE_EXECUTION_ENABLED = false as const;

const SOL_MINT = "So11111111111111111111111111111111111111112";
const JUP = "https://lite-api.jup.ag";

export interface LivePrepStatus {
  liveExecutionEnabled: false;
  liveFlagSecret: "false" | "true" | "absent" | "other";
  secrets: Record<string, boolean>;
  turnkey: { ok: boolean; message: string; organizationName: string | null };
  signAddressValid: boolean;
  balanceSol: number | null;
  solPriceUsd: number | null;
  balanceUsd: number | null;
  checkedAt: string;
}

async function solPrice(): Promise<number | null> {
  try {
    const r = await fetch(`${JUP}/price/v3?ids=${SOL_MINT}`);
    if (!r.ok) return null;
    const j = (await r.json()) as Record<string, { usdPrice?: number }>;
    return j[SOL_MINT]?.usdPrice ?? null;
  } catch {
    return null;
  }
}

export const getLivePrepStatus = createServerFn({ method: "POST" }).handler(
  async (): Promise<LivePrepStatus> => {
    const { requireSettingsUnlocked } = await import("./settings-gate.server");
    await requireSettingsUnlocked();
    const env = (k: string) => process.env[k];
    const names = [
      "TURNKEY_API_PUBLIC_KEY", "TURNKEY_API_PRIVATE_KEY", "TURNKEY_ORGANIZATION_ID",
      "TURNKEY_SIGN_WITH", "LIVE_TRADING_ENABLED", "SOLANA_RPC_URL",
    ];
    const secrets = Object.fromEntries(names.map((n) => [n, Boolean(env(n))]));
    const flag = env("LIVE_TRADING_ENABLED")?.trim().toLowerCase();
    const liveFlagSecret = flag === undefined ? "absent" : flag === "false" ? "false" : flag === "true" ? "true" : "other";
    const signWith = env("TURNKEY_SIGN_WITH")?.trim() ?? "";
    const signAddressValid = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(signWith);

    // Turnkey : requête whoami (lecture seule, signée par la clé API).
    let turnkey: LivePrepStatus["turnkey"] = { ok: false, message: "Identifiants incomplets", organizationName: null };
    const pub = env("TURNKEY_API_PUBLIC_KEY")?.trim();
    const priv = env("TURNKEY_API_PRIVATE_KEY")?.trim();
    const org = env("TURNKEY_ORGANIZATION_ID")?.trim();
    if (pub && priv && org) {
      try {
        const { ApiKeyStamper } = await import("@turnkey/api-key-stamper");
        const stamper = new ApiKeyStamper({ apiPublicKey: pub, apiPrivateKey: priv });
        const body = JSON.stringify({ organizationId: org });
        const stamp = await stamper.stamp(body);
        const base = env("TURNKEY_API_BASE_URL")?.trim() || "https://api.turnkey.com";
        const r = await fetch(`${base}/public/v1/query/whoami`, {
          method: "POST",
          headers: { "content-type": "application/json", [stamp.stampHeaderName]: stamp.stampHeaderValue },
          body,
        });
        if (r.ok) {
          const j = (await r.json()) as { organizationName?: string };
          turnkey = { ok: true, message: "Connexion Turnkey vérifiée", organizationName: j.organizationName ?? null };
        } else {
          console.error("turnkey whoami", r.status);
          turnkey = { ok: false, message: `Turnkey a refusé la connexion (code ${r.status})`, organizationName: null };
        }
      } catch (e) {
        console.error("turnkey whoami error", e instanceof Error ? e.message : "unknown");
        turnkey = { ok: false, message: "Clé API illisible ou Turnkey injoignable", organizationName: null };
      }
    }

    let balanceSol: number | null = null;
    if (signAddressValid) {
      const { rpcCall } = await import("./solana-rpc.server");
      const res = await rpcCall<{ value: number }>("getBalance", [signWith, { commitment: "confirmed" }]);
      if (res) balanceSol = res.value / 1e9;
    }
    const solPriceUsd = await solPrice();
    return {
      liveExecutionEnabled: LIVE_EXECUTION_ENABLED,
      liveFlagSecret,
      secrets,
      turnkey,
      signAddressValid,
      balanceSol,
      solPriceUsd,
      balanceUsd: balanceSol !== null && solPriceUsd ? balanceSol * solPriceUsd : null,
      checkedAt: new Date().toISOString(),
    };
  },
);

export interface ShadowQuote {
  ok: boolean;
  message: string;
  side: "buy" | "sell";
  inAmountUsd: number;
  outTokens: number | null;
  priceImpactPct: number | null;
  route: string | null;
}

/** Devis Jupiter « fantôme » : on construit l'ordre, on ne signe ni n'envoie rien. */
export const getShadowQuote = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ mint: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/), usd: z.number().min(0.5).max(5) }).parse(d),
  )
  .handler(async ({ data }): Promise<ShadowQuote> => {
    const { requireSettingsUnlocked } = await import("./settings-gate.server");
    await requireSettingsUnlocked();
    const base = { side: "buy" as const, inAmountUsd: data.usd, outTokens: null, priceImpactPct: null, route: null };
    const price = await solPrice();
    if (!price) return { ...base, ok: false, message: "Prix du SOL indisponible" };
    const lamports = Math.floor((data.usd / price) * 1e9);
    try {
      const q = new URL(`${JUP}/swap/v1/quote`);
      q.searchParams.set("inputMint", SOL_MINT);
      q.searchParams.set("outputMint", data.mint);
      q.searchParams.set("amount", String(lamports));
      q.searchParams.set("slippageBps", "300");
      const r = await fetch(q);
      if (!r.ok) return { ...base, ok: false, message: `Aucune route d'achat (code ${r.status})` };
      const j = (await r.json()) as {
        outAmount?: string; priceImpactPct?: string;
        routePlan?: { swapInfo?: { label?: string } }[];
      };
      const decRes = await (await import("./solana-rpc.server")).rpcCall<{ value: { decimals: number } }>(
        "getTokenSupply", [data.mint],
      );
      const dec = decRes?.value.decimals ?? 6;
      return {
        ...base,
        ok: true,
        message: "Devis obtenu — rien n'a été signé ni envoyé",
        outTokens: j.outAmount ? Number(j.outAmount) / 10 ** dec : null,
        priceImpactPct: j.priceImpactPct ? Number(j.priceImpactPct) * 100 : null,
        route: j.routePlan?.map((s) => s.swapInfo?.label).filter(Boolean).join(" → ") || null,
      };
    } catch {
      return { ...base, ok: false, message: "Jupiter injoignable" };
    }
  });
