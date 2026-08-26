import { Play, Square, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCollectorStatus, useSetCollectorState } from "@/lib/collector-hooks";
import { cn } from "@/lib/utils";

function relative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  if (diff < 60_000) return `il y a ${Math.round(diff / 1000)} s`;
  if (diff < 3_600_000) return `il y a ${Math.round(diff / 60_000)} min`;
  return `il y a ${Math.round(diff / 3_600_000)} h`;
}

const STATE_LABEL: Record<string, string> = {
  running: "En cours",
  connecting: "Connexion…",
  stopped: "Arrêté",
  error: "Erreur",
  worker_required: "Worker externe requis",
};

export function CollectorPanel() {
  const { data, isLoading } = useCollectorStatus();
  const setState = useSetCollectorState();

  const runtime = data?.runtimeState ?? "stopped";
  const tone =
    runtime === "running"
      ? "border-primary/40 bg-primary/10 text-primary"
      : runtime === "error" || runtime === "worker_required"
        ? "border-warning/40 bg-warning/10 text-warning"
        : "border-border bg-surface text-muted-foreground";

  const wantsRunning = data?.desiredState === "running";

  return (
    <section aria-label="Collecteur Solana" className="panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radar className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-base font-semibold">Collecteur temps réel</h2>
        </div>
        <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", tone)}>
          {isLoading ? "…" : (STATE_LABEL[runtime] ?? runtime)}
        </span>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{data?.message ?? "Chargement…"}</p>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          { label: "Dernière activité", value: relative(data?.lastEventAt ?? null) },
          { label: "Heartbeat", value: relative(data?.lastHeartbeatAt ?? null) },
          { label: "Événements reçus", value: (data?.eventsReceived ?? 0).toLocaleString("fr-FR") },
          {
            label: "Tokens confirmés",
            value: (data?.tokensConfirmed ?? 0).toLocaleString("fr-FR"),
          },
          { label: "Reconnexions", value: String(data?.reconnects ?? 0) },
          { label: "Source", value: data?.source ?? "none" },
        ].map((item) => (
          <div key={item.label} className="rounded-md border border-border/60 bg-surface p-2">
            <dt className="text-[11px] text-muted-foreground">{item.label}</dt>
            <dd className="mt-0.5 truncate font-mono text-xs font-semibold">{item.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 rounded-md border border-border/60 bg-surface p-2">
        <p className="text-[11px] text-muted-foreground">Dernière signature</p>
        <p className="mt-0.5 break-all font-mono text-[11px]">{data?.lastSignature ?? "—"}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          onClick={() => setState.mutate({ desired: wantsRunning ? "stopped" : "running" })}
          disabled={setState.isPending || isLoading}
          variant={wantsRunning ? "outline" : "default"}
          className="min-h-11"
        >
          {wantsRunning ? (
            <>
              <Square className="size-4" aria-hidden="true" /> Arrêter le collecteur
            </>
          ) : (
            <>
              <Play className="size-4" aria-hidden="true" /> Démarrer le collecteur
            </>
          )}
        </Button>
        <span className="text-xs text-muted-foreground">
          Observation uniquement — aucun ordre, aucune alerte Telegram automatique en V1.
        </span>
      </div>
    </section>
  );
}
