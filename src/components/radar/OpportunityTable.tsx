import { formatAge, formatUsd } from "@/lib/radar-service";
import type { TokenRow } from "@/lib/radar-types";
import { ScoreBadge, StatusPill } from "./ScoreBadge";

export function OpportunityTable({
  tokens,
  onSelect,
}: {
  tokens: TokenRow[];
  onSelect: (token: TokenRow) => void;
}) {
  return (
    <section aria-label="Opportunités détectées" className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
        <h2 className="text-base font-semibold">Opportunités détectées</h2>
        <span className="rounded-full border border-warning/40 bg-warning/10 px-2.5 py-0.5 text-xs text-warning">
          Données de simulation
        </span>
      </div>

      {/* Desktop */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Tokens Solana détectés, triés par score de détection
          </caption>
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-5 py-3 font-medium">Token</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Market cap</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Volume 24h</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Nouv. acheteurs</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Smart wallets</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Score</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Âge</th>
              <th scope="col" className="px-5 py-3 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((token) => (
              <tr
                key={token.id}
                tabIndex={0}
                role="button"
                onClick={() => onSelect(token)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(token);
                  }
                }}
                className="cursor-pointer border-b border-border/60 outline-none transition-colors last:border-0 hover:bg-secondary/60 focus-visible:bg-secondary"
              >
                <td className="px-5 py-3">
                  <div className="font-medium">${token.symbol}</div>
                  <div className="text-xs text-muted-foreground">{token.name}</div>
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">
                  {formatUsd(token.market_cap)}
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">
                  {formatUsd(token.volume_24h)}
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">{token.new_buyers}</td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">
                  {token.smart_wallet_count}
                </td>
                <td className="px-3 py-3 text-right">
                  <ScoreBadge score={token.score} />
                </td>
                <td className="px-3 py-3 text-right font-mono text-muted-foreground tabular-nums">
                  {formatAge(token.launched_at)}
                </td>
                <td className="px-5 py-3">
                  <StatusPill status={token.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <ul className="divide-y divide-border/60 md:hidden">
        {tokens.map((token) => (
          <li key={token.id}>
            <button
              type="button"
              onClick={() => onSelect(token)}
              className="w-full px-4 py-4 text-left transition-colors hover:bg-secondary/60"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">${token.symbol}</p>
                  <p className="text-xs text-muted-foreground">{token.name}</p>
                </div>
                <ScoreBadge score={token.score} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">MCap</dt>
                  <dd className="font-mono">{formatUsd(token.market_cap)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Vol 24h</dt>
                  <dd className="font-mono">{formatUsd(token.volume_24h)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Acheteurs</dt>
                  <dd className="font-mono">{token.new_buyers}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Âge</dt>
                  <dd className="font-mono">{formatAge(token.launched_at)}</dd>
                </div>
              </dl>
              <div className="mt-3">
                <StatusPill status={token.status} />
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
