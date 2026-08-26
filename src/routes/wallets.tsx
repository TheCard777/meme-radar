import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/radar/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { useSmartWallets, useWalletTrades } from "@/lib/radar-hooks";
import { formatAge, shortAddress } from "@/lib/radar-service";

export const Route = createFileRoute("/wallets")({
  head: () => ({
    meta: [
      { title: "Smart Wallets — Meme Radar" },
      {
        name: "description",
        content:
          "Wallets Solana suivis par Meme Radar : win rate, PnL simulé, nombre de trades et derniers achats.",
      },
      { property: "og:title", content: "Smart Wallets — Meme Radar" },
      {
        property: "og:description",
        content: "Performance simulée des wallets suivis et leurs derniers achats.",
      },
    ],
  }),
  component: WalletsPage,
});

function WalletsPage() {
  const wallets = useSmartWallets();
  const trades = useWalletTrades();

  return (
    <AppShell
      title="Smart Wallets"
      subtitle="Wallets suivis et performance simulée — aucune exécution d’ordre."
    >
      {wallets.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {(wallets.data ?? []).map((wallet) => {
            const last = (trades.data ?? []).filter((t) => t.wallet_id === wallet.id).slice(0, 3);
            const positive = wallet.simulated_pnl >= 0;
            return (
              <li key={wallet.id} className="panel p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm">{shortAddress(wallet.address)}</p>
                    <p className="text-xs text-muted-foreground">
                      {wallet.label ?? "Wallet suivi"} · actif il y a {formatAge(wallet.last_active_at)}
                    </p>
                  </div>
                  <span
                    className={
                      positive
                        ? "rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-sm text-primary"
                        : "rounded-md border border-destructive/40 bg-destructive/10 px-2 py-0.5 font-mono text-sm text-destructive"
                    }
                  >
                    {positive ? "+" : ""}
                    {wallet.simulated_pnl.toFixed(1)} SOL
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-border bg-surface p-2">
                    <dt className="text-[0.7rem] text-muted-foreground">Win rate</dt>
                    <dd className="font-mono text-sm">{wallet.win_rate.toFixed(1)}%</dd>
                  </div>
                  <div className="rounded-lg border border-border bg-surface p-2">
                    <dt className="text-[0.7rem] text-muted-foreground">Trades</dt>
                    <dd className="font-mono text-sm">{wallet.trade_count}</dd>
                  </div>
                  <div className="rounded-lg border border-border bg-surface p-2">
                    <dt className="text-[0.7rem] text-muted-foreground">PnL simulé</dt>
                    <dd className="font-mono text-sm">{wallet.simulated_pnl.toFixed(0)}</dd>
                  </div>
                </dl>

                <div className="mt-4">
                  <p className="text-xs font-medium text-muted-foreground">Derniers achats</p>
                  <ul className="mt-2 space-y-1.5">
                    {last.map((trade) => (
                      <li
                        key={trade.id}
                        className="flex items-center justify-between rounded-md border border-border/70 px-3 py-1.5 text-xs"
                      >
                        <span className="font-medium">${trade.token_symbol}</span>
                        <span className="font-mono text-muted-foreground">
                          {trade.amount_sol} SOL · il y a {formatAge(trade.traded_at)}
                        </span>
                      </li>
                    ))}
                    {last.length === 0 && (
                      <li className="text-xs text-muted-foreground">Aucun achat récent</li>
                    )}
                  </ul>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
