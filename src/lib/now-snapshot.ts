/**
 * Snapshot ⚡ NOW — LOGIQUE PURE ET TESTABLE.
 *
 * Construit le message Telegram d'une analyse ponctuelle d'un token, à partir
 * des données réelles déjà produites par le pipeline. Aucune donnée inventée :
 * ce qui est inconnu est explicitement listé comme manquant.
 */

export type NowSnapshotInput = {
  symbol: string;
  name: string | null;
  mint: string;
  launchedAt: string | null;
  marketCap: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  volume1h: number | null;
  buyers: number | null;
  buyers1h: number | null;
  smartWallets: number | null;
  score: number | null;
  scoreConfidence: number | null;
  riskScore: number | null;
  riskLevel: string | null;
  lpStatus: string | null;
  holdersTop10Share: number | null;
  topFactors: Array<{ label: string; detail?: string }>;
  pairUrl: string | null;
  isSimulated: boolean;
  /** Horodatage du rafraîchissement à la demande. */
  refreshedAt?: string;
  /** Données non rafraîchissables à l'instant : valeur reprise + ancienneté. */
  staleFields?: Array<{ label: string; ageMinutes: number }>;
};


const UNKNOWN = "inconnu";

export function usd(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? UNKNOWN
    : `${Math.round(value).toLocaleString("fr-FR")} $`;
}

export function ageLabel(iso: string | null): string {
  if (!iso) return UNKNOWN;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return UNKNOWN;
  const minutes = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} j`;
}

function pct(value: number | null): string {
  return value === null || !Number.isFinite(value) ? UNKNOWN : `${Math.round(value * 100)} %`;
}

/** Liste explicite des données non mesurées (jamais inventées). */
export function missingFields(input: NowSnapshotInput): string[] {
  const missing: string[] = [];
  if (input.marketCap === null) missing.push("market cap");
  if (input.liquidityUsd === null) missing.push("liquidité");
  if (input.volume24h === null) missing.push("volume 24h");
  if (input.volume1h === null) missing.push("volume 1h");
  if (input.buyers1h === null) missing.push("acheteurs 1h");
  if (input.smartWallets === null) missing.push("smart wallets");
  if (input.score === null) missing.push("score Radar");
  if (input.riskScore === null) missing.push("risk score");
  if (input.holdersTop10Share === null) missing.push("concentration top-10");
  if (!input.lpStatus || input.lpStatus === "unknown") missing.push("statut LP");
  return missing;
}

export function buildNowSnapshotMessage(input: NowSnapshotInput): string {
  const missing = missingFields(input);
  const lines: string[] = [
    "⚡ NOW — analyse instantanée",
    "",
    `🪙 Token : $${input.symbol}${input.name ? ` (${input.name})` : ""}`,
    `⏱️ Âge : ${ageLabel(input.launchedAt)}`,
    `💰 Market cap : ${usd(input.marketCap)}`,
    `💧 Liquidité : ${usd(input.liquidityUsd)}`,
    `📈 Volume 24h : ${usd(input.volume24h)}`,
    `📈 Volume 1h : ${usd(input.volume1h)}`,
    `👥 Acheteurs : ${input.buyers ?? UNKNOWN}${
      input.buyers1h !== null ? ` (1h : ${input.buyers1h})` : " (1h : inconnu)"
    }`,
    `🧠 Smart wallets : ${input.smartWallets ?? UNKNOWN}`,
    "",
    `⭐ Score Radar : ${input.score !== null ? `${input.score}/100` : UNKNOWN} (informatif${
      input.scoreConfidence !== null ? `, fiabilité ${pct(input.scoreConfidence)}` : ""
    })`,
    `⚠️ Risque : ${
      input.riskScore !== null
        ? `${input.riskScore}/100 (${input.riskLevel ?? "niveau inconnu"})`
        : "non mesuré"
    }`,
    `🔒 LP : ${input.lpStatus && input.lpStatus !== "unknown" ? input.lpStatus : UNKNOWN}`,
    `📊 Concentration top-10 : ${input.holdersTop10Share !== null ? pct(input.holdersTop10Share) : UNKNOWN}`,
  ];

  if (input.topFactors.length > 0) {
    lines.push("", "🔎 Principaux signaux mesurés :");
    for (const factor of input.topFactors.slice(0, 5)) {
      lines.push(`• ${factor.label}${factor.detail ? ` — ${factor.detail}` : ""}`);
    }
  }

  if (missing.length > 0) {
    lines.push("", `❔ Données non mesurées : ${missing.join(", ")}.`);
  }

  if (input.isSimulated) {
    lines.push("", "⚠️ Donnée de démonstration — pas une donnée on-chain réelle.");
  }

  lines.push(
    "",
    `🔗 DEX : ${input.pairUrl ?? `https://dexscreener.com/solana/${input.mint}`}`,
    `🔗 Explorer : https://solscan.io/token/${input.mint}`,
    "",
    "Analyse ponctuelle — observation uniquement, aucun trading automatique.",
  );

  return lines.join("\n");
}
