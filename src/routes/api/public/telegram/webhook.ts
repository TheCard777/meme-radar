import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";
import { parseStartCommand, INVITE_STATUS_MESSAGES } from "@/lib/telegram-recipients";

/**
 * Webhook Telegram — commande `/start CODE` uniquement.
 *
 * Sécurité : Telegram doit présenter le header secret dérivé du bot token.
 * Aucune donnée sensible n'est renvoyée, aucun accès dashboard n'est accordé.
 */
export function deriveWebhookSecret(botToken: string): string {
  return createHash("sha256").update(`meme-radar-telegram:${botToken}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env["TELEGRAM_BOT_TOKEN"];
        if (!token) return new Response("Not configured", { status: 503 });

        const provided = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(provided, deriveWebhookSecret(token))) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = (await request.json().catch(() => null)) as {
          message?: { chat?: { id?: number | string }; text?: string };
        } | null;
        const message = update?.message;
        const chatId = message?.chat?.id;
        if (chatId === undefined || chatId === null) return Response.json({ ok: true });

        const parsed = parseStartCommand(message?.text ?? null);
        if (!parsed) return Response.json({ ok: true, ignored: true });

        const { sendTelegramToChat } = await import("@/lib/telegram.server");

        if (!parsed.code) {
          await sendTelegramToChat(
            String(chatId),
            "Meme Radar — accès sur invitation.\nUtilisez la commande /start suivie du code fourni par le propriétaire.",
          );
          return Response.json({ ok: true });
        }

        const { redeemInvite } = await import("@/lib/telegram-recipients.server");
        const result = await redeemInvite(parsed.code, String(chatId));

        if (!result.ok) {
          await sendTelegramToChat(String(chatId), `Meme Radar — ${INVITE_STATUS_MESSAGES[result.status]}`);
          return Response.json({ ok: true });
        }

        await sendTelegramToChat(
          String(chatId),
          "✅ Meme Radar — accès aux alertes activé.\nVous recevrez uniquement les nouvelles alertes à partir de maintenant. Aucune alerte passée n'est renvoyée.\nLe propriétaire peut ajuster ou révoquer cet accès à tout moment.",
        );
        return Response.json({ ok: true });
      },
    },
  },
});
