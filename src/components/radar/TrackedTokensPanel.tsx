import { BellOff, BellRing } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAge, shortAddress } from "@/lib/radar-service";
import {
  useToggleTrackedToken,
  useTrackedTokenAlerts,
  useTrackedTokens,
} from "@/lib/radar-hooks";

const STATE_LABEL: Record<string, string> = {
  unknown: "État inconnu",
  accelerating: "Accélération",
  stable: "Momentum intact",
  caution: "Prudence",
  degrading: "Dégradation forte",
};

/** Vue « Tokens suivis » : liste, compteur et désactivation immédiate. */
export function TrackedTokensPanel() {
  const tracked = useTrackedTokens();
  const alerts = useTrackedTokenAlerts();
  const toggle = useToggleTrackedToken();

  const rows = tracked.data ?? [];
  const active = rows.filter((row) => row.enabled);

  return (
    <section aria-label="Tokens suivis" className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <BellRing className="h-4 w-4 text-primary" aria-hidden="true" />
          Tokens suivis
        </h2>
        <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
          {active.length} token{active.length > 1 ? "s" : ""} suivi{active.length > 1 ? "s" : ""}
        </span>
      </div>

      {tracked.isLoading ? (
        <Skeleton className="m-4 h-24" />
      ) : active.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          Aucun token suivi. Active la cloche 🔔 sur une opportunité pour recevoir des alertes
          personnalisées en cas de changement significatif.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {active.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  ${row.token_symbol ?? "?"}{" "}
                  <span className="font-mono text-xs text-muted-foreground">
                    {shortAddress(row.token_mint)}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {STATE_LABEL[row.last_state] ?? row.last_state}
                  {row.last_evaluated_at
                    ? ` · évalué il y a ${formatAge(row.last_evaluated_at)}`
                    : " · pas encore évalué"}
                </p>
              </div>
              <button
                type="button"
                disabled={toggle.isPending}
                onClick={() =>
                  toggle.mutate({
                    tokenId: row.token_id ?? "",
                    mint: row.token_mint,
                    symbol: row.token_symbol,
                    name: row.token_name,
                    enabled: false,
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <BellOff className="h-3.5 w-3.5" aria-hidden="true" />
                Désactiver
              </button>
            </li>
          ))}
        </ul>
      )}

      {(alerts.data ?? []).length > 0 ? (
        <div className="border-t border-border px-4 py-3 sm:px-5">
          <h3 className="text-sm font-semibold">Dernières alertes personnalisées</h3>
          <ul className="mt-2 space-y-1.5">
            {(alerts.data ?? []).slice(0, 10).map((alert) => (
              <li key={alert.id} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">${alert.token_symbol ?? "?"}</span>{" "}
                {alert.message} · il y a {formatAge(alert.created_at)}
                {alert.telegram_sent ? " · Telegram envoyé" : " · non envoyé"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
