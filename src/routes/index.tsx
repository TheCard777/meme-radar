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
  useSmartWalletCount,
  useTokenDetail,
  useTokens,
  useTotalRealTokenCount,
} from "@/lib/radar-hooks";
import type { TokenRow } from "@/lib/radar-types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Meme Radar — Détection de memecoins Solana" },
      {
        name: "description",
        content:
          "Dashboard privé de détection et de trading de memecoins Solana : scoring, smart wallets et alertes.",
      },
      { property: "og:title", content: "Meme Radar — Détection de memecoins Solana" },
      {
        property: "og:description",
        content: "Scoring des nouveaux memecoins Solana, smart wallets et alertes en temps réel.",
      },
      {
        property: "og:image",
        content: "https://token-spotter-ai.lovable.app/__l5e/assets-v1/2ec26853-2f6a-45c1-93ba-1a79cd2d17ee/meme-radar-logo.png",
      },
      {
        name: "twitter:image",
        content: "https://token-spotter-ai.lovable.app/__l5e/assets-v1/2ec26853-2f6a-45c1-93ba-1a79cd2d17ee/meme-radar-logo.png",
      },
    ],
  }),
  component: Dashboard,
});

function PanelSkeleton({ className = "h-40" }: { className?: string }) {
  return <Skeleton className={`w-full ${className}`} />;
}

function Dashboard() {
  const [selected, setSelected] = useState<TokenRow | null>(null);
  const tokens = useTokens();
  const alerts = useAlerts();
  const walletCount = useSmartWalletCount();
  const settings = useBotSettings();
  const demoArchived = useDemoArchived();
  const totalTokens = useTotalRealTokenCount();
  const detail = useTokenDetail(selected?.id ?? null);

  const tokenList = tokens.data ?? [];
  const realTokenCount = tokenList.length;
  const kpisReady = !tokens.isLoading && !alerts.isLoading;

  return (
    <AppShell
      title="Radar des memecoins Solana"
      subtitle="Observation Solana en lecture seule — 100 % données réelles, aucun ordre n’est passé."
    >
      <div className="space-y-6">
        {kpisReady ? (
          <KpiGrid
            tokens={tokenList}
            alerts={alerts.data ?? []}
            wallets={[]}
            walletCount={walletCount.data ?? 0}
            demoArchived={demoArchived.data ?? 0}
            totalTokens={totalTokens.data ?? realTokenCount}
          />
        ) : (
          <PanelSkeleton className="h-28" />
        )}

        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          {tokens.isLoading ? (
            <PanelSkeleton className="h-96" />
          ) : (
            <OpportunityTable
              tokens={tokenList}
              onSelect={setSelected}
              hasMore={tokens.hasNextPage}
              loadingMore={tokens.isFetchingNextPage}
              onLoadMore={() => void tokens.fetchNextPage()}
            />
          )}
          <div className="space-y-6">
            <SystemStatus />
            <CollectorPanel />
            {tokens.isLoading ? <PanelSkeleton /> : <ScoringPanel tokens={tokenList} />}
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
                    {tokens.isLoading
                      ? "Chargement…"
                      : realTokenCount > 0
                        ? `${realTokenCount} tokens réels chargés`
                        : "Aucune donnée réelle"}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </div>
      </div>

      <TokenDetailSheet
        token={selected ? (detail.data ?? selected) : null}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </AppShell>
  );
}
