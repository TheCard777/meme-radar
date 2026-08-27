import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/radar/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { useAlerts } from "@/lib/radar-hooks";
import { formatAge } from "@/lib/radar-service";
import { ScoreBadge } from "@/components/radar/ScoreBadge";
import { TrackedTokensPanel } from "@/components/radar/TrackedTokensPanel";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Historique des alertes — Meme Radar" },
      {
        name: "description",
        content:
          "Historique des alertes de détection Meme Radar : niveau, score, canal et horodatage, en mode simulation.",
      },
      { property: "og:title", content: "Historique des alertes — Meme Radar" },
      {
        property: "og:description",
        content: "Toutes les alertes de scoring générées par le radar, en simulation.",
      },
    ],
  }),
  component: AlertsPage,
});

const LEVEL_STYLE: Record<string, string> = {
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
  signal: "border-primary/40 bg-primary/10 text-primary",
  info: "border-border bg-secondary text-muted-foreground",
};

function AlertsPage() {
  const alerts = useAlerts();

  return (
    <AppShell
      title="Historique des alertes"
      subtitle="Toutes les alertes générées par le scoring — simulation uniquement."
    >
      <div className="mb-6">
        <TrackedTokensPanel />
      </div>

      {alerts.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <ul className="panel divide-y divide-border/60">
          {(alerts.data ?? []).map((alert) => (
            <li key={alert.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${LEVEL_STYLE[alert.level] ?? LEVEL_STYLE["info"]}`}
              >
                {alert.level === "critical"
                  ? "Critique"
                  : alert.level === "signal"
                    ? "Signal"
                    : "Info"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{alert.message}</p>
                <p className="text-xs text-muted-foreground">
                  ${alert.token_symbol} · {alert.channel} · il y a {formatAge(alert.created_at)}
                </p>
              </div>
              <ScoreBadge score={alert.score} />
            </li>
          ))}
          {(alerts.data ?? []).length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-muted-foreground">
              Aucune alerte pour le moment.
            </li>
          )}
        </ul>
      )}
    </AppShell>
  );
}
