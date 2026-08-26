import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/radar/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { useSmartWallets, useWalletEntries } from "@/lib/radar-hooks";
import { formatAge, shortAddress } from "@/lib/radar-service";

export const Route = createFileRoute("/wallets")({
  head: () => ({
    meta: [
      { title: "Smart Wallets réels — Meme Radar" },
      {
        name: "description",
        content:
          "Adresses publiques Solana identifiées comme premiers acheteurs réels : entrées précoces, taux de réussite observé et raisons du score. Aucune donnée hors chaîne.",
      },
      { property: "og:title", content: "Smart Wallets réels — Meme Radar" },
      {
        property: "og:description",
        content:
          "Analyse on-chain des premiers acheteurs : entrées précoces, réussite observée et données manquantes explicites.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WalletsPage,
});

function fmtPct(value: number | null): string {
  return value === null ? "inconnu" : `${Math.round(value * 100)} %`;
}

function WalletsPage() {
  const wallets = useSmartWallets();
  const entries = useWalletEntries();

  const rows = wallets.data ?? [];

  return (
    <AppShell
      title="Smart Wallets"
      subtitle="Adresses publiques réelles observées on-chain — aucune identité hors chaîne, aucune exécution d’ordre."
    >
      {wallets.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : rows.length === 0 ? (
        <section className="panel p-6">
          <h2 className="text-base font-semibold">Aucun wallet réel analysé pour l’instant</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Les premiers acheteurs sont extraits des transactions on-chain de chaque token réel
            détecté. Lancez le worker (ou l’analyse manuelle) pour peupler cette vue. Aucun wallet
            n’est jamais fabriqué.
          </p>
        </section>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {rows.map((wallet) => {
            const last = (entries.data ?? [])
              .filter((e) => e.wallet_address === wallet.address)
              .slice(0, 3);
            return (
              <li key={wallet.id} className="panel p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <a
                      href={`https://solscan.io/account/${wallet.address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-sm underline-offset-4 hover:underline"
                    >
                      {shortAddress(wallet.address)}
                    </a>
                    <p className="text-xs text-muted-foreground">
                      Vu il y a {formatAge(wallet.last_active_at)} · données blockchain uniquement
                    </p>
                  </div>
                  <span
                    className={
                      wallet.data_sufficient
                        ? "rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-sm text-primary"
                        : "rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-xs text-muted-foreground"
                    }
                  >
                    {wallet.data_sufficient && wallet.smart_wallet_score !== null
                      ? `Score ${Math.round(wallet.smart_wallet_score)}/100`
                      : "Données insuffisantes"}
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-border bg-surface p-2">
                    <dt className="text-[0.7rem] text-muted-foreground">Tokens observés</dt>
                    <dd className="font-mono text-sm">{wallet.tokens_tracked}</dd>
                  </div>
                  <div className="rounded-lg border border-border bg-surface p-2">
                    <dt className="text-[0.7rem] text-muted-foreground">Entrées précoces</dt>
                    <dd className="font-mono text-sm">{wallet.early_entries}</dd>
                  </div>
                  <div className="rounded-lg border border-border bg-surface p-2">
                    <dt className="text-[0.7rem] text-muted-foreground">Réussite observée</dt>
                    <dd className="font-mono text-sm">{fmtPct(wallet.success_rate)}</dd>
                  </div>
                </dl>

                <div className="mt-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    Pourquoi ce wallet est suivi
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {(wallet.reasons ?? []).map((reason) => (
                      <li key={reason}>• {reason}</li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    Dernières entrées observées
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {last.map((entry) => (
                      <li
                        key={`${entry.wallet_address}-${entry.mint_address}`}
                        className="flex items-center justify-between rounded-md border border-border/70 px-3 py-1.5 text-xs"
                      >
                        <span className="font-mono">{shortAddress(entry.mint_address)}</span>
                        <span className="font-mono text-muted-foreground">
                          rang #{entry.entry_rank}
                          {entry.block_time ? ` · il y a ${formatAge(entry.block_time)}` : ""}
                        </span>
                      </li>
                    ))}
                    {last.length === 0 && (
                      <li className="text-xs text-muted-foreground">Aucune entrée enregistrée</li>
                    )}
                  </ul>
                </div>

                <p className="mt-4 text-[0.7rem] text-muted-foreground">
                  PnL et multiples : inconnus — non calculables de façon fiable à ce stade.
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
