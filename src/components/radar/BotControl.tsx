import { Pause, Play, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useBotSettings, useUpdateSettings } from "@/lib/radar-hooks";
import { cn } from "@/lib/utils";

export function BotControl() {
  const { data: settings, isLoading } = useBotSettings();
  const update = useUpdateSettings();
  const active = settings?.status === "active";

  const toggle = () => {
    if (!settings) return;
    const next = active ? "paused" : "active";
    update.mutate(
      {
        id: settings.id,
        patch: { status: next, last_scan_at: new Date().toISOString() },
      },
      {
        onSuccess: () =>
          toast.success(
            next === "active"
              ? "Scanner activé — surveillance et alertes en cours (simulation)"
              : "Scanner en pause — données conservées",
          ),
      },
    );
  };

  return (
    <div className="flex items-center gap-3">
      <div
        className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5"
        role="status"
        aria-live="polite"
      >
        <span
          className={cn(
            "size-2 rounded-full pulse-dot",
            active ? "bg-primary text-primary" : "bg-muted-foreground text-muted-foreground",
          )}
          aria-hidden="true"
        />
        <span className="text-xs font-medium">
          {isLoading ? "Chargement…" : active ? "Bot actif" : "Bot en pause"}
        </span>
      </div>

      <Button
        onClick={toggle}
        disabled={!settings || update.isPending}
        size="lg"
        variant={active ? "secondary" : "default"}
        className={cn("min-w-36 font-semibold", !active && "glow-primary")}
        aria-label={active ? "Mettre le bot en pause" : "Activer le bot"}
      >
        {update.isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : active ? (
          <Pause className="size-4" aria-hidden="true" />
        ) : (
          <Play className="size-4" aria-hidden="true" />
        )}
        {active ? "Pause" : "Activer"}
      </Button>
    </div>
  );
}
