import { Bell, BellRing } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToggleTrackedToken, useTrackedTokens } from "@/lib/radar-hooks";
import type { TokenRow } from "@/lib/radar-types";

/** Cloche de suivi personnalisé — n'ouvre jamais le détail du token. */
export function TrackBell({ token, className }: { token: TokenRow; className?: string }) {
  const tracked = useTrackedTokens();
  const toggle = useToggleTrackedToken();

  const row = (tracked.data ?? []).find((t) => t.token_mint === token.mint_address);
  const active = Boolean(row?.enabled);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-pressed={active}
          aria-label={active ? "Suivi actif" : "Suivre ce token"}
          disabled={toggle.isPending}
          onClick={(event) => {
            // Empêche l'ouverture accidentelle du détail du token.
            event.stopPropagation();
            event.preventDefault();
            toggle.mutate({
              tokenId: token.id,
              mint: token.mint_address,
              symbol: token.symbol,
              name: token.name,
              enabled: !active,
            });
          }}
          onKeyDown={(event) => event.stopPropagation()}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
            active
              ? "border-primary/50 bg-primary/15 text-primary hover:bg-primary/25"
              : "border-border/70 text-muted-foreground hover:bg-secondary hover:text-foreground"
          } ${className ?? ""}`}
        >
          {active ? (
            <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Bell className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>{active ? "Suivi actif" : "Suivre ce token"}</TooltipContent>
    </Tooltip>
  );
}
