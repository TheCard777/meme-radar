/**
 * Alertes « POTENTIEL RUG PULL » — LOGIQUE PURE (aucun I/O, testable).
 *
 * Décide si une alerte de risque doit être envoyée à partir du Risk Score
 * réellement calculé (`risk-scoring.ts`) et de l'historique des alertes déjà
 * envoyées pour ce token. Ne qualifie JAMAIS un token de « rug pull confirmé ».
 */
import type { RiskResult } from "./risk-scoring";
import { summarizeRisk } from "./risk-scoring";
import { contractLines, contractLinkLines, ageFromLaunch } from "./telegram-token-block";

export type RiskAlertLevel = "high" | "critical" | "urgent";

export const RISK_ALERT_THRESHOLDS = { high: 55, critical: 75 } as const;
/** Chute de liquidité mesurée déclenchant une alerte urgente. */
export const URGENT_LIQUIDITY_DROP = 0.5;

export interface RiskAlertConfig {
  enabled: boolean;
  /** Confiance minimale (0-1) pour une alerte catégorique. */
  minConfidence: number;
  cooldownMinutes: number;
}

export const RISK_ALERT_DEFAULTS: RiskAlertConfig = {
  enabled: true,
  minConfidence: 0.5,
  cooldownMinutes: 360,
};

const RANK: Record<RiskAlertLevel, number> = { high: 1, critical: 2, urgent: 3 };

export function readRiskAlertConfig(row: {
  risk_alerts_enabled?: boolean | null;
  risk_alert_min_confidence?: number | null;
  risk_alert_cooldown_minutes?: number | null;
} | null): RiskAlertConfig {
  return {
    enabled: row?.risk_alerts_enabled ?? RISK_ALERT_DEFAULTS.enabled,
    minConfidence: Number(row?.risk_alert_min_confidence ?? RISK_ALERT_DEFAULTS.minConfidence),
    cooldownMinutes: row?.risk_alert_cooldown_minutes ?? RISK_ALERT_DEFAULTS.cooldownMinutes,
  };
}

/** Niveau d'alerte observé, ou null (risque faible, non évaluable, confiance insuffisante). */
export function classifyRiskAlert(
  risk: RiskResult | null,
  liquidityDropRatio: number | null,
  config: RiskAlertConfig,
): RiskAlertLevel | null {
  if (!risk || risk.score === null) return null;
  if (risk.confidence < config.minConfidence) return null;
  const dropMeasured = typeof liquidityDropRatio === "number" && Number.isFinite(liquidityDropRatio);
  if (dropMeasured && liquidityDropRatio >= URGENT_LIQUIDITY_DROP && risk.score >= RISK_ALERT_THRESHOLDS.high) {
    return "urgent";
  }
  if (risk.score >= RISK_ALERT_THRESHOLDS.critical) return "critical";
  if (risk.score >= RISK_ALERT_THRESHOLDS.high) return "high";
  return null;
}

export interface PreviousRiskAlert {
  level: RiskAlertLevel;
  createdAt: string;
}

/**
 * Déduplication : jamais deux fois le même niveau pendant le cooldown ;
 * une aggravation (high → critical → urgent) est toujours notifiée.
 */
export function shouldSendRiskAlert(
  level: RiskAlertLevel | null,
  previous: PreviousRiskAlert | null,
  config: RiskAlertConfig,
  nowMs = Date.now(),
): boolean {
  if (!config.enabled || !level) return false;
  if (!previous) return true;
  if (RANK[level] > RANK[previous.level]) return true;
  const elapsed = nowMs - Date.parse(previous.createdAt);
  return Number.isFinite(elapsed) && elapsed >= config.cooldownMinutes * 60_000;
}

export function buildRiskAlertMessage(params: {
  level: RiskAlertLevel;
  symbol: string;
  name: string;
  mint: string;
  risk: RiskResult;
  launchedAt?: string | null;
  pairUrl?: string | null;
  liquidityDropRatio?: number | null;
}): string {
  const header =
    params.level === "urgent"
      ? "🚨 URGENT — POTENTIEL RUG PULL (chute de liquidité)"
      : params.level === "critical"
        ? "⚠️ POTENTIEL RUG PULL — risque critique"
        : "⚠️ POTENTIEL RUG PULL — risque élevé";
  const signals = summarizeRisk(params.risk, 4);
  const lines = [
    header,
    "",
    `Token : $${params.symbol}`,
    `Nom : ${params.name || "Non disponible"}`,
    `Risk Score : ${params.risk.score}/100`,
    `Confiance : ${Math.round(params.risk.confidence * 100)} %`,
    `Âge : ${ageFromLaunch(params.launchedAt)}`,
  ];
  if (typeof params.liquidityDropRatio === "number") {
    lines.push(`Baisse de liquidité observée : ${(params.liquidityDropRatio * 100).toFixed(1)} %`);
  }
  lines.push("", "Signaux détectés :", ...(signals.length ? signals.map((s) => `• ${s}`) : ["• aucun détail disponible"]));
  if (params.risk.missing.length > 0) lines.push(`Non mesuré : ${params.risk.missing.join(", ")}`);
  lines.push(
    "",
    ...contractLines(params.mint),
    "",
    ...contractLinkLines(params.mint, params.pairUrl ?? null),
    "",
    "Conclusion : risque élevé détecté — vérification nécessaire avant toute décision.",
    "Indicateur d'observation, pas un rug pull confirmé. Aucun trading automatique.",
  );
  return lines.join("\n");
}
