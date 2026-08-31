import { createServerFn } from "@tanstack/react-start";
import {
  ALERT_CATEGORIES,
  maskChatId,
  type AlertCategory,
  type RecipientPrefs,
} from "./telegram-recipients";

/**
 * Gestion des destinataires Telegram — SERVEUR UNIQUEMENT.
 * L'UI ne reçoit jamais de chat_id brut ni de bot token.
 */

export const listTelegramRecipients = createServerFn({ method: "GET" }).handler(async () => {
    const { requireSettingsUnlocked } = await import("./settings-gate.server");
    await requireSettingsUnlocked();
  const { listRecipients, listPendingInvites } = await import("./telegram-recipients.server");
  const [recipients, invites] = await Promise.all([listRecipients(), listPendingInvites()]);
  return {
    recipients: recipients.map((r) => ({
      id: r.id,
      label: r.label,
      role: r.role,
      isActive: r.is_active,
      prefs: r.prefs,
      maskedChatId: maskChatId(r.chat_id),
      activatedAt: r.activated_at,
    })),
    invites,
  };
});

export const createTelegramInvite = createServerFn({ method: "POST" })
  .inputValidator((input: { label?: string; ttlMinutes?: number }) => ({
    label: typeof input?.label === "string" ? input.label : "Invité",
    ttlMinutes: typeof input?.ttlMinutes === "number" ? input.ttlMinutes : 60,
  }))
  .handler(async ({ data }) => {
    const { requireSettingsUnlocked } = await import("./settings-gate.server");
    await requireSettingsUnlocked();
    const { createInvite } = await import("./telegram-recipients.server");
    const invite = await createInvite({ label: data.label, ttlMinutes: data.ttlMinutes });
    return { code: invite.code, expiresAt: invite.expiresAt, label: invite.label, id: invite.id };
  });

export const revokeTelegramInvite = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Invitation invalide");
    return { id: input.id };
  })
  .handler(async ({ data }) => {
    const { requireSettingsUnlocked } = await import("./settings-gate.server");
    await requireSettingsUnlocked();
    const { revokeInvite } = await import("./telegram-recipients.server");
    await revokeInvite(data.id);
    return { ok: true as const };
  });

export const setTelegramRecipientActive = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; isActive: boolean }) => {
    if (!input?.id) throw new Error("Destinataire invalide");
    return { id: input.id, isActive: Boolean(input.isActive) };
  })
  .handler(async ({ data }) => {
    const { requireSettingsUnlocked } = await import("./settings-gate.server");
    await requireSettingsUnlocked();
    const { setRecipientActive } = await import("./telegram-recipients.server");
    await setRecipientActive(data.id, data.isActive);
    return { ok: true as const };
  });

export const revokeTelegramRecipient = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Destinataire invalide");
    return { id: input.id };
  })
  .handler(async ({ data }) => {
    const { requireSettingsUnlocked } = await import("./settings-gate.server");
    await requireSettingsUnlocked();
    const { revokeRecipient } = await import("./telegram-recipients.server");
    await revokeRecipient(data.id);
    return { ok: true as const };
  });

export const updateTelegramRecipientPrefs = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; prefs: Partial<RecipientPrefs> }) => {
    if (!input?.id) throw new Error("Destinataire invalide");
    const prefs: Partial<RecipientPrefs> = {};
    for (const key of ALERT_CATEGORIES) {
      const value = input.prefs?.[key as AlertCategory];
      if (typeof value === "boolean") prefs[key] = value;
    }
    return { id: input.id, prefs };
  })
  .handler(async ({ data }) => {
    const { requireSettingsUnlocked } = await import("./settings-gate.server");
    await requireSettingsUnlocked();
    const { updateRecipientPrefs } = await import("./telegram-recipients.server");
    await updateRecipientPrefs(data.id, data.prefs);
    return { ok: true as const };
  });

/** Enregistre le webhook `/start` auprès de Telegram (bot existant, aucun second bot). */
export const registerTelegramWebhook = createServerFn({ method: "POST" }).handler(async () => {
    const { requireSettingsUnlocked } = await import("./settings-gate.server");
    await requireSettingsUnlocked();
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) return { ok: false as const, reason: "TELEGRAM_BOT_TOKEN non configuré" };

  const { deriveWebhookSecret } = await import("@/routes/api/public/telegram/webhook");
  const base =
    process.env["MEME_RADAR_API_URL"] ??
    "https://project--093cfa11-923c-45a0-9fdd-610af01e0cd1-dev.lovable.app";
  const url = `${base.replace(/\/$/, "")}/api/public/telegram/webhook`;

  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: deriveWebhookSecret(token),
      allowed_updates: ["message"],
    }),
  });
  const payload = (await response.json()) as { ok: boolean; description?: string };
  if (!payload.ok) return { ok: false as const, reason: payload.description ?? "Refusé" };
  return { ok: true as const, url };
});
