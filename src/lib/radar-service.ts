import { supabase } from "@/integrations/supabase/client";
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
  const { data, error } = await supabase
    .from("bot_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
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
  };
}

export async function fetchTokens(): Promise<TokenRow[]> {
  const { data, error } = await supabase
    .from("tokens")
    .select("*")
    .eq("is_simulated", false)
    .order("score", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as TokenRow[];
}

export async function fetchSmartWallets(): Promise<SmartWallet[]> {
  const { data, error } = await supabase
    .from("smart_wallets")
    .select("*")
    .eq("is_simulated", false)
    .order("smart_wallet_score", { ascending: false, nullsFirst: false });
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
  const { data, error } = await supabase.from("demo_archive").select("rows_removed");
  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + (row.rows_removed ?? 0), 0);
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

export function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.max(0, Math.floor(diff / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} j`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
