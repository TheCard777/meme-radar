import { createFileRoute } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/radar/AppShell";
import { Button } from "@/components/ui/button";
import { getPaperMarketViews } from "@/lib/paper-strategy.functions";
import {
  EXIT_REASON_LABELS,
  PAPER_STRATEGY_V1 as CFG,
  REAL_TRADING_ENABLED,
  dailyStats,
  emptyLedger,
  entryBlocker,
  evaluateEligibility,
  positionPnl,
  stepLedger,
  type PaperLedger,
} from "@/lib/paper-strategy";

export const Route = createFileRoute("/strategy")({
  head: () => ({
    meta: [
      { title: "Stratégie simulée V1 — Meme Radar" },
      {
        name: "description",
        content:
          "Paper trading uniquement : éligibilité, positions simulées, PnL et limites de la stratégie V1. Aucun ordre réel.",
      },
      { property: "og:title", content: "Stratégie simulée V1 — Meme Radar" },
      { property: "og:description", content: "Simulation de stratégie sans aucun ordre réel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StrategyPage,
});

const KEY = "meme-radar:paper-ledger:v1";
const usd = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)} $`;

function StrategyPage() {
  const [ledger, setLedger] = useState<PaperLedger | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      setLedger(raw ? (JSON.parse(raw) as PaperLedger) : emptyLedger());
    } catch {
      setLedger(emptyLedger());
    }
  }, []);

  const openMints = useMemo(() => (ledger?.open ?? []).map((p) => p.mint).sort(), [ledger]);
  const q = useQuery({
    queryKey: ["paper-views", openMints],
    queryFn: () => getPaperMarketViews({ data: { openMints } }),
    enabled: ledger !== null,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!q.data || !ledger) return;
    const { ledger: next } = stepLedger(ledger, q.data.views, q.data.at);
    localStorage.setItem(KEY, JSON.stringify(next));
    setLedger(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data?.at]);

  const now = q.data?.at ?? new Date().toISOString();
  const stats = ledger ? dailyStats(ledger, now) : null;

  return (
    <AppShell title="Stratégie V1 (simulation)" subtitle="Paper trading — aucun ordre réel n'est envoyé.">
      <div className="space-y-6">
        <section className="panel border-warning p-4 text-sm">
          <p className="font-semibold">SIMULATION UNIQUEMENT — mode réel : {REAL_TRADING_ENABLED ? "activé" : "désactivé (verrouillé dans le code)"}</p>
          <p className="mt-1 text-muted-foreground">
            Aucun wallet, aucune clé, aucune transaction. Les positions vivent uniquement dans ce navigateur
            et ne progressent que lorsque cette page est ouverte (rafraîchie toutes les 30 s). Le coupe-circuit
            de {CFG.dailyLossLimitUsd} $ est un seuil logiciel, pas une garantie : illiquidité, slippage, frais et
            gaps de prix peuvent produire des pertes supérieures en conditions réelles.
          </p>
        </section>

        {stats && (
          <section className="panel grid gap-3 p-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Achats aujourd'hui" value={`${stats.entries} / ${CFG.maxEntriesPerDay}`} />
            <Stat label="Entrées du jour" value={`${stats.newEntriesUsd} / ${CFG.maxDailyNewEntriesUsd} $`} />
            <Stat label="Engagé" value={`${stats.openExposureUsd} / ${CFG.maxOpenExposureUsd} $`} />
            <Stat label="PnL réalisé (jour)" value={usd(stats.realizedUsd)} />
            <Stat label="PnL latent" value={usd(stats.unrealizedUsd)} />
            <Stat
              label="Coupe-circuit"
              value={stats.circuitBreaker ? "ACTIF jusqu'à 00:00 UTC" : `inactif (${usd(stats.totalUsd)})`}
            />
          </section>
        )}

        <section className="panel p-4">
          <h2 className="mb-3 text-base font-semibold">Positions simulées ouvertes</h2>
          {!ledger?.open.length ? (
            <p className="text-sm text-muted-foreground">Aucune.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {ledger.open.map((p) => (
                <li key={p.id} className="flex flex-wrap justify-between gap-2 rounded border border-border p-2">
                  <span className="font-mono">{p.symbol} · {p.mint}</span>
                  <span>{p.stakeUsd} $ · entrée {p.entryPrice} · {usd(positionPnl(p))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel p-4">
          <h2 className="mb-3 text-base font-semibold">Candidats évalués ({q.data?.views.length ?? 0})</h2>
          {q.isError && <p className="text-sm text-destructive">Lecture impossible : {String(q.error)}</p>}
          <ul className="space-y-3 text-sm">
            {(q.data?.views ?? []).map((v) => {
              const e = evaluateEligibility(v);
              const block = ledger && e.eligible ? entryBlocker(ledger, v, now) : null;
              return (
                <li key={v.mint} className="rounded border border-border p-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-mono">{v.symbol} · {v.mint}</span>
                    <span className={e.eligible ? "text-primary" : "text-muted-foreground"}>
                      {e.eligible ? (block ? `Éligible — bloqué : ${block}` : "Éligible") : "Non éligible"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {e.checks.map((c) => (
                      <span
                        key={c.key}
                        className={`rounded px-1.5 py-0.5 text-xs ${c.pass === true ? "bg-primary/15 text-primary" : c.pass === false ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}
                      >
                        {c.label} : {c.detail}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Historique simulé</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!confirm("Effacer l'historique simulé de ce navigateur ?")) return;
                const l = emptyLedger();
                localStorage.setItem(KEY, JSON.stringify(l));
                setLedger(l);
              }}
            >
              Réinitialiser
            </Button>
          </div>
          {!ledger?.closed.length ? (
            <p className="text-sm text-muted-foreground">Aucune position clôturée.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {[...ledger.closed].reverse().map((p) => (
                <li key={p.id} className="flex flex-wrap justify-between gap-2 rounded border border-border p-2">
                  <span className="font-mono">{p.symbol}</span>
                  <span>
                    {p.exitReason ? EXIT_REASON_LABELS[p.exitReason] : ""} · {usd(p.realizedPnlUsd ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono">{value}</p>
    </div>
  );
}
