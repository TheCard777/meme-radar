import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  createTelegramInvite,
  listTelegramRecipients,
  registerTelegramWebhook,
  revokeTelegramInvite,
  revokeTelegramRecipient,
  setTelegramRecipientActive,
  updateTelegramRecipientPrefs,
} from "./telegram.functions";
import type { RecipientPrefs } from "./telegram-recipients";

const KEY = ["telegram_recipients"];

export function useTelegramRecipients() {
  const fetchList = useServerFn(listTelegramRecipients);
  return useQuery({ queryKey: KEY, queryFn: () => fetchList() });
}

export function useCreateTelegramInvite() {
  const qc = useQueryClient();
  const mutate = useServerFn(createTelegramInvite);
  return useMutation({
    mutationFn: (input: { label: string; ttlMinutes: number }) => mutate({ data: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
    onError: (error: Error) =>
      toast.error("Invitation impossible", { description: error.message }),
  });
}

export function useRevokeTelegramInvite() {
  const qc = useQueryClient();
  const mutate = useServerFn(revokeTelegramInvite);
  return useMutation({
    mutationFn: (id: string) => mutate({ data: { id } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      toast.success("Invitation annulée");
    },
    onError: (error: Error) => toast.error("Annulation impossible", { description: error.message }),
  });
}

export function useSetRecipientActive() {
  const qc = useQueryClient();
  const mutate = useServerFn(setTelegramRecipientActive);
  return useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) => mutate({ data: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
    onError: (error: Error) => toast.error("Mise à jour impossible", { description: error.message }),
  });
}

export function useRevokeRecipient() {
  const qc = useQueryClient();
  const mutate = useServerFn(revokeTelegramRecipient);
  return useMutation({
    mutationFn: (id: string) => mutate({ data: { id } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      toast.success("Accès révoqué");
    },
    onError: (error: Error) => toast.error("Révocation impossible", { description: error.message }),
  });
}

export function useUpdateRecipientPrefs() {
  const qc = useQueryClient();
  const mutate = useServerFn(updateTelegramRecipientPrefs);
  return useMutation({
    mutationFn: (input: { id: string; prefs: Partial<RecipientPrefs> }) => mutate({ data: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
    onError: (error: Error) => toast.error("Mise à jour impossible", { description: error.message }),
  });
}

export function useRegisterTelegramWebhook() {
  const mutate = useServerFn(registerTelegramWebhook);
  return useMutation({
    mutationFn: () => mutate(),
    onSuccess: (result) => {
      if (result.ok) toast.success("Commande /start activée sur le bot existant");
      else toast.error("Activation impossible", { description: result.reason });
    },
    onError: (error: Error) => toast.error("Activation impossible", { description: error.message }),
  });
}
