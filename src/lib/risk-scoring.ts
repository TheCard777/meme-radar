/**
 * Moteur de RISQUE 0-100 — module pur (aucun I/O, testable).
 *
 * Totalement séparé du score d'opportunité (`scoring.ts`), qui n'est pas
 * modifié. Ici, 0 = risque faible observé, 100 = risque très élevé observé.
 *
 * Règles strictes :
 * - Une donnée inconnue reste `null` : elle n'est JAMAIS convertie en risque
 *   arbitraire (ni en risque nul, ni en risque maximal).
 * - Les poids réellement mesurés sont renormalisés ; la confiance reflète la
 *   part du poids mesurée.
 * - En dessous de `MIN_RISK_CONFIDENCE`, le score vaut `null` (« risque non
 *   évaluable ») plutôt qu'un chiffre trompeur.
 *
 * AVERTISSEMENT : indicateur d'observation, ni conseil financier ni garantie.
 */

export type LpStatus = "burned" | "locked" | "unlocked" | "unknown";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskInput {
  /** Part nette (hors LP/burn/programmes) des 10 plus gros comptes, 0-1. */
  holdersTop10Share: number | null;
  /** Part nette des 20 plus gros comptes, 0-1. */
  holdersTop20Share: number | null;
  /** Part de l'offre détenue par le déployeur, 0-1. */
  creatorShare: number | null;
  /** Nombre de tokens précédemment déployés par le créateur (observés). */
  creatorPreviousTokens: number | null;
  /** Statut de la liquidité ; `unknown` = non vérifiable, donc non noté. */
  lpStatus: LpStatus;
  /** Baisse relative de liquidité observée sur les snapshots, 0-1. */
  liquidityDropRatio: number | null;
  /** Confiance de la détection de coordination, 0-1 (null = non évaluée). */
  coordinationScore: number | null;
  /** Part d'entrées de type sniper réellement mesurée, 0-1. */
  sniperRatio: number | null;
}

export interface RiskFactor {
  key: string;
  label: string;
  weight: number;
  /** 0-100 (100 = risque maximal sur ce facteur) ou null si non mesuré. */
  normalized: number | null;
  points: number | null;
  detail: string;
  source: string;
}

export interface RiskResult {
  score: number | null;
  level: RiskLevel | null;
  confidence: number;
  factors: RiskFactor[];
  /** Libellés des facteurs non mesurables sur ce token. */
  missing: string[];
}

export const RISK_WEIGHTS = {
  concentration: 25,
  creator: 15,
  lp: 20,
  liquidityDrop: 20,
  coordination: 15,
  sniping: 5,
} as const;

/** Poids minimal réellement mesuré pour publier un risque. */
export const MIN_RISK_CONFIDENCE = 0.4;

export const RISK_THRESHOLDS = { medium: 30, high: 55, critical: 75 } as const;

function ramp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || max <= min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function pct(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

export function riskLevelForScore(score: number | null): RiskLevel | null {
  if (score === null) return null;
  if (score >= RISK_THRESHOLDS.critical) return "critical";
  if (score >= RISK_THRESHOLDS.high) return "high";
  if (score >= RISK_THRESHOLDS.medium) return "medium";
  return "low";
}

export function computeRisk(input: RiskInput): RiskResult {
  const factors: RiskFactor[] = [];

  const add = (
    key: string,
    label: string,
    weight: number,
    normalized: number | null,
    detail: string,
    source: string,
  ) => {
    factors.push({
      key,
      label,
      weight,
      normalized,
      points: normalized === null ? null : Math.round((normalized * weight) / 100),
      detail,
      source: normalized === null ? "indisponible" : source,
    });
  };

  // 1) Concentration nette des holders (top 20 si dispo, sinon top 10).
  const share = input.holdersTop20Share ?? input.holdersTop10Share;
  const shareLabel = input.holdersTop20Share !== null ? "Top 20" : "Top 10";
  add(
    "concentration",
    "Concentration des holders",
    RISK_WEIGHTS.concentration,
    share === null ? null : pct(ramp(share, 0.2, 0.85)),
    share === null
      ? "Concentration nette indisponible"
      : `${shareLabel} net = ${(share * 100).toFixed(1)} % de l'offre`,
    "RPC Solana (comptes LP/burn/programmes exclus quand identifiables)",
  );

  // 2) Créateur : part détenue + déploiements antérieurs observés.
  if (input.creatorShare === null && input.creatorPreviousTokens === null) {
    add("creator", "Créateur / deployer", RISK_WEIGHTS.creator, null, "Créateur non résolu", "RPC Solana");
  } else {
    const shareRisk = input.creatorShare === null ? null : ramp(input.creatorShare, 0.02, 0.3);
    const historyRisk =
      input.creatorPreviousTokens === null ? null : ramp(input.creatorPreviousTokens, 1, 8);
    const parts = [shareRisk, historyRisk].filter((v): v is number => v !== null);
    const details: string[] = [];
    if (input.creatorShare !== null) {
      details.push(`part créateur ${(input.creatorShare * 100).toFixed(2)} %`);
    }
    if (input.creatorPreviousTokens !== null) {
      details.push(`${input.creatorPreviousTokens} déploiement(s) antérieur(s) observé(s)`);
    }
    add(
      "creator",
      "Créateur / deployer",
      RISK_WEIGHTS.creator,
      pct(Math.max(...parts)),
      details.join(" · "),
      "RPC Solana + historique interne des tokens détectés",
    );
  }

  // 3) Statut de la liquidité. `unknown` n'est jamais compté comme rassurant.
  const lpNormalized =
    input.lpStatus === "unknown"
      ? null
      : input.lpStatus === "burned"
        ? 0
        : input.lpStatus === "locked"
          ? 15
          : 85;
  add(
    "lp",
    "Statut de la liquidité (LP)",
    RISK_WEIGHTS.lp,
    lpNormalized,
    input.lpStatus === "unknown"
      ? "Verrouillage/burn de la LP non vérifiable — non noté"
      : `LP ${input.lpStatus}`,
    "RPC Solana (supply LP + autorité du pool)",
  );

  // 4) Retrait / chute de liquidité observée entre snapshots réels.
  add(
    "liquidityDrop",
    "Retrait de liquidité",
    RISK_WEIGHTS.liquidityDrop,
    input.liquidityDropRatio === null ? null : pct(ramp(input.liquidityDropRatio, 0.15, 0.7)),
    input.liquidityDropRatio === null
      ? "Historique de liquidité insuffisant"
      : `Baisse de ${(input.liquidityDropRatio * 100).toFixed(1)} % depuis le pic observé`,
    "token_snapshots (données réelles)",
  );

  // 5) Coordination : jamais une accusation, une confiance mesurée.
  add(
    "coordination",
    "Comportements coordonnés",
    RISK_WEIGHTS.coordination,
    input.coordinationScore === null ? null : pct(input.coordinationScore),
    input.coordinationScore === null
      ? "Coordination non évaluable (échantillon d'entrées insuffisant)"
      : `Indice de coordination ${(input.coordinationScore * 100).toFixed(0)} %`,
    "wallet_token_entries (achats quasi simultanés, financeur commun)",
  );

  // 6) Sniping, uniquement si réellement mesuré.
  add(
    "sniping",
    "Sniping",
    RISK_WEIGHTS.sniping,
    input.sniperRatio === null ? null : pct(input.sniperRatio),
    input.sniperRatio === null
      ? "Sniping non mesurable sur ces données"
      : `${(input.sniperRatio * 100).toFixed(0)} % des premières entrées de type sniper`,
    "wallet_token_entries (délai après création)",
  );

  const availableWeight = factors
    .filter((f) => f.normalized !== null)
    .reduce((sum, f) => sum + f.weight, 0);
  const confidence = availableWeight / 100;
  const missing = factors.filter((f) => f.normalized === null).map((f) => f.label);

  let score: number | null = null;
  if (availableWeight > 0 && confidence >= MIN_RISK_CONFIDENCE) {
    const points = factors.reduce((sum, f) => sum + (f.points ?? 0), 0);
    score = Math.max(0, Math.min(100, Math.round((points / availableWeight) * 100)));
  }

  return { score, level: riskLevelForScore(score), confidence, factors, missing };
}

/** Résumé court (Telegram / UI) des facteurs de risque réellement mesurés. */
export function summarizeRisk(result: RiskResult, max = 3): string[] {
  return result.factors
    .filter((f) => f.normalized !== null && (f.normalized ?? 0) > 0)
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    .slice(0, max)
    .map((f) => `${f.label} : ${f.detail}`);
}
