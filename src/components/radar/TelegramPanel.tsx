import { Send } from "lucide-react";

export function TelegramPanel({ connected }: { connected: boolean }) {
  return (
    <section aria-label="Intégration Telegram" className="panel p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-accent">
            <Send className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Alertes Telegram</h2>
            <p className="text-xs text-muted-foreground">Notification des signaux ≥ seuil</p>
          </div>
        </div>
        <span
          className={
            connected
              ? "rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
              : "rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground"
          }
        >
          {connected ? "Connecté" : "Non connecté"}
        </span>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex items-center justify-between rounded-lg border border-dashed border-border px-3 py-2">
          <dt className="text-muted-foreground">Bot token</dt>
          <dd className="font-mono text-xs text-muted-foreground">à configurer côté serveur</dd>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-dashed border-border px-3 py-2">
          <dt className="text-muted-foreground">Chat ID</dt>
          <dd className="font-mono text-xs text-muted-foreground">à configurer côté serveur</dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-muted-foreground">
        Les secrets ne sont jamais stockés dans le frontend. Le token du bot et le chat ID seront
        ajoutés comme secrets serveur lors du branchement du scanner réel.
      </p>
    </section>
  );
}
