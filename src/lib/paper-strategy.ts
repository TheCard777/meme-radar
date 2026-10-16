/**
 * Stratégie personnelle V1 — SIMULATION (paper trading) UNIQUEMENT.
 *
 * Module pur : aucun I/O, aucune clé, aucun envoi d'ordre. Il ne connaît
 * aucun wallet, aucun RPC de signature, aucun service d'exécution. Le mode
 * réel est une constante littérale `false` qui ne peut pas être modifiée
 * à l'exécution.
 */

export const PAPER_TRADING_ONLY = true as const;
export const REAL_TRADING_ENABLED = false as const;

export const PAPER_STRATEGY_V1 = Object.freeze({
  minAgeMinutes: 5,
  maxAgeMinutes: 120,
  minOpportunityScore: 90,
  maxRiskScore: 30, // strictement inférieur
  minConfidence: 0.8, // pour les deux scores
  minLiquidityUsd: 20_000,
  minVolume1hUsd: 5_000,
  minAcceleration: 1.5,
  maxVolumeLiquidityRatio: 15, // au-delà : volume/liquidité anormal
  stakeUsd: 5,
  maxPerTokenUsd: 15,
  maxEntriesPerDay: 3,
  maxDailyNewEntriesUsd: 15,
  maxOpenExposureUsd: 30,
  stopLossPct: -0.2,
  takeProfitPct: 0.3,
  maxHoldMinutes: 60,
  exitRiskScore: 55,
  exitLiquidityDropPct: 0.3, // baisse de liquidité ≥ 30 % vs entrée
  dailyLossLimitUsd: -15, // réalisé + latent, seuil logiciel
});

export type PaperConfig = typeof PAPER_STRATEGY_V1;

/** Vue marché d'un token réel au moment de l'évaluation (null = inconnu). */
export interface MarketView {
  tokenId: string;
  mint: string;
  symbol: string;
  ageMinutes: number | null;
  dex: string | null;
  postMigrationPool: boolean | null;
  opportunityScore: number | null;
  opportunityConfidence: number | null;
  riskScore: number | null;
  riskConfidence: number | null;
  liquidityUsd: number | null;
  volume1h: number | null;
  volume5m: number | null;
  priceUsd: number | null;
}

export interface EligibilityCheck {
  key: string;
  label: string;
  /** true = OK, false = échec, null = inconnu (compte comme échec). */
  pass: boolean | null;
  detail: string;
}

export interface Eligibility {
  eligible: boolean;
  checks: EligibilityCheck[];
}

const isNum = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

export function acceleration(view: Pick<MarketView, "volume1h" | "volume5m">): number | null {
  if (!isNum(view.volume1h) || !isNum(view.volume5m)) return null;
  if (!(view.volume1h > 0) || view.volume5m < 0) return null;
  return (view.volume5m * 12) / view.volume1h;
}

/** Pool DEX actif après migration : présent, et pas la bonding curve Pump.fun. */
export function isPostMigrationDex(dex: string | null): boolean | null {
  if (!dex) return null;
  return dex.toLowerCase() !== "pumpfun";
}

function check(
  key: string,
  label: string,
  value: number | boolean | null,
  test: (v: number) => boolean,
  fmt: (v: number) => string,
): EligibilityCheck {
  if (typeof value === "boolean") return { key, label, pass: value, detail: value ? "oui" : "non" };
  if (!isNum(value)) return { key, label, pass: null, detail: "inconnu" };
  return { key, label, pass: test(value), detail: fmt(value) };
}

export function evaluateEligibility(view: MarketView, cfg: PaperConfig = PAPER_STRATEGY_V1): Eligibility {
  const accel = acceleration(view);
  const ratio =
    isNum(view.volume1h) && isNum(view.liquidityUsd) && view.liquidityUsd > 0
      ? view.volume1h / view.liquidityUsd
      : null;
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  const usd = (v: number) => `${Math.round(v).toLocaleString("fr-FR")} $`;
  const checks: EligibilityCheck[] = [
    {
      key: "pool",
      label: "Pool DEX actif après migration",
      pass: view.postMigrationPool,
      detail: view.dex ?? "aucun pool",
    },
    check("age", `Âge ${cfg.minAgeMinutes} min – ${cfg.maxAgeMinutes / 60} h`, view.ageMinutes,
      (v) => v >= cfg.minAgeMinutes && v <= cfg.maxAgeMinutes, (v) => `${Math.round(v)} min`),
    check("score", `Score opportunité ≥ ${cfg.minOpportunityScore}`, view.opportunityScore,
      (v) => v >= cfg.minOpportunityScore, (v) => String(Math.round(v))),
    check("score_conf", `Confiance score ≥ ${pct(cfg.minConfidence)}`, view.opportunityConfidence,
      (v) => v >= cfg.minConfidence, pct),
    check("risk", `Risque < ${cfg.maxRiskScore}`, view.riskScore,
      (v) => v < cfg.maxRiskScore, (v) => String(Math.round(v))),
    check("risk_conf", `Confiance risque ≥ ${pct(cfg.minConfidence)}`, view.riskConfidence,
      (v) => v >= cfg.minConfidence, pct),
    check("liquidity", `Liquidité ≥ ${usd(cfg.minLiquidityUsd)}`, view.liquidityUsd,
      (v) => v >= cfg.minLiquidityUsd, usd),
    check("volume", `Volume 1h ≥ ${usd(cfg.minVolume1hUsd)}`, view.volume1h,
      (v) => v >= cfg.minVolume1hUsd, usd),
    check("accel", `Accélération ≥ ${cfg.minAcceleration}x`, accel,
      (v) => v >= cfg.minAcceleration, (v) => `${v.toFixed(2)}x`),
    check("ratio", `Volume/liquidité ≤ ${cfg.maxVolumeLiquidityRatio}x`, ratio,
      (v) => v <= cfg.maxVolumeLiquidityRatio, (v) => `${v.toFixed(1)}x`),
    check("price", "Prix mesuré", view.priceUsd, (v) => v > 0, (v) => `${v} $`),
  ];
  return { eligible: checks.every((c) => c.pass === true), checks };
}

// ---------------------------------------------------------------------------
// Registre de positions simulées
// ---------------------------------------------------------------------------

export type ExitReason = "stop_loss" | "take_profit" | "max_hold" | "risk" | "liquidity_drop";

export const EXIT_REASON_LABELS: Record<ExitReason, string> = {
  stop_loss: "Stop -20 %",
  take_profit: "Prise de bénéfice +30 %",
  max_hold: "Détention max 60 min",
  risk: "Risque ≥ 55",
  liquidity_drop: "Forte baisse de liquidité",
};

export interface PaperPosition {
  id: string;
  tokenId: string;
  mint: string;
  symbol: string;
  stakeUsd: number;
  entryPrice: number;
  entryLiquidityUsd: number;
  openedAt: string;
  lastPrice: number;
  lastPriceAt: string;
  closedAt?: string;
  exitPrice?: number;
  exitReason?: ExitReason;
  realizedPnlUsd?: number;
}

export interface PaperLedger {
  version: 1;
  open: PaperPosition[];
  closed: PaperPosition[];
}

export const emptyLedger = (): PaperLedger => ({ version: 1, open: [], closed: [] });

export const utcDay = (iso: string) => iso.slice(0, 10);

export function positionPnl(p: PaperPosition, price = p.lastPrice): number {
  return p.stakeUsd * (price / p.entryPrice - 1);
}

export interface DailyStats {
  day: string;
  entries: number;
  newEntriesUsd: number;
  realizedUsd: number;
  unrealizedUsd: number;
  totalUsd: number;
  openExposureUsd: number;
  circuitBreaker: boolean;
}

export function dailyStats(ledger: PaperLedger, nowIso: string, cfg: PaperConfig = PAPER_STRATEGY_V1): DailyStats {
  const day = utcDay(nowIso);
  const all = [...ledger.open, ...ledger.closed];
  const openedToday = all.filter((p) => utcDay(p.openedAt) === day);
  const realizedUsd = ledger.closed
    .filter((p) => p.closedAt && utcDay(p.closedAt) === day)
    .reduce((s, p) => s + (p.realizedPnlUsd ?? 0), 0);
  const unrealizedUsd = ledger.open.reduce((s, p) => s + positionPnl(p), 0);
  const totalUsd = realizedUsd + unrealizedUsd;
  return {
    day,
    entries: openedToday.length,
    newEntriesUsd: openedToday.reduce((s, p) => s + p.stakeUsd, 0),
    realizedUsd,
    unrealizedUsd,
    totalUsd,
    openExposureUsd: ledger.open.reduce((s, p) => s + p.stakeUsd, 0),
    circuitBreaker: totalUsd <= cfg.dailyLossLimitUsd,
  };
}

/** Pourquoi une nouvelle entrée est bloquée par les limites (null = autorisée). */
export function entryBlocker(
  ledger: PaperLedger,
  view: MarketView,
  nowIso: string,
  cfg: PaperConfig = PAPER_STRATEGY_V1,
): string | null {
  const stats = dailyStats(ledger, nowIso, cfg);
  const day = stats.day;
  if (stats.circuitBreaker) return "Coupe-circuit journalier atteint";
  if (ledger.open.some((p) => p.mint === view.mint)) return "Position déjà ouverte (pas de renforcement)";
  if ([...ledger.open, ...ledger.closed].some((p) => p.mint === view.mint && utcDay(p.openedAt) === day))
    return "Déjà acheté aujourd'hui (pas de réentrée)";
  if (stats.entries >= cfg.maxEntriesPerDay) return "3 achats simulés déjà faits aujourd'hui";
  if (stats.newEntriesUsd + cfg.stakeUsd > cfg.maxDailyNewEntriesUsd) return "Plafond journalier 15 $ atteint";
  if (stats.openExposureUsd + cfg.stakeUsd > cfg.maxOpenExposureUsd) return `Budget engagé ${cfg.maxOpenExposureUsd} $ atteint`;
  if (cfg.stakeUsd > cfg.maxPerTokenUsd) return "Mise supérieure au plafond par token";
  return null;
}

export function exitReasonFor(
  p: PaperPosition,
  view: MarketView | undefined,
  nowIso: string,
  cfg: PaperConfig = PAPER_STRATEGY_V1,
): ExitReason | null {
  const change = p.lastPrice / p.entryPrice - 1;
  const EPS = 1e-9; // un prix pile au seuil doit déclencher malgré les arrondis
  if (change <= cfg.stopLossPct + EPS) return "stop_loss";
  if (change >= cfg.takeProfitPct - EPS) return "take_profit";
  if (view && isNum(view.riskScore) && view.riskScore >= cfg.exitRiskScore) return "risk";
  if (
    view &&
    isNum(view.liquidityUsd) &&
    p.entryLiquidityUsd > 0 &&
    (p.entryLiquidityUsd - view.liquidityUsd) / p.entryLiquidityUsd >= cfg.exitLiquidityDropPct
  )
    return "liquidity_drop";
  if (Date.parse(nowIso) - Date.parse(p.openedAt) >= cfg.maxHoldMinutes * 60_000) return "max_hold";
  return null;
}

export interface StepResult {
  ledger: PaperLedger;
  opened: PaperPosition[];
  closed: PaperPosition[];
}

/**
 * Un pas de simulation : met à jour les prix, ferme selon les règles de
 * sortie, puis ouvre de nouvelles positions éligibles dans les limites.
 * Aucun ordre réel n'est jamais émis.
 */
export function stepLedger(
  ledger: PaperLedger,
  views: MarketView[],
  nowIso: string,
  cfg: PaperConfig = PAPER_STRATEGY_V1,
): StepResult {
  const byMint = new Map(views.map((v) => [v.mint, v]));
  const open: PaperPosition[] = [];
  const closedNow: PaperPosition[] = [];

  for (const pos of ledger.open) {
    const view = byMint.get(pos.mint);
    const p = { ...pos };
    if (view && isNum(view.priceUsd) && view.priceUsd > 0) {
      p.lastPrice = view.priceUsd;
      p.lastPriceAt = nowIso;
    }
    const reason = exitReasonFor(p, view, nowIso, cfg);
    if (reason) {
      // Pas de remplissage idéal au seuil : on clôture au dernier prix observé.
      closedNow.push({
        ...p,
        closedAt: nowIso,
        exitPrice: p.lastPrice,
        exitReason: reason,
        realizedPnlUsd: positionPnl(p),
      });
    } else open.push(p);
  }

  let next: PaperLedger = { version: 1, open, closed: [...ledger.closed, ...closedNow] };
  const openedNow: PaperPosition[] = [];
  const candidates = views
    .filter((v) => evaluateEligibility(v, cfg).eligible)
    .sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0));
  for (const v of candidates) {
    if (entryBlocker(next, v, nowIso, cfg)) continue;
    const pos: PaperPosition = {
      id: `${v.mint}:${nowIso}`,
      tokenId: v.tokenId,
      mint: v.mint,
      symbol: v.symbol,
      stakeUsd: cfg.stakeUsd,
      entryPrice: v.priceUsd as number,
      entryLiquidityUsd: v.liquidityUsd as number,
      openedAt: nowIso,
      lastPrice: v.priceUsd as number,
      lastPriceAt: nowIso,
    };
    openedNow.push(pos);
    next = { ...next, open: [...next.open, pos] };
  }
  return { ledger: next, opened: openedNow, closed: closedNow };
}
