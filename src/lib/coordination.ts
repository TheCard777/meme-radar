/**
 * Détection de comportements coordonnés — module pur (aucun I/O, testable).
 *
 * Basé UNIQUEMENT sur des entrées réelles observées on-chain
 * (`wallet_token_entries`). On ne conclut jamais à une manipulation certaine :
 * on publie des drapeaux (`flags`) et une confiance. Une donnée non mesurable
 * reste `null`.
 */

export interface CoordinationEntry {
  address: string;
  rank: number;
  /** ISO date de l'achat observé (null = horodatage inconnu). */
  blockTime: string | null;
  /** Financeur SOL identifié (null = non vérifié ou introuvable). */
  funder?: string | null;
}

export interface CoordinationFlags {
  /** Entrées réellement analysées. */
  entriesAnalyzed: number;
  /** Entrées disposant d'un horodatage exploitable. */
  timedEntries: number;
  /** Plus grand groupe d'achats dans la fenêtre `windowMs`. */
  largestSimultaneousCluster: number | null;
  /** Part des entrées appartenant à un groupe quasi simultané, 0-1. */
  simultaneousRatio: number | null;
  /** Wallets dont le financeur SOL a été vérifié. */
  fundersChecked: number;
  /** Plus grand groupe de wallets partageant un même financeur. */
  largestFunderGroup: number | null;
  /** Part des wallets vérifiés partageant un financeur commun, 0-1. */
  sharedFunderRatio: number | null;
  /** Indice global 0-1, ou null si rien n'est mesurable. */
  coordinationScore: number | null;
  /** Notes explicites (limites, données absentes). */
  notes: string[];
}

/** Fenêtre par défaut considérée comme « quasi simultané ». */
export const SIMULTANEOUS_WINDOW_MS = 3_000;
/** Échantillon minimal d'entrées horodatées pour publier un indice. */
export const MIN_COORDINATION_SAMPLE = 4;

export function detectCoordination(
  entries: CoordinationEntry[],
  windowMs = SIMULTANEOUS_WINDOW_MS,
): CoordinationFlags {
  const notes: string[] = [];
  const timed = entries
    .map((e) => ({ ...e, ts: e.blockTime ? Date.parse(e.blockTime) : Number.NaN }))
    .filter((e) => Number.isFinite(e.ts))
    .sort((a, b) => a.ts - b.ts);

  let largestCluster: number | null = null;
  let simultaneousRatio: number | null = null;

  if (timed.length >= MIN_COORDINATION_SAMPLE) {
    let best = 1;
    let inCluster = new Set<string>();
    let start = 0;
    for (let end = 0; end < timed.length; end += 1) {
      while (timed[end]!.ts - timed[start]!.ts > windowMs) start += 1;
      const size = end - start + 1;
      if (size > best) best = size;
      if (size >= 2) {
        for (let i = start; i <= end; i += 1) inCluster.add(timed[i]!.address);
      }
    }
    largestCluster = best;
    simultaneousRatio = inCluster.size / timed.length;
  } else {
    notes.push(
      `Horodatages insuffisants (${timed.length} < ${MIN_COORDINATION_SAMPLE}) — achats simultanés non évaluables`,
    );
  }

  const funded = entries.filter((e) => typeof e.funder === "string" && e.funder.length > 0);
  let largestFunderGroup: number | null = null;
  let sharedFunderRatio: number | null = null;
  if (funded.length >= 2) {
    const groups = new Map<string, number>();
    for (const entry of funded) {
      const key = entry.funder as string;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    largestFunderGroup = Math.max(...groups.values());
    sharedFunderRatio = largestFunderGroup > 1 ? largestFunderGroup / funded.length : 0;
  } else {
    notes.push("Financeur SOL non vérifié pour un nombre suffisant de wallets");
  }

  const parts: number[] = [];
  if (simultaneousRatio !== null) parts.push(simultaneousRatio);
  if (sharedFunderRatio !== null) parts.push(sharedFunderRatio);
  const coordinationScore =
    parts.length === 0 ? null : Math.min(1, parts.reduce((a, b) => a + b, 0) / parts.length);

  notes.push(
    "Indice d'observation : une simultanéité peut être due au marché, ce n'est pas une preuve de manipulation.",
  );
  notes.push("Wash trading / revente rapide : non mesurable depuis les entrées seules.");

  return {
    entriesAnalyzed: entries.length,
    timedEntries: timed.length,
    largestSimultaneousCluster: largestCluster,
    simultaneousRatio,
    fundersChecked: funded.length,
    largestFunderGroup,
    sharedFunderRatio,
    coordinationScore,
    notes,
  };
}

/**
 * Part des premières entrées survenues très peu de temps après la création du
 * token (sniping). `null` si l'un des horodatages manque.
 */
export function computeSniperRatio(
  entries: CoordinationEntry[],
  launchedAt: string | null,
  windowMs = 30_000,
): number | null {
  if (!launchedAt) return null;
  const launch = Date.parse(launchedAt);
  if (!Number.isFinite(launch)) return null;
  const timed = entries.filter((e) => e.blockTime && Number.isFinite(Date.parse(e.blockTime)));
  if (timed.length < MIN_COORDINATION_SAMPLE) return null;
  const snipers = timed.filter((e) => {
    const delta = Date.parse(e.blockTime as string) - launch;
    return delta >= 0 && delta <= windowMs;
  }).length;
  return snipers / timed.length;
}
