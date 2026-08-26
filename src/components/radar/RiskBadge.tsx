import { RISK_LEVEL_LABELS, type RiskLevel } from "@/lib/radar-types";

const TONES: Record<RiskLevel, string> = {
  low: "border-primary/40 bg-primary/10 text-primary",
  medium: "border-warning/40 bg-warning/10 text-warning",
  high: "border-destructive/40 bg-destructive/10 text-destructive",
  critical: "border-destructive bg-destructive/20 text-destructive",
};

/**
 * Indicateur de RISQUE, volontairement distinct du Score Radar (opportunité).
 * Un risque non mesurable affiche « Risque n/d » plutôt qu'un chiffre inventé.
 */
export function RiskBadge({
  score,
  level,
  compact = false,
}: {
  score: number | null;
  level: RiskLevel | null;
  compact?: boolean;
}) {
  if (score === null || level === null) {
    return (
      <span className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground">
        Risque n/d
      </span>
    );
  }
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[level]}`}
      title={RISK_LEVEL_LABELS[level]}
    >
      {compact ? `R ${score}` : `Risque ${score}/100 · ${RISK_LEVEL_LABELS[level]}`}
    </span>
  );
}
