/**
 * Enrichissement + scoring des tokens réels — SERVEUR / WORKER UNIQUEMENT.
 *
 * Cycle : tokens réels (is_simulated = false) -> métriques de marché
 * DEX Screener -> score /100 -> mise à jour token + snapshot -> alerte
 * Telegram si score >= seuil configuré.
 *
 * MODE OBSERVATION UNIQUEMENT : aucun ordre, aucune clé privée.
 * Les tokens de démonstration (is_simulated = true) ne sont jamais modifiés
 * et ne déclenchent jamais d'alerte Telegram.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeScore, statusForScore } from "./scoring";
import { fetchMarketMetrics, MARKET_BATCH_SIZE, type MarketMetrics } from "./market.server";
import { sendAlertTelegram } from "./telegram.server";

export interface EnrichmentResult {
  scanned: number;
  enriched: number;
  withoutMarketData: number;
  alertsCreated: number;
  telegramSent: number;
  telegramSkipped: string | null;
  topScore: number;
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
  alerted_score: number;
}

interface Settings {
  telegramThreshold: number;
  criticalThreshold: number;
  botActive: boolean;
}

async function readSettings(): Promise<Settings> {
  const { data } = await supabaseAdmin
    .from("bot_settings")
    .select("telegram_threshold, critical_threshold, status")
    .limit(1)
    .maybeSingle();
  return {
    telegramThreshold: data?.telegram_threshold ?? 85,
    criticalThreshold: data?.critical_threshold ?? 90,
    botActive: data?.status === "active",
  };
}

/**
 * Enrichit au maximum `limit` tokens réels (les moins récemment enrichis d'abord).
 */
export async function enrichRealTokens(limit = MARKET_BATCH_SIZE): Promise<EnrichmentResult> {
  const settings = await readSettings();
  const errors: string[] = [];

  const { data, error } = await supabaseAdmin
    .from("tokens")
    .select("id, symbol, name, mint_address, launched_at, smart_wallet_count, alerted_score")
    .eq("is_simulated", false)
    .order("last_enriched_at", { ascending: true, nullsFirst: true })
    .limit(Math.min(limit, MARKET_BATCH_SIZE));

  if (error) throw new Error(error.message);
  const tokens = (data ?? []) as unknown as TokenRecord[];

  const result: EnrichmentResult = {
    scanned: tokens.length,
    enriched: 0,
    withoutMarketData: 0,
    alertsCreated: 0,
    telegramSent: 0,
    telegramSkipped: null,
    topScore: 0,
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

  const now = new Date();

  for (const token of tokens) {
    const metrics = market.get(token.mint_address);
    const ageMinutes = Math.max(
      0,
      (now.getTime() - new Date(token.launched_at).getTime()) / 60_000,
    );

    const scoring = computeScore({
      marketCap: metrics?.marketCap ?? 0,
      liquidityUsd: metrics?.liquidityUsd ?? 0,
      volume24h: metrics?.volume24h ?? 0,
      volume1h: metrics?.volume1h ?? 0,
      buyers: metrics?.buyers1h ?? 0,
      priceChange1h: metrics?.priceChange1h ?? 0,
      smartWallets: token.smart_wallet_count ?? 0,
      ageMinutes,
      hasMarketData: Boolean(metrics),
    });

    const status = metrics
      ? statusForScore(scoring.score, settings.telegramThreshold, settings.criticalThreshold)
      : "watching";

    const symbol =
      metrics?.symbol && metrics.symbol.length <= 24 ? metrics.symbol : token.symbol;

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
        market_source: metrics ? `dexscreener:${metrics.dex}` : "none",
        score: scoring.score,
        score_factors: scoring.factors as unknown as never,
        status,
        last_enriched_at: now.toISOString(),
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
    result.topScore = Math.max(result.topScore, scoring.score);

    await supabaseAdmin.from("token_snapshots").insert({
      token_id: token.id,
      market_cap: metrics.marketCap,
      liquidity_usd: metrics.liquidityUsd,
      volume: metrics.volume24h,
      buyers: Math.round(metrics.buyers1h),
      score: scoring.score,
    });

    // Alerte uniquement au-dessus du seuil, et seulement si le score progresse
    // significativement depuis la dernière alerte (anti-spam).
    const shouldAlert =
      scoring.score >= settings.telegramThreshold &&
      scoring.score >= (token.alerted_score ?? 0) + 3;

    if (!shouldAlert) continue;

    const level = scoring.score >= settings.criticalThreshold ? "critical" : "signal";
    const message = [
      `MC ${Math.round(metrics.marketCap).toLocaleString("fr-FR")} $`,
      `Liq ${Math.round(metrics.liquidityUsd).toLocaleString("fr-FR")} $`,
      `Vol24h ${Math.round(metrics.volume24h).toLocaleString("fr-FR")} $`,
      `Acheteurs 1h ${Math.round(metrics.buyers1h)}`,
      `Var 1h ${metrics.priceChange1h.toFixed(1)} %`,
      token.mint_address,
    ].join(" · ");

    await supabaseAdmin.from("alerts").insert({
      token_id: token.id,
      token_symbol: symbol,
      level,
      score: scoring.score,
      message,
      channel: settings.botActive ? "telegram" : "dashboard",
      is_simulated: false,
    });
    result.alertsCreated += 1;

    await supabaseAdmin
      .from("tokens")
      .update({ alerted_score: scoring.score })
      .eq("id", token.id);

    // Le bot en pause n'envoie rien sur Telegram (alerte gardée en historique).
    if (!settings.botActive) {
      result.telegramSkipped = "Bot en pause — alerte enregistrée sans envoi Telegram.";
      continue;
    }

    const sent = await sendAlertTelegram({
      symbol,
      score: scoring.score,
      level,
      message,
      simulated: false,
    });
    if (sent.sent) result.telegramSent += 1;
    else result.telegramSkipped = sent.reason ?? "Envoi Telegram impossible";
  }

  return result;
}
