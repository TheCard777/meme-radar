import { Activity, Database, Radio, Send, ShieldCheck } from "lucide-react";
import { useSystemHealth } from "@/lib/system-hooks";
import { cn } from "@/lib/utils";

type Tone = "ok" | "warn" | "off";

function StatusRow({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: Tone;
}) {
  return (
    <li className="flex items-start gap-3 border-b border-border/60 py-3 last:border-0">
      <span className="mt-0.5 text-muted-foreground" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">{label}</span>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
              tone === "ok" && "border-primary/40 bg-primary/10 text-primary",
              tone === "warn" && "border-warning/40 bg-warning/10 text-warning",
              tone === "off" && "border-border bg-surface text-muted-foreground",
            )}
          >
            {value}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
    </li>
  );
}

export function SystemStatus() {
  const { data, isLoading } = useSystemHealth();

  const scannerTone: Tone =
    data?.scanner.state === "connected" ? "ok" : data?.scanner.state === "error" ? "warn" : "off";
  const wsState = data?.scanner.websocketState;
  const wsTone: Tone = wsState === "verified" ? "ok" : wsState === "failed" ? "warn" : "off";
  const live = data?.scanner.state === "connected" && !data.scanner.demoData;
  const telegramTone: Tone = data?.telegram.configured
    ? data.telegram.chatConfigured
      ? "ok"
      : "warn"
    : "off";

  return (
    <section aria-label="Santé du système" className="panel p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Santé du système</h2>
        <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-muted-foreground">
          {isLoading ? "Vérification…" : "Temps réel"}
        </span>
      </div>

      <ul className="mt-2" aria-live="polite">
        <StatusRow
          icon={<Activity className="size-4" />}
          label="Scanner Solana"
          value={
            data?.scanner.state === "connected"
              ? "Connecté"
              : data?.scanner.state === "not_configured"
                ? "Non configuré"
                : data?.scanner.state === "unreachable"
                  ? "Injoignable"
                  : data?.scanner.state === "error"
                    ? "Erreur"
                    : "…"
          }
          detail={
            data?.scanner.message ??
            "Vérification de la connexion RPC/WebSocket Solana en cours."
          }
          tone={scannerTone}
        />
        <StatusRow
          icon={<Radio className="size-4" />}
          label="Flux temps réel (WebSocket)"
          value={
            wsState === "verified"
              ? "Vérifié"
              : wsState === "configured"
                ? "Configuré"
                : wsState === "failed"
                  ? "Échec"
                  : "Absent"
          }
          detail={data?.scanner.websocketMessage ?? "Vérification du handshake WebSocket."}
          tone={wsTone}
        />
        <StatusRow
          icon={<Send className="size-4" />}
          label="Alertes Telegram"
          value={data?.telegram.configured ? "Connecté" : "Non connecté"}
          detail={data?.telegram.message ?? "Vérification des secrets serveur."}
          tone={telegramTone}
        />
        <StatusRow
          icon={<Database className="size-4" />}
          label="Base de données"
          value={data?.database.ok ? "OK" : "Erreur"}
          detail={data?.database.message ?? "Vérification…"}
          tone={data?.database.ok ? "ok" : "warn"}
        />
        <StatusRow
          icon={<ShieldCheck className="size-4" />}
          label="Trading automatique"
          value="Désactivé"
          detail="Aucun achat, aucune vente, aucune clé privée. Observation et scoring uniquement."
          tone="off"
        />
      </ul>

      {live ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Latence RPC", value: data.scanner.latencyMs != null ? `${data.scanner.latencyMs} ms` : "—" },
            { label: "Slot", value: data.scanner.slot != null ? data.scanner.slot.toLocaleString("fr-FR") : "—" },
            { label: "Nœud", value: data.scanner.version ?? "—" },
            { label: "Endpoint", value: data.scanner.endpoint ?? "—" },
          ].map((m) => (
            <div key={m.label} className="rounded-md border border-border/60 bg-surface p-2">
              <p className="text-[11px] text-muted-foreground">{m.label}</p>
              <p className="mt-0.5 truncate font-mono text-xs font-semibold">{m.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {live ? (
        <p className="mt-3 rounded-md border border-primary/30 bg-primary/10 p-3 text-xs text-primary">
          Connexion mainnet Solana saine (lecture seule). Les nouvelles détections du collecteur sont
          enregistrées comme réelles ; les seeds historiques restent étiquetés « démo ».
        </p>
      ) : null}

      {data?.scanner.demoData ? (
        <p className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          Aucun flux mainnet actif : les tokens, wallets et alertes affichés sont des données de
          simulation seed. Ajoutez les secrets serveur SOLANA_RPC_URL (et SOLANA_WS_URL) pour
          brancher le scanner réel.
        </p>
      ) : null}
    </section>
  );
}
