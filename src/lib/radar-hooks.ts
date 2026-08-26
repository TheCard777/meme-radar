import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  updateBotSettings,
} from "./radar-service";
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
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: SettingsPatch }) =>
      updateBotSettings(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["bot_settings"] });
    },
    onError: (error: Error) => {
      toast.error("Mise à jour impossible", { description: error.message });
    },
  });
}
