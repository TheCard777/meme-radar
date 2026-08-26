/**
 * Scoring /100 des memecoins Solana — module pur (aucun I/O, testable).
 *
 * MODE OBSERVATION UNIQUEMENT : le score ne déclenche jamais d'ordre d'achat
 * ou de vente, uniquement un affichage dashboard et éventuellement une alerte.
 */

import type { ScoreFactor } from "./radar-types";

export interface ScoringInput {
  marketCap: number;
  liquidityUsd: number;
  volume24h: number;
  volume1h: number;
  buyers: number;
  priceChange1h: number;
  smartWallets: number;
  ageMinutes: number;
  /** Aucune donnée de marché trouvée (token trop jeune ou sans pool). */
  hasMarketData: boolean;
}

export interface ScoringResult {
  score: number;
  factors: ScoreFactor[];
  status: "watching" | "signal" | "critical";
}

/** Interpolation linéaire bornée sur [0,1]. */
function ramp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || max <= min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

const WEIGHTS = {
  liquidity: 20,
  volume: 20,
  momentum: 15,
  buyers: 15,
  smartMoney: 15,
  marketCap: 10,
  freshness: 5,
} as const;

export function computeScore(input: ScoringInput): ScoringResult {
  // Sans données de marché, on reste honnête : score 0, aucun signal.
  if (!input.hasMarketData) {
    return {
      score: 0,
      factors: [
        { label: "Données de marché indisponibles", weight: 100, value: 0 },
      ],
      status: "watching",
    };
  }

  const liquidity = ramp(input.liquidityUsd, 3_000, 60_000);
  // Volume rapporté à la liquidité : rotation saine sans être absurde.
  const turnover = input.liquidityUsd > 0 ? input.volume24h / input.liquidityUsd : 0;
  const volume = 0.6 * ramp(input.volume24h, 5_000, 250_000) + 0.4 * ramp(turnover, 0.5, 8);
  const momentum =
    0.6 * ramp(input.priceChange1h, 0, 80) +
    0.4 * ramp(input.volume1h, 1_000, 60_000);
  const buyers = ramp(input.buyers, 20, 400);
  const smartMoney = ramp(input.smartWallets, 0, 5);
  // Sweet spot de market cap : ni trop petit, ni déjà pumpé.
  const marketCap =
    input.marketCap <= 0
      ? 0
      : input.marketCap < 300_000
        ? ramp(input.marketCap, 10_000, 300_000)
        : Math.max(0, 1 - ramp(input.marketCap, 300_000, 3_000_000));
  const freshness = Math.max(0, 1 - ramp(input.ageMinutes, 60, 1_440));

  const factors: ScoreFactor[] = [
    { label: "Liquidité", weight: WEIGHTS.liquidity, value: Math.round(liquidity * 100) },
    { label: "Volume", weight: WEIGHTS.volume, value: Math.round(volume * 100) },
    { label: "Momentum 1h", weight: WEIGHTS.momentum, value: Math.round(momentum * 100) },
    { label: "Nouveaux acheteurs", weight: WEIGHTS.buyers, value: Math.round(buyers * 100) },
    { label: "Smart money", weight: WEIGHTS.smartMoney, value: Math.round(smartMoney * 100) },
    { label: "Market cap", weight: WEIGHTS.marketCap, value: Math.round(marketCap * 100) },
    { label: "Fraîcheur", weight: WEIGHTS.freshness, value: Math.round(freshness * 100) },
  ];

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(factors.reduce((sum, f) => sum + (f.weight * f.value) / 100, 0)),
    ),
  );

  return { score, factors, status: "watching" };
}

/** Statut dérivé des seuils configurés dans les réglages du bot. */
export function statusForScore(
  score: number,
  telegramThreshold: number,
  criticalThreshold: number,
): "watching" | "signal" | "critical" {
  if (score >= criticalThreshold) return "critical";
  if (score >= telegramThreshold) return "signal";
  return "watching";
}
