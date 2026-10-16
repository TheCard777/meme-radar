/**
 * Exécution réelle — SERVEUR UNIQUEMENT.
 * Chaque ordre : devis Jupiter → ordre « en attente » 60 s → validation
 * manuelle → re-vérifications → signature Turnkey → simulation RPC →
 * envoi (seulement si LIVE_TRADING_ENABLED=true ET trading armé ET pas
 * d'arrêt d'urgence). Sinon : signature + simulation uniquement (test à blanc).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { allPass, liveBuyBlocker, LIVE_RULES, preflight, sendBlocker, type PreflightCheck } from "./live-orders";
import { evaluateEligibility, isPostMigrationDex, type MarketView } from "./paper-strategy";
import { INCINERATOR, toB64, zeroTransferTx } from "./solana-test-tx";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const JUP = "https://lite-api.jup.ag";

async function db(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}
const env = (k: string) => process.env[k]?.trim() ?? "";
const signer = () => env("TURNKEY_SIGN_WITH");

const b64ToHex = (b64: string) =>
  Array.from(atob(b64), (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
const hexToB64 = (hex: string) => {
  let s = "";
  for (let i = 0; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return btoa(s);
};

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const r = await fetch(env("SOLANA_RPC_URL"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = (await r.json()) as { result?: T; error?: { message?: string } };
  if (j.error) throw new Error(`RPC ${method}: ${j.error.message ?? "erreur"}`);
  return j.result as T;
}

export async function solPriceUsd(): Promise<number> {
  const r = await fetch(`${JUP}/price/v3?ids=${SOL_MINT}`);
  const j = (await r.json()) as Record<string, { usdPrice?: number }>;
  const p = j[SOL_MINT]?.usdPrice;
  if (!p) throw new Error("Prix du SOL indisponible");
  return p;
}

async function decimals(mint: string): Promise<number> {
  const r = await rpc<{ value: { decimals: number } }>("getTokenSupply", [mint]);
  return r.value.decimals;
}

export async function loadMarketView(mint: string): Promise<MarketView | null> {
  const d = await db();
  const { data: r } = await d
    .from("tokens")
    .select("id, mint_address, symbol, launched_at, score, score_confidence, data_sufficient, risk_score, risk_confidence")
    .eq("is_simulated", false)
    .eq("mint_address", mint)
    .maybeSingle();
  if (!r) return null;
  const { fetchMarketMetrics } = await import("./market.server");
  const m = (await fetchMarketMetrics([mint])).get(mint);
  const launched = Date.parse(r.launched_at);
  return {
    tokenId: r.id, mint, symbol: m?.symbol ?? r.symbol,
    ageMinutes: Number.isFinite(launched) ? (Date.now() - launched) / 60_000 : null,
    dex: m?.dex ?? null, postMigrationPool: isPostMigrationDex(m?.dex ?? null),
    opportunityScore: r.data_sufficient ? r.score : null, opportunityConfidence: r.score_confidence ?? null,
    riskScore: r.risk_score ?? null, riskConfidence: r.risk_confidence ?? null,
    liquidityUsd: m?.liquidityUsd ?? null, volume1h: m?.volume1h ?? null,
    volume5m: m?.volume5m ?? null, priceUsd: m?.priceUsd ?? null,
  };
}

async function gates() {
  const d = await db();
  const { data } = await d.from("bot_settings").select("live_kill_switch, live_trading_armed").limit(1).maybeSingle();
  return {
    envFlag: env("LIVE_TRADING_ENABLED").toLowerCase() === "true",
    armed: Boolean(data?.live_trading_armed),
    killSwitch: Boolean(data?.live_kill_switch),
  };
}

async function capitalState(nowIso: string) {
  const d = await db();
  const since = new Date(Date.parse(nowIso) - 3 * 86_400_000).toISOString();
  const { data, error } = await d
    .from("trade_positions")
    .select("mint, stake_usd, opened_at, status, closed_at, realized_pnl_usd, entry_price_usd")
    .or(`status.eq.open,opened_at.gte.${since},closed_at.gte.${since}`);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const today = nowIso.slice(0, 10);
  const realized = rows
    .filter((p) => p.closed_at?.slice(0, 10) === today)
    .reduce((s, p) => s + Number(p.realized_pnl_usd ?? 0), 0);
  let unrealized = 0;
  const open = rows.filter((p) => p.status === "open");
  if (open.length) {
    const { fetchMarketMetrics } = await import("./market.server");
    const m = await fetchMarketMetrics(open.map((p) => p.mint));
    for (const p of open) {
      const px = m.get(p.mint)?.priceUsd;
      if (px) unrealized += Number(p.stake_usd) * (px / Number(p.entry_price_usd) - 1);
    }
  }
  return {
    positions: rows.map((p) => ({ mint: p.mint, stakeUsd: Number(p.stake_usd), openedAt: p.opened_at, status: p.status })),
    realized, unrealized,
  };
}

interface JupQuote {
  inputMint: string; outputMint: string; inAmount: string; outAmount: string;
  otherAmountThreshold: string; priceImpactPct: string; slippageBps: number;
  routePlan?: { swapInfo?: { label?: string } }[];
}

async function quoteAndBuild(input: string, output: string, amount: string) {
  const q = new URL(`${JUP}/swap/v1/quote`);
  q.searchParams.set("inputMint", input);
  q.searchParams.set("outputMint", output);
  q.searchParams.set("amount", amount);
  q.searchParams.set("slippageBps", String(LIVE_RULES.maxSlippageBps));
  const qr = await fetch(q);
  if (!qr.ok) throw new Error(`Aucune route Jupiter (code ${qr.status})`);
  const quote = (await qr.json()) as JupQuote;
  const sr = await fetch(`${JUP}/swap/v1/swap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: signer(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 1_000_000, priorityLevel: "high" } },
    }),
  });
  if (!sr.ok) throw new Error(`Jupiter n'a pas construit la transaction (code ${sr.status})`);
  const swap = (await sr.json()) as { swapTransaction: string; prioritizationFeeLamports?: number };
  return { quote, tx: swap.swapTransaction, feeLamports: 5_000 + (swap.prioritizationFeeLamports ?? 0) };
}

const expiry = () => new Date(Date.now() + LIVE_RULES.orderTtlSeconds * 1000).toISOString();

export async function createBuyOrder(mint: string) {
  const g = await gates();
  if (g.killSwitch) throw new Error("Arrêt d'urgence actif : aucun nouvel ordre");
  if (!signer()) throw new Error("TURNKEY_SIGN_WITH manquant");
  const view = await loadMarketView(mint);
  if (!view) throw new Error("Token inconnu du radar");
  const el = evaluateEligibility(view, LIVE_RULES);
  if (!el.eligible) {
    const failed = el.checks.filter((c) => c.pass !== true).map((c) =>
      `${c.pass === null ? "Donnée manquante" : "Refusé"} — ${c.label} : ${c.detail}`);
    throw Object.assign(new Error(`Token non éligible :\n${failed.join("\n")}`), { reasons: failed });
  }
  const nowIso = new Date().toISOString();
  const cap = await capitalState(nowIso);
  const block = liveBuyBlocker(cap.positions, mint, nowIso, cap.realized, cap.unrealized);
  if (block) throw new Error(block);
  const sol = await solPriceUsd();
  const lamports = Math.floor((LIVE_RULES.stakeUsd / sol) * 1e9);
  const dec = await decimals(mint);
  const { quote, tx, feeLamports } = await quoteAndBuild(SOL_MINT, mint, String(lamports));
  const outTokens = Number(quote.outAmount) / 10 ** dec;
  const d = await db();
  const { data, error } = await d.from("trade_orders").insert({
    side: "buy", mint, symbol: view.symbol, usd_amount: LIVE_RULES.stakeUsd,
    in_amount_raw: quote.inAmount, expected_out_raw: quote.outAmount, min_out_raw: quote.otherAmountThreshold,
    out_decimals: dec, price_usd: outTokens > 0 ? LIVE_RULES.stakeUsd / outTokens : null,
    liquidity_usd: view.liquidityUsd, slippage_bps: quote.slippageBps,
    price_impact_pct: Number(quote.priceImpactPct) * 100, fee_lamports: feeLamports,
    route: quote.routePlan?.map((s) => s.swapInfo?.label).filter(Boolean).join(" → ") ?? null,
    unsigned_tx: tx, expires_at: expiry(),
  }).select("id").single();
  if (error) throw new Error(error.code === "23505" ? "Un ordre est déjà en attente pour ce token" : error.message);
  return data.id as string;
}

export async function createSellOrder(positionId: string, exitReason: string | null) {
  const g = await gates();
  if (g.killSwitch) throw new Error("Arrêt d'urgence actif : aucun nouvel ordre");
  const d = await db();
  const { data: p } = await d.from("trade_positions").select("*").eq("id", positionId).eq("status", "open").maybeSingle();
  if (!p) throw new Error("Position introuvable ou déjà fermée");
  const bal = await rpc<{ value: { account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } }[] }>(
    "getTokenAccountsByOwner", [signer(), { mint: p.mint }, { encoding: "jsonParsed", commitment: "confirmed" }],
  );
  const raw = bal.value.reduce((s, a) => s + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n);
  if (raw <= 0n) throw new Error("Aucun token sur le compte SMD pour cette position");
  const sol = await solPriceUsd();
  const { quote, tx, feeLamports } = await quoteAndBuild(p.mint, SOL_MINT, raw.toString());
  const outUsd = (Number(quote.outAmount) / 1e9) * sol;
  const view = await loadMarketView(p.mint);
  const { data, error } = await d.from("trade_orders").insert({
    side: "sell", mint: p.mint, symbol: p.symbol, position_id: p.id, usd_amount: outUsd,
    in_amount_raw: quote.inAmount, expected_out_raw: quote.outAmount, min_out_raw: quote.otherAmountThreshold,
    out_decimals: 9, price_usd: view?.priceUsd ?? null, liquidity_usd: view?.liquidityUsd ?? null,
    slippage_bps: quote.slippageBps, price_impact_pct: Number(quote.priceImpactPct) * 100, fee_lamports: feeLamports,
    route: quote.routePlan?.map((s) => s.swapInfo?.label).filter(Boolean).join(" → ") ?? null,
    exit_reason: exitReason, unsigned_tx: tx, expires_at: expiry(),
  }).select("id").single();
  if (error) throw new Error(error.code === "23505" ? "Une vente est déjà en attente pour ce token" : error.message);
  return data.id as string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrderRow = any;

export async function orderChecks(o: OrderRow, nowIso = new Date().toISOString()): Promise<PreflightCheck[]> {
  let market: number | null = null;
  if (o.side === "buy") {
    const { fetchMarketMetrics } = await import("./market.server");
    market = (await fetchMarketMetrics([o.mint])).get(o.mint)?.priceUsd ?? null;
  }
  return preflight({
    side: o.side, usdAmount: Number(o.usd_amount), quoteMint: o.mint, expectedMint: o.mint,
    slippageBps: o.slippage_bps, priceImpactPct: o.price_impact_pct === null ? null : Number(o.price_impact_pct),
    feeLamports: Number(o.fee_lamports), quotePriceUsd: o.price_usd === null ? null : Number(o.price_usd),
    marketPriceUsd: market, expectedOutRaw: o.expected_out_raw, expiresAt: o.expires_at, nowIso,
  });
}

async function turnkeySign(unsignedB64: string): Promise<string> {
  const { ApiKeyStamper } = await import("@turnkey/api-key-stamper");
  const stamper = new ApiKeyStamper({ apiPublicKey: env("TURNKEY_API_PUBLIC_KEY"), apiPrivateKey: env("TURNKEY_API_PRIVATE_KEY") });
  const body = JSON.stringify({
    type: "ACTIVITY_TYPE_SIGN_TRANSACTION_V2",
    timestampMs: String(Date.now()),
    organizationId: env("TURNKEY_ORGANIZATION_ID"),
    parameters: { signWith: signer(), unsignedTransaction: b64ToHex(unsignedB64), type: "TRANSACTION_TYPE_SOLANA" },
  });
  const st = await stamper.stamp(body);
  const r = await fetch(`${env("TURNKEY_API_BASE_URL") || "https://api.turnkey.com"}/public/v1/submit/sign_transaction`, {
    method: "POST", headers: { "content-type": "application/json", [st.stampHeaderName]: st.stampHeaderValue }, body,
  });
  const j = (await r.json()) as {
    activity?: { status?: string; result?: { signTransactionResult?: { signedTransaction?: string } } };
    message?: string;
  };
  const signed = j.activity?.result?.signTransactionResult?.signedTransaction;
  if (!r.ok || !signed) {
    const s = j.activity?.status;
    const byRules = s === "ACTIVITY_STATUS_CONSENSUS_NEEDED" || s === "ACTIVITY_STATUS_REJECTED";
    throw Object.assign(
      new Error(
        byRules
          ? "Refusé par les règles de sécurité Turnkey"
          : r.status === 403
            ? "Turnkey refuse : aucune règle (policy) n'autorise encore cette signature"
            : `Signature Turnkey échouée (${r.status})`,
      ),
      { policyDenied: byRules || r.status === 403 },
    );
  }
  return hexToB64(signed);
}

async function finish(id: string, patch: OrderRow) {
  const d = await db();
  await d.from("trade_orders").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}

export interface ConfirmResult { status: string; message: string; signature: string | null }

export async function confirmOrder(id: string): Promise<ConfirmResult> {
  const d = await db();
  // Verrou atomique : un seul passage pending → sending, avant l'expiration.
  const { data: o } = await d.from("trade_orders")
    .update({ status: "sending", updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "pending").gt("expires_at", new Date().toISOString())
    .select("*").maybeSingle();
  if (!o) {
    await d.from("trade_orders").update({ status: "expired" }).eq("id", id).eq("status", "pending");
    return { status: "expired", message: "Ordre expiré ou déjà traité", signature: null };
  }
  try {
    const g = await gates();
    if (g.killSwitch) throw Object.assign(new Error("Arrêt d'urgence actif"), { cancel: true });
    if (o.side === "buy") {
      const nowIso = new Date().toISOString();
      const cap = await capitalState(nowIso);
      const b = liveBuyBlocker(cap.positions, o.mint, nowIso, cap.realized, cap.unrealized);
      if (b) throw Object.assign(new Error(b), { cancel: true });
    }
    const checks = await orderChecks(o);
    if (!allPass(checks)) {
      const bad = checks.filter((c) => !c.pass).map((c) => `${c.label} : ${c.detail}`).join(", ");
      throw Object.assign(new Error(`Vérification échouée — ${bad}`), { cancel: true });
    }
    const signed = await turnkeySign(o.unsigned_tx);
    const sim = await rpc<{ value: { err: unknown; logs?: string[] } }>("simulateTransaction", [
      signed, { encoding: "base64", sigVerify: true, commitment: "processed" },
    ]);
    if (sim.value.err) throw new Error(`Simulation refusée par le réseau : ${JSON.stringify(sim.value.err)}`);

    const blocked = sendBlocker(g);
    if (blocked) {
      await finish(id, { status: "cancelled", error: `Test à blanc réussi (signé + simulé), non envoyé : ${blocked}` });
      return { status: "dry_run", message: `Signé et simulé avec succès. Non envoyé : ${blocked}.`, signature: null };
    }

    const sig = await rpc<string>("sendTransaction", [signed, { encoding: "base64", skipPreflight: true, maxRetries: 3 }]);
    await finish(id, { status: "sent", signature: sig });
    let confirmed = false;
    let txErr: unknown = null;
    for (let i = 0; i < 15 && !confirmed; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      // Une erreur RPC ici ne prouve pas l'échec de la transaction : on continue d'attendre.
      const st = await rpc<{ value: ({ confirmationStatus?: string; err: unknown } | null)[] }>(
        "getSignatureStatuses", [[sig]],
      ).catch(() => null);
      const s = st?.value[0];
      if (s?.err) { txErr = s.err; break; }
      if (s?.confirmationStatus === "confirmed" || s?.confirmationStatus === "finalized") confirmed = true;
    }
    if (txErr) {
      await finish(id, { status: "failed", error: `Transaction rejetée : ${JSON.stringify(txErr)}` });
      return { status: "failed", message: "Transaction échouée sur le réseau, rien n'a été échangé (hors frais).", signature: sig };
    }
    // Achat : position enregistrée même sans confirmation, pour que les plafonds la comptent et que la
    // vente reste possible. Côté prudent : si l'achat n'est jamais passé, la vente échouera faute de tokens.
    if (o.side === "buy") {
      const { error: pe } = await d.from("trade_positions").insert({
        mint: o.mint, symbol: o.symbol, stake_usd: o.usd_amount, token_amount_raw: o.expected_out_raw,
        token_decimals: o.out_decimals, entry_price_usd: o.price_usd, entry_liquidity_usd: o.liquidity_usd,
        buy_signature: sig,
      });
      if (pe) {
        await finish(id, { error: `Achat envoyé mais position non enregistrée : ${pe.message}` });
        return { status: "sent", message: `Achat envoyé mais position non enregistrée (${pe.message}). Vérifiez sur Solscan.`, signature: sig };
      }
    }
    if (!confirmed) {
      await finish(id, { error: "Envoyée, confirmation non reçue en 30 s — vérifiez sur Solscan" });
      return {
        status: "sent",
        message: o.side === "buy"
          ? "Achat envoyé mais pas encore confirmé : position enregistrée par prudence. Vérifiez sur Solscan."
          : "Vente envoyée mais pas encore confirmée : position laissée ouverte. Vérifiez sur Solscan.",
        signature: sig,
      };
    }
    if (o.side === "sell" && o.position_id) {
      const { data: p } = await d.from("trade_positions").select("stake_usd").eq("id", o.position_id).single();
      await d.from("trade_positions").update({
        status: "closed", closed_at: new Date().toISOString(), exit_reason: o.exit_reason ?? "manuel",
        realized_pnl_usd: Number(o.usd_amount) - Number(p?.stake_usd ?? 0), sell_signature: sig,
      }).eq("id", o.position_id);
    }
    return { status: "sent", message: "Transaction confirmée.", signature: sig };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    const cancel = Boolean((e as { cancel?: boolean }).cancel);
    await finish(id, { status: cancel ? "cancelled" : "failed", error: msg });
    return { status: cancel ? "cancelled" : "failed", message: msg, signature: null };
  }
}

export async function cancelOrder(id: string) {
  const d = await db();
  await d.from("trade_orders").update({ status: "cancelled", error: "Annulé par vous" }).eq("id", id).eq("status", "pending");
}

export async function setKillSwitch(on: boolean) {
  const d = await db();
  const { data: s } = await d.from("bot_settings").select("id").limit(1).single();
  const patch: Record<string, boolean> = { live_kill_switch: on };
  if (on) patch["live_trading_armed"] = false;
  await d.from("bot_settings").update(patch).eq("id", s?.id);
  if (on) await d.from("trade_orders").update({ status: "cancelled", error: "Arrêt d'urgence" }).eq("status", "pending");
}

export async function setArmed(on: boolean) {
  const g = await gates();
  if (on && g.killSwitch) throw new Error("Désactivez d'abord l'arrêt d'urgence");
  const d = await db();
  const { data: s } = await d.from("bot_settings").select("id").limit(1).single();
  await d.from("bot_settings").update({ live_trading_armed: on }).eq("id", s?.id);
}

export async function liveOverview() {
  const d = await db();
  const nowIso = new Date().toISOString();
  await d.from("trade_orders").update({ status: "expired" }).eq("status", "pending").lt("expires_at", nowIso);
  const [g, orders, positions] = await Promise.all([
    gates(),
    d.from("trade_orders").select("id, side, mint, symbol, usd_amount, expected_out_raw, min_out_raw, out_decimals, price_usd, slippage_bps, price_impact_pct, fee_lamports, route, exit_reason, status, signature, error, expires_at, created_at").order("created_at", { ascending: false }).limit(20),
    d.from("trade_positions").select("*").order("opened_at", { ascending: false }).limit(20),
  ]);
  const pending = (orders.data ?? []).filter((o) => o.status === "pending");
  const checks: Record<string, PreflightCheck[]> = {};
  for (const o of pending) checks[o.id] = await orderChecks(o, nowIso);
  // Ventes suggérées par les règles de sortie (validation manuelle toujours requise).
  const { exitReasonFor } = await import("./paper-strategy");
  const suggestions: Record<string, string | null> = {};
  for (const p of (positions.data ?? []).filter((x) => x.status === "open")) {
    const v = await loadMarketView(p.mint);
    const lite = {
      id: p.id, tokenId: p.id, mint: p.mint, symbol: p.symbol, stakeUsd: Number(p.stake_usd),
      entryPrice: Number(p.entry_price_usd), entryLiquidityUsd: Number(p.entry_liquidity_usd ?? 0),
      openedAt: p.opened_at, lastPrice: v?.priceUsd ?? Number(p.entry_price_usd), lastPriceAt: nowIso,
    };
    suggestions[p.id] = exitReasonFor(lite, v ?? undefined, nowIso, LIVE_RULES);
  }
  return {
    gates: g, orders: orders.data ?? [], positions: positions.data ?? [], checks, suggestions,
    dbError: orders.error?.message ?? positions.error?.message ?? null,
  };
}

/* ---------- Test de signature Turnkey (jamais envoyé) ---------- */

export interface SignatureTest {
  /** La policy a-t-elle accepté de signer l'auto-virement 0 SOL ? */
  signature: { ok: boolean; detail: string };
  /** null = non concluante : non lancée, ou compte SMD non financé (échec attendu). */
  simulation: { ok: boolean | null; detail: string };
  /** Sonde : virement 0 SOL vers une autre adresse. refused=true est le résultat sûr. */
  externalTransfer: { refused: boolean | null; detail: string };
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "erreur");

async function simulateSigned(signed: string): Promise<SignatureTest["simulation"]> {
  try {
    // sigVerify : le RPC rejette en erreur JSON-RPC une signature invalide, avant toute simulation.
    const sim = await rpc<{ value: { err: unknown } }>("simulateTransaction", [
      signed, { encoding: "base64", sigVerify: true, commitment: "processed" },
    ]);
    const err = sim.value.err;
    if (!err) return { ok: true, detail: "Réussie" };
    const raw = JSON.stringify(err);
    if (err === "AccountNotFound" || raw.includes("InsufficientFundsForFee"))
      return { ok: null, detail: `Signature vérifiée par le réseau ; échec attendu : compte SMD non financé (${raw})` };
    return { ok: false, detail: `Refusée par le réseau : ${raw}` };
  } catch (e) {
    return { ok: false, detail: `Indisponible : ${errMsg(e)}` };
  }
}

/**
 * 1. Auto-virement 0 SOL SMD → SMD : signé par Turnkey puis simulé.
 * 2. Sonde : virement 0 SOL SMD → adresse externe, signé puis jeté (ni simulé ni envoyé),
 *    pour savoir si la policy laisse signer des virements arbitraires.
 * N'appelle JAMAIS sendTransaction, indépendant des 3 verrous.
 */
export async function testTurnkeySignature(): Promise<SignatureTest> {
  const g = await gates();
  if (g.killSwitch) throw new Error("Arrêt d'urgence actif");
  const me = signer();
  if (!me) throw new Error("TURNKEY_SIGN_WITH manquant");
  const { value } = await rpc<{ value: { blockhash: string } }>("getLatestBlockhash", [{ commitment: "confirmed" }]);

  let signature: SignatureTest["signature"];
  let simulation: SignatureTest["simulation"] = { ok: null, detail: "Non lancée (aucune signature)" };
  try {
    const signed = await turnkeySign(toB64(zeroTransferTx(me, me, value.blockhash)));
    signature = { ok: true, detail: "Acceptée par la policy, signature produite" };
    simulation = await simulateSigned(signed);
  } catch (e) {
    signature = { ok: false, detail: errMsg(e) };
  }

  let externalTransfer: SignatureTest["externalTransfer"];
  try {
    await turnkeySign(toB64(zeroTransferTx(me, INCINERATOR, value.blockhash)));
    externalTransfer = {
      refused: false,
      detail: "Signée : la policy autorise un virement vers une autre adresse. Si la clé API fuit, le compte SMD peut être vidé. Restreindre la policy avant de le financer.",
    };
  } catch (e) {
    externalTransfer = (e as { policyDenied?: boolean }).policyDenied
      ? { refused: true, detail: "Refusée par la policy : les virements vers d'autres adresses sont bloqués" }
      : { refused: null, detail: `Indéterminé : ${errMsg(e)}` };
  }
  return { signature, simulation, externalTransfer };
}
