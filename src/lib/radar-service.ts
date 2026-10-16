import { supabase } from "@/integrations/supabase/client";
import { getBotSettingsServer, getDemoArchivedCountServer } from "./ops.functions";

import type { SnapshotPoint } from "./performance";
import type {
  AlertRow,
  BotSettings,
  BotStatus,
  SignalCategories,
  SmartWallet,
  TokenRow,
  WalletTrade,
} from "./radar-types";

/**
 * Abstraction de lecture : le dashboard ne lit QUE des données réelles
 * (`is_simulated = false`). Les seeds de démonstration ont été archivés et
 * retirés du flux ; seul leur compteur reste consultable.
 */

export async function fetchBotSettings(): Promise<BotSettings> {
  const data = await getBotSettingsServer();
  if (!data) throw new Error("Réglages du bot introuvables");

  return {
    id: data.id,
    status: (data.status as BotStatus) ?? "paused",
    telegram_threshold: data.telegram_threshold,
    critical_threshold: data.critical_threshold,
    signal_categories: data.signal_categories as unknown as SignalCategories,
    telegram_connected: data.telegram_connected,
    demo_mode: data.demo_mode,
    last_scan_at: data.last_scan_at,
    smart_wallet_alerts_enabled: data.smart_wallet_alerts_enabled ?? true,
    smart_wallet_alert_threshold: data.smart_wallet_alert_threshold ?? 75,
  };
}

/** Alertes « Smart Wallet Entry » déjà envoyées (anti-doublon persistant). */
export async function fetchSmartWalletAlerts(): Promise<
  Array<{
    id: string;
    wallet_address: string;
    token_mint: string;
    token_symbol: string | null;
    wallet_score: number | null;
    telegram_sent: boolean;
    first_entry_detected_at: string;
  }>
> {
  const { data, error } = await supabase
    .from("smart_wallet_alerts")
    .select(
      "id, wallet_address, token_mint, token_symbol, wallet_score, telegram_sent, first_entry_detected_at",
    )
    .order("first_entry_detected_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

/**
 * Affichage seulement : on ne charge que les 1000 opportunités les plus
 * pertinentes (score décroissant, puis token le plus récent). L'historique
 * complet reste intégralement conservé en base — rien n'est supprimé.
 */
export const RADAR_DISPLAY_LIMIT = 1000;
/** Taille d'une page chargée depuis la base (pagination « Charger plus »). */
export const TOKENS_PAGE_SIZE = 200;

/**
 * Colonnes légères pour la liste : les JSON lourds (facteurs de score/risque,
 * holders exclus, coordination, métriques marché) ne sont chargés qu'à
 * l'ouverture de la fiche détaillée via `fetchTokenDetail`.
 */
const TOKEN_LIST_COLUMNS =
  "id, symbol, name, mint_address, market_cap, volume_24h, new_buyers, smart_wallet_count, score, status, liquidity_usd, price_usd, price_change_1h, volume_1h, market_source, last_enriched_at, is_simulated, launched_at, score_confidence, data_sufficient, holders_top10_share, alert_level, last_alert_at, risk_score, risk_level, risk_confidence, holders_top20_share, creator_address, creator_share, creator_previous_tokens, lp_status";

export async function fetchTokensPage(offset: number, limit = TOKENS_PAGE_SIZE): Promise<TokenRow[]> {
  const { data, error } = await supabase
    .from("tokens")
    .select(TOKEN_LIST_COLUMNS)
    .eq("is_simulated", false)
    // Classement : meilleur score d'abord, puis le token le plus récent.
    .order("score", { ascending: false })
    .order("launched_at", { ascending: false })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...(row as object),
    score_factors: [],
    market_metrics: null,
    missing_metrics: null,
    risk_factors: null,
    holders_excluded: null,
    coordination_flags: null,
  })) as unknown as TokenRow[];
}

/** Compat : première page élargie (1000) pour les consommateurs existants. */
export async function fetchTokens(): Promise<TokenRow[]> {
  return fetchTokensPage(0, RADAR_DISPLAY_LIMIT);
}

/** Ligne complète d'un token (fiche détaillée). */
export async function fetchTokenDetail(id: string): Promise<TokenRow | null> {
  const { data, error } = await supabase.from("tokens").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as TokenRow | null;
}

/** Nombre total de tokens réels conservés en base (au-delà de l'affichage). */
export async function fetchTotalRealTokenCount(): Promise<number> {
  const { count, error } = await supabase
    .from("tokens")
    .select("id", { count: "exact", head: true })
    .eq("is_simulated", false);
  if (error) throw error;
  return count ?? 0;
}


/** Garde-fou d'affichage ; le compteur total reste exact via fetchSmartWalletCount. */
export const SMART_WALLETS_LIMIT = 500;

export async function fetchSmartWalletCount(): Promise<number> {
  const { count, error } = await supabase
    .from("smart_wallets")
    .select("id", { count: "exact", head: true })
    .eq("is_simulated", false);
  if (error) throw error;
  return count ?? 0;
}

export async function fetchSmartWallets(): Promise<SmartWallet[]> {
  const { data, error } = await supabase
    .from("smart_wallets")
    .select(
      "id, address, label, win_rate, simulated_pnl, trade_count, last_active_at, smart_wallet_score, early_entries, tokens_tracked, success_count, success_rate, median_multiple, data_sufficient, reasons",
    )
    .eq("is_simulated", false)
    .order("smart_wallet_score", { ascending: false, nullsFirst: false })
    .limit(SMART_WALLETS_LIMIT);
  if (error) throw error;
  return (data ?? []) as unknown as SmartWallet[];
}

export async function fetchWalletTrades(): Promise<WalletTrade[]> {
  const { data, error } = await supabase
    .from("wallet_trades")
    .select("*")
    .eq("is_simulated", false)
    .order("traded_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as WalletTrade[];
}

export async function fetchAlerts(): Promise<AlertRow[]> {
  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .eq("is_simulated", false)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as AlertRow[];
}

/** Nombre total de lignes de démonstration archivées (retirées du flux). */
export async function fetchDemoArchivedCount(): Promise<number> {
  return getDemoArchivedCountServer();
}


/** Entrées précoces réelles observées on-chain, par wallet. */
export async function fetchWalletEntries(): Promise<
  Array<{ wallet_address: string; mint_address: string; entry_rank: number; block_time: string | null }>
> {
  const { data, error } = await supabase
    .from("wallet_token_entries")
    .select("wallet_address, mint_address, entry_rank, block_time")
    .order("entry_rank", { ascending: true })
    .limit(2000);
  if (error) throw error;
  return data ?? [];
}

export async function fetchSnapshots(): Promise<SnapshotPoint[]> {
  const { data, error } = await supabase
    .from("token_snapshots")
    .select("token_id, captured_at, price_usd")
    .order("captured_at", { ascending: true })
    .limit(5000);
  if (error) throw error;
  return (data ?? []) as unknown as SnapshotPoint[];
}

/* ---------- helpers d'affichage ---------- */

export { formatAge, formatUsd, shortAddress } from "./radar-service-format";

/* ---------- suivi individuel des tokens (cloche) ---------- */

export type TrackedTokenRow = {
  id: string;
  token_id: string | null;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  enabled: boolean;
  last_state: string;
  last_evaluated_at: string | null;
  created_at: string;
};

export async function fetchTrackedTokens(): Promise<TrackedTokenRow[]> {
  const { data, error } = await supabase
    .from("tracked_tokens")
    .select(
      "id, token_id, token_mint, token_symbol, token_name, enabled, last_state, last_evaluated_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as TrackedTokenRow[];
}

export type TrackedTokenAlertRow = {
  id: string;
  token_mint: string;
  token_symbol: string | null;
  event_type: string;
  event_state: string;
  severity: string;
  message: string;
  telegram_sent: boolean;
  created_at: string;
};

export async function fetchTrackedTokenAlerts(): Promise<TrackedTokenAlertRow[]> {
  const { data, error } = await supabase
    .from("tracked_token_alerts")
    .select(
      "id, token_mint, token_symbol, event_type, event_state, severity, message, telegram_sent, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as TrackedTokenAlertRow[];
}
