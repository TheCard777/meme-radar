import { useState } from "react";
import { CheckCircle2, Loader2, Send, XCircle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { sendTestTelegramAlert } from "@/lib/system.functions";
import { useSystemHealth } from "@/lib/system-hooks";

export function TelegramPanel() {
  const health = useSystemHealth();
  const sendTest = useServerFn(sendTestTelegramAlert);
  const [sending, setSending] = useState(false);

  const telegram = health.data?.telegram;
  const connected = Boolean(telegram?.configured && telegram?.chatConfigured);

  async function handleTest() {
    setSending(true);
    try {
      const result = await sendTest();
      if (result.sent) {
        toast.success("Alerte de test envoyée sur Telegram");
      } else {
        toast.error("Envoi impossible", { description: result.reason });
      }
    } catch (error) {
      toast.error("Envoi impossible", {
        description: error instanceof Error ? error.message : "Erreur inconnue",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-label="Intégration Telegram" className="panel p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-accent">
            <Send className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Alertes Telegram</h2>
            <p className="text-xs text-muted-foreground">Connexion validée · test manuel disponible</p>
          </div>
        </div>
        <span
          className={
            connected
              ? "rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
              : "rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground"
          }
        >
          {health.isLoading ? "Vérification…" : connected ? "Connecté" : "Non connecté"}
        </span>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
          <dt className="text-muted-foreground">Bot token</dt>
          <dd className="flex items-center gap-1.5 font-mono text-xs">
            {telegram?.configured ? (
              <>
                <CheckCircle2 className="size-3.5 text-primary" aria-hidden="true" />
                <span className="text-primary">
                  configuré{telegram.botUsername ? ` — @${telegram.botUsername}` : ""}
                </span>
              </>
            ) : (
              <>
                <XCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span className="text-muted-foreground">non configuré</span>
              </>
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
          <dt className="text-muted-foreground">Chat ID</dt>
          <dd className="flex items-center gap-1.5 font-mono text-xs">
            {telegram?.chatConfigured ? (
              <>
                <CheckCircle2 className="size-3.5 text-primary" aria-hidden="true" />
                <span className="text-primary">configuré</span>
              </>
            ) : (
              <>
                <XCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span className="text-muted-foreground">non configuré</span>
              </>
            )}
          </dd>
        </div>
      </dl>

      {telegram?.message ? (
        <p className="mt-3 text-xs text-muted-foreground">{telegram.message}</p>
      ) : null}

      <button
        type="button"
        onClick={handleTest}
        disabled={!connected || sending}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Send className="size-4" aria-hidden="true" />
        )}
        Envoyer une alerte de test
      </button>

      <p className="mt-3 text-xs text-muted-foreground">
        Les secrets sont stockés côté serveur uniquement et ne transitent jamais par le frontend.
        Telegram est prêt. Seul l’envoi automatique après scoring des tokens réels reste volontairement
        désactivé pendant la validation du collecteur V1.
      </p>
    </section>
  );
}
