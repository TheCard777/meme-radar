import { createServerFn } from "@tanstack/react-start";

type NowInput = { mint: string };

/**
 * ⚡ NOW — analyse instantanée d'un token.
 * Rafraîchit d'abord les données via le pipeline d'enrichissement existant,
 * puis envoie un unique message Telegram.
 * Ne crée aucun suivi 🔔 et ne modifie aucune préférence d'alerte.
 */
export const sendNowSnapshotServer = createServerFn({ method: "POST" })
  .inputValidator((input: NowInput) => {
    if (!input || typeof input.mint !== "string" || input.mint.length < 32) {
      throw new Error("Mint invalide");
    }
    return { mint: input.mint };
  })
  .handler(async ({ data }) => {
    const { refreshTokenNow } = await import("./now.server");
    const { sendRawTelegramMessage } = await import("./telegram.server");
    const { buildNowSnapshotMessage } = await import("./now-snapshot");

    const { input, warnings } = await refreshTokenNow(data.mint);
    const message = buildNowSnapshotMessage(input);
    const sent = await sendRawTelegramMessage(message);
    if (!sent.sent) throw new Error(sent.reason ?? "Envoi Telegram impossible");
    return { ok: true as const, warnings };
  });
