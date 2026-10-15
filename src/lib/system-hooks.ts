import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getSystemHealth, setBotState } from "./system.functions";

export function useSystemHealth() {
  const fetchHealth = useServerFn(getSystemHealth);
  return useQuery({
    queryKey: ["system_health"],
    queryFn: () => fetchHealth(),
    refetchInterval: 45_000,
    refetchIntervalInBackground: false,
  });
}

export function useSetBotState() {
  const qc = useQueryClient();
  const mutate = useServerFn(setBotState);
  return useMutation({
    mutationFn: (input: { id: string; status: "paused" | "active" }) =>
      mutate({ data: input }),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["bot_settings"] });
      void qc.invalidateQueries({ queryKey: ["system_health"] });
      toast.success(result.message);
    },
    onError: (error: Error) => {
      toast.error("Changement d'état impossible", { description: error.message });
    },
  });
}
