import { Bell, BellOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useBotSettings, useSmartWalletAlerts, useUpdateSettings } from "@/lib/radar-hooks";
import { formatAge, shortAddress } from "@/lib/radar-service";

/**
 * Contrôle ON/OFF des alertes Telegram « Smart Wallet Entry » + rappel du
 * seuil actif. Aucune modification du scoring ni du radar.
 */
export function SmartWalletAlertsPanel() {
  const settings = useBotSettings();
  const update = useUpdateSettings();
  const alerts = useSmartWalletAlerts();

  const enabled = settings.data?.smart_wallet_alerts_enabled ?? true;
  const recent = alerts.data ?? [];

  return (
    <section aria-label="Alertes Telegram Smart Wallet" className="panel mb-6 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-accent">
            {enabled ? (
              <Bell className="size-4" aria-hidden="true" />
            ) : (
              <BellOff className="size-4" aria-hidden="true" />
            )}
          </span>
          <div>
            <h2 className="text-base font-semibold">🔔 Alertes Telegram Smart Wallet</h2>
            <p className="text-xs text-muted-foreground">
              Notification à la première entrée d’un smart wallet sur un token — une seule fois par
              wallet et par token.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{enabled ? "ON" : "OFF"}</span>
          <Switch
            checked={enabled}
            disabled={!settings.data || update.isPending}
            onCheckedChange={(checked) => {
              if (!settings.data) return;
              update.mutate({
                id: settings.data.id,
                patch: { smart_wallet_alerts_enabled: checked },
              });
            }}
            aria-label="Activer les alertes Telegram Smart Wallet"
          />
        </div>
      </div>

      <p className="mt-4 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
        <span className="font-semibold">Smart Wallet Early Entry</span> —{" "}
        <span className="font-mono text-primary">Smart Wallet score ≥65</span> +{" "}
        <span className="font-mono text-primary">token ≤2 h</span> +{" "}
        <span className="font-mono text-primary">entrée #2 à #100</span> +{" "}
        <span className="font-mono text-primary">token ≥100 acheteurs</span>. Le{" "}
        <span className="font-mono">#1</span> est exclu (créateur / acheteur initial). Si le token
        n’a pas encore 100 acheteurs, l’alerte est différée : les entrées qualifiées sont réévaluées
        à chaque cycle et notifiées dès le seuil atteint, tant que le token reste dans sa fenêtre de
        2 h. Une seule alerte par wallet et par token, même en cas de rachat.
      </p>

      <p className="mt-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
        <span className="font-semibold">Meme Radar — Early Opportunity</span> (alerte distincte) —{" "}
        <span className="font-mono text-primary">âge ≤2 h</span> +{" "}
        <span className="font-mono text-primary">60–150 acheteurs</span> +{" "}
        <span className="font-mono text-primary">volume 1h ≥5 000 $</span> +{" "}
        <span className="font-mono text-primary">accélération ≥1,5×</span> (volume des 5 dernières
        minutes rapporté au rythme de l’heure, uniquement si la donnée est réellement mesurable —
        sinon marquée « inconnue »). Aucun minimum de liquidité : les tokens Pump.fun pré-migration
        n’ont pas de pool DEX, la liquidité est alors indiquée « non mesurée » et jamais présentée
        comme un 0 réel. Aucun seuil de score : le score Radar est affiché à titre informatif.
        Déclenchée côté serveur dans le pipeline d’enrichissement, indépendamment des 1000 tokens
        affichés. Un seul envoi par token, mais les critères sont réévalués à chaque cycle pendant
        toute la fenêtre de 2 h. Le message Telegram indique l’Early Strength calculée sur les seuls
        critères mesurés.
      </p>






      <div className="mt-4">
        <p className="text-xs font-medium text-muted-foreground">Dernières entrées notifiées</p>
        <ul className="mt-2 space-y-1.5">
          {recent.slice(0, 5).map((alert) => (
            <li
              key={alert.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 px-3 py-1.5 text-xs"
            >
              <span className="font-mono">
                {shortAddress(alert.wallet_address)} → ${alert.token_symbol ?? "?"}
              </span>
              <span className="font-mono text-muted-foreground">
                {alert.wallet_score !== null ? `${Math.round(alert.wallet_score)}/100 · ` : ""}
                il y a {formatAge(alert.first_entry_detected_at)}
                {alert.telegram_sent ? "" : " · non envoyé"}
              </span>
            </li>
          ))}
          {recent.length === 0 && (
            <li className="text-xs text-muted-foreground">Aucune entrée notifiée pour l’instant.</li>
          )}
        </ul>
      </div>
    </section>
  );
}
