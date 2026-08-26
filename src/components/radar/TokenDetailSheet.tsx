import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { formatAge, formatUsd, shortAddress } from "@/lib/radar-service";
import type { TokenRow } from "@/lib/radar-types";
import { ScoreBadge, StatusPill } from "./ScoreBadge";

export function TokenDetailSheet({
  token,
  onOpenChange,
}: {
  token: TokenRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={token !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {token ? (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-3">
                <span>${token.symbol}</span>
                <ScoreBadge score={token.score} />
              </SheetTitle>
              <SheetDescription>
                {token.name} · <span className="font-mono">{shortAddress(token.mint_address)}</span>
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-8">
              <div className="flex items-center gap-2">
                <StatusPill status={token.status} />
                <span
                  className={
                    token.is_simulated
                      ? "rounded-full border border-warning/40 bg-warning/10 px-2.5 py-0.5 text-xs text-warning"
                      : "rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
                  }
                >
                  {token.is_simulated ? "Donnée démo" : "Donnée réelle"}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-3">
                {[
                  ["Market cap", formatUsd(token.market_cap)],
                  ["Liquidité", formatUsd(token.liquidity_usd ?? 0)],
                  ["Variation 1h", `${(token.price_change_1h ?? 0).toFixed(1)} %`],
                  ["Volume 24h", formatUsd(token.volume_24h)],
                  ["Nouveaux acheteurs", String(token.new_buyers)],
                  ["Smart wallets", String(token.smart_wallet_count)],
                  ["Âge", formatAge(token.launched_at)],
                  ["Score global", `${token.score}/100`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border bg-surface p-3">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 font-mono text-sm">{value}</dd>
                  </div>
                ))}
              </dl>

              <section aria-label="Facteurs du score" className="space-y-3">
                <h3 className="text-sm font-semibold">Facteurs du score</h3>
                {token.score_factors.map((factor) => (
                  <div key={factor.label}>
                    <div className="flex items-center justify-between text-xs">
                      <span>{factor.label}</span>
                      <span className="font-mono text-muted-foreground">
                        {factor.value}/{factor.weight}
                      </span>
                    </div>
                    <Progress
                      className="mt-1.5 h-2"
                      value={Math.round((factor.value / factor.weight) * 100)}
                    />
                  </div>
                ))}
              </section>

              <p className="rounded-lg border border-border bg-surface p-3 text-xs text-muted-foreground">
                V1 : détection et scoring uniquement. Aucun achat, aucune vente, aucune clé privée
                n’est manipulée par l’application.
              </p>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
