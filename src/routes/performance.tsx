import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AppShell } from "@/components/radar/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { useAlerts, useSnapshots } from "@/lib/radar-hooks";
import {
  computeOutcomes,
  COHORTS,
  summarizeCohort,
  HORIZONS_MIN,
  type AlertPoint,
} from "@/lib/performance";

export const Route = createFileRoute("/performance")({
  head: () => ({
    meta: [
      { title: "Performance des signaux — Meme Radar" },
      {
        name: "description",
        content:
          "Ce qui s’est réellement passé après chaque signal Meme Radar : cohortes 75-84, 85-89 et 90-100, multiples médians, survie et pertes, sur données réelles uniquement.",
      },
      { property: "og:title", content: "Performance des signaux — Meme Radar" },
      {
        property: "og:description",
        content:
          "Mesure descriptive des signaux réels : multiples observés, taux de survie et pertes, avec taille d’échantillon.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PerformancePage,
});

function fmtMultiple(value: number | null): string {
  return value === null ? "inconnu" : `×${value.toFixed(2)}`;
}

function fmtPct(value: number | null): string {
  return value === null ? "inconnu" : `${Math.round(value * 100)} %`;
}

function PerformancePage() {
  const alerts = useAlerts();
  const tokenIds = useMemo(
    () => [...new Set((alerts.data ?? []).map((a) => a.token_id).filter((id): id is string => !!id))].sort(),
    [alerts.data],
  );
  const snapshots = useSnapshots(tokenIds);

  const outcomes = useMemo(() => {
    const points: AlertPoint[] = (alerts.data ?? []).map((a) => ({
      id: a.id,
      token_id: a.token_id ?? null,
      token_symbol: a.token_symbol,
      score: a.score,
      created_at: a.created_at,
      price_usd_at_alert: a.price_usd_at_alert ?? null,
    }));
    return computeOutcomes(points, snapshots.data ?? []);
  }, [alerts.data, snapshots.data]);

  const cohorts = useMemo(
    () => COHORTS.map((c) => summarizeCohort(outcomes, c)),
    [outcomes],
  );

  const loading = alerts.isLoading || (tokenIds.length > 0 && snapshots.isLoading);

  return (
    <AppShell
      title="Performance des signaux"
      subtitle="Mesure descriptive de ce qui suit chaque signal réel — aucune promesse de rendement, aucun trading."
    >
      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {cohorts.map((cohort) => (
              <section key={cohort.cohort} className="panel p-4 sm:p-5">
                <h2 className="text-base font-semibold">Cohorte {cohort.cohort}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Échantillon : {cohort.sample} signal(aux) · {cohort.measured} mesurable(s)
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border border-border bg-surface p-3">
                    <dt className="text-xs text-muted-foreground">Multiple médian (max atteint)</dt>
                    <dd className="mt-1 font-mono">{fmtMultiple(cohort.medianMax)}</dd>
                  </div>
                  <div className="rounded-lg border border-border bg-surface p-3">
                    <dt className="text-xs text-muted-foreground">Meilleur multiple</dt>
                    <dd className="mt-1 font-mono">{fmtMultiple(cohort.bestMax)}</dd>
                  </div>
                  <div className="rounded-lg border border-border bg-surface p-3">
                    <dt className="text-xs text-muted-foreground">Taux de survie (≥ 0,5×)</dt>
                    <dd className="mt-1 font-mono">{fmtPct(cohort.survivalRate)}</dd>
                  </div>
                  <div className="rounded-lg border border-border bg-surface p-3">
                    <dt className="text-xs text-muted-foreground">Signaux en perte (&lt; 1×)</dt>
                    <dd className="mt-1 font-mono">{fmtPct(cohort.lossRate)}</dd>
                  </div>
                </dl>
              </section>
            ))}
          </div>

          <section className="panel overflow-x-auto p-4 sm:p-5" aria-label="Détail des signaux">
            <h2 className="text-base font-semibold">Détail par signal</h2>
            {outcomes.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Aucun signal réel ≥ 85 enregistré pour l’instant. Les mesures apparaîtront dès
                qu’un token réel franchira le seuil et que des instantanés seront capturés.
              </p>
            ) : (
              <table className="mt-4 w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2">Token</th>
                    <th className="pb-2">Score</th>
                    {HORIZONS_MIN.map((h) => (
                      <th key={h} className="pb-2">
                        {h < 60 ? `${h}m` : `${h / 60}h`}
                      </th>
                    ))}
                    <th className="pb-2">Max</th>
                  </tr>
                </thead>
                <tbody>
                  {outcomes.map((o) => (
                    <tr key={o.alertId} className="border-t border-border/70">
                      <td className="py-2 font-medium">${o.symbol}</td>
                      <td className="py-2 font-mono">{o.score}</td>
                      {HORIZONS_MIN.map((h) => (
                        <td key={h} className="py-2 font-mono text-muted-foreground">
                          {fmtMultiple(o.horizons[h])}
                        </td>
                      ))}
                      <td className="py-2 font-mono">{fmtMultiple(o.maxMultiple)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              Multiples calculés à partir du prix enregistré au moment de l’alerte et des
              instantanés capturés ensuite. « inconnu » signifie qu’aucune donnée fiable n’existe
              pour cet horizon — rien n’est extrapolé.
            </p>
          </section>
        </div>
      )}
    </AppShell>
  );
}
