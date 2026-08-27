/**
 * Alertes Telegram « Meme Radar — Early Opportunity » — SERVEUR / WORKER UNIQUEMENT.
 *
 * Objectif : repérer les memes qui commencent à montrer une traction réelle,
 * indépendamment du score Radar (le score est seulement informatif).
 *
 * Conditions (toutes configurables dans `bot_settings`) :
 *   - âge du token <= 2 h
 *   - nombre d'acheteurs réels compris entre 60 et 100 (fenêtre de traction)
 *   - liquidité >= 20 000 $
 *   - volume 1h >= 30 000 $
 *   - accélération >= 2x, UNIQUEMENT si mesurable (volume 5 min vs volume 1h).
 *     Si la donnée manque, elle est marquée « inconnue » et n'est jamais inventée.
 *
 * Anti-doublon : la table `early_opportunity_alerts` porte une contrainte
 * unique sur `token_mint`. L'insertion sert de verrou : une seule alerte est
 * envoyée au franchissement des critères, jamais à chaque cycle. Un token qui
 * ne remplit pas les critères au premier cycle peut donc les remplir plus tard
 * dans sa fenêtre de 2 h.
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
  minBuyers: 60,
  maxBuyers: 150,
  maxAgeMinutes: 120,
  /** 0 = aucun minimum de liquidité (les Pump.fun pré-migration n'ont pas de pool). */
  minLiquidityUsd: 0,
  minVolume1hUsd: 5_000,
  accelerationFactor: 1.5,
} as const;

/**
 * DEX Screener renvoie `0` (ou rien) pour les tokens Pump.fun encore sur bonding
 * curve : il n'existe pas de pool à mesurer. Ce 0 n'est PAS une liquidité réelle
 * mesurée, il est donc converti en « non mesurée » (null) et n'apparaît jamais
 * comme une valeur chiffrée dans les alertes.
 */
export function normalizeLiquidityUsd(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}


export interface EarlyOpportunityConfig {
  enabled: boolean;
  minBuyers: number;
  maxBuyers: number;
  maxAgeMinutes: number;
  minLiquidityUsd: number;
  minVolume1hUsd: number;
  accelerationFactor: number;
}

export interface EarlyOpportunityCandidate {
  tokenId: string;
  mint: string;
  symbol: string;
  name: string;
  /** Score Radar courant, informatif uniquement (null = inconnu). */
  score: number | null;
  confidence: number;
  buyers: number;
  liquidityUsd: number | null;
  marketCap: number | null;
  volume24h: number | null;
  volume1h: number | null;
  /** Volume des 5 dernières minutes, sert à mesurer l'accélération. */
  volume5m: number | null;
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
  early_opportunity_min_buyers?: number | null;
  early_opportunity_max_buyers?: number | null;
  early_opportunity_max_age_minutes?: number | null;
  early_opportunity_min_liquidity_usd?: number | null;
  early_opportunity_min_volume_1h_usd?: number | null;
  early_opportunity_acceleration_factor?: number | null;
} | null): EarlyOpportunityConfig {
  return {
    enabled: row?.early_opportunity_enabled ?? EARLY_OPPORTUNITY_DEFAULTS.enabled,
    minBuyers: row?.early_opportunity_min_buyers ?? EARLY_OPPORTUNITY_DEFAULTS.minBuyers,
    maxBuyers: row?.early_opportunity_max_buyers ?? EARLY_OPPORTUNITY_DEFAULTS.maxBuyers,
    maxAgeMinutes:
      row?.early_opportunity_max_age_minutes ?? EARLY_OPPORTUNITY_DEFAULTS.maxAgeMinutes,
    minLiquidityUsd:
      row?.early_opportunity_min_liquidity_usd ?? EARLY_OPPORTUNITY_DEFAULTS.minLiquidityUsd,
    minVolume1hUsd:
      row?.early_opportunity_min_volume_1h_usd ?? EARLY_OPPORTUNITY_DEFAULTS.minVolume1hUsd,
    accelerationFactor:
      row?.early_opportunity_acceleration_factor ??
      EARLY_OPPORTUNITY_DEFAULTS.accelerationFactor,
  };
}

/**
 * Accélération = rythme des 5 dernières minutes rapporté au rythme moyen de
 * la dernière heure. `null` si la donnée n'est pas réellement mesurable.
 */
export function computeAcceleration(
  candidate: Pick<EarlyOpportunityCandidate, "volume1h" | "volume5m">,
): number | null {
  const { volume1h, volume5m } = candidate;
  if (volume1h === null || volume5m === null) return null;
  if (!(volume1h > 0) || volume5m < 0) return null;
  return (volume5m * 12) / volume1h;
}

export interface EarlyStrength {
  /** Part des critères Early réellement mesurés qui sont satisfaits (0-100). */
  score: number;
  measured: number;
  passed: number;
  /** Vrai si trop peu de critères sont mesurables pour conclure. */
  insufficient: boolean;
}

/** Force Early calculée UNIQUEMENT à partir des critères réellement mesurés. */
export function computeEarlyStrength(
  candidate: EarlyOpportunityCandidate,
  config: EarlyOpportunityConfig,
): EarlyStrength {
  const acceleration = computeAcceleration(candidate);
  const checks: (boolean | null)[] = [
    Number.isFinite(candidate.ageMinutes) ? candidate.ageMinutes <= config.maxAgeMinutes : null,
    Number.isFinite(candidate.buyers)
      ? candidate.buyers >= config.minBuyers && candidate.buyers <= config.maxBuyers
      : null,
    candidate.liquidityUsd === null ? null : candidate.liquidityUsd >= config.minLiquidityUsd,
    candidate.volume1h === null ? null : candidate.volume1h >= config.minVolume1hUsd,
    acceleration === null ? null : acceleration >= config.accelerationFactor,
  ];
  const measuredChecks = checks.filter((c): c is boolean => c !== null);
  const passed = measuredChecks.filter(Boolean).length;
  const measured = measuredChecks.length;
  return {
    score: measured === 0 ? 0 : Math.round((passed / measured) * 100),
    measured,
    passed,
    insufficient: measured < 3,
  };
}

/**
 * Vérifie les conditions de traction précoce. Aucun effet de bord.
 * Le score Radar n'intervient pas : il est purement informatif.
 * L'accélération n'est bloquante que si elle est mesurable.
 */
export function matchesEarlyOpportunity(
  candidate: EarlyOpportunityCandidate,
  config: EarlyOpportunityConfig,
): boolean {
  if (!config.enabled) return false;
  if (candidate.ageMinutes > config.maxAgeMinutes) return false;
  if (candidate.buyers < config.minBuyers || candidate.buyers > config.maxBuyers) return false;
  if (candidate.liquidityUsd === null || candidate.liquidityUsd < config.minLiquidityUsd) {
    return false;
  }
  if (candidate.volume1h === null || candidate.volume1h < config.minVolume1hUsd) return false;

  const acceleration = computeAcceleration(candidate);
  if (acceleration !== null && acceleration < config.accelerationFactor) return false;
  return true;
}

export function buildEarlyOpportunityMessage(
  candidate: EarlyOpportunityCandidate,
  config: EarlyOpportunityConfig,
): string {
  const ageLabel =
    candidate.ageMinutes < 60
      ? `${Math.round(candidate.ageMinutes)} min`
      : `${(candidate.ageMinutes / 60).toFixed(1)} h`;

  const acceleration = computeAcceleration(candidate);
  const strength = computeEarlyStrength(candidate, config);

  return [
    "🌱 EARLY OPPORTUNITY",
    "",
    `🪙 Token : $${candidate.symbol}`,
    `📛 Nom : ${candidate.name}`,
    strength.insufficient
      ? `💪 Early Strength : données insuffisantes (${strength.passed}/${strength.measured} critères mesurés)`
      : `💪 Early Strength : ${strength.score}/100 (${strength.passed}/${strength.measured} critères Early mesurés satisfaits)`,
    "",
    `👥 Acheteurs : ${candidate.buyers} (fenêtre ${config.minBuyers}–${config.maxBuyers})`,
    `💧 Liquidité : ${candidate.liquidityUsd !== null ? formatUsd(candidate.liquidityUsd) : "inconnue"} (min ${formatUsd(config.minLiquidityUsd)})`,
    `📈 Volume 1h : ${candidate.volume1h !== null ? formatUsd(candidate.volume1h) : "inconnu"} (min ${formatUsd(config.minVolume1hUsd)})`,
    `⚡ Accélération : ${acceleration !== null ? `${acceleration.toFixed(1)}x` : "inconnue"} (min ${config.accelerationFactor}x)`,
    `⏱️ Âge : ${ageLabel} (max ${Math.round(config.maxAgeMinutes / 60)} h)`,
    `📊 Market Cap : ${candidate.marketCap !== null ? formatUsd(candidate.marketCap) : "inconnu"}`,
    "",
    `⭐ Score Radar actuel : ${candidate.score !== null ? `${candidate.score}/100` : "inconnu"} (informatif uniquement)`,
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
  const acceleration = computeAcceleration(candidate);
  const strength = computeEarlyStrength(candidate, config);

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
        volume_1h_usd: candidate.volume1h,
        acceleration,
        early_strength: strength.insufficient ? null : strength.score,
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
