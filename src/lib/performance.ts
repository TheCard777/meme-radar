/**
 * Performance observée APRÈS chaque signal — module pur (aucun I/O).
 *
 * On compare le prix enregistré au moment de l'alerte aux instantanés
 * (`token_snapshots`) capturés ensuite. Aucun résultat n'est extrapolé :
 * si aucun instantané n'existe pour un horizon, la valeur reste `null`.
 *
 * AVERTISSEMENT : mesure descriptive du passé observé, sur un échantillon
 * affiché. Ce n'est ni une prévision, ni une promesse de rendement.
 */

export interface AlertPoint {
  id: string;
  token_id: string | null;
  token_symbol: string;
  score: number;
  created_at: string;
  price_usd_at_alert: number | null;
}

export interface SnapshotPoint {
  token_id: string;
  captured_at: string;
  price_usd: number;
}

export const HORIZONS_MIN = [5, 15, 60, 360, 1440] as const;
export type HorizonMinutes = (typeof HORIZONS_MIN)[number];

export interface SignalOutcome {
  alertId: string;
  symbol: string;
  score: number;
  cohort: "85-89" | "90-100";
  /** Multiples par horizon (null = pas encore d'instantané exploitable). */
  horizons: Record<HorizonMinutes, number | null>;
  maxMultiple: number | null;
  lastMultiple: number | null;
}

export interface CohortStats {
  cohort: "85-89" | "90-100";
  sample: number;
  measured: number;
  medianMax: number | null;
  bestMax: number | null;
  survivalRate: number | null;
  lossRate: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const low = sorted[mid - 1];
  const high = sorted[mid];
  if (sorted.length % 2 === 0) {
    if (low === undefined || high === undefined) return null;
    return (low + high) / 2;
  }
  return high ?? null;
}

export function computeOutcomes(
  alerts: AlertPoint[],
  snapshots: SnapshotPoint[],
): SignalOutcome[] {
  const byToken = new Map<string, SnapshotPoint[]>();
  for (const snapshot of snapshots) {
    if (!(snapshot.price_usd > 0)) continue;
    const bucket = byToken.get(snapshot.token_id) ?? [];
    bucket.push(snapshot);
    byToken.set(snapshot.token_id, bucket);
  }
  for (const bucket of byToken.values()) {
    bucket.sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  }

  const outcomes: SignalOutcome[] = [];
  for (const alert of alerts) {
    if (alert.score < 85) continue;
    const cohort: "85-89" | "90-100" = alert.score >= 90 ? "90-100" : "85-89";
    const base = alert.price_usd_at_alert;
    const series = alert.token_id ? (byToken.get(alert.token_id) ?? []) : [];
    const alertTime = new Date(alert.created_at).getTime();

    const horizons = Object.fromEntries(
      HORIZONS_MIN.map((h) => [h, null as number | null]),
    ) as Record<HorizonMinutes, number | null>;

    let maxMultiple: number | null = null;
    let lastMultiple: number | null = null;

    if (base && base > 0) {
      const after = series.filter((s) => new Date(s.captured_at).getTime() >= alertTime);
      for (const horizon of HORIZONS_MIN) {
        const deadline = alertTime + horizon * 60_000;
        const point = [...after]
          .reverse()
          .find((s) => new Date(s.captured_at).getTime() <= deadline);
        horizons[horizon] = point ? point.price_usd / base : null;
      }
      const multiples = after.map((s) => s.price_usd / base);
      if (multiples.length > 0) {
        maxMultiple = Math.max(...multiples);
        lastMultiple = multiples[multiples.length - 1] ?? null;
      }
    }

    outcomes.push({
      alertId: alert.id,
      symbol: alert.token_symbol,
      score: alert.score,
      cohort,
      horizons,
      maxMultiple,
      lastMultiple,
    });
  }
  return outcomes;
}

export function summarizeCohort(
  outcomes: SignalOutcome[],
  cohort: "85-89" | "90-100",
): CohortStats {
  const rows = outcomes.filter((o) => o.cohort === cohort);
  const measured = rows.filter((o) => o.maxMultiple !== null);
  const maxes = measured.map((o) => o.maxMultiple as number);
  const lasts = measured.map((o) => o.lastMultiple).filter((v): v is number => v !== null);

  return {
    cohort,
    sample: rows.length,
    measured: measured.length,
    medianMax: median(maxes),
    bestMax: maxes.length > 0 ? Math.max(...maxes) : null,
    // « Survie » = dernier prix observé >= 50 % du prix au moment du signal.
    survivalRate: lasts.length > 0 ? lasts.filter((v) => v >= 0.5).length / lasts.length : null,
    lossRate: lasts.length > 0 ? lasts.filter((v) => v < 1).length / lasts.length : null,
  };
}
