export type BotStatus = "paused" | "active";

export type SignalCategories = {
  smart_money: boolean;
  volume_spike: boolean;
  new_buyers: boolean;
  liquidity_lock: boolean;
  holder_growth: boolean;
  socials: boolean;
};

export const SIGNAL_CATEGORY_LABELS: Record<keyof SignalCategories, string> = {
  smart_money: "Smart money inflow",
  volume_spike: "Pic de volume",
  new_buyers: "Nouveaux acheteurs",
  liquidity_lock: "Liquidité verrouillée",
  holder_growth: "Croissance des holders",
  socials: "Signaux sociaux",
};

export type BotSettings = {
  id: string;
  status: BotStatus;
  telegram_threshold: number;
  critical_threshold: number;
  signal_categories: SignalCategories;
  telegram_connected: boolean;
  demo_mode: boolean;
  last_scan_at: string | null;
  smart_wallet_alerts_enabled: boolean;
  smart_wallet_alert_threshold: number;
};

export type ScoreFactor = {
  label: string;
  weight: number;
  value: number;
  /** Présent sur les scores calculés par le moteur V1. */
  key?: string;
  normalized?: number | null;
  points?: number | null;
  detail?: string;
  source?: string;
};

export type TokenStatus = "watching" | "signal" | "critical" | "cooling" | "archived";

export type TokenMarketMetrics = {
  priceUsd: number | null;
  marketCap: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  volume1h: number | null;
  buyers1h: number | null;
  priceChange1h: number | null;
  holdersTop10Share: number | null;
  creatorHistory: number | null;
  dex: string | null;
  pairUrl: string | null;
};

export type TokenRow = {
  id: string;
  symbol: string;
  name: string;
  mint_address: string;
  market_cap: number;
  volume_24h: number;
  new_buyers: number;
  smart_wallet_count: number;
  score: number;
  score_factors: ScoreFactor[];
  status: TokenStatus;
  liquidity_usd: number;
  price_usd: number;
  price_change_1h: number;
  volume_1h: number;
  market_source: string;
  last_enriched_at: string | null;
  is_simulated: boolean;
  launched_at: string;
  market_metrics: Partial<TokenMarketMetrics> | null;
  missing_metrics: string[] | null;
  score_confidence: number;
  data_sufficient: boolean;
  holders_top10_share: number | null;
  alert_level: "none" | "signal" | "priority" | string;
  last_alert_at: string | null;
};

/** Niveau lisible dérivé du score et de la fiabilité des données. */
export function tokenLevel(token: TokenRow): {
  label: string;
  tone: "muted" | "warning" | "primary" | "destructive";
} {
  if (!token.is_simulated && !token.data_sufficient) {
    return { label: "Données insuffisantes", tone: "muted" };
  }
  if (token.score >= 90) return { label: "Priorité", tone: "destructive" };
  if (token.score >= 85) return { label: "Signal", tone: "primary" };
  if (token.score >= 70) return { label: "Surveillé", tone: "warning" };
  return { label: "Ignoré", tone: "muted" };
}

export type SmartWallet = {
  id: string;
  address: string;
  label: string | null;
  win_rate: number;
  simulated_pnl: number;
  trade_count: number;
  last_active_at: string;
  /** Métriques réelles issues de l'analyse on-chain (null = inconnu). */
  smart_wallet_score: number | null;
  early_entries: number;
  tokens_tracked: number;
  success_count: number;
  success_rate: number | null;
  median_multiple: number | null;
  data_sufficient: boolean;
  reasons: string[];
};

export type WalletTrade = {
  id: string;
  wallet_id: string;
  token_symbol: string;
  side: "buy" | "sell";
  amount_sol: number;
  traded_at: string;
};

export type AlertRow = {
  id: string;
  token_id?: string | null;
  price_usd_at_alert?: number | null;
  token_symbol: string;
  level: "info" | "signal" | "critical";
  score: number;
  message: string;
  channel: string;
  created_at: string;
};
