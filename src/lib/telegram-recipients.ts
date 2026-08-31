/**
 * Destinataires Telegram — logique pure et testable.
 *
 * Aucune donnée sensible ici : pas de bot token, pas de chat_id brut exposé.
 * Le compte propriétaire (secret serveur TELEGRAM_CHAT_ID) reste toujours
 * destinataire principal et ne peut jamais être révoqué.
 */

export type AlertCategory =
  | "early_opportunity"
  | "smart_wallet"
  | "risk"
  | "tracking"
  | "now"
  | "general";

export const ALERT_CATEGORIES: AlertCategory[] = [
  "early_opportunity",
  "smart_wallet",
  "risk",
  "tracking",
  "now",
  "general",
];

export const ALERT_CATEGORY_LABELS: Record<AlertCategory, string> = {
  early_opportunity: "Early Opportunity",
  smart_wallet: "Smart Wallet",
  risk: "Risque",
  tracking: "Suivi 🔔",
  now: "⚡ NOW",
  general: "Alertes générales",
};

export type RecipientPrefs = Record<AlertCategory, boolean>;

export const DEFAULT_SECONDARY_PREFS: RecipientPrefs = {
  early_opportunity: true,
  smart_wallet: true,
  risk: true,
  tracking: true,
  now: false,
  general: true,
};

export const OWNER_PREFS: RecipientPrefs = {
  early_opportunity: true,
  smart_wallet: true,
  risk: true,
  tracking: true,
  now: true,
  general: true,
};

/** Normalise des préférences venant de la base ou de l'UI (valeurs inconnues ignorées). */
export function normalizePrefs(input: unknown, base: RecipientPrefs = DEFAULT_SECONDARY_PREFS): RecipientPrefs {
  const out: RecipientPrefs = { ...base };
  if (input && typeof input === "object") {
    for (const key of ALERT_CATEGORIES) {
      const value = (input as Record<string, unknown>)[key];
      if (typeof value === "boolean") out[key] = value;
    }
  }
  return out;
}

/** Un destinataire reçoit-il cette catégorie ? */
export function acceptsCategory(
  recipient: { role: "owner" | "secondary"; is_active: boolean; prefs: RecipientPrefs },
  category: AlertCategory,
): boolean {
  if (recipient.role === "owner") return true; // le propriétaire reçoit toujours tout
  if (!recipient.is_active) return false;
  return recipient.prefs[category] === true;
}

export type InviteStatus = "valid" | "unknown" | "expired" | "used" | "revoked";

export type InviteRow = {
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
};

/** Évalue un code d'invitation retrouvé en base (null = code inconnu). */
export function evaluateInvite(invite: InviteRow | null, now: Date = new Date()): InviteStatus {
  if (!invite) return "unknown";
  if (invite.revoked_at) return "revoked";
  if (invite.used_at) return "used";
  if (new Date(invite.expires_at).getTime() <= now.getTime()) return "expired";
  return "valid";
}

export const INVITE_STATUS_MESSAGES: Record<Exclude<InviteStatus, "valid">, string> = {
  unknown: "Code d'invitation inconnu. Demandez un nouveau code au propriétaire.",
  expired: "Ce code d'invitation a expiré. Demandez un nouveau code.",
  used: "Ce code a déjà été utilisé.",
  revoked: "Ce code a été annulé par le propriétaire.",
};

/** Alphabet sans caractères ambigus (0/O, 1/I). */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 10;

export function formatInviteCode(bytes: Uint8Array): string {
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[(bytes[i] ?? 0) % CODE_ALPHABET.length];
  }
  return code;
}

/** Extrait le code d'un message `/start CODE` (renvoie null si ce n'est pas un /start). */
export function parseStartCommand(text: string | null | undefined): { code: string | null } | null {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!/^\/start(?:@[\w_]+)?(\s|$)/i.test(trimmed)) return null;
  const parts = trimmed.split(/\s+/);
  const raw = parts[1];
  if (!raw) return { code: null };
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return { code: code.length > 0 ? code : null };
}

export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Masque un chat_id pour l'UI : jamais de valeur brute affichée. */
export function maskChatId(chatId: string): string {
  const tail = chatId.slice(-3);
  return `••••${tail}`;
}
