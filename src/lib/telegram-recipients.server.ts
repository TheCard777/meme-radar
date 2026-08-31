/**
 * Destinataires Telegram — accès base (SERVEUR UNIQUEMENT).
 *
 * Les tables `telegram_recipients` / `telegram_invites` ne sont accessibles
 * qu'au rôle service_role : aucun accès anon/authenticated, aucune lecture
 * directe depuis le navigateur. L'UI passe par des fonctions serveur qui
 * n'exposent jamais le chat_id brut ni le bot token.
 */
import { createHash, randomBytes } from "crypto";
import {
  DEFAULT_SECONDARY_PREFS,
  OWNER_PREFS,
  evaluateInvite,
  formatInviteCode,
  normalizeInviteCode,
  normalizePrefs,
  type AlertCategory,
  type InviteStatus,
  type RecipientPrefs,
} from "./telegram-recipients";

export type RecipientRow = {
  id: string;
  chat_id: string;
  label: string;
  role: "owner" | "secondary";
  is_active: boolean;
  prefs: RecipientPrefs;
  activated_at: string | null;
  created_at: string;
};

function hashCode(code: string): string {
  return createHash("sha256").update(`meme-radar-invite:${code}`).digest("hex");
}

export function hashInviteCode(code: string): string {
  return hashCode(normalizeInviteCode(code));
}

export function generateInviteCode(): string {
  return formatInviteCode(new Uint8Array(randomBytes(32)));
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function mapRow(row: Record<string, unknown>): RecipientRow {
  const role = row["role"] === "owner" ? "owner" : "secondary";
  return {
    id: String(row["id"]),
    chat_id: String(row["chat_id"]),
    label: String(row["label"] ?? "Destinataire"),
    role,
    is_active: Boolean(row["is_active"]),
    prefs: normalizePrefs(row["prefs"], role === "owner" ? OWNER_PREFS : DEFAULT_SECONDARY_PREFS),
    activated_at: (row["activated_at"] as string | null) ?? null,
    created_at: String(row["created_at"]),
  };
}

/**
 * Garantit que le compte principal (secret TELEGRAM_CHAT_ID) existe en base
 * comme propriétaire. Aucune reconfiguration côté utilisateur n'est requise.
 */
export async function ensureOwnerRecipient(): Promise<RecipientRow | null> {
  const chatId = process.env["TELEGRAM_CHAT_ID"];
  if (!chatId) return null;
  const db = await admin();
  const { data: existing } = await db
    .from("telegram_recipients")
    .select("*")
    .eq("chat_id", chatId)
    .maybeSingle();
  if (existing) {
    if (existing.role !== "owner" || !existing.is_active) {
      await db
        .from("telegram_recipients")
        .update({ role: "owner", is_active: true, prefs: OWNER_PREFS })
        .eq("id", existing.id);
      return mapRow({ ...existing, role: "owner", is_active: true, prefs: OWNER_PREFS });
    }
    return mapRow(existing);
  }
  const { data, error } = await db
    .from("telegram_recipients")
    .insert({
      chat_id: chatId,
      label: "Compte principal",
      role: "owner",
      is_active: true,
      prefs: OWNER_PREFS,
      activated_at: new Date().toISOString(),
    })
    .select("*")
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

export async function listRecipients(): Promise<RecipientRow[]> {
  await ensureOwnerRecipient();
  const db = await admin();
  const { data, error } = await db
    .from("telegram_recipients")
    .select("*")
    .order("role", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

/**
 * Cibles d'envoi pour une catégorie donnée.
 * Le propriétaire (env) est toujours inclus, même si la base est indisponible.
 */
export async function resolveTargets(
  category: AlertCategory,
): Promise<Array<{ chatId: string; role: "owner" | "secondary" }>> {
  const ownerChatId = process.env["TELEGRAM_CHAT_ID"] ?? null;
  const targets: Array<{ chatId: string; role: "owner" | "secondary" }> = [];
  if (ownerChatId) targets.push({ chatId: ownerChatId, role: "owner" });

  try {
    const db = await admin();
    const { data } = await db
      .from("telegram_recipients")
      .select("chat_id, role, is_active, prefs")
      .eq("role", "secondary")
      .eq("is_active", true);
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const chatId = String(row["chat_id"]);
      if (chatId === ownerChatId) continue;
      const prefs = normalizePrefs(row["prefs"]);
      if (prefs[category]) targets.push({ chatId, role: "secondary" });
    }
  } catch {
    // Base injoignable : le destinataire principal reste servi.
  }
  return targets;
}

export type CreatedInvite = {
  id: string;
  code: string;
  expiresAt: string;
  label: string;
};

export async function createInvite(params: {
  label: string;
  prefs?: Partial<RecipientPrefs>;
  ttlMinutes?: number;
}): Promise<CreatedInvite> {
  const db = await admin();
  const code = generateInviteCode();
  const ttl = Math.min(Math.max(params.ttlMinutes ?? 60, 5), 24 * 60);
  const expiresAt = new Date(Date.now() + ttl * 60_000).toISOString();
  const prefs = normalizePrefs(params.prefs ?? {}, DEFAULT_SECONDARY_PREFS);
  const label = params.label.trim().slice(0, 60) || "Invité";

  const { data, error } = await db
    .from("telegram_invites")
    .insert({ code_hash: hashCode(code), label, prefs, expires_at: expiresAt })
    .select("id")
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "Création d'invitation impossible");
  return { id: String(data.id), code, expiresAt, label };
}

export async function revokeInvite(id: string): Promise<void> {
  const db = await admin();
  const { error } = await db
    .from("telegram_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("used_at", null);
  if (error) throw new Error(error.message);
}

export async function listPendingInvites(): Promise<
  Array<{ id: string; label: string; expiresAt: string }>
> {
  const db = await admin();
  const { data, error } = await db
    .from("telegram_invites")
    .select("id, label, expires_at, used_at, revoked_at")
    .is("used_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    label: String(row.label),
    expiresAt: String(row.expires_at),
  }));
}

export type RedeemResult =
  | { ok: true; label: string; alreadyActive: boolean }
  | { ok: false; status: Exclude<InviteStatus, "valid"> };

/**
 * Valide un code `/start CODE` et active le chat_id comme destinataire
 * secondaire. Le code est invalidé immédiatement après usage.
 * Aucune alerte passée n'est renvoyée : seules les nouvelles alertes partent.
 */
export async function redeemInvite(code: string, chatId: string): Promise<RedeemResult> {
  const db = await admin();
  const normalized = normalizeInviteCode(code);
  const { data: invite } = await db
    .from("telegram_invites")
    .select("id, label, prefs, expires_at, used_at, revoked_at")
    .eq("code_hash", hashCode(normalized))
    .maybeSingle();

  const status = evaluateInvite(
    invite
      ? {
          expires_at: String(invite.expires_at),
          used_at: (invite.used_at as string | null) ?? null,
          revoked_at: (invite.revoked_at as string | null) ?? null,
        }
      : null,
  );
  if (status !== "valid" || !invite) {
    return { ok: false, status: status === "valid" ? "unknown" : status };
  }

  const prefs = normalizePrefs(invite.prefs);
  const nowIso = new Date().toISOString();

  const { data: existing } = await db
    .from("telegram_recipients")
    .select("id, role")
    .eq("chat_id", chatId)
    .maybeSingle();

  let recipientId: string;
  let alreadyActive = false;
  if (existing) {
    // Le propriétaire ne peut pas être rétrogradé par une invitation.
    if (existing.role === "owner") {
      await db.from("telegram_invites").update({ used_at: nowIso }).eq("id", invite.id);
      return { ok: true, label: String(invite.label), alreadyActive: true };
    }
    alreadyActive = true;
    recipientId = String(existing.id);
    await db
      .from("telegram_recipients")
      .update({ is_active: true, prefs, label: String(invite.label), activated_at: nowIso })
      .eq("id", recipientId);
  } else {
    const { data: created, error } = await db
      .from("telegram_recipients")
      .insert({
        chat_id: chatId,
        label: String(invite.label),
        role: "secondary",
        is_active: true,
        prefs,
        activated_at: nowIso,
      })
      .select("id")
      .maybeSingle();
    if (error || !created) throw new Error(error?.message ?? "Activation impossible");
    recipientId = String(created.id);
  }

  // Invalidation atomique du code (une seule utilisation possible).
  const { data: consumed } = await db
    .from("telegram_invites")
    .update({ used_at: nowIso, recipient_id: recipientId })
    .eq("id", invite.id)
    .is("used_at", null)
    .select("id");
  if (!consumed || consumed.length === 0) {
    return { ok: false, status: "used" };
  }

  return { ok: true, label: String(invite.label), alreadyActive };
}

export async function setRecipientActive(id: string, isActive: boolean): Promise<void> {
  const db = await admin();
  const { error } = await db
    .from("telegram_recipients")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("role", "secondary"); // le propriétaire n'est jamais désactivable
  if (error) throw new Error(error.message);
}

export async function revokeRecipient(id: string): Promise<void> {
  const db = await admin();
  const { error } = await db
    .from("telegram_recipients")
    .delete()
    .eq("id", id)
    .eq("role", "secondary"); // le propriétaire n'est jamais supprimable
  if (error) throw new Error(error.message);
}

export async function updateRecipientPrefs(
  id: string,
  prefs: Partial<RecipientPrefs>,
): Promise<void> {
  const db = await admin();
  const { data: current } = await db
    .from("telegram_recipients")
    .select("prefs, role")
    .eq("id", id)
    .maybeSingle();
  if (!current || current.role === "owner") return; // propriétaire inchangeable
  const merged = normalizePrefs(prefs, normalizePrefs(current.prefs));
  const { error } = await db.from("telegram_recipients").update({ prefs: merged }).eq("id", id);
  if (error) throw new Error(error.message);
}
