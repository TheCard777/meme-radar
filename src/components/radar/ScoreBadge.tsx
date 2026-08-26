import { cn } from "@/lib/utils";

export function ScoreBadge({ score, className }: { score: number; className?: string }) {
  const tone =
    score >= 90
      ? "border-destructive/40 bg-destructive/15 text-destructive"
      : score >= 85
        ? "border-primary/40 bg-primary/15 text-primary"
        : score >= 70
          ? "border-warning/40 bg-warning/15 text-warning"
          : "border-border bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex min-w-14 items-center justify-center rounded-md border px-2 py-0.5 font-mono text-sm font-semibold tabular-nums",
        tone,
        className,
      )}
    >
      {score}
      <span className="ml-0.5 text-[0.65rem] opacity-70">/100</span>
    </span>
  );
}

const STATUS_LABEL: Record<string, string> = {
  watching: "Surveillé",
  signal: "Signal",
  critical: "Critique",
  cooling: "Refroidit",
  archived: "Archivé",
};

export function StatusPill({ status }: { status: string }) {
  const tone =
    status === "critical"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : status === "signal"
        ? "border-primary/40 bg-primary/10 text-primary"
        : status === "cooling"
          ? "border-warning/40 bg-warning/10 text-warning"
          : "border-border bg-secondary text-muted-foreground";
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium", tone)}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
