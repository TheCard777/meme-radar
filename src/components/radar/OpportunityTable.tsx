import { useMemo, useState } from "react";
import { ArrowDownWideNarrow, Search, TrendingUp, X } from "lucide-react";
import { formatAge, formatUsd } from "@/lib/radar-service";
import { tokenLevel, type TokenRow } from "@/lib/radar-types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ScoreBadge, StatusPill } from "./ScoreBadge";
import { RiskBadge } from "./RiskBadge";
import { TrackBell } from "./TrackBell";
import { NowButton } from "./NowButton";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

/** Lignes rendues à la fois ; « Afficher plus » en ajoute autant. */
const VISIBLE_STEP = 20;


type SortMode = "score" | "newest";

export function OpportunityTable({
  tokens,
  onSelect,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: {
  tokens: TokenRow[];
  onSelect: (token: TokenRow) => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  const [sortBy, setSortBy] = useState<SortMode>("score");
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(VISIBLE_STEP);
  const isMobile = useIsMobile();

  const normalizedSearch = search.trim().toLowerCase();

  const filteredTokens = useMemo(() => {
    if (!normalizedSearch) return tokens;
    return tokens.filter(
      (token) =>
        token.symbol.toLowerCase().includes(normalizedSearch) ||
        token.name.toLowerCase().includes(normalizedSearch) ||
        token.mint_address.toLowerCase().includes(normalizedSearch),
    );
  }, [tokens, normalizedSearch]);

  const sortedTokens = useMemo(() => {
    const arr = [...filteredTokens];
    if (sortBy === "score") {
      return arr.sort((a, b) => b.score - a.score);
    }
    return arr.sort(
      (a, b) => new Date(b.launched_at).getTime() - new Date(a.launched_at).getTime(),
    );
  }, [filteredTokens, sortBy]);

  const shownTokens = useMemo(() => sortedTokens.slice(0, visible), [sortedTokens, visible]);
  const canShowMore = sortedTokens.length > visible;

  const realCount = filteredTokens.filter((token) => !token.is_simulated).length;
  const demoCount = filteredTokens.length - realCount;
  const totalCount = tokens.length;

  return (
    <section aria-label="Opportunités détectées" className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <h2 className="text-base font-semibold">Opportunités détectées</h2>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisible(VISIBLE_STEP);
              }}
              placeholder="Rechercher un token, nom ou mint…"
              aria-label="Rechercher une opportunité"
              className="h-8 w-full pl-8 pr-7 text-xs sm:w-64"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Effacer la recherche"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
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
            {normalizedSearch && totalCount > 0 ? ` · ${filteredTokens.length}/${totalCount}` : null}
          </span>
        </div>
      </div>

      {/* Desktop — un seul des deux rendus est monté selon la taille d'écran */}
      {!isMobile && (
      <div className="overflow-x-auto">
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
              <th scope="col" className="px-3 py-3 text-right font-medium">Suivi</th>
            </tr>
          </thead>
          <tbody>
            {shownTokens.map((token) => (
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
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <NowButton token={token} />
                    <TrackBell token={token} />
                  </div>
                </td>

              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {/* Mobile */}
      {isMobile && (
      <ul className="divide-y divide-border/60">
        {shownTokens.map((token) => (
          <li key={token.id} className="relative">
            <div className="absolute right-3 top-4 z-10 flex items-center gap-1.5">
              <NowButton token={token} />
              <TrackBell token={token} />
            </div>

            <button
              type="button"
              onClick={() => onSelect(token)}
              className="w-full px-4 py-4 pr-32 text-left transition-colors hover:bg-secondary/60"
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
      )}

      {(canShowMore || hasMore) && (
        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span>
            {shownTokens.length} affichés sur {sortedTokens.length} chargés
          </span>
          {canShowMore ? (
            <Button size="sm" variant="secondary" onClick={() => setVisible((v) => v + VISIBLE_STEP)}>
              Voir plus (+20)
            </Button>
          ) : hasMore && onLoadMore ? (
            <Button size="sm" variant="secondary" disabled={loadingMore} onClick={() => { onLoadMore(); setVisible((v) => v + VISIBLE_STEP); }}>
              {loadingMore ? "Chargement…" : "Charger plus depuis l’historique"}
            </Button>
          ) : null}
        </div>
      )}

      {sortedTokens.length === 0 && (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          {normalizedSearch ? (
            <>
              <p className="font-medium">Aucune opportunité ne correspond à « {search.trim()} »</p>
              <p className="mt-1 text-xs">Essaye un autre symbole, nom ou adresse mint.</p>
            </>
          ) : (
            <p>Aucune opportunité détectée pour le moment.</p>
          )}
        </div>
      )}
    </section>
  );
}
