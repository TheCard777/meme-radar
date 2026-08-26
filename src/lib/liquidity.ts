/**
 * Analyse de liquidité — module pur (aucun I/O, testable).
 * Détecte une baisse anormale de liquidité à partir des snapshots RÉELS déjà
 * collectés. Aucune valeur n'est inventée : sans historique, on renvoie null.
 */

export interface LiquidityPoint {
  capturedAt: string;
  liquidityUsd: number | null;
}

/** Nombre minimal de points exploitables pour publier une tendance. */
export const MIN_LIQUIDITY_POINTS = 3;
/** Liquidité minimale au pic pour que la variation soit significative. */
export const MIN_PEAK_LIQUIDITY_USD = 1_000;

/**
 * Baisse relative (0-1) entre le pic observé et la dernière valeur.
 * `null` si l'historique est insuffisant ou non significatif.
 */
export function computeLiquidityDrop(points: LiquidityPoint[]): number | null {
  const usable = points
    .filter((p) => typeof p.liquidityUsd === "number" && Number.isFinite(p.liquidityUsd))
    .map((p) => ({ ts: Date.parse(p.capturedAt), value: p.liquidityUsd as number }))
    .filter((p) => Number.isFinite(p.ts) && p.value > 0)
    .sort((a, b) => a.ts - b.ts);

  if (usable.length < MIN_LIQUIDITY_POINTS) return null;

  const peak = Math.max(...usable.map((p) => p.value));
  if (peak < MIN_PEAK_LIQUIDITY_USD) return null;

  const last = usable[usable.length - 1]!.value;
  if (last >= peak) return 0;
  return Math.max(0, Math.min(1, (peak - last) / peak));
}
