import { useMemo, useState } from "react";
import { ArrowDownWideNarrow, TrendingUp } from "lucide-react";
import { formatAge, formatUsd } from "@/lib/radar-service";
import { tokenLevel, type TokenRow } from "@/lib/radar-types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScoreBadge, StatusPill } from "./ScoreBadge";
import { RiskBadge } from "./RiskBadge";

type SortMode = "score" | "newest";

export function OpportunityTable({
  tokens,
  onSelect,
}: {
  tokens: TokenRow[];
  onSelect: (token: TokenRow) => void;
}) {
  const [sortBy, setSortBy] = useState<SortMode>("score");

  const sortedTokens = useMemo(() => {
    const arr = [...tokens];
    if (sortBy === "score") {
      return arr.sort((a, b) => b.score - a.score);
    }
    return arr.sort(
      (a, b) => new Date(b.launched_at).getTime() - new Date(a.launched_at).getTime(),
    );
  }, [tokens, sortBy]);

  const realCount = tokens.filter((token) => !token.is_simulated).length;
  const demoCount = tokens.length - realCount;

  return (
    <section aria-label="Opportunités détectées" className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
        <h2 className="text-base font-semibold">Opportunités détectées</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortMode)}>
            <SelectTrigger
              aria-label="Trier les opportunités"
              className="h-8 w-auto min-w-[10rem] gap-2 border-border/70 bg-secondary/40 px-2.5 text-xs hover:bg-secondary"
            >
              {sortBy === "score" ? (
                <TrendingUp className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              ) : (
                <ArrowDownWideNarrow className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              )}
              <SelectValue placeholder="Trier par" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score">Score Radar</SelectItem>
              <SelectItem value="newest">Plus récent</SelectItem>
            </SelectContent>
          </Select>
          <span
            className={
              realCount > 0
                ? "rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
                : "rounded-full border border-warning/40 bg-warning/10 px-2.5 py-0.5 text-xs text-warning"
            }
          >
            {realCount > 0
              ? `${realCount} réel${realCount > 1 ? "s" : ""}${demoCount > 0 ? ` · ${demoCount} démo` : ""}`
              : `${demoCount} donnée${demoCount > 1 ? "s" : ""} démo`}
          </span>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">
            {sortBy === "score"
              ? "Tokens Solana détectés, triés par score Radar décroissant"
              : "Tokens Solana détectés, triés du plus récent au plus ancien"}
          </caption>
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-5 py-3 font-medium">Token</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Market cap</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Volume 24h</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Nouv. acheteurs</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Smart wallets</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Score</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Risque</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Âge</th>
              <th scope="col" className="px-5 py-3 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {sortedTokens.map((token) => (
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
                  <div className="flex items-center gap-2 font-medium">
                    <span>${token.symbol}</span>
                    <span className={token.is_simulated ? "text-[10px] text-warning" : "text-[10px] text-primary"}>
                      {token.is_simulated ? "DÉMO" : "RÉEL"}
                    </span>
                  </div>
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
                  <ScoreBadge
                    score={token.score}
                    unavailable={!token.is_simulated && !token.data_sufficient}
                  />
                </td>
                <td className="px-3 py-3 text-right">
                  {token.is_simulated ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <RiskBadge score={token.risk_score} level={token.risk_level} compact />
                  )}
                </td>

                <td className="px-3 py-3 text-right font-mono text-muted-foreground tabular-nums">
                  {formatAge(token.launched_at)}
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-col gap-1">
                    <StatusPill status={token.status} />
                    <span className="text-[10px] text-muted-foreground">
                      {tokenLevel(token).label}
                    </span>
                  </div>
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
                  <p className="flex items-center gap-2 font-medium">
                    <span>${token.symbol}</span>
                    <span className={token.is_simulated ? "text-[10px] text-warning" : "text-[10px] text-primary"}>
                      {token.is_simulated ? "DÉMO" : "RÉEL"}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">{token.name}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <ScoreBadge
                    score={token.score}
                    unavailable={!token.is_simulated && !token.data_sufficient}
                  />
                  {!token.is_simulated ? (
                    <RiskBadge score={token.risk_score} level={token.risk_level} compact />
                  ) : null}
                </div>
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
              <div className="mt-3 flex items-center gap-2">
                <StatusPill status={token.status} />
                <span className="text-[10px] text-muted-foreground">{tokenLevel(token).label}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
