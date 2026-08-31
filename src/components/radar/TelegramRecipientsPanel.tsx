import { useState } from "react";
import { Copy, Loader2, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateTelegramInvite,
  useRegisterTelegramWebhook,
  useRevokeRecipient,
  useRevokeTelegramInvite,
  useSetRecipientActive,
  useTelegramRecipients,
  useUpdateRecipientPrefs,
} from "@/lib/telegram-hooks";
import {
  ALERT_CATEGORIES,
  ALERT_CATEGORY_LABELS,
  type AlertCategory,
} from "@/lib/telegram-recipients";

export function TelegramRecipientsPanel() {
  const list = useTelegramRecipients();
  const createInvite = useCreateTelegramInvite();
  const revokeInvite = useRevokeTelegramInvite();
  const setActive = useSetRecipientActive();
  const revoke = useRevokeRecipient();
  const updatePrefs = useUpdateRecipientPrefs();
  const registerWebhook = useRegisterTelegramWebhook();

  const [label, setLabel] = useState("");
  const [issued, setIssued] = useState<{ code: string; expiresAt: string } | null>(null);

  const recipients = list.data?.recipients ?? [];
  const invites = list.data?.invites ?? [];

  async function handleInvite() {
    const result = await createInvite.mutateAsync({
      label: label.trim() || "Invité",
      ttlMinutes: 60,
    });
    setIssued({ code: result.code, expiresAt: result.expiresAt });
    setLabel("");
  }

  return (
    <section aria-label="Utilisateurs autorisés" className="panel p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary">
            <Users className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Utilisateurs autorisés</h2>
            <p className="text-xs text-muted-foreground">
              Même bot Telegram · accès en lecture des alertes uniquement, aucun accès au dashboard.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => registerWebhook.mutate()}
          disabled={registerWebhook.isPending}
        >
          {registerWebhook.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <ShieldCheck className="size-4" aria-hidden="true" />
          )}
          Activer /start
        </Button>
      </div>

      {list.isLoading ? (
        <Skeleton className="mt-4 h-40 w-full" />
      ) : (
        <ul className="mt-4 space-y-3">
          {recipients.map((recipient) => (
            <li key={recipient.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {recipient.label}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({recipient.role === "owner" ? "propriétaire" : "secondaire"} ·{" "}
                      {recipient.maskedChatId})
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {recipient.role === "owner"
                      ? "Destinataire principal — reçoit toujours toutes les alertes."
                      : recipient.isActive
                        ? "Actif — reçoit les nouvelles alertes cochées."
                        : "Suspendu — ne reçoit plus aucune alerte."}
                  </p>
                </div>
                {recipient.role === "secondary" ? (
                  <div className="flex items-center gap-2">
                    <Switch
                      aria-label={`Activer ${recipient.label}`}
                      checked={recipient.isActive}
                      onCheckedChange={(checked) =>
                        setActive.mutate({ id: recipient.id, isActive: checked })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Révoquer ${recipient.label}`}
                      onClick={() => revoke.mutate(recipient.id)}
                    >
                      <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                    </Button>
                  </div>
                ) : null}
              </div>

              {recipient.role === "secondary" ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {ALERT_CATEGORIES.map((category: AlertCategory) => (
                    <label
                      key={category}
                      className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-xs"
                    >
                      {ALERT_CATEGORY_LABELS[category]}
                      <Switch
                        aria-label={`${ALERT_CATEGORY_LABELS[category]} pour ${recipient.label}`}
                        checked={recipient.prefs[category]}
                        onCheckedChange={(checked) =>
                          updatePrefs.mutate({
                            id: recipient.id,
                            prefs: { ...recipient.prefs, [category]: checked },
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-3 rounded-lg border border-border p-3">
        <Label htmlFor="invite-label" className="text-sm">
          Ajouter un utilisateur
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="invite-label"
            placeholder="Nom de l’invité"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          <Button onClick={handleInvite} disabled={createInvite.isPending}>
            {createInvite.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <UserPlus className="size-4" aria-hidden="true" />
            )}
            Générer une invitation
          </Button>
        </div>

        {issued ? (
          <div className="rounded-md border border-primary/40 bg-primary/10 p-3 text-sm">
            <p className="font-medium text-primary">Code à transmettre (valable 1 h, usage unique)</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="rounded bg-background px-2 py-1 font-mono text-base tracking-widest">
                /start {issued.code}
              </code>
              <Button
                variant="outline"
                size="icon"
                aria-label="Copier le code"
                onClick={() => {
                  void navigator.clipboard.writeText(`/start ${issued.code}`);
                  toast.success("Code copié");
                }}
              >
                <Copy className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Votre ami ouvre le bot Telegram existant et envoie exactement cette commande. Le code
              est invalidé après usage.
            </p>
          </div>
        ) : null}

        {invites.length > 0 ? (
          <ul className="space-y-1.5">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-xs"
              >
                <span>
                  {invite.label} — expire le{" "}
                  {new Date(invite.expiresAt).toLocaleString("fr-FR", { timeZone: "UTC" })} UTC
                </span>
                <Button variant="ghost" size="sm" onClick={() => revokeInvite.mutate(invite.id)}>
                  Annuler
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
