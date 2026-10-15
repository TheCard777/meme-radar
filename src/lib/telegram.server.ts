/**
 * Intégration Telegram — SERVEUR UNIQUEMENT.
 *
 * Les secrets (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID) ne sont jamais exposés au
 * frontend : seul un statut booléen « connecté / non connecté » est renvoyé.
 */

import type { AlertCategory } from "./telegram-recipients";
import { copyMintKeyboard, type CopyKeyboard } from "./telegram-token-block";

export type SendOptions = { parseMode?: "HTML"; replyMarkup?: CopyKeyboard | null };

export interface TelegramStatus {
  configured: boolean;
  chatConfigured: boolean;
  botUsername: string | null;
  message: string;
}

interface TelegramConfig {
  token: string;
  chatId: string | null;
}

function readTelegramConfig(): TelegramConfig | null {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) return null;
  return { token, chatId: process.env["TELEGRAM_CHAT_ID"] ?? null };
}

export async function getTelegramStatus(): Promise<TelegramStatus> {
  const config = readTelegramConfig();
  if (!config) {
    return {
      configured: false,
      chatConfigured: false,
      botUsername: null,
      message:
        "Non connecté — ajoutez les secrets serveur TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID.",
    };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${config.token}/getMe`);
    const payload = (await response.json()) as {
      ok: boolean;
      result?: { username?: string };
      description?: string;
    };
    if (!payload.ok) {
      return {
        configured: false,
        chatConfigured: Boolean(config.chatId),
        botUsername: null,
        message: payload.description ?? "Token Telegram refusé.",
      };
    }
    return {
      configured: true,
      chatConfigured: Boolean(config.chatId),
      botUsername: payload.result?.username ?? null,
      message: config.chatId
        ? "Bot Telegram connecté, alertes prêtes à être envoyées."
        : "Bot connecté, mais TELEGRAM_CHAT_ID manquant.",
    };
  } catch (error) {
    return {
      configured: false,
      chatConfigured: Boolean(config.chatId),
      botUsername: null,
      message: error instanceof Error ? error.message : "Erreur Telegram inconnue",
    };
  }
}

/** Envoi bas niveau vers un chat précis. Ne lève jamais. */
export async function sendTelegramToChat(
  chatId: string,
  text: string,
  options: SendOptions = {},
): Promise<{ sent: boolean; reason?: string }> {
  const config = readTelegramConfig();
  if (!config) return { sent: false, reason: "Secrets Telegram non configurés" };
  try {
    const response = await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        ...(options.parseMode ? { parse_mode: options.parseMode } : {}),
        ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
      }),
    });
    const payload = (await response.json()) as { ok: boolean; description?: string };
    if (!payload.ok) return { sent: false, reason: payload.description ?? "Envoi refusé" };
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : "Erreur réseau" };
  }
}

/**
 * Diffusion d'un message unique aux destinataires concernés par la catégorie.
 * Le message est construit une seule fois par la logique métier appelante :
 * cette fonction ne fait que le distribuer.
 *
 * `sent` reflète la livraison au destinataire principal, afin de conserver
 * exactement la sémantique historique des alertes.
 */
async function broadcast(
  text: string,
  category: AlertCategory,
  options: SendOptions = {},
): Promise<{ sent: boolean; reason?: string; deliveredTo: number }> {
  const config = readTelegramConfig();
  if (!config || !config.chatId) {
    return { sent: false, reason: "Secrets Telegram non configurés", deliveredTo: 0 };
  }

  const { resolveTargets } = await import("./telegram-recipients.server");
  const targets = await resolveTargets(category);

  let ownerResult: { sent: boolean; reason?: string } = {
    sent: false,
    reason: "Destinataire principal introuvable",
  };
  let deliveredTo = 0;

  for (const target of targets) {
    const result = await sendTelegramToChat(target.chatId, text, options);
    if (result.sent) deliveredTo += 1;
    if (target.role === "owner") ownerResult = result;
  }

  return { ...ownerResult, deliveredTo };
}

/**
 * Envoi brut d'un message déjà formaté (alertes Smart Wallet, Early, suivi, NOW).
 * Ne lève jamais : renvoie toujours un résultat explicite.
 */
export async function sendRawTelegramMessage(
  text: string,
  category: AlertCategory = "general",
  options: { copyMint?: string | null } = {},
): Promise<{ sent: boolean; reason?: string; deliveredTo?: number }> {
  return broadcast(text, category, { replyMarkup: copyMintKeyboard(options.copyMint) });
}

export interface AlertPayload {
  symbol: string;
  score: number;
  level: "info" | "signal" | "critical";
  message: string;
  simulated: boolean;
  /** Mint exact (base) : ajoute le bouton inline « Copier le CA ». */
  mint?: string | null;
}

/**
 * Envoie une alerte de surveillance (jamais un ordre d'achat/vente).
 * Retourne un résultat explicite si les secrets ne sont pas configurés.
 */
export async function sendAlertTelegram(
  alert: AlertPayload,
  category: AlertCategory = "general",
): Promise<{ sent: boolean; reason?: string; deliveredTo?: number }> {
  const prefix = alert.level === "critical" ? "🚨 PRIORITÉ" : "📡 SIGNAL";
  const tag = alert.simulated ? "\nDonnée de simulation — aucun trading" : "";
  // Texte brut (pas de parse_mode) : aucun risque d'injection via nom/symbole.
  const text = alert.mint
    ? `${alert.message}${tag}`
    : `${prefix} ${alert.symbol} — score ${alert.score}/100\n${alert.message}${tag}`;
  return broadcast(text, category, { replyMarkup: copyMintKeyboard(alert.mint) });
}

