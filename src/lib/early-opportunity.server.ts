/**
 * Alertes Telegram « Meme Radar — Early Opportunity » — SERVEUR / WORKER UNIQUEMENT.
 *
 * Objectif : repérer les memes qui commencent à montrer une traction réelle
 * AVANT que leur score n'atteigne les seuils SIGNAL/PRIORITÉ classiques.
 *
 * Conditions (toutes configurables dans `bot_settings`) :
 *   - âge du token <= 2 h
 *   - nombre d'acheteurs réels compris entre 60 et 100 (fenêtre de traction)
 *   - score du token >= 65/100
 *   - liquidité >= 50 000 $ (valeur par défaut, configurable)
 *
 * Anti-doublon : la table `early_opportunity_alerts` porte une contrainte
 * unique sur `token_mint`. L'insertion sert de verrou : une seule alerte est
 * envoyée au franchissement des critères, jamais à chaque cycle.
 *
 * MODE OBSERVATION UNIQUEMENT : aucun ordre, aucune clé privée.
 * Le scoring des tokens n'est pas modifié par ce module.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendRawTelegramMessage } from "./telegram.server";
import { formatUsd } from "./radar-service-format";

/** Valeurs par défaut si `bot_settings` ne fournit rien. */
export const EARLY_OPPORTUNITY_DEFAULTS = {
  enabled: true,
  minScore: 65,
  minBuyers: 60,
  maxBuyers: 100,
  maxAgeMinutes: 120,
  minLiquidityUsd: 50_000,
} as const;

export interface EarlyOpportunityConfig {
  enabled: boolean;
  minScore: number;
  minBuyers: number;
  maxBuyers: number;
  maxAgeMinutes: number;
  minLiquidityUsd: number;
}

export interface EarlyOpportunityCandidate {
  tokenId: string;
  mint: string;
  symbol: string;
  name: string;
  score: number;
  confidence: number;
  buyers: number;
  liquidityUsd: number | null;
  marketCap: number | null;
  volume24h: number | null;
  ageMinutes: number;
  pairUrl: string | null;
}

export interface EarlyOpportunityOutcome {
  created: boolean;
  telegramSent: boolean;
  error: string | null;
}

export function readEarlyOpportunityConfig(row: {
  early_opportunity_enabled?: boolean | null;
  early_opportunity_min_score?: number | null;
  early_opportunity_min_buyers?: number | null;
  early_opportunity_max_buyers?: number | null;
  early_opportunity_max_age_minutes?: number | null;
  early_opportunity_min_liquidity_usd?: number | null;
} | null): EarlyOpportunityConfig {
  return {
    enabled: row?.early_opportunity_enabled ?? EARLY_OPPORTUNITY_DEFAULTS.enabled,
    minScore: row?.early_opportunity_min_score ?? EARLY_OPPORTUNITY_DEFAULTS.minScore,
    minBuyers: row?.early_opportunity_min_buyers ?? EARLY_OPPORTUNITY_DEFAULTS.minBuyers,
    maxBuyers: row?.early_opportunity_max_buyers ?? EARLY_OPPORTUNITY_DEFAULTS.maxBuyers,
    maxAgeMinutes:
      row?.early_opportunity_max_age_minutes ?? EARLY_OPPORTUNITY_DEFAULTS.maxAgeMinutes,
    minLiquidityUsd:
      row?.early_opportunity_min_liquidity_usd ?? EARLY_OPPORTUNITY_DEFAULTS.minLiquidityUsd,
  };
}

/** Vérifie les 4 conditions de traction précoce. Aucun effet de bord. */
export function matchesEarlyOpportunity(
  candidate: Pick<
    EarlyOpportunityCandidate,
    "score" | "buyers" | "liquidityUsd" | "ageMinutes"
  >,
  config: EarlyOpportunityConfig,
): boolean {
  if (!config.enabled) return false;
  if (candidate.ageMinutes > config.maxAgeMinutes) return false;
  if (candidate.buyers < config.minBuyers || candidate.buyers > config.maxBuyers) return false;
  if (candidate.score < config.minScore) return false;
  if (candidate.liquidityUsd === null) return false;
  return candidate.liquidityUsd >= config.minLiquidityUsd;
}

export function buildEarlyOpportunityMessage(
  candidate: EarlyOpportunityCandidate,
  config: EarlyOpportunityConfig,
): string {
  const ageLabel =
    candidate.ageMinutes < 60
      ? `${Math.round(candidate.ageMinutes)} min`
      : `${(candidate.ageMinutes / 60).toFixed(1)} h`;

  return [
    "🌱 MEME RADAR — EARLY OPPORTUNITY",
    "",
    `🪙 Token : $${candidate.symbol}`,
    `📛 Nom : ${candidate.name}`,
    `⭐ Score : ${candidate.score}/100 (fiabilité ${Math.round(candidate.confidence * 100)} %)`,
    `👥 Acheteurs : ${candidate.buyers} (fenêtre ${config.minBuyers}–${config.maxBuyers})`,
    `💧 Liquidité : ${candidate.liquidityUsd !== null ? formatUsd(candidate.liquidityUsd) : "inconnue"} (min ${formatUsd(config.minLiquidityUsd)})`,
    `📊 Market Cap : ${candidate.marketCap !== null ? formatUsd(candidate.marketCap) : "inconnu"}`,
    `📈 Volume 24h : ${candidate.volume24h !== null ? formatUsd(candidate.volume24h) : "inconnu"}`,
    `⏱️ Âge : ${ageLabel} (max ${Math.round(config.maxAgeMinutes / 60)} h)`,
    "",
    `🔗 DEX : ${candidate.pairUrl ?? `https://dexscreener.com/solana/${candidate.mint}`}`,
    `🔗 Explorer : https://solscan.io/token/${candidate.mint}`,
    "",
    "Détection de traction précoce — observation on-chain uniquement.",
    "Ni conseil financier, ni garantie, aucun trading automatique.",
  ].join("\n");
}

/**
 * Enregistre (verrou unique par mint) puis notifie une opportunité précoce.
 * Idempotent : si le token a déjà été signalé, rien n'est renvoyé.
 * Une erreur Telegram n'est jamais bloquante.
 */
export async function recordEarlyOpportunity(
  candidate: EarlyOpportunityCandidate,
  config: EarlyOpportunityConfig,
  options: { sendTelegram: boolean },
): Promise<EarlyOpportunityOutcome> {
  const { data: inserted, error } = await supabaseAdmin
    .from("early_opportunity_alerts")
    .upsert(
      {
        token_id: candidate.tokenId,
        token_mint: candidate.mint,
        token_symbol: candidate.symbol,
        score: candidate.score,
        buyers: candidate.buyers,
        liquidity_usd: candidate.liquidityUsd,
        market_cap: candidate.marketCap,
        age_minutes: Math.round(candidate.ageMinutes),
      } as never,
      { onConflict: "token_mint", ignoreDuplicates: true },
    )
    .select("id");

  if (error) return { created: false, telegramSent: false, error: error.message };

  const row = (inserted ?? [])[0] as { id: string } | undefined;
  if (!row) return { created: false, telegramSent: false, error: null };

  if (!options.sendTelegram) {
    return { created: true, telegramSent: false, error: null };
  }

  try {
    const sent = await sendRawTelegramMessage(buildEarlyOpportunityMessage(candidate, config));
    await supabaseAdmin
      .from("early_opportunity_alerts")
      .update({
        telegram_sent: sent.sent,
        telegram_error: sent.sent ? null : (sent.reason ?? "envoi refusé"),
      })
      .eq("id", row.id);
    return {
      created: true,
      telegramSent: sent.sent,
      error: sent.sent ? null : (sent.reason ?? "envoi refusé"),
    };
  } catch (telegramError) {
    const message = telegramError instanceof Error ? telegramError.message : String(telegramError);
    await supabaseAdmin
      .from("early_opportunity_alerts")
      .update({ telegram_sent: false, telegram_error: message })
      .eq("id", row.id);
    return { created: true, telegramSent: false, error: message };
  }
}
