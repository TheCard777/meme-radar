import { useState } from "react";
import { Activity, Loader2, RefreshCw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { runEnrichmentCycle } from "@/lib/enrichment.functions";
import { useBotSettings } from "@/lib/radar-hooks";
import type { TokenRow } from "@/lib/radar-types";

/**
 * Enrichissement des tokens réels (données de marché + on-chain) puis scoring
 * /100 renormalisé. Observation uniquement : aucun ordre n'est jamais passé.
 */
export function ScoringPanel({ tokens }: { tokens: TokenRow[] }) {
  const run = useServerFn(runEnrichmentCycle);
  const qc = useQueryClient();
  const settings = useBotSettings();
  const [running, setRunning] = useState(false);

  const real = tokens.filter((t) => !t.is_simulated);
  const scored = real.filter((t) => t.data_sufficient);
  const insufficient = real.filter((t) => (t.last_enriched_at ?? null) !== null && !t.data_sufficient);
  const signals = real.filter((t) => t.data_sufficient && t.score >= 85);
  const alerted = real.filter((t) => t.alert_level === "signal" || t.alert_level === "priority");
  const threshold = settings.data?.telegram_threshold ?? 85;
  const critical = settings.data?.critical_threshold ?? 90;
  const bestScore = scored.length > 0 ? Math.max(...scored.map((t) => t.score)) : null;

  async function handleRun() {
    setRunning(true);
    try {
      const result = await run();
      toast.success(
        `Scoring terminé — ${result.enriched} token(s) enrichi(s), ${result.alertsCreated} alerte(s)`,
        {
          description:
            result.telegramSkipped ??
            `Meilleur score ${result.topScore ?? "n/a"} · ${result.insufficientData} sans score fiable · ${result.withoutMarketData} sans marché`,
        },
      );
      await qc.invalidateQueries({ queryKey: ["tokens"] });
      await qc.invalidateQueries({ queryKey: ["alerts"] });
    } catch (error) {
      toast.error("Enrichissement impossible", {
        description: error instanceof Error ? error.message : "Erreur inconnue",
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <section aria-label="Enrichissement et scoring" className="panel p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary">
            <Activity className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Scoring des tokens réels</h2>
            <p className="text-xs text-muted-foreground">
              Marché DEX Screener + holders on-chain · seuils : &lt;70 ignoré, 70-84 surveillé,{" "}
              {threshold}-{critical - 1} SIGNAL, ≥{critical} PRIORITÉ
            </p>
          </div>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg border border-border px-3 py-2">
          <dt className="text-xs text-muted-foreground">Tokens réels</dt>
          <dd className="font-mono">{real.length}</dd>
        </div>
        <div className="rounded-lg border border-border px-3 py-2">
          <dt className="text-xs text-muted-foreground">Score fiable</dt>
          <dd className="font-mono">{scored.length}</dd>
        </div>
        <div className="rounded-lg border border-border px-3 py-2">
          <dt className="text-xs text-muted-foreground">Données insuffisantes</dt>
          <dd className="font-mono">{insufficient.length}</dd>
        </div>
        <div className="rounded-lg border border-border px-3 py-2">
          <dt className="text-xs text-muted-foreground">Meilleur score</dt>
          <dd className="font-mono">{bestScore === null ? "n/a" : `${bestScore}/100`}</dd>
        </div>
        <div className="rounded-lg border border-border px-3 py-2">
          <dt className="text-xs text-muted-foreground">≥ {threshold} détectés</dt>
          <dd className="font-mono">{signals.length}</dd>
        </div>
        <div className="rounded-lg border border-border px-3 py-2">
          <dt className="text-xs text-muted-foreground">Alertes Telegram émises</dt>
          <dd className="font-mono">{alerted.length}</dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={handleRun}
        disabled={running || real.length === 0}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
      >
        {running ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="size-4" aria-hidden="true" />
        )}
        {running ? "Enrichissement en cours…" : "Enrichir et scorer maintenant"}
      </button>

      <p className="mt-3 text-xs text-muted-foreground">
        Un cycle traite jusqu’à 30 tokens (les moins récemment enrichis d’abord). Les poids des
        métriques manquantes sont renormalisés ; sans données suffisantes le score reste « n/a ».
        Anti-spam : une alerte par token et par niveau, cooldown 30 min. Les tokens démo ne sont
        jamais scorés ni alertés. Le score est un indicateur d’observation, pas une probabilité de
        gain. Aucun trading.
      </p>
      <p className="mt-2 text-xs text-warning">
        Le scoring continu tourne dans le processus collector externe : sans worker 24/7 lancé, il
        ne s’exécute qu’à la demande via ce bouton.
      </p>
    </section>
  );
}
