/**
 * Enrichissement + scoring + alertes Telegram — SERVEUR / WORKER UNIQUEMENT.
 *
 * Cycle : tokens réels (is_simulated = false) -> métriques DEX Screener +
 * concentration des holders (RPC) -> score /100 renormalisé -> mise à jour
 * token + snapshot -> alerte Telegram si le niveau SIGNAL/PRIORITÉ est franchi.
 *
 * MODE OBSERVATION UNIQUEMENT : aucun ordre, aucune clé privée.
 * Les tokens de démonstration (is_simulated = true) ne sont jamais modifiés,
 * jamais scorés et ne déclenchent jamais d'alerte.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeScore, tokenStatusForLevel, type ScoringResult } from "./scoring";
import { fetchMarketMetrics, MARKET_BATCH_SIZE, type MarketMetrics } from "./market.server";
import { sendAlertTelegram } from "./telegram.server";
import {
  matchesEarlyOpportunity,
  readEarlyOpportunityConfig,
  recordEarlyOpportunity,
  type EarlyOpportunityConfig,
} from "./early-opportunity.server";
import { assessTokenRisk, type TokenRiskAssessment } from "./risk.server";
import { summarizeRisk } from "./risk-scoring";

/** Délai minimal entre deux alertes pour un même token. */
export const ALERT_COOLDOWN_MS = 30 * 60 * 1000;

export interface EnrichmentResult {
  scanned: number;
  enriched: number;
  withoutMarketData: number;
  insufficientData: number;
  alertsCreated: number;
  telegramSent: number;
  telegramSkipped: string | null;
  topScore: number | null;
  /** Alertes « Early Opportunity » créées pendant ce cycle. */
  earlyOpportunitiesCreated: number;
  /** Messages Telegram « Early Opportunity » réellement envoyés. */
  earlyOpportunitiesTelegramSent: number;
  errors: string[];
  tradingEnabled: false;
}

interface TokenRecord {
  id: string;
  symbol: string;
  name: string;
  mint_address: string;
  launched_at: string;
  smart_wallet_count: number;
  alert_level: string | null;
  last_alert_at: string | null;
  creator_address: string | null;
  creator_previous_tokens: number | null;
  coordination_flags: unknown;
}

interface Settings {
  signalThreshold: number;
  priorityThreshold: number;
  botActive: boolean;
  earlyOpportunity: EarlyOpportunityConfig;
}

async function readSettings(): Promise<Settings> {
  const { data } = await supabaseAdmin
    .from("bot_settings")
    .select(
      "telegram_threshold, critical_threshold, status, early_opportunity_enabled, early_opportunity_min_buyers, early_opportunity_max_buyers, early_opportunity_max_age_minutes, early_opportunity_min_liquidity_usd, early_opportunity_min_volume_1h_usd, early_opportunity_acceleration_factor",
    )
    .limit(1)
    .maybeSingle();
  return {
    signalThreshold: data?.telegram_threshold ?? 85,
    priorityThreshold: data?.critical_threshold ?? 90,
    botActive: data?.status === "active",
    earlyOpportunity: readEarlyOpportunityConfig(data ?? null),
  };
}

/**
 * Nombre d'acheteurs réels observés par token, indépendamment des 1000 tokens
 * affichés dans le Radar : acheteurs distincts de `wallet_token_entries`.
 */
async function countRealBuyers(tokenIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (tokenIds.length === 0) return counts;
  const { data } = await supabaseAdmin
    .from("wallet_token_entries")
    .select("token_id, wallet_address")
    .in("token_id", tokenIds)
    .limit(50_000);
  const distinct = new Map<string, Set<string>>();
  for (const row of (data ?? []) as Array<{ token_id: string; wallet_address: string }>) {
    const set = distinct.get(row.token_id) ?? new Set<string>();
    set.add(row.wallet_address);
    distinct.set(row.token_id, set);
  }
  for (const [tokenId, set] of distinct) counts.set(tokenId, set.size);
  return counts;
}

function fmtUsd(value: number | null): string {
  if (value === null) return "inconnu";
  return `${Math.round(value).toLocaleString("fr-FR")} $`;
}

/** Message Telegram : token, score, sous-scores, marché, horodatage, liens. */
export function buildAlertMessage(params: {
  symbol: string;
  name: string;
  mint: string;
  scoring: ScoringResult;
  metrics: MarketMetrics | undefined;
  level: "signal" | "priority";
  smartWallets?: number | null;
  /** Risque mesuré (facultatif) : ajouté au message sans bloquer l'alerte. */
  risk?: TokenRiskAssessment["risk"] | null;
}): string {
  const { scoring, metrics } = params;
  const top = scoring.subScores
    .filter((s) => s.normalized !== null)
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    .slice(0, 3)
    .map((s) => `• ${s.label} : ${s.points}/${s.weight} (${s.detail})`)
    .join("\n");

  const lines = [
    `${params.name} (${params.symbol})`,
    `${params.level === "priority" ? "PRIORITÉ" : "SIGNAL"} — score ${scoring.score}/100`,
    `Fiabilité des données : ${Math.round(scoring.confidence * 100)} %`,
    `Smart wallets qualifiés : ${params.smartWallets ?? "inconnu"}`,
    "",
    "Sous-scores principaux :",
    top || "• aucun sous-score disponible",
    "",
    `Market cap : ${fmtUsd(metrics?.marketCap ?? null)}`,
    `Liquidité : ${fmtUsd(metrics?.liquidityUsd ?? null)}`,
    `Volume 24h : ${fmtUsd(metrics?.volume24h ?? null)}`,
    `Acheteurs 1h : ${metrics?.buyers1h ?? "inconnu"}`,
    `Volume 1h : ${fmtUsd(metrics?.volume1h ?? null)}`,
  ];

  if (scoring.missing.length > 0) {
    lines.push(`Données manquantes : ${scoring.missing.join(", ")}`);
  }

  // Risque : informatif, jamais bloquant. Absent si non évaluable.
  if (params.risk && params.risk.score !== null) {
    lines.push(
      "",
      `Risque : ${params.risk.score}/100 (${params.risk.level}) — fiabilité ${Math.round(params.risk.confidence * 100)} %`,
      ...summarizeRisk(params.risk).map((line) => `• ${line}`),
    );
    if (params.risk.missing.length > 0) {
      lines.push(`Risque non mesuré : ${params.risk.missing.join(", ")}`);
    }
  } else if (params.risk) {
    lines.push("", "Risque : non évaluable (données on-chain insuffisantes).");
  }

  lines.push(
    "",
    `Horodatage : ${new Date().toISOString()}`,
    `DEX : ${metrics?.pairUrl ?? `https://dexscreener.com/solana/${params.mint}`}`,
    `Explorer : https://solscan.io/token/${params.mint}`,
    "",
    "Indicateur d'observation — ni conseil financier ni garantie. Aucun trading automatique.",
  );

  return lines.join("\n");
}

/**
 * Enrichit au maximum `limit` tokens réels (les moins récemment enrichis d'abord).
 */
export async function enrichRealTokens(limit = MARKET_BATCH_SIZE): Promise<EnrichmentResult> {
  const settings = await readSettings();
  const errors: string[] = [];

  const { data, error } = await supabaseAdmin
    .from("tokens")
    .select(
      "id, symbol, name, mint_address, launched_at, smart_wallet_count, alert_level, last_alert_at, creator_address, creator_previous_tokens, coordination_flags",
    )
    .eq("is_simulated", false)
    .order("last_enriched_at", { ascending: true, nullsFirst: true })
    .limit(Math.min(limit, MARKET_BATCH_SIZE));

  if (error) throw new Error(error.message);
  const tokens = (data ?? []) as unknown as TokenRecord[];

  const result: EnrichmentResult = {
    scanned: tokens.length,
    enriched: 0,
    withoutMarketData: 0,
    insufficientData: 0,
    alertsCreated: 0,
    telegramSent: 0,
    telegramSkipped: null,
    topScore: null,
    earlyOpportunitiesCreated: 0,
    earlyOpportunitiesTelegramSent: 0,
    errors,
    tradingEnabled: false,
  };
  if (tokens.length === 0) return result;

  let market: Map<string, MarketMetrics>;
  try {
    market = await fetchMarketMetrics(tokens.map((t) => t.mint_address));
  } catch (marketError) {
    errors.push(marketError instanceof Error ? marketError.message : String(marketError));
    return result;
  }

  const onChainBuyers = await countRealBuyers(tokens.map((t) => t.id));
  const now = new Date();

  for (const token of tokens) {
    const metrics = market.get(token.mint_address);
    const ageMinutes = Math.max(
      0,
      (now.getTime() - new Date(token.launched_at).getTime()) / 60_000,
    );

    // Analyse de risque on-chain (holders nets, créateur, LP, coordination),
    // uniquement pour les tokens ayant réellement un marché.
    let assessment: TokenRiskAssessment | null = null;
    if (metrics) {
      try {
        assessment = await assessTokenRisk({
          tokenId: token.id,
          mint: token.mint_address,
          launchedAt: token.launched_at,
          pairUrl: metrics.pairUrl ?? null,
          knownCreator: token.creator_address,
          knownCreatorPreviousTokens: token.creator_previous_tokens,
          // Vérification du financeur SOL une seule fois par token (coût RPC).
          checkFunders: token.coordination_flags === null,
        });
      } catch (riskError) {
        errors.push(
          `risk ${token.mint_address}: ${riskError instanceof Error ? riskError.message : String(riskError)}`,
        );
      }
    }
    const holdersTop10Share = assessment?.holders.top10Share ?? null;

    const scoring = computeScore(
      {
        liquidityUsd: metrics?.liquidityUsd ?? null,
        volume24h: metrics?.volume24h ?? null,
        volume1h: metrics?.volume1h ?? null,
        buyers1h: metrics?.buyers1h ?? null,
        priceChange1h: metrics?.priceChange1h ?? null,
        // Analyse smart money non branchée en V1 : explicitement inconnue.
        smartWallets: token.smart_wallet_count > 0 ? token.smart_wallet_count : null,
        holdersTop10Share,
        creatorHistory: null,
        ageMinutes,
      },
      { signal: settings.signalThreshold, priority: settings.priorityThreshold },
    );

    const symbol =
      metrics?.symbol && metrics.symbol.length <= 24 ? metrics.symbol : token.symbol;

    const marketMetrics = {
      priceUsd: metrics?.priceUsd ?? null,
      marketCap: metrics?.marketCap ?? null,
      liquidityUsd: metrics?.liquidityUsd ?? null,
      volume24h: metrics?.volume24h ?? null,
      volume1h: metrics?.volume1h ?? null,
      buyers1h: metrics?.buyers1h ?? null,
      priceChange1h: metrics?.priceChange1h ?? null,
      holdersTop10Share,
      creatorHistory: null,
      dex: metrics?.dex ?? null,
      pairUrl: metrics?.pairUrl ?? null,
    };

    const { error: updateError } = await supabaseAdmin
      .from("tokens")
      .update({
        symbol,
        name: metrics?.name ?? token.name,
        market_cap: metrics?.marketCap ?? 0,
        liquidity_usd: metrics?.liquidityUsd ?? 0,
        price_usd: metrics?.priceUsd ?? 0,
        price_change_1h: metrics?.priceChange1h ?? 0,
        volume_24h: metrics?.volume24h ?? 0,
        volume_1h: metrics?.volume1h ?? 0,
        new_buyers: Math.round(metrics?.buyers1h ?? 0),
        market_source: metrics ? `dexscreener:${metrics.dex ?? "unknown"}` : "none",
        score: scoring.score ?? 0,
        score_factors: scoring.subScores as unknown as never,
        market_metrics: marketMetrics as unknown as never,
        missing_metrics: scoring.missing as unknown as never,
        score_confidence: scoring.confidence,
        data_sufficient: scoring.score !== null,
        holders_top10_share: holdersTop10Share,
        status: tokenStatusForLevel(scoring.level),
        last_enriched_at: now.toISOString(),
        // Risque : champs séparés du score d'opportunité. `null` = non mesuré.
        ...(assessment
          ? {
              risk_score: assessment.risk.score,
              risk_level: assessment.risk.level,
              risk_confidence: assessment.risk.confidence,
              risk_factors: assessment.risk.factors as unknown as never,
              holders_top20_share: assessment.holders.top20Share,
              holders_excluded: {
                excluded: assessment.holders.excluded,
                accountsConsidered: assessment.holders.accountsConsidered,
                notes: assessment.holders.notes,
              } as unknown as never,
              creator_address: assessment.creatorAddress,
              creator_share: assessment.holders.creatorShare,
              creator_previous_tokens: assessment.creatorPreviousTokens,
              lp_status: assessment.lpStatus,
              coordination_flags: {
                ...assessment.coordination,
                lpNotes: assessment.lpNotes,
                liquidityDropRatio: assessment.liquidityDropRatio,
              } as unknown as never,
            }
          : {}),
      })
      .eq("id", token.id);

    if (updateError) {
      errors.push(`${token.mint_address}: ${updateError.message}`);
      continue;
    }

    if (!metrics) {
      result.withoutMarketData += 1;
      continue;
    }
    result.enriched += 1;

    if (scoring.score === null) {
      result.insufficientData += 1;
    } else {
      result.topScore = Math.max(result.topScore ?? 0, scoring.score);
    }

    await supabaseAdmin.from("token_snapshots").insert({
      token_id: token.id,
      market_cap: metrics.marketCap ?? 0,
      liquidity_usd: metrics.liquidityUsd ?? 0,
      volume: metrics.volume24h ?? 0,
      buyers: Math.round(metrics.buyers1h ?? 0),
      score: scoring.score ?? 0,
      price_usd: metrics.priceUsd ?? 0,
    });

    // ---- Alerte « Early Opportunity » (indépendante du score et du niveau)
    // Traction précoce : âge <= 2 h, 60-100 acheteurs, liquidité + volume 1h
    // minimums, accélération >= 2x lorsqu'elle est réellement mesurable.
    {
      const buyers = Math.max(
        Math.round(metrics.buyers1h ?? 0),
        onChainBuyers.get(token.id) ?? 0,
      );
      const candidate = {
        tokenId: token.id,
        mint: token.mint_address,
        symbol,
        name: metrics.name ?? token.name,
        score: scoring.score,
        confidence: scoring.confidence,
        buyers,
        liquidityUsd: metrics.liquidityUsd ?? null,
        marketCap: metrics.marketCap ?? null,
        volume24h: metrics.volume24h ?? null,
        volume1h: metrics.volume1h ?? null,
        volume5m: metrics.volume5m ?? null,
        ageMinutes,
        pairUrl: metrics.pairUrl ?? null,
      };
      if (matchesEarlyOpportunity(candidate, settings.earlyOpportunity)) {
        const outcome = await recordEarlyOpportunity(candidate, settings.earlyOpportunity, {
          sendTelegram: settings.botActive,
        });
        if (outcome.created) result.earlyOpportunitiesCreated += 1;
        if (outcome.telegramSent) result.earlyOpportunitiesTelegramSent += 1;
        if (outcome.error) errors.push(`early-opportunity ${token.mint_address}: ${outcome.error}`);
      }
    }

    // ---- Alerte « Token suivi » (cloche 🔔) — uniquement si le suivi est actif.
    // Réutilise les métriques réelles de ce cycle : aucun second WebSocket.
    {
      const tracked = trackedTokens.get(token.mint_address);
      if (tracked && tracked.enabled) {
        try {
          const outcome = await evaluateTrackedToken({
            tracked,
            tokenId: token.id,
            mint: token.mint_address,
            symbol,
            name: metrics.name ?? token.name,
            pairUrl: metrics.pairUrl ?? null,
            sendTelegram: settings.botActive,
            current: {
              score: scoring.score,
              volume1h: metrics.volume1h ?? null,
              buyers: Math.max(
                Math.round(metrics.buyers1h ?? 0),
                onChainBuyers.get(token.id) ?? 0,
              ),
              liquidityUsd: metrics.liquidityUsd ?? null,
              smartWallets: token.smart_wallet_count,
              riskScore: assessment?.risk.score ?? null,
              riskLevel: assessment?.risk.level ?? null,
              priceChange1h: metrics.priceChange1h ?? null,
            },
          });
          result.trackedAlertsCreated += outcome.events;
          result.trackedAlertsTelegramSent += outcome.telegramSent;
          if (outcome.error) errors.push(`tracked ${token.mint_address}: ${outcome.error}`);
        } catch (trackedError) {
          errors.push(
            `tracked ${token.mint_address}: ${trackedError instanceof Error ? trackedError.message : String(trackedError)}`,
          );
        }
      }
    }




    if (scoring.level !== "signal" && scoring.level !== "priority") continue;

    // Anti-spam : une seule alerte par token et par niveau + cooldown.
    const sameLevel = token.alert_level === scoring.level;
    const priorityAfterSignal =
      scoring.level === "priority" && token.alert_level === "signal";
    const cooldownActive =
      token.last_alert_at !== null &&
      now.getTime() - new Date(token.last_alert_at).getTime() < ALERT_COOLDOWN_MS;

    if (sameLevel || (cooldownActive && !priorityAfterSignal)) continue;

    const message = buildAlertMessage({
      symbol,
      name: metrics.name ?? token.name,
      mint: token.mint_address,
      scoring,
      metrics,
      level: scoring.level,
      smartWallets: token.smart_wallet_count > 0 ? token.smart_wallet_count : null,
      risk: assessment?.risk ?? null,
    });

    await supabaseAdmin.from("alerts").insert({
      token_id: token.id,
      token_symbol: symbol,
      level: scoring.level === "priority" ? "critical" : "signal",
      score: scoring.score ?? 0,
      message,
      channel: settings.botActive ? "telegram" : "dashboard",
      is_simulated: false,
      token_mint: token.mint_address,
      price_usd_at_alert: metrics.priceUsd ?? null,
      market_cap_at_alert: metrics.marketCap ?? null,
    });
    result.alertsCreated += 1;

    await supabaseAdmin
      .from("tokens")
      .update({
        alert_level: scoring.level,
        alerted_score: scoring.score ?? 0,
        last_alert_at: now.toISOString(),
      })
      .eq("id", token.id);

    // Bot en pause : l'alerte reste en historique, rien n'est envoyé.
    if (!settings.botActive) {
      result.telegramSkipped = "Bot en pause — alerte enregistrée sans envoi Telegram.";
      continue;
    }

    const sent = await sendAlertTelegram({
      symbol,
      score: scoring.score ?? 0,
      level: scoring.level === "priority" ? "critical" : "signal",
      message,
      simulated: false,
    });
    if (sent.sent) result.telegramSent += 1;
    else result.telegramSkipped = sent.reason ?? "Envoi Telegram impossible";
  }

  return result;
}
