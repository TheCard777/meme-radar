/**
 * ⚡ NOW — rafraîchissement à la demande d'un seul token (SERVEUR UNIQUEMENT).
 *
 * Réutilise strictement le pipeline existant : métriques DEX Screener
 * (`market.server`), analyse de risque on-chain (`risk.server`) et scoring
 * (`scoring`). Aucun second WebSocket, aucun suivi 🔔 créé, aucun trading.
 *
 * Les critères des alertes automatiques (Early Opportunity / Smart Wallet)
 * ne sont jamais évalués ici : NOW est une simple analyse ponctuelle.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeScore, tokenStatusForLevel } from "./scoring";
import { fetchMarketMetrics, type MarketMetrics } from "./market.server";
import { assessTokenRisk, type TokenRiskAssessment } from "./risk.server";
import type { NowSnapshotInput } from "./now-snapshot";

export interface NowRefreshOutcome {
  input: NowSnapshotInput;
  /** Erreurs non bloquantes rencontrées pendant le refresh. */
  warnings: string[];
}

type TokenRow = Record<string, unknown>;

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const str = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

function ageMinutesSince(iso: string | null): number | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.round((Date.now() - ts) / 60_000));
}

/** Acheteurs réels distincts observés on-chain pour ce token. */
async function countBuyers(tokenId: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin
    .from("wallet_token_entries")
    .select("wallet_address")
    .eq("token_id", tokenId)
    .limit(50_000);
  if (error) return null;
  const set = new Set<string>();
  for (const row of (data ?? []) as Array<{ wallet_address: string }>) {
    set.add(row.wallet_address);
  }
  return set.size;
}

/** Anti-doublon : un seul refresh simultané par mint. */
const inFlight = new Map<string, Promise<NowRefreshOutcome>>();

export function refreshTokenNow(mint: string): Promise<NowRefreshOutcome> {
  const existing = inFlight.get(mint);
  if (existing) return existing;
  const run = doRefresh(mint).finally(() => {
    inFlight.delete(mint);
  });
  inFlight.set(mint, run);
  return run;
}

async function doRefresh(mint: string): Promise<NowRefreshOutcome> {
  const warnings: string[] = [];

  const { data: tokenData, error } = await supabaseAdmin
    .from("tokens")
    .select("*")
    .eq("mint_address", mint)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!tokenData) throw new Error("Token introuvable");

  const row = tokenData as unknown as TokenRow;
  const tokenId = String(row["id"]);
  const isSimulated = Boolean(row["is_simulated"]);
  const launchedAt = str(row["launched_at"]);
  const storedMetrics = (row["market_metrics"] ?? null) as Record<string, unknown> | null;
  const storedAgeMinutes = ageMinutesSince(str(row["last_enriched_at"]));

  // Les tokens de démonstration ne sont jamais ré-enrichis.
  let metrics: MarketMetrics | undefined;
  if (!isSimulated) {
    try {
      const map = await fetchMarketMetrics([mint]);
      metrics = map.get(mint);
      if (!metrics) warnings.push("Aucune paire DEX active trouvée pour ce token.");
    } catch (marketError) {
      warnings.push(
        `Marché indisponible : ${marketError instanceof Error ? marketError.message : String(marketError)}`,
      );
    }
  }

  let assessment: TokenRiskAssessment | null = null;
  if (!isSimulated && metrics) {
    try {
      assessment = await assessTokenRisk({
        tokenId,
        mint,
        launchedAt: launchedAt ?? new Date().toISOString(),
        pairUrl: metrics.pairUrl ?? null,
        knownCreator: str(row["creator_address"]),
        knownCreatorPreviousTokens: num(row["creator_previous_tokens"]),
        checkFunders: false,
      });
    } catch (riskError) {
      warnings.push(
        `Analyse de risque indisponible : ${riskError instanceof Error ? riskError.message : String(riskError)}`,
      );
    }
  }

  const ageMinutes = ageMinutesSince(launchedAt) ?? 0;
  const holdersTop10Share = assessment?.holders.top10Share ?? null;

  const scoring = metrics
    ? computeScore(
        {
          liquidityUsd: metrics.liquidityUsd ?? null,
          volume24h: metrics.volume24h ?? null,
          volume1h: metrics.volume1h ?? null,
          buyers1h: metrics.buyers1h ?? null,
          priceChange1h: metrics.priceChange1h ?? null,
          smartWallets:
            num(row["smart_wallet_count"]) && Number(row["smart_wallet_count"]) > 0
              ? Number(row["smart_wallet_count"])
              : null,
          holdersTop10Share,
          creatorHistory: null,
          ageMinutes,
        },
        await readThresholds(),
      )
    : null;

  const onChainBuyers = await countBuyers(tokenId);
  const refreshedAt = new Date();

  // Persistance des données fraîches (mêmes champs que le cycle worker,
  // sans alerte ni snapshot : NOW n'interfère pas avec le worker).
  if (!isSimulated && metrics && scoring) {
    const symbol = metrics.symbol && metrics.symbol.length <= 24 ? metrics.symbol : str(row["symbol"]);
    const { error: updateError } = await supabaseAdmin
      .from("tokens")
      .update({
        ...(symbol ? { symbol } : {}),
        name: metrics.name ?? (str(row["name"]) ?? ""),
        market_cap: metrics.marketCap ?? 0,
        liquidity_usd: metrics.liquidityUsd ?? 0,
        price_usd: metrics.priceUsd ?? 0,
        price_change_1h: metrics.priceChange1h ?? 0,
        volume_24h: metrics.volume24h ?? 0,
        volume_1h: metrics.volume1h ?? 0,
        new_buyers: Math.round(metrics.buyers1h ?? 0),
        market_source: `dexscreener:${metrics.dex ?? "unknown"}`,
        score: scoring.score ?? 0,
        score_factors: scoring.subScores as unknown as never,
        market_metrics: {
          priceUsd: metrics.priceUsd ?? null,
          marketCap: metrics.marketCap ?? null,
          liquidityUsd: metrics.liquidityUsd ?? null,
          volume24h: metrics.volume24h ?? null,
          volume1h: metrics.volume1h ?? null,
          buyers1h: metrics.buyers1h ?? null,
          priceChange1h: metrics.priceChange1h ?? null,
          holdersTop10Share,
          creatorHistory: null,
          dex: metrics.dex ?? null,
          pairUrl: metrics.pairUrl ?? null,
        } as unknown as never,
        missing_metrics: scoring.missing as unknown as never,
        score_confidence: scoring.confidence,
        data_sufficient: scoring.score !== null,
        holders_top10_share: holdersTop10Share,
        status: tokenStatusForLevel(scoring.level),
        last_enriched_at: refreshedAt.toISOString(),
        ...(assessment
          ? {
              risk_score: assessment.risk.score,
              risk_level: assessment.risk.level,
              risk_confidence: assessment.risk.confidence,
              risk_factors: assessment.risk.factors as unknown as never,
              holders_top20_share: assessment.holders.top20Share,
              creator_address: assessment.creatorAddress,
              creator_share: assessment.holders.creatorShare,
              creator_previous_tokens: assessment.creatorPreviousTokens,
              lp_status: assessment.lpStatus,
            }
          : {}),
      })
      .eq("id", tokenId);
    if (updateError) warnings.push(`Enregistrement partiel : ${updateError.message}`);
  }

  // Champs frais vs champs repris de la dernière analyse du worker.
  const stale: NonNullable<NowSnapshotInput["staleFields"]> = [];
  const markStale = (label: string) => {
    if (storedAgeMinutes !== null) stale.push({ label, ageMinutes: storedAgeMinutes });
  };

  const riskFresh = assessment !== null;
  if (!riskFresh && num(row["risk_score"]) !== null) markStale("risk score");
  if (!riskFresh && num(row["holders_top10_share"]) !== null) markStale("concentration top-10");
  if (!riskFresh && str(row["lp_status"]) && row["lp_status"] !== "unknown") markStale("statut LP");
  if (!metrics && storedMetrics) markStale("métriques de marché");

  const factorsSource = scoring
    ? scoring.subScores
    : Array.isArray(row["score_factors"])
      ? (row["score_factors"] as Array<Record<string, unknown>>)
      : [];
  const topFactors = (factorsSource as Array<Record<string, unknown>>)
    .filter((f) => typeof f["label"] === "string")
    .map((f) =>
      typeof f["detail"] === "string"
        ? { label: String(f["label"]), detail: f["detail"] }
        : { label: String(f["label"]) },
    );

  const input: NowSnapshotInput = {
    symbol: metrics?.symbol ?? str(row["symbol"]) ?? "?",
    name: metrics?.name ?? str(row["name"]),
    mint,
    launchedAt,
    marketCap: metrics ? (metrics.marketCap ?? null) : num(storedMetrics?.["marketCap"]),
    liquidityUsd: metrics ? (metrics.liquidityUsd ?? null) : num(storedMetrics?.["liquidityUsd"]),
    volume24h: metrics ? (metrics.volume24h ?? null) : num(storedMetrics?.["volume24h"]),
    volume1h: metrics ? (metrics.volume1h ?? null) : num(storedMetrics?.["volume1h"]),
    buyers: onChainBuyers ?? num(row["new_buyers"]),
    buyers1h: metrics ? (metrics.buyers1h ?? null) : num(storedMetrics?.["buyers1h"]),
    smartWallets: num(row["smart_wallet_count"]),
    score: scoring ? scoring.score : num(row["score"]),
    scoreConfidence: scoring ? scoring.confidence : num(row["score_confidence"]),
    riskScore: assessment ? assessment.risk.score : num(row["risk_score"]),
    riskLevel: assessment ? assessment.risk.level : str(row["risk_level"]),
    lpStatus: assessment ? assessment.lpStatus : str(row["lp_status"]),
    holdersTop10Share: assessment
      ? assessment.holders.top10Share
      : num(row["holders_top10_share"]),
    topFactors,
    pairUrl: metrics?.pairUrl ?? str(storedMetrics?.["pairUrl"]),
    isSimulated,
    refreshedAt: refreshedAt.toISOString(),
    staleFields: stale,
  };

  return { input, warnings };
}

async function readThresholds(): Promise<{ signal: number; priority: number }> {
  const { data } = await supabaseAdmin
    .from("bot_settings")
    .select("telegram_threshold, critical_threshold")
    .limit(1)
    .maybeSingle();
  return {
    signal: data?.telegram_threshold ?? 85,
    priority: data?.critical_threshold ?? 90,
  };
}
