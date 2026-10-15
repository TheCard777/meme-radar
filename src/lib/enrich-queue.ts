/**
 * Planification du cycle d'enrichissement (logique pure, testable).
 *
 * - Les tokens récents (< 2 h) sont traités en priorité.
 * - Un token sans marché trouvé (réponse DEX Screener valide mais vide) n'est
 *   pas une erreur : il est reprogrammé avec un délai progressif.
 * - Une erreur technique (429, 5xx, réseau) ne touche pas au délai des tokens.
 */

export const RECENT_WINDOW_MS = 2 * 60 * 60 * 1000;
/** Part du lot réservée aux tokens récents (le reste complète si besoin). */
export const RECENT_SHARE = 0.8;

const MINUTE = 60_000;
/** Délai de base et plafonds du backoff « aucun marché ». */
export const NO_MARKET_BASE_MS = 2 * MINUTE;
export const NO_MARKET_MAX_RECENT_MS = 15 * MINUTE;
export const NO_MARKET_MAX_OLD_MS = 6 * 60 * MINUTE;

/** Délai avant la prochaine tentative après `missCount` absences consécutives (>=1). */
export function noMarketDelayMs(missCount: number, ageMs: number): number {
  const n = Math.max(1, Math.floor(missCount));
  const cap = ageMs < RECENT_WINDOW_MS ? NO_MARKET_MAX_RECENT_MS : NO_MARKET_MAX_OLD_MS;
  return Math.min(cap, NO_MARKET_BASE_MS * 2 ** Math.min(n - 1, 20));
}

export function nextEnrichAfterMiss(
  previousMissCount: number,
  launchedAt: string,
  now: Date,
): { market_miss_count: number; next_enrich_at: string } {
  const missCount = previousMissCount + 1;
  const ageMs = Math.max(0, now.getTime() - new Date(launchedAt).getTime());
  return {
    market_miss_count: missCount,
    next_enrich_at: new Date(now.getTime() + noMarketDelayMs(missCount, ageMs)).toISOString(),
  };
}

/** Répartition du lot entre récents et anciens. */
export function splitBatch(limit: number): { recent: number; old: number } {
  const recent = Math.max(1, Math.round(limit * RECENT_SHARE));
  return { recent, old: Math.max(0, limit - recent) };
}

/** Erreurs temporaires DEX Screener à réessayer. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Délai d'attente avant nouvel essai (Retry-After en secondes, borné). */
export function retryDelayMs(retryAfter: string | null, attempt: number): number {
  const seconds = retryAfter ? Number.parseFloat(retryAfter) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(10_000, seconds * 1000);
  return Math.min(10_000, 1000 * 2 ** attempt);
}
