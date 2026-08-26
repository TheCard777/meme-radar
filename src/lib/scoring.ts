/**
 * Moteur de score 0-100 — module pur (aucun I/O, testable).
 *
 * Principes :
 * - Chaque métrique manquante vaut `null` : elle n'est JAMAIS devinée.
 * - Les poids des sous-scores disponibles sont renormalisés (on ne donne pas
 *   artificiellement un score élevé quand il manque des données).
 * - Si trop peu de poids est disponible, le score est `null` (« données
 *   insuffisantes ») plutôt qu'un chiffre trompeur.
 *
 * AVERTISSEMENT : le score est un indicateur de qualité/opportunité basé sur
 * les signaux observés. Ce n'est PAS une probabilité de gain, PAS une garantie
 * et PAS un conseil financier. Mode observation uniquement, aucun trading.
 */

import type { ScoreFactor } from "./radar-types";

export interface ScoringInput {
  /** Liquidité totale du pool le plus profond, en USD. */
  liquidityUsd: number | null;
  volume24h: number | null;
  volume1h: number | null;
  buyers1h: number | null;
  priceChange1h: number | null;
  /** Nombre de smart wallets identifiés (null = analyse non disponible). */
  smartWallets: number | null;
  /** Part cumulée des 10 plus gros comptes, entre 0 et 1. */
  holdersTop10Share: number | null;
  /** Réputation du créateur entre 0 et 1 (null = historique non résolu). */
  creatorHistory: number | null;
  ageMinutes: number | null;
}

export type ScoreLevel = "insufficient" | "ignored" | "watch" | "signal" | "priority";

export interface SubScore {
  key: string;
  label: string;
  /** Poids nominal (somme = 100). */
  weight: number;
  /** Note normalisée 0-100, ou null si la donnée manque. */
  normalized: number | null;
  /** Points effectivement apportés (avant renormalisation), ou null. */
  points: number | null;
  detail: string;
}

export interface ScoringResult {
  /** Score 0-100, ou null si les données sont insuffisantes. */
  score: number | null;
  level: ScoreLevel;
  /** Part du poids total réellement mesurée, entre 0 et 1. */
  confidence: number;
  subScores: SubScore[];
  /** Libellés des métriques manquantes. */
  missing: string[];
  /** Vue compatible avec l'affichage historique des facteurs. */
  factors: ScoreFactor[];
}

/** Pondération V1, documentée et volontairement simple. */
export const WEIGHTS = {
  volume: 20,
  buyers: 15,
  smartMoney: 20,
  liquidity: 15,
  holders: 10,
  creator: 10,
  growth: 10,
} as const;

/** Poids minimal mesuré pour qu'un score soit publié. */
export const MIN_CONFIDENCE = 0.5;

export const LEVEL_THRESHOLDS = { watch: 70, signal: 85, priority: 90 } as const;

function ramp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || max <= min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function pct(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

export function levelForScore(
  score: number | null,
  thresholds: { signal: number; priority: number } = LEVEL_THRESHOLDS,
): ScoreLevel {
  if (score === null) return "insufficient";
  if (score >= thresholds.priority) return "priority";
  if (score >= thresholds.signal) return "signal";
  if (score >= LEVEL_THRESHOLDS.watch) return "watch";
  return "ignored";
}

export function computeScore(
  input: ScoringInput,
  thresholds: { signal: number; priority: number } = LEVEL_THRESHOLDS,
): ScoringResult {
  const subScores: SubScore[] = [];

  const add = (
    key: string,
    label: string,
    weight: number,
    normalized: number | null,
    detail: string,
  ) => {
    subScores.push({
      key,
      label,
      weight,
      normalized,
      points: normalized === null ? null : Math.round((normalized * weight) / 100),
      detail,
    });
  };

  // 1) Volume et accélération.
  if (input.volume24h === null) {
    add("volume", "Volume / accélération", WEIGHTS.volume, null, "Volume indisponible");
  } else {
    const base = ramp(input.volume24h, 5_000, 250_000);
    let normalized = base;
    let detail = `Volume 24h ${Math.round(input.volume24h)} $`;
    if (input.volume1h !== null && input.volume24h > 0) {
      // >1 signifie que l'heure écoulée fait mieux que la moyenne horaire du jour.
      const acceleration = (input.volume1h * 24) / input.volume24h;
      normalized = 0.6 * base + 0.4 * ramp(acceleration, 1, 4);
      detail += ` · accélération ×${acceleration.toFixed(2)}`;
    }
    add("volume", "Volume / accélération", WEIGHTS.volume, pct(normalized), detail);
  }

  // 2) Nouveaux acheteurs (transactions d'achat sur 1h).
  add(
    "buyers",
    "Nouveaux acheteurs",
    WEIGHTS.buyers,
    input.buyers1h === null ? null : pct(ramp(input.buyers1h, 10, 300)),
    input.buyers1h === null ? "Acheteurs indisponibles" : `${Math.round(input.buyers1h)} achats sur 1h`,
  );

  // 3) Smart wallets (null tant qu'aucune analyse de wallets n'est branchée).
  add(
    "smartMoney",
    "Smart wallets",
    WEIGHTS.smartMoney,
    input.smartWallets === null ? null : pct(ramp(input.smartWallets, 0, 5)),
    input.smartWallets === null
      ? "Analyse smart money non disponible"
      : `${input.smartWallets} wallet(s) suivi(s)`,
  );

  // 4) Liquidité.
  add(
    "liquidity",
    "Liquidité",
    WEIGHTS.liquidity,
    input.liquidityUsd === null ? null : pct(ramp(input.liquidityUsd, 3_000, 60_000)),
    input.liquidityUsd === null
      ? "Liquidité indisponible"
      : `${Math.round(input.liquidityUsd)} $ de liquidité`,
  );

  // 5) Répartition des holders (concentration top 10 : plus bas = mieux).
  add(
    "holders",
    "Répartition holders",
    WEIGHTS.holders,
    input.holdersTop10Share === null
      ? null
      : pct(1 - ramp(input.holdersTop10Share, 0.2, 0.8)),
    input.holdersTop10Share === null
      ? "Concentration des holders indisponible"
      : `Top 10 = ${(input.holdersTop10Share * 100).toFixed(1)} % de l'offre`,
  );

  // 6) Créateur / historique (non résolu en V1 : reste explicitement inconnu).
  add(
    "creator",
    "Créateur / historique",
    WEIGHTS.creator,
    input.creatorHistory === null ? null : pct(input.creatorHistory),
    input.creatorHistory === null
      ? "Historique du créateur non résolu"
      : "Historique du créateur évalué",
  );

  // 7) Vitesse de croissance (variation de prix récente, pondérée par la fraîcheur).
  if (input.priceChange1h === null) {
    add("growth", "Vitesse de croissance", WEIGHTS.growth, null, "Variation 1h indisponible");
  } else {
    const move = ramp(input.priceChange1h, 0, 80);
    const freshness =
      input.ageMinutes === null ? 0.5 : Math.max(0, 1 - ramp(input.ageMinutes, 60, 1_440));
    add(
      "growth",
      "Vitesse de croissance",
      WEIGHTS.growth,
      pct(0.7 * move + 0.3 * freshness),
      `Variation 1h ${input.priceChange1h.toFixed(1)} %`,
    );
  }

  const availableWeight = subScores
    .filter((s) => s.normalized !== null)
    .reduce((sum, s) => sum + s.weight, 0);
  const confidence = availableWeight / 100;
  const missing = subScores.filter((s) => s.normalized === null).map((s) => s.label);

  let score: number | null = null;
  if (availableWeight > 0 && confidence >= MIN_CONFIDENCE) {
    const points = subScores.reduce((sum, s) => sum + (s.points ?? 0), 0);
    // Renormalisation sur le poids réellement mesuré.
    score = Math.max(0, Math.min(100, Math.round((points / availableWeight) * 100)));
  }

  const factors: ScoreFactor[] = subScores.map((s) => ({
    label: s.label,
    weight: s.weight,
    value: s.points ?? 0,
  }));

  return { score, level: levelForScore(score, thresholds), confidence, subScores, missing, factors };
}

/** Statut stocké en base à partir du niveau de score. */
export function tokenStatusForLevel(level: ScoreLevel): "watching" | "signal" | "critical" {
  if (level === "priority") return "critical";
  if (level === "signal") return "signal";
  return "watching";
}
