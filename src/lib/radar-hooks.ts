import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  fetchAlerts,
  fetchBotSettings,
  fetchSmartWallets,
  fetchTokens,
  fetchWalletTrades,
  fetchDemoArchivedCount,
  fetchWalletEntries,
  fetchSnapshots,
} from "./radar-service";
import { updateBotSettingsServer } from "./settings.functions";
import type { BotStatus, SignalCategories } from "./radar-types";

export const useBotSettings = () =>
  useQuery({ queryKey: ["bot_settings"], queryFn: fetchBotSettings });

export const useTokens = () => useQuery({ queryKey: ["tokens"], queryFn: fetchTokens });

export const useSmartWallets = () =>
  useQuery({ queryKey: ["smart_wallets"], queryFn: fetchSmartWallets });

export const useWalletTrades = () =>
  useQuery({ queryKey: ["wallet_trades"], queryFn: fetchWalletTrades });

export const useDemoArchived = () =>
  useQuery({ queryKey: ["demo_archive"], queryFn: fetchDemoArchivedCount });

export const useWalletEntries = () =>
  useQuery({ queryKey: ["wallet_entries"], queryFn: fetchWalletEntries });

export const useSnapshots = () =>
  useQuery({ queryKey: ["snapshots"], queryFn: fetchSnapshots });

export const useAlerts = () => useQuery({ queryKey: ["alerts"], queryFn: fetchAlerts });

type SettingsPatch = Partial<{
  status: BotStatus;
  telegram_threshold: number;
  critical_threshold: number;
  signal_categories: SignalCategories;
  last_scan_at: string;
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
