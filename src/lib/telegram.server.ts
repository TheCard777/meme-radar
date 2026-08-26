/**
 * Intégration Telegram — SERVEUR UNIQUEMENT.
 *
 * Les secrets (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID) ne sont jamais exposés au
 * frontend : seul un statut booléen « connecté / non connecté » est renvoyé.
 */

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

export interface AlertPayload {
  symbol: string;
  score: number;
  level: "info" | "signal" | "critical";
  message: string;
  simulated: boolean;
}

/**
 * Envoie une alerte de surveillance (jamais un ordre d'achat/vente).
 * Retourne un résultat explicite si les secrets ne sont pas configurés.
 */
export async function sendAlertTelegram(
  alert: AlertPayload,
): Promise<{ sent: boolean; reason?: string }> {
  const config = readTelegramConfig();
  if (!config || !config.chatId) {
    return { sent: false, reason: "Secrets Telegram non configurés" };
  }

  const prefix = alert.level === "critical" ? "🚨 CRITIQUE" : "📡 SIGNAL";
  const tag = alert.simulated ? "\n<i>Donnée de simulation — aucun trading</i>" : "";
  const text = `${prefix} ${alert.symbol} — score ${alert.score}/100\n${alert.message}${tag}`;

  try {
    const response = await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: config.chatId, text, parse_mode: "HTML" }),
    });
    const payload = (await response.json()) as { ok: boolean; description?: string };
    if (!payload.ok) return { sent: false, reason: payload.description ?? "Envoi refusé" };
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : "Erreur réseau" };
  }
}
