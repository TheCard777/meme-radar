/**
 * Verrou serveur de la section Paramètres.
 * Le mot de passe attendu (SETTINGS_PASSWORD) reste côté serveur : il n'est
 * jamais renvoyé dans une réponse API ni exposé au bundle client.
 */
import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  SETTINGS_SESSION_MAX_AGE,
  SETTINGS_SESSION_NAME,
  isSessionUnlocked,
  type SettingsGateSession,
} from "./settings-gate";

function sessionConfig() {
  const password = process.env["SETTINGS_SESSION_SECRET"];
  if (!password) {
    throw new Error("SETTINGS_SESSION_SECRET manquant : verrou Paramètres non configurable.");
  }
  return {
    password,
    name: SETTINGS_SESSION_NAME,
    maxAge: SETTINGS_SESSION_MAX_AGE,
    cookie: {
      httpOnly: true,
      secure: true,
      // "none" est requis pour que le cookie soit accepté quand l'app est
      // affichée dans une iframe (aperçu Lovable). Nécessite secure: true.
      sameSite: "none" as const,
      path: "/",
    },
  };
}

export async function getGateSession() {
  return useSession<SettingsGateSession>(sessionConfig());
}

/** Le verrou est-il configuré (mot de passe défini côté serveur) ? */
export function isGateConfigured(): boolean {
  return Boolean(process.env["SETTINGS_PASSWORD"]);
}

/** Comparaison timing-safe via digests de longueur fixe. */
export function passwordMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

/** Vérifie l'état déverrouillé, sans jamais divulguer le secret attendu. */
export async function isSettingsUnlocked(token?: string | null): Promise<boolean> {
  if (!isGateConfigured()) return true; // verrou non configuré : comportement inchangé
  const headerToken = token ?? readUnlockHeader();
  if (verifyUnlockToken(headerToken)) return true;
  const session = await getGateSession();
  return isSessionUnlocked(session.data);
}

/** En-tête de repli envoyé par le client quand le cookie est bloqué (iframe). */
export const SETTINGS_UNLOCK_HEADER = "x-settings-unlock";

function readUnlockHeader(): string | null {
  try {
    return getRequestHeader(SETTINGS_UNLOCK_HEADER) ?? null;
  } catch {
    return null;
  }
}

/**
 * À appeler au début des server functions réservées aux Paramètres.
 * N'affecte ni le worker Railway (API `/api/public/worker/*`) ni le collector.
 */
export async function requireSettingsUnlocked(): Promise<void> {
  if (!(await isSettingsUnlocked())) {
    throw new Error("Paramètres verrouillés : authentification requise.");
  }
}

/**
 * Repli sans cookie (aperçu en iframe, cookies tiers bloqués) :
 * jeton signé HMAC-SHA256 avec SETTINGS_SESSION_SECRET, valable
 * SETTINGS_SESSION_MAX_AGE. Le mot de passe n'est jamais inclus.
 */
import { createHmac } from "node:crypto";

function signPayload(payload: string): string {
  const secret = process.env["SETTINGS_SESSION_SECRET"];
  if (!secret) throw new Error("SETTINGS_SESSION_SECRET manquant.");
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function issueUnlockToken(now: number = Date.now()): string {
  const exp = now + SETTINGS_SESSION_MAX_AGE * 1000;
  const payload = String(exp);
  return `${payload}.${signPayload(payload)}`;
}

export function verifyUnlockToken(token: string | undefined | null, now: number = Date.now()): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  let expected: string;
  try {
    expected = signPayload(payload);
  } catch {
    return false;
  }
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const exp = Number(payload);
  return Number.isFinite(exp) && exp > now;
}
