import { Zap } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSendNowSnapshot } from "@/lib/radar-hooks";
import type { TokenRow } from "@/lib/radar-types";

/**
 * ⚡ NOW — envoie immédiatement UNE analyse Telegram du token.
 * N'active aucun suivi et ne modifie aucune préférence d'alerte.
 */
export function NowButton({ token, className }: { token: TokenRow; className?: string }) {
  const now = useSendNowSnapshot();
  const pending = now.isPending;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Envoyer une analyse NOW sur Telegram"
            disabled={pending}
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              now.mutate({ mint: token.mint_address, symbol: token.symbol });
            }}
            onKeyDown={(event) => event.stopPropagation()}
            className={`inline-flex h-7 items-center justify-center gap-1 rounded-md border px-2 text-[10px] font-semibold uppercase tracking-wide transition-colors disabled:opacity-60 ${
              pending
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/70 text-muted-foreground hover:bg-secondary hover:text-foreground"
            } ${className ?? ""}`}
          >
            <Zap className={`h-3.5 w-3.5 ${pending ? "animate-pulse" : ""}`} aria-hidden="true" />
            NOW
          </button>
        </TooltipTrigger>
        <TooltipContent>Analyse instantanée sur Telegram</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
