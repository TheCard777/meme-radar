/** Message Telegram SIGNAL / PRIORITÉ — LOGIQUE PURE (texte brut). */
import type { ScoringResult } from "./scoring";
import type { MarketMetrics } from "./market.server";
import { summarizeRisk, type RiskResult } from "./risk-scoring";
import {
  ageFromLaunch,
  contractLines,
  contractLinkLines,
  NOT_AVAILABLE,
  usdOrNA,
} from "./telegram-token-block";

export function buildAlertMessage(params: {
  symbol: string;
  name: string;
  mint: string;
  scoring: ScoringResult;
  metrics: MarketMetrics | undefined;
  level: "signal" | "priority";
  launchedAt?: string | null;
  smartWallets?: number | null;
  risk?: RiskResult | null;
}): string {
  const { scoring, metrics } = params;
  const top = scoring.subScores
    .filter((s) => s.normalized !== null)
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    .slice(0, 3)
    .map((s) => `• ${s.label} : ${s.points}/${s.weight} (${s.detail})`)
    .join("\n");

  const lines = [
    `${params.level === "priority" ? "🚨 PRIORITÉ" : "📡 SIGNAL"} — $${params.symbol}`,
    `📛 Nom : ${params.name || NOT_AVAILABLE}`,
    "",
    ...contractLines(params.mint),
    "",
    `⭐ Score Meme Radar : ${scoring.score !== null && scoring.score !== undefined ? `${scoring.score}/100` : NOT_AVAILABLE}`,
    `💧 Liquidité : ${usdOrNA(metrics?.liquidityUsd)}`,
    `💰 Market cap : ${usdOrNA(metrics?.marketCap)}`,
    `⏱️ Âge : ${ageFromLaunch(params.launchedAt)}`,
    "",
    `Fiabilité des données : ${Math.round(scoring.confidence * 100)} %`,
    `Smart wallets qualifiés : ${params.smartWallets ?? NOT_AVAILABLE}`,
    `Volume 24h : ${usdOrNA(metrics?.volume24h)}`,
    `Volume 1h : ${usdOrNA(metrics?.volume1h)}`,
    `Acheteurs 1h : ${metrics?.buyers1h ?? NOT_AVAILABLE}`,
    "",
    "Sous-scores principaux :",
    top || "• aucun sous-score disponible",
  ];

  if (scoring.missing.length > 0) {
    lines.push(`Données manquantes : ${scoring.missing.join(", ")}`);
  }

  if (params.risk && params.risk.score !== null) {
    lines.push(
      "",
      `Risque : ${params.risk.score}/100 (${params.risk.level}) — fiabilité ${Math.round(params.risk.confidence * 100)} %`,
      ...summarizeRisk(params.risk).map((line) => `• ${line}`),
    );
    if (params.risk.missing.length > 0) {
      lines.push(`Risque non mesuré : ${params.risk.missing.join(", ")}`);
    }
  } else if (params.risk) {
    lines.push("", "Risque : non évaluable (données on-chain insuffisantes).");
  }

  lines.push(
    "",
    ...contractLinkLines(params.mint, metrics?.pairUrl ?? null),
    `Horodatage : ${new Date().toISOString()}`,
    "",
    "Indicateur d'observation — ni conseil financier ni garantie. Aucun trading automatique.",
  );

  return lines.join("\n");
}
