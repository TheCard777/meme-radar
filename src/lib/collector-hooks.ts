import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { fetchCollectorStatus, setCollectorState } from "./collector.functions";

export function useCollectorStatus() {
  const fetchStatus = useServerFn(fetchCollectorStatus);
  return useQuery({
    queryKey: ["collector_status"],
    queryFn: () => fetchStatus(),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
}

export function useSetCollectorState() {
  const qc = useQueryClient();
  const mutate = useServerFn(setCollectorState);
  return useMutation({
    mutationFn: (input: { desired: "stopped" | "running" }) => mutate({ data: input }),
    onSuccess: (status) => {
      void qc.invalidateQueries({ queryKey: ["collector_status"] });
      toast.success(
        status.desiredState === "running"
          ? "Collecteur demandé : démarrage"
          : "Collecteur demandé : arrêt",
        { description: status.message },
      );
    },
    onError: (error: Error) => {
      toast.error("Action collecteur impossible", { description: error.message });
    },
  });
}
