/**
 * Rétention des données — logique pure (aucun I/O).
 *
 * L'historique de prix (`token_snapshots`) grossit sans fin et finit par
 * saturer la base. Un memecoin mort depuis plusieurs jours ne remonte pas :
 * ses anciens instantanés ne servent plus. On ne garde que les récents.
 *
 * Ce qui a besoin des instantanés : le calcul de risque (30 derniers), la
 * page Performance (suivi des signaux des 7 derniers jours), le suivi après
 * alerte (70 min). 7 jours couvrent tout cela avec une marge confortable.
 */

export const SNAPSHOT_RETENTION_DAYS = 7;
/** Lignes supprimées par cycle : borné pour ne jamais bloquer longtemps la table. */
export const SNAPSHOT_PURGE_BATCH = 3000;

/** Date limite : tout instantané capturé avant est purgeable. */
export function snapshotCutoff(now: Date, days = SNAPSHOT_RETENTION_DAYS): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}
