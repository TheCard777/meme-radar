import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { formatAge, formatUsd, shortAddress } from "@/lib/radar-service";
import { LP_STATUS_LABELS, tokenLevel, type TokenRow } from "@/lib/radar-types";
import { ScoreBadge, StatusPill } from "./ScoreBadge";
import { RiskBadge } from "./RiskBadge";

function metricLabel(value: number | null | undefined, format: (v: number) => string): string {
  return value === null || value === undefined ? "Inconnu" : format(value);
}

export function TokenDetailSheet({
  token,
  onOpenChange,
}: {
  token: TokenRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const level = token ? tokenLevel(token) : null;
  const metrics = token?.market_metrics ?? null;
  const missing = token?.missing_metrics ?? [];
  const insufficient = Boolean(token && !token.is_simulated && !token.data_sufficient);

  return (
    <Sheet open={token !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {token && level ? (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-3">
                <span>${token.symbol}</span>
                <ScoreBadge score={token.score} unavailable={insufficient} />
              </SheetTitle>
              <SheetDescription>
                {token.name} · <span className="font-mono">{shortAddress(token.mint_address)}</span>
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-8">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={token.status} />
                <span className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs">
                  {level.label}
                </span>
                <span
                  className={
                    token.is_simulated
                      ? "rounded-full border border-warning/40 bg-warning/10 px-2.5 py-0.5 text-xs text-warning"
                      : "rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
                  }
                >
                  {token.is_simulated ? "Donnée démo" : "Donnée réelle"}
                </span>
                {!token.is_simulated ? (
                  <span className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground">
                    Fiabilité {Math.round((token.score_confidence ?? 0) * 100)} %
                  </span>
                ) : null}
              </div>

              {insufficient ? (
                <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
                  Données insuffisantes pour publier un score fiable : trop de métriques
                  manquantes sur ce token.
                </p>
              ) : null}

              <dl className="grid grid-cols-2 gap-3">
                {[
                  ["Market cap", token.is_simulated ? formatUsd(token.market_cap) : metricLabel(metrics?.marketCap, formatUsd)],
                  ["Liquidité", token.is_simulated ? formatUsd(token.liquidity_usd) : metricLabel(metrics?.liquidityUsd, formatUsd)],
                  ["Volume 24h", token.is_simulated ? formatUsd(token.volume_24h) : metricLabel(metrics?.volume24h, formatUsd)],
                  ["Volume 1h", token.is_simulated ? formatUsd(token.volume_1h) : metricLabel(metrics?.volume1h, formatUsd)],
                  ["Acheteurs 1h", token.is_simulated ? String(token.new_buyers) : metricLabel(metrics?.buyers1h, (v) => String(Math.round(v)))],
                  ["Variation 1h", metricLabel(token.is_simulated ? token.price_change_1h : metrics?.priceChange1h, (v) => `${v.toFixed(1)} %`)],
                  ["Top 10 holders", metricLabel(token.holders_top10_share, (v) => `${(v * 100).toFixed(1)} %`)],
                  ["Âge", formatAge(token.launched_at)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border bg-surface p-3">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 font-mono text-sm">{value}</dd>
                  </div>
                ))}
              </dl>

              <section aria-label="Détail du score" className="space-y-3">
                <h3 className="text-sm font-semibold">Détail du score</h3>
                {token.score_factors.map((factor) => {
                  const available = factor.normalized !== null && factor.normalized !== undefined
                    ? true
                    : factor.points !== undefined
                      ? factor.points !== null
                      : true;
                  const points = factor.points ?? factor.value;
                  return (
                    <div key={factor.label}>
                      <div className="flex items-center justify-between text-xs">
                        <span>{factor.label}</span>
                        <span className="font-mono text-muted-foreground">
                          {available ? `${points}/${factor.weight}` : "non disponible"}
                        </span>
                      </div>
                      <Progress
                        className="mt-1.5 h-2"
                        value={available ? Math.round(((points ?? 0) / factor.weight) * 100) : 0}
                      />
                      {factor.detail ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">{factor.detail}</p>
                      ) : null}
                      {factor.source ? (
                        <p className="text-[11px] text-muted-foreground/70">
                          Source : {factor.source}
                        </p>
                      ) : null}

                    </div>
                  );
                })}
              </section>

              {missing.length > 0 ? (
                <section aria-label="Données manquantes" className="space-y-2">
                  <h3 className="text-sm font-semibold">Données manquantes</h3>
                  <ul className="flex flex-wrap gap-2">
                    {missing.map((item) => (
                      <li
                        key={item}
                        className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-muted-foreground">
                    Les poids indisponibles sont renormalisés : aucun score n’est gonflé
                    artificiellement.
                  </p>
                </section>
              ) : null}

              <section aria-label="Statut de l'alerte" className="space-y-1">
                <h3 className="text-sm font-semibold">Alerte Telegram</h3>
                <p className="text-xs text-muted-foreground">
                  {token.is_simulated
                    ? "Token démo — jamais alerté."
                    : token.alert_level === "priority"
                      ? `Alerte PRIORITÉ envoyée${token.last_alert_at ? ` le ${new Date(token.last_alert_at).toLocaleString("fr-FR")}` : ""}.`
                      : token.alert_level === "signal"
                        ? `Alerte SIGNAL envoyée${token.last_alert_at ? ` le ${new Date(token.last_alert_at).toLocaleString("fr-FR")}` : ""}.`
                        : "Aucune alerte envoyée (score sous le seuil 85 ou données insuffisantes)."}
                </p>
              </section>

              {!token.is_simulated && metrics?.pairUrl ? (
                <div className="flex flex-wrap gap-2 text-xs">
                  <a
                    className="rounded-lg border border-border px-3 py-1.5 hover:bg-secondary"
                    href={metrics.pairUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Voir sur DEX Screener
                  </a>
                  <a
                    className="rounded-lg border border-border px-3 py-1.5 hover:bg-secondary"
                    href={`https://solscan.io/token/${token.mint_address}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Voir sur Solscan
                  </a>
                </div>
              ) : null}

              <p className="rounded-lg border border-border bg-surface p-3 text-xs text-muted-foreground">
                Le score est un indicateur de qualité des signaux observés, pas une probabilité de
                gain ni une garantie. V1 : détection, scoring et alertes uniquement — aucun achat,
                aucune vente, aucune clé privée.
              </p>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
