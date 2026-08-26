/**
 * Analyse des premiers acheteurs réels — SERVEUR / WORKER UNIQUEMENT.
 *
 * Source unique : le RPC Solana déjà configuré (SOLANA_RPC_URL), en LECTURE
 * SEULE. On lit les premières transactions connues d'un mint, on identifie les
 * comptes dont le solde du token augmente (= achat/réception initiale) et on
 * enregistre ces adresses publiques comme « entrées précoces ».
 *
 * Règles strictes :
 * - Aucune identité hors chaîne. Uniquement des adresses publiques.
 * - Aucune métrique inventée : PnL et multiples restent `null` (inconnus) tant
 *   qu'ils ne sont pas calculables de façon fiable.
 * - Un Smart Wallet Score n'est attribué QUE si l'échantillon est suffisant.
 * - Aucun ordre, aucune signature, aucune clé privée.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Nombre minimal de tokens observés pour publier un score de wallet. */
export const MIN_WALLET_SAMPLE = 3;
/** Rang maximal considéré comme « entrée précoce ». */
export const EARLY_RANK_LIMIT = 10;

export interface WalletAnalysisResult {
  tokensAnalyzed: number;
  entriesRecorded: number;
  walletsUpserted: number;
  walletsQualified: number;
  errors: string[];
  tradingEnabled: false;
}

interface RpcResponse<T> {
  result?: T;
  error?: { message?: string };
}

async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  const url = process.env["SOLANA_RPC_URL"];
  if (!url) return null;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as RpcResponse<T>;
    if (payload.error) return null;
    return payload.result ?? null;
  } catch {
    return null;
  }
}

interface TokenBalance {
  owner?: string;
  mint?: string;
  uiTokenAmount?: { amount?: string };
}

export interface EarlyBuyer {
  address: string;
  signature: string;
  rank: number;
  amountRaw: number | null;
  blockTime: string | null;
}

/**
 * Premiers acheteurs observables d'un mint (au plus `maxBuyers`).
 * Renvoie une liste vide si le RPC n'est pas configuré ou ne répond pas :
 * l'absence de données n'est jamais comblée par des valeurs fabriquées.
 */
export async function fetchEarlyBuyers(
  mint: string,
  maxTransactions = 12,
  maxBuyers = 20,
): Promise<EarlyBuyer[]> {
  const signatures = await rpc<Array<{ signature: string; blockTime?: number | null }>>(
    "getSignaturesForAddress",
    [mint, { limit: 200 }],
  );
  if (!signatures || signatures.length === 0) return [];

  // Le RPC renvoie du plus récent au plus ancien : on repart des plus anciennes.
  const oldest = [...signatures].reverse().slice(0, maxTransactions);

  const buyers: EarlyBuyer[] = [];
  const seen = new Set<string>();

  for (const entry of oldest) {
    if (buyers.length >= maxBuyers) break;
    const tx = await rpc<{
      blockTime?: number | null;
      meta?: {
        preTokenBalances?: TokenBalance[];
        postTokenBalances?: TokenBalance[];
        err?: unknown;
      };
    }>("getTransaction", [
      entry.signature,
      { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" },
    ]);
    if (!tx?.meta || tx.meta.err) continue;

    const pre = new Map<string, number>();
    for (const balance of tx.meta.preTokenBalances ?? []) {
      if (balance.mint !== mint || !balance.owner) continue;
      pre.set(balance.owner, Number(balance.uiTokenAmount?.amount ?? 0));
    }

    for (const balance of tx.meta.postTokenBalances ?? []) {
      if (balance.mint !== mint || !balance.owner) continue;
      const after = Number(balance.uiTokenAmount?.amount ?? 0);
      const before = pre.get(balance.owner) ?? 0;
      const delta = after - before;
      if (!Number.isFinite(delta) || delta <= 0) continue;
      if (seen.has(balance.owner)) continue;
      seen.add(balance.owner);
      const blockTime = entry.blockTime ?? tx.blockTime ?? null;
      buyers.push({
        address: balance.owner,
        signature: entry.signature,
        rank: buyers.length + 1,
        amountRaw: delta,
        blockTime: blockTime ? new Date(blockTime * 1000).toISOString() : null,
      });
      if (buyers.length >= maxBuyers) break;
    }
  }

  return buyers;
}

function ramp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || max <= min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

export interface WalletAggregate {
  address: string;
  tokensTracked: number;
  earlyEntries: number;
  successCount: number;
  successRate: number | null;
  score: number | null;
  dataSufficient: boolean;
  reasons: string[];
}

/**
 * Agrégation déterministe et purement observationnelle.
 * `successRate`, `score` et les multiples restent `null` tant que
 * l'échantillon est insuffisant : « inconnu » plutôt qu'inventé.
 */
export function aggregateWallet(entries: {
  address: string;
  ranks: number[];
  tokenSucceeded: boolean[];
}): WalletAggregate {
  const tokensTracked = entries.ranks.length;
  const earlyEntries = entries.ranks.filter((r) => r > 0 && r <= EARLY_RANK_LIMIT).length;
  const successCount = entries.tokenSucceeded.filter(Boolean).length;
  const dataSufficient = tokensTracked >= MIN_WALLET_SAMPLE;

  const successRate = dataSufficient ? successCount / tokensTracked : null;
  const score =
    successRate === null
      ? null
      : Math.round(100 * (0.6 * successRate + 0.4 * ramp(earlyEntries, 1, 8)));

  const reasons: string[] = [
    `${tokensTracked} token(s) réel(s) observé(s)`,
    `${earlyEntries} entrée(s) dans les ${EARLY_RANK_LIMIT} premiers acheteurs`,
  ];
  reasons.push(
    dataSufficient
      ? `${successCount}/${tokensTracked} token(s) ont atteint un niveau surveillé ou supérieur`
      : `Échantillon insuffisant (< ${MIN_WALLET_SAMPLE} tokens) — taux de réussite inconnu`,
  );
  reasons.push("PnL et multiples : inconnus (non calculables de façon fiable sur ces données)");

  return {
    address: entries.address,
    tokensTracked,
    earlyEntries,
    successCount,
    successRate,
    score,
    dataSufficient,
    reasons,
  };
}

/** Seuil au-delà duquel un wallet est considéré « smart » pour le scoring. */
export const SMART_WALLET_QUALIFY_SCORE = 60;

/**
 * Analyse les premiers acheteurs de `limit` tokens réels non encore analysés,
 * puis recalcule les agrégats de tous les wallets observés.
 */
export async function analyzeRealWallets(limit = 3): Promise<WalletAnalysisResult> {
  const result: WalletAnalysisResult = {
    tokensAnalyzed: 0,
    entriesRecorded: 0,
    walletsUpserted: 0,
    walletsQualified: 0,
    errors: [],
    tradingEnabled: false,
  };

  if (!process.env["SOLANA_RPC_URL"]) {
    result.errors.push("SOLANA_RPC_URL non configuré — analyse on-chain impossible.");
    return result;
  }

  const { data, error } = await supabaseAdmin
    .from("tokens")
    .select("id, mint_address")
    .eq("is_simulated", false)
    .is("wallets_analyzed_at", null)
    .limit(limit);
  if (error) throw new Error(error.message);

  for (const token of (data ?? []) as Array<{ id: string; mint_address: string }>) {
    const buyers = await fetchEarlyBuyers(token.mint_address);
    result.tokensAnalyzed += 1;

    if (buyers.length > 0) {
      const rows = buyers.map((buyer) => ({
        wallet_address: buyer.address,
        token_id: token.id,
        mint_address: token.mint_address,
        signature: buyer.signature,
        entry_rank: buyer.rank,
        amount_raw: buyer.amountRaw,
        block_time: buyer.blockTime,
      }));
      const { error: insertError } = await supabaseAdmin
        .from("wallet_token_entries")
        .upsert(rows as never, { onConflict: "wallet_address,token_id" });
      if (insertError) result.errors.push(`${token.mint_address}: ${insertError.message}`);
      else result.entriesRecorded += rows.length;
    }

    await supabaseAdmin
      .from("tokens")
      .update({
        wallets_analyzed_at: new Date().toISOString(),
        early_buyers_found: buyers.length,
      })
      .eq("id", token.id);
  }

  const refreshed = await refreshWalletAggregates();
  result.walletsUpserted = refreshed.upserted;
  result.walletsQualified = refreshed.qualified;
  result.errors.push(...refreshed.errors);
  return result;
}

/** Recalcule les métriques réelles de tous les wallets observés. */
export async function refreshWalletAggregates(): Promise<{
  upserted: number;
  qualified: number;
  errors: string[];
}> {
  const errors: string[] = [];
  const { data: entries, error } = await supabaseAdmin
    .from("wallet_token_entries")
    .select("wallet_address, token_id, entry_rank")
    .limit(20_000);
  if (error) throw new Error(error.message);

  const rows = (entries ?? []) as Array<{
    wallet_address: string;
    token_id: string;
    entry_rank: number;
  }>;
  if (rows.length === 0) return { upserted: 0, qualified: 0, errors };

  const { data: tokenRows } = await supabaseAdmin
    .from("tokens")
    .select("id, score, alert_level, data_sufficient")
    .eq("is_simulated", false);

  const success = new Map<string, boolean>();
  for (const token of (tokenRows ?? []) as Array<{
    id: string;
    score: number;
    alert_level: string | null;
    data_sufficient: boolean;
  }>) {
    success.set(
      token.id,
      (token.data_sufficient && token.score >= 70) ||
        token.alert_level === "signal" ||
        token.alert_level === "priority",
    );
  }

  const grouped = new Map<string, { ranks: number[]; tokenSucceeded: boolean[] }>();
  for (const row of rows) {
    const bucket = grouped.get(row.wallet_address) ?? { ranks: [], tokenSucceeded: [] };
    bucket.ranks.push(row.entry_rank);
    bucket.tokenSucceeded.push(success.get(row.token_id) ?? false);
    grouped.set(row.wallet_address, bucket);
  }

  const now = new Date().toISOString();
  const payload = [...grouped.entries()].map(([address, bucket]) => {
    const aggregate = aggregateWallet({ address, ...bucket });
    return {
      address,
      label: null,
      is_simulated: false,
      trade_count: aggregate.tokensTracked,
      tokens_tracked: aggregate.tokensTracked,
      early_entries: aggregate.earlyEntries,
      success_count: aggregate.successCount,
      success_rate: aggregate.successRate,
      smart_wallet_score: aggregate.score,
      median_multiple: null,
      simulated_pnl: 0,
      win_rate: aggregate.successRate === null ? 0 : aggregate.successRate * 100,
      data_sufficient: aggregate.dataSufficient,
      reasons: aggregate.reasons,
      last_active_at: now,
      updated_at: now,
    };
  });

  const { error: upsertError } = await supabaseAdmin
    .from("smart_wallets")
    .upsert(payload as never, { onConflict: "address" });
  if (upsertError) errors.push(upsertError.message);

  const qualified = payload.filter(
    (w) => w.data_sufficient && (w.smart_wallet_score ?? 0) >= SMART_WALLET_QUALIFY_SCORE,
  );

  // Nombre de smart wallets qualifiés par token (0 = aucun, jamais deviné).
  const qualifiedAddresses = new Set(qualified.map((w) => w.address));
  const perToken = new Map<string, number>();
  for (const row of rows) {
    if (!qualifiedAddresses.has(row.wallet_address)) continue;
    perToken.set(row.token_id, (perToken.get(row.token_id) ?? 0) + 1);
  }
  for (const [tokenId, count] of perToken) {
    await supabaseAdmin.from("tokens").update({ smart_wallet_count: count }).eq("id", tokenId);
  }

  return { upserted: payload.length, qualified: qualified.length, errors };
}
