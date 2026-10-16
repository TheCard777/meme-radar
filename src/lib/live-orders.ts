/**
 * Règles pures du trading réel (aucun I/O). Réutilise exactement les
 * paramètres de la stratégie V1, avec un plafond engagé de 30 $.
 */
import { PAPER_STRATEGY_V1 } from "./paper-strategy";

export const LIVE_RULES = Object.freeze({
  ...PAPER_STRATEGY_V1,
  maxOpenExposureUsd: 30,
  orderTtlSeconds: 60,
  maxSlippageBps: 300, // 3 %
  maxPriceImpactPct: 3,
  maxFeeLamports: 2_000_000, // 0,002 SOL de frais max par ordre
  priceDriftPct: 0.05, // le prix du devis ne doit pas s'écarter > 5 % du prix marché
});

export type OrderStatus = "pending" | "sending" | "sent" | "failed" | "expired" | "cancelled";

export interface LivePositionLite {
  mint: string;
  stakeUsd: number;
  openedAt: string;
  status: "open" | "closed";
}

export interface GateState {
  envFlag: boolean; // LIVE_TRADING_ENABLED === "true"
  armed: boolean; // interrupteur Paramètres
  killSwitch: boolean;
}

/** Peut-on envoyer réellement ? Les trois conditions + pas d'arrêt d'urgence. */
export function sendBlocker(g: GateState): string | null {
  if (g.killSwitch) return "Arrêt d'urgence actif";
  if (!g.envFlag) return "LIVE_TRADING_ENABLED n'est pas à true (envoi réel désactivé)";
  if (!g.armed) return "Trading réel non armé dans les Paramètres";
  return null;
}

const day = (iso: string) => iso.slice(0, 10);

/** Limites de capital pour un NOUVEL achat réel. */
export function liveBuyBlocker(
  positions: LivePositionLite[],
  mint: string,
  nowIso: string,
  realizedTodayUsd: number,
  unrealizedUsd: number,
  r = LIVE_RULES,
): string | null {
  const today = day(nowIso);
  if (realizedTodayUsd + unrealizedUsd <= r.dailyLossLimitUsd) return "Coupe-circuit journalier -15 $ atteint";
  const open = positions.filter((p) => p.status === "open");
  if (open.some((p) => p.mint === mint)) return "Position déjà ouverte (pas de renforcement)";
  const todays = positions.filter((p) => day(p.openedAt) === today);
  if (todays.some((p) => p.mint === mint)) return "Déjà acheté aujourd'hui (pas de réentrée)";
  if (todays.length >= r.maxEntriesPerDay) return "3 achats déjà faits aujourd'hui";
  if (todays.reduce((s, p) => s + p.stakeUsd, 0) + r.stakeUsd > r.maxDailyNewEntriesUsd)
    return "Plafond 15 $ de nouvelles entrées aujourd'hui atteint";
  if (open.reduce((s, p) => s + p.stakeUsd, 0) + r.stakeUsd > r.maxOpenExposureUsd)
    return "Plafond 30 $ engagés atteint";
  if (r.stakeUsd > r.maxPerTokenUsd) return "Mise supérieure au plafond par token";
  return null;
}

export interface PreflightInput {
  side: "buy" | "sell";
  usdAmount: number;
  quoteMint: string;
  expectedMint: string;
  slippageBps: number;
  priceImpactPct: number | null;
  feeLamports: number;
  quotePriceUsd: number | null;
  marketPriceUsd: number | null;
  expectedOutRaw: string;
  expiresAt: string;
  nowIso: string;
}

export interface PreflightCheck {
  key: string;
  label: string;
  pass: boolean;
  detail: string;
}

/** Vérifications montrées avant chaque validation ; toutes doivent passer. */
export function preflight(i: PreflightInput, r = LIVE_RULES): PreflightCheck[] {
  const drift =
    i.quotePriceUsd && i.marketPriceUsd ? Math.abs(i.quotePriceUsd / i.marketPriceUsd - 1) : null;
  const left = (Date.parse(i.expiresAt) - Date.parse(i.nowIso)) / 1000;
  return [
    { key: "token", label: "Token", pass: i.quoteMint === i.expectedMint, detail: i.quoteMint },
    {
      key: "amount", label: "Montant",
      pass: i.side === "sell" ? i.usdAmount >= 0 : i.usdAmount > 0 && i.usdAmount <= r.stakeUsd,
      detail: `${i.usdAmount.toFixed(2)} $`,
    },
    { key: "out", label: "Quantité attendue", pass: BigInt(i.expectedOutRaw || "0") > 0n, detail: i.expectedOutRaw },
    {
      key: "price", label: "Prix vs marché (≤ 5 %)",
      pass: i.side === "sell" ? true : drift !== null && drift <= r.priceDriftPct,
      detail: drift === null ? "inconnu" : `écart ${(drift * 100).toFixed(1)} %`,
    },
    { key: "slippage", label: "Slippage max 3 %", pass: i.slippageBps <= r.maxSlippageBps, detail: `${i.slippageBps / 100} %` },
    {
      key: "impact", label: "Impact prix ≤ 3 %",
      pass: i.priceImpactPct !== null && i.priceImpactPct <= r.maxPriceImpactPct,
      detail: i.priceImpactPct === null ? "inconnu" : `${i.priceImpactPct.toFixed(2)} %`,
    },
    {
      key: "fees", label: "Frais ≤ 0,002 SOL", pass: i.feeLamports <= r.maxFeeLamports,
      detail: `${(i.feeLamports / 1e9).toFixed(6)} SOL`,
    },
    { key: "expiry", label: "Ordre valide (60 s)", pass: left > 0, detail: left > 0 ? `${Math.ceil(left)} s restantes` : "expiré" },
  ];
}

export const allPass = (c: PreflightCheck[]) => c.every((x) => x.pass);
