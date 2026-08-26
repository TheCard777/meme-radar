/**
 * Constantes du collecteur Solana — SERVEUR / WORKER UNIQUEMENT.
 *
 * MODE OBSERVATION UNIQUEMENT : aucune transaction n'est signée ni envoyée,
 * aucune clé privée n'est lue. Le collecteur ne fait que lire des logs.
 */

export const TRADING_ENABLED = false as const;

/** Program ID du lanceur Pump.fun (mainnet). */
export const PUMP_FUN_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

/** Marqueurs de logs considérés comme une création de token (conservateur). */
export const CREATE_LOG_MARKERS = [
  "Program log: Instruction: Create",
  "Program log: Instruction: InitializeMint2",
];

/** Nom de la source enregistrée en base pour les tokens détectés. */
export const COLLECTOR_SOURCE = "pumpfun-logs";

/** Intervalles (ms). */
export const HEARTBEAT_INTERVAL_MS = 15_000;
export const HEARTBEAT_TIMEOUT_MS = 45_000;
export const DESIRED_STATE_POLL_MS = 10_000;
export const BACKOFF_MIN_MS = 1_000;
export const BACKOFF_MAX_MS = 60_000;

/** Au-delà de ce délai sans heartbeat, le worker est considéré absent. */
export const STALE_HEARTBEAT_MS = 60_000;
