/**
 * Suivi individuel des tokens (cloche 🔔) — LOGIQUE PURE ET TESTABLE.
 *
 * Compare l'état précédemment observé d'un token suivi avec l'état courant
 * produit par le pipeline d'enrichissement existant, et n'émet un événement
 * QUE lorsqu'un changement matériel ou un changement d'état est constaté.
 *
 * Aucune donnée inventée : une métrique inconnue reste `null` et n'émet rien.
 * Aucun trading, aucune clé privée, aucun second système de surveillance.
 */

export type TrackedMetrics = {
  score: number | null;
  volume1h: number | null;
  buyers: number | null;
  liquidityUsd: number | null;
  smartWallets: number | null;
  riskScore: number | null;
  riskLevel: string | null;
  priceChange1h: number | null;
};

export type MomentumState = "unknown" | "accelerating" | "stable" | "caution" | "degrading";

export type TrackedEventType =
  | "momentum_state"
  | "volume_shift"
  | "buyers_shift"
  | "smart_wallets"
  | "liquidity_drop"
  | "risk_up"
  | "exit_signal";

export type TrackedEvent = {
  type: TrackedEventType;
  /** État associé : la déduplication se fait par (type + état). */
  state: string;
  severity: "info" | "warning" | "critical";
  label: string;
  detail: string;
};

/** Seuils « changement matériel » : évitent un spam sur 78 -> 79. */
export const TRACKING_THRESHOLDS = {
  volumeRatio: 0.6,
  volumeAbsUsd: 5_000,
  buyersRatio: 0.5,
  buyersAbs: 25,
  smartWalletsAbs: 2,
  liquidityDropRatio: 0.3,
  liquidityDropAbsUsd: 5_000,
  riskScoreJump: 15,
  exitLiquidityDropRatio: 0.5,
  /** Fenêtre anti-spam par (token + type d'événement + état). */
  cooldownMs: 45 * 60 * 1000,
} as const;

const RISK_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

const EMPTY: TrackedMetrics = {
  score: null,
  volume1h: null,
  buyers: null,
  liquidityUsd: null,
  smartWallets: null,
  riskScore: null,
  riskLevel: null,
  priceChange1h: null,
};

export function emptyMetrics(): TrackedMetrics {
  return { ...EMPTY };
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Relit un `last_metrics` jsonb de façon défensive. */
export function parseMetrics(raw: unknown): TrackedMetrics {
  if (!raw || typeof raw !== "object") return emptyMetrics();
  const obj = raw as Record<string, unknown>;
  return {
    score: num(obj["score"]),
    volume1h: num(obj["volume1h"]),
    buyers: num(obj["buyers"]),
    liquidityUsd: num(obj["liquidityUsd"]),
    smartWallets: num(obj["smartWallets"]),
    riskScore: num(obj["riskScore"]),
    riskLevel: typeof obj["riskLevel"] === "string" ? obj["riskLevel"] : null,
    priceChange1h: num(obj["priceChange1h"]),
  };
}

/**
 * État de momentum lisible, dérivé uniquement de données mesurées.
 * `unknown` tant que ni la variation de prix ni la liquidité ne sont connues.
 */
export function momentumState(
  current: TrackedMetrics,
  previous: TrackedMetrics,
): MomentumState {
  const change = current.priceChange1h;
  const liqDrop = liquidityDropRatio(current, previous);

  if (liqDrop !== null && liqDrop >= TRACKING_THRESHOLDS.exitLiquidityDropRatio) {
    return "degrading";
  }
  if (change === null) return "unknown";
  if (change <= -35) return "degrading";
  if (change <= -10) return "caution";
  if (change >= 25) return "accelerating";
  return "stable";
}

function liquidityDropRatio(
  current: TrackedMetrics,
  previous: TrackedMetrics,
): number | null {
  if (current.liquidityUsd === null || previous.liquidityUsd === null) return null;
  if (previous.liquidityUsd <= 0) return null;
  const drop = (previous.liquidityUsd - current.liquidityUsd) / previous.liquidityUsd;
  return drop > 0 ? drop : 0;
}

const MOMENTUM_LABEL: Record<MomentumState, string> = {
  unknown: "momentum inconnu",
  accelerating: "accélération",
  stable: "momentum intact",
  caution: "prudence",
  degrading: "dégradation forte",
};

function usd(value: number | null): string {
  return value === null ? "inconnu" : `${Math.round(value).toLocaleString("fr-FR")} $`;
}

function ratioBucket(ratio: number): string {
  // Regroupe l'amplitude pour que deux cycles proches ne créent pas 2 alertes.
  const pct = Math.abs(ratio) * 100;
  const bucket = pct >= 200 ? "200+" : pct >= 100 ? "100" : pct >= 60 ? "60" : "30";
  return `${ratio >= 0 ? "up" : "down"}:${bucket}`;
}

/**
 * Détecte les changements significatifs entre deux observations réelles.
 * Renvoie une liste vide quand rien de matériel n'a changé.
 */
export function detectTrackedEvents(params: {
  current: TrackedMetrics;
  previous: TrackedMetrics;
  previousState: MomentumState | string;
}): { events: TrackedEvent[]; state: MomentumState } {
  const { current, previous } = params;
  const events: TrackedEvent[] = [];
  const state = momentumState(current, previous);
  const previousState = (params.previousState || "unknown") as MomentumState;

  // 1) Changement d'état de momentum (intact -> prudence, etc.)
  if (state !== "unknown" && state !== previousState) {
    const worsening =
      (RISK_ORDER["x"] ?? 0, ["accelerating", "stable", "caution", "degrading"].indexOf(state)) >
      ["accelerating", "stable", "caution", "degrading"].indexOf(previousState);
    events.push({
      type: "momentum_state",
      state,
      severity: state === "degrading" ? "critical" : worsening ? "warning" : "info",
      label: `Momentum : ${MOMENTUM_LABEL[previousState]} → ${MOMENTUM_LABEL[state]}`,
      detail:
        current.priceChange1h === null
          ? "Variation de prix 1h inconnue — état déduit de la liquidité."
          : `Variation 1h : ${current.priceChange1h.toFixed(1)} %`,
    });
  }

  // 2) Volume 1h
  if (current.volume1h !== null && previous.volume1h !== null && previous.volume1h > 0) {
    const delta = current.volume1h - previous.volume1h;
    const ratio = delta / previous.volume1h;
    if (
      Math.abs(ratio) >= TRACKING_THRESHOLDS.volumeRatio &&
      Math.abs(delta) >= TRACKING_THRESHOLDS.volumeAbsUsd
    ) {
      events.push({
        type: "volume_shift",
        state: ratioBucket(ratio),
        severity: ratio > 0 ? "info" : "warning",
        label: `Volume 1h ${ratio > 0 ? "en forte hausse" : "en forte baisse"} (${Math.round(ratio * 100)} %)`,
        detail: `${usd(previous.volume1h)} → ${usd(current.volume1h)}`,
      });
    }
  }

  // 3) Nouveaux acheteurs
  if (current.buyers !== null && previous.buyers !== null) {
    const delta = current.buyers - previous.buyers;
    const base = Math.max(previous.buyers, 1);
    const ratio = delta / base;
    if (
      Math.abs(delta) >= TRACKING_THRESHOLDS.buyersAbs &&
      Math.abs(ratio) >= TRACKING_THRESHOLDS.buyersRatio
    ) {
      events.push({
        type: "buyers_shift",
        state: ratioBucket(ratio),
        severity: delta > 0 ? "info" : "warning",
        label: `Acheteurs ${delta > 0 ? "+" : ""}${delta} (${Math.round(ratio * 100)} %)`,
        detail: `${previous.buyers} → ${current.buyers} acheteurs observés`,
      });
    }
  }

  // 4) Smart wallets (entrée ou sortie significative)
  if (current.smartWallets !== null && previous.smartWallets !== null) {
    const delta = current.smartWallets - previous.smartWallets;
    if (Math.abs(delta) >= TRACKING_THRESHOLDS.smartWalletsAbs) {
      events.push({
        type: "smart_wallets",
        state: `${delta > 0 ? "in" : "out"}:${current.smartWallets}`,
        severity: delta > 0 ? "info" : "warning",
        label: `Smart wallets ${delta > 0 ? "+" : ""}${delta}`,
        detail: `${previous.smartWallets} → ${current.smartWallets} smart wallets qualifiés`,
      });
    }
  }

  // 5) Baisse significative de liquidité
  const drop = liquidityDropRatio(current, previous);
  if (
    drop !== null &&
    drop >= TRACKING_THRESHOLDS.liquidityDropRatio &&
    previous.liquidityUsd !== null &&
    current.liquidityUsd !== null &&
    previous.liquidityUsd - current.liquidityUsd >= TRACKING_THRESHOLDS.liquidityDropAbsUsd
  ) {
    events.push({
      type: "liquidity_drop",
      state: ratioBucket(-drop),
      severity: drop >= TRACKING_THRESHOLDS.exitLiquidityDropRatio ? "critical" : "warning",
      label: `Liquidité en baisse de ${Math.round(drop * 100)} %`,
      detail: `${usd(previous.liquidityUsd)} → ${usd(current.liquidityUsd)}`,
    });
  }

  // 6) Risque en hausse (catégorie plus dangereuse ou saut de score)
  if (current.riskScore !== null && previous.riskScore !== null) {
    const levelUp =
      current.riskLevel !== null &&
      previous.riskLevel !== null &&
      (RISK_ORDER[current.riskLevel] ?? -1) > (RISK_ORDER[previous.riskLevel] ?? -1);
    const jump = current.riskScore - previous.riskScore >= TRACKING_THRESHOLDS.riskScoreJump;
    if (levelUp || jump) {
      events.push({
        type: "risk_up",
        state: `${current.riskLevel ?? "unknown"}:${Math.round(current.riskScore / 10) * 10}`,
        severity: current.riskLevel === "critical" ? "critical" : "warning",
        label: `Risque en hausse : ${previous.riskScore} → ${current.riskScore}/100${
          levelUp ? ` (${previous.riskLevel} → ${current.riskLevel})` : ""
        }`,
        detail: levelUp
          ? "Changement de catégorie de risque."
          : "Hausse matérielle du score de risque.",
      });
    }
  }

  // 7) Exit signal : dégradation forte réellement mesurée
  const exitByLiquidity = drop !== null && drop >= TRACKING_THRESHOLDS.exitLiquidityDropRatio;
  const exitByPrice = current.priceChange1h !== null && current.priceChange1h <= -50;
  if (exitByLiquidity || exitByPrice) {
    events.push({
      type: "exit_signal",
      state: exitByLiquidity ? "liquidity" : "price",
      severity: "critical",
      label: "Exit Signal — dégradation forte détectée",
      detail: exitByLiquidity
        ? `Liquidité : ${usd(previous.liquidityUsd)} → ${usd(current.liquidityUsd)}`
        : `Variation 1h : ${current.priceChange1h?.toFixed(1)} %`,
    });
  }

  return { events, state };
}

/**
 * Anti-spam : un même (type + état) n'est pas renvoyé dans la fenêtre de
 * cooldown. Un changement d'état renvoie immédiatement une alerte.
 */
export function shouldSendEvent(
  event: TrackedEvent,
  last: { event_state: string; created_at: string } | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!last) return true;
  if (last.event_state !== event.state) return true;
  return now.getTime() - new Date(last.created_at).getTime() >= TRACKING_THRESHOLDS.cooldownMs;
}

/** Message Telegram d'un token suivi (📌 distinct des alertes globales). */
export function buildTrackedAlertMessage(params: {
  symbol: string;
  name: string | null;
  mint: string;
  state: MomentumState;
  events: TrackedEvent[];
  current: TrackedMetrics;
  pairUrl: string | null;
}): string {
  return [
    "🔔 TOKEN SUIVI — changement significatif",
    "",
    `🪙 Token : $${params.symbol}${params.name ? ` (${params.name})` : ""}`,
    `📊 État : ${MOMENTUM_LABEL[params.state]}`,
    "",
    ...params.events.map((e) => `• ${e.label}\n  ${e.detail}`),
    "",
    `⭐ Score Radar : ${params.current.score !== null ? `${params.current.score}/100` : "inconnu"} (informatif)`,
    `⚠️ Risque : ${params.current.riskScore !== null ? `${params.current.riskScore}/100 (${params.current.riskLevel})` : "non évaluable"}`,
    `💧 Liquidité : ${usd(params.current.liquidityUsd)}`,
    `📈 Volume 1h : ${usd(params.current.volume1h)}`,
    `👥 Acheteurs : ${params.current.buyers ?? "inconnu"}`,
    "",
    `🔗 DEX : ${params.pairUrl ?? `https://dexscreener.com/solana/${params.mint}`}`,
    `🔗 Explorer : https://solscan.io/token/${params.mint}`,
    "",
    "Suivi personnalisé — observation uniquement, aucun trading automatique.",
  ].join("\n");
}
