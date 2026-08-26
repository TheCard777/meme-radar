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
};

export type ScoreFactor = { label: string; weight: number; value: number };

export type TokenStatus = "watching" | "signal" | "critical" | "cooling" | "archived";

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
};

export type SmartWallet = {
  id: string;
  address: string;
  label: string | null;
  win_rate: number;
  simulated_pnl: number;
  trade_count: number;
  last_active_at: string;
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
  token_symbol: string;
  level: "info" | "signal" | "critical";
  score: number;
  message: string;
  channel: string;
  created_at: string;
};
