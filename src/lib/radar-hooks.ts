import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  fetchAlerts,
  fetchBotSettings,
  fetchDemoArchivedCount,
  fetchSmartWalletAlerts,
  fetchSmartWallets,
  fetchTokens,
  fetchTotalRealTokenCount,
  fetchWalletEntries,
  fetchWalletTrades,
  fetchSnapshots,
  fetchTrackedTokens,
  fetchTrackedTokenAlerts,
} from "./radar-service";
import { updateBotSettingsServer } from "./settings.functions";
import { toggleTrackedTokenServer } from "./tracking.functions";
import { sendNowSnapshotServer } from "./now.functions";

import type { BotStatus, SignalCategories } from "./radar-types";

export const useBotSettings = () =>
  useQuery({ queryKey: ["bot_settings"], queryFn: fetchBotSettings });

/** Rafraîchissement automatique : uniquement onglet visible, données précédentes conservées. */
const live = (ms: number) => ({
  refetchInterval: ms,
  refetchIntervalInBackground: false,
  staleTime: ms - 2_000,
  placeholderData: keepPreviousData,
});

export const useTokens = () =>
  useQuery({ queryKey: ["tokens"], queryFn: fetchTokens, ...live(15_000) });

export const useTotalRealTokenCount = () =>
  useQuery({ queryKey: ["tokens", "total_real_count"], queryFn: fetchTotalRealTokenCount, ...live(30_000) });

export const useSmartWallets = () =>
  useQuery({ queryKey: ["smart_wallets"], queryFn: fetchSmartWallets, ...live(30_000) });

export const useWalletTrades = () =>
  useQuery({ queryKey: ["wallet_trades"], queryFn: fetchWalletTrades });

export const useDemoArchived = () =>
  useQuery({ queryKey: ["demo_archive"], queryFn: fetchDemoArchivedCount });

export const useWalletEntries = () =>
  useQuery({ queryKey: ["wallet_entries"], queryFn: fetchWalletEntries });

export const useSnapshots = () =>
  useQuery({ queryKey: ["snapshots"], queryFn: fetchSnapshots });

export const useAlerts = () => useQuery({ queryKey: ["alerts"], queryFn: fetchAlerts, ...live(15_000) });

export const useSmartWalletAlerts = () =>
  useQuery({ queryKey: ["smart_wallet_alerts"], queryFn: fetchSmartWalletAlerts });

type SettingsPatch = Partial<{
  status: BotStatus;
  telegram_threshold: number;
  critical_threshold: number;
  signal_categories: SignalCategories;
  last_scan_at: string;
  smart_wallet_alerts_enabled: boolean;
  smart_wallet_alert_threshold: number;
}>;

export function useUpdateSettings() {
  const qc = useQueryClient();
  const updateSettings = useServerFn(updateBotSettingsServer);
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: SettingsPatch }) =>
      updateSettings({ data: { id, patch } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["bot_settings"] });
    },
    onError: (error: Error) => {
      toast.error("Mise à jour impossible", { description: error.message });
    },
  });
}

/* ---------- suivi individuel des tokens (cloche 🔔) ---------- */

export const useTrackedTokens = () =>
  useQuery({ queryKey: ["tracked_tokens"], queryFn: fetchTrackedTokens });

export const useTrackedTokenAlerts = () =>
  useQuery({ queryKey: ["tracked_token_alerts"], queryFn: fetchTrackedTokenAlerts });

export function useToggleTrackedToken() {
  const qc = useQueryClient();
  const toggle = useServerFn(toggleTrackedTokenServer);
  return useMutation({
    mutationFn: async (input: {
      tokenId: string;
      mint: string;
      symbol: string | null;
      name: string | null;
      enabled: boolean;
    }) => toggle({ data: input }),
    onSuccess: (_result, variables) => {
      void qc.invalidateQueries({ queryKey: ["tracked_tokens"] });
      toast.success(variables.enabled ? "Suivi activé" : "Suivi désactivé", {
        description: variables.enabled
          ? "Tu recevras une alerte Telegram en cas de changement significatif."
          : "Plus aucune alerte personnalisée ne sera envoyée pour ce token.",
      });
    },
    onError: (error: Error) => {
      toast.error("Suivi impossible", { description: error.message });
    },
  });
}

/* ---------- analyse ponctuelle (⚡ NOW) ---------- */

export function useSendNowSnapshot() {
  const sendNow = useServerFn(sendNowSnapshotServer);
  return useMutation({
    mutationFn: async (input: { mint: string; symbol: string }) =>
      sendNow({ data: { mint: input.mint } }),
    onSuccess: (_result, variables) => {
      toast.success("Analyse NOW envoyée", {
        description: `Snapshot de $${variables.symbol} envoyé sur Telegram.`,
      });
    },
    onError: (error: Error) => {
      toast.error("Envoi NOW impossible", { description: error.message });
    },
  });
}
