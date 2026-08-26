import { supabase } from "@/integrations/supabase/client";
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
 * Abstraction service — V1 lit uniquement des données de SIMULATION.
 * Quand le vrai scanner Solana sera branché côté serveur, il écrira dans
 * les mêmes tables et l'UI n'aura pas besoin d'être refaite.
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

export async function updateBotSettings(
  id: string,
  patch: Partial<{
    status: BotStatus;
    telegram_threshold: number;
    critical_threshold: number;
    signal_categories: SignalCategories;
    last_scan_at: string;
  }>,
): Promise<void> {
  const { error } = await supabase
    .from("bot_settings")
    .update(patch as never)
    .eq("id", id);
  if (error) throw error;
}

export async function fetchTokens(): Promise<TokenRow[]> {
  const { data, error } = await supabase
    .from("tokens")
    .select("*")
    .order("score", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as TokenRow[];
}

export async function fetchSmartWallets(): Promise<SmartWallet[]> {
  const { data, error } = await supabase
    .from("smart_wallets")
    .select("*")
    .order("win_rate", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as SmartWallet[];
}

export async function fetchWalletTrades(): Promise<WalletTrade[]> {
  const { data, error } = await supabase
    .from("wallet_trades")
    .select("*")
    .order("traded_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as WalletTrade[];
}

export async function fetchAlerts(): Promise<AlertRow[]> {
  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as AlertRow[];
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
