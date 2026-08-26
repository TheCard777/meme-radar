import type { LucideIcon } from "lucide-react";
import { Activity, Archive, Flame, Radar, Wallet } from "lucide-react";
import type { AlertRow, SmartWallet, TokenRow } from "@/lib/radar-types";

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
}) {
  return (
    <div className="panel p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className="size-4 text-primary" aria-hidden="true" />
      </div>
      <p className="mt-3 font-display text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function KpiGrid({
  tokens,
  alerts,
  wallets,
  demoArchived = 0,
}: {
  tokens: TokenRow[];
  alerts: AlertRow[];
  wallets: SmartWallet[];
  demoArchived?: number;
}) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todaysAlerts = alerts.filter((a) => new Date(a.created_at) >= startOfDay);
  const critical = alerts.filter((a) => a.score >= 90);

  return (
    <section aria-label="Indicateurs clés" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        label="Tokens analysés"
        value={String(tokens.length)}
        hint="Tokens réels détectés on-chain"
        icon={Radar}
      />
      <Kpi
        label="Signaux aujourd’hui"
        value={String(todaysAlerts.length)}
        hint="Depuis minuit (UTC local)"
        icon={Activity}
      />
      <Kpi
        label="Signaux ≥ 90"
        value={String(critical.length)}
        hint="Seuil critique"
        icon={Flame}
      />
      <Kpi
        label="Wallets surveillés"
        value={String(wallets.length)}
        hint="Adresses réelles observées on-chain"
        icon={Wallet}
      />
      {demoArchived > 0 && (
        <Kpi
          label="Démo archivées"
          value={String(demoArchived)}
          hint="Lignes de démonstration retirées du flux réel"
          icon={Archive}
        />
      )}
    </section>
  );
}
