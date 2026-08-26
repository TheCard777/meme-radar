import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/radar/AppShell";
import { KpiGrid } from "@/components/radar/KpiGrid";
import { OpportunityTable } from "@/components/radar/OpportunityTable";
import { TokenDetailSheet } from "@/components/radar/TokenDetailSheet";
import { TelegramPanel } from "@/components/radar/TelegramPanel";
import { SystemStatus } from "@/components/radar/SystemStatus";
import { CollectorPanel } from "@/components/radar/CollectorPanel";
import { ScoringPanel } from "@/components/radar/ScoringPanel";

import { Skeleton } from "@/components/ui/skeleton";
import {
  useAlerts,
  useBotSettings,
  useDemoArchived,
  useSmartWallets,
  useTokens,
} from "@/lib/radar-hooks";
import type { TokenRow } from "@/lib/radar-types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Meme Radar — Détection de memecoins Solana" },
      {
        name: "description",
        content:
          "Dashboard privé de détection et de simulation de memecoins Solana : scoring, smart wallets et alertes. Aucun trading automatique.",
      },
      { property: "og:title", content: "Meme Radar — Détection de memecoins Solana" },
      {
        property: "og:description",
        content: "Scoring des nouveaux memecoins Solana, smart wallets et alertes en simulation.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [selected, setSelected] = useState<TokenRow | null>(null);
  const tokens = useTokens();
  const alerts = useAlerts();
  const wallets = useSmartWallets();
  const settings = useBotSettings();
  const demoArchived = useDemoArchived();

  const loading = tokens.isLoading || alerts.isLoading || wallets.isLoading;
  const realTokenCount = (tokens.data ?? []).length;

  return (
    <AppShell
      title="Radar des memecoins Solana"
      subtitle="Observation Solana en lecture seule — 100 % données réelles, aucun ordre n’est passé."
    >
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          <KpiGrid
            tokens={tokens.data ?? []}
            alerts={alerts.data ?? []}
            wallets={wallets.data ?? []}
            demoArchived={demoArchived.data ?? 0}
          />

          <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
            <OpportunityTable tokens={tokens.data ?? []} onSelect={setSelected} />
            <div className="space-y-6">
              <SystemStatus />
              <CollectorPanel />
              <ScoringPanel tokens={tokens.data ?? []} />
              <TelegramPanel />
              <section aria-label="Statut du scanner" className="panel p-4 sm:p-5">
                <h2 className="text-base font-semibold">Statut du scanner</h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Mode</dt>
                    <dd>{settings.data?.status === "active" ? "Actif" : "En pause"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Seuil Telegram</dt>
                    <dd className="font-mono">{settings.data?.telegram_threshold ?? 85}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Seuil critique</dt>
                    <dd className="font-mono">{settings.data?.critical_threshold ?? 90}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Source des données</dt>
                    <dd className="text-right">
                      {realTokenCount > 0
                        ? `${realTokenCount} tokens réels`
                        : "Aucune donnée réelle"}
                    </dd>
                  </div>
                </dl>
              </section>

            </div>
          </div>
        </div>
      )}

      <TokenDetailSheet token={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </AppShell>
  );
}
