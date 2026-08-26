import { Pause, Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBotSettings } from "@/lib/radar-hooks";
import { useSetBotState, useSystemHealth } from "@/lib/system-hooks";
import { cn } from "@/lib/utils";

export function BotControl() {
  const { data: settings, isLoading } = useBotSettings();
  const health = useSystemHealth();
  const update = useSetBotState();
  const active = settings?.status === "active";
  const scannerConnected = health.data?.scanner.state === "connected";

  const toggle = () => {
    if (!settings) return;
    update.mutate({ id: settings.id, status: active ? "paused" : "active" });
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
