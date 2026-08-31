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
export async function isSettingsUnlocked(): Promise<boolean> {
  if (!isGateConfigured()) return true; // verrou non configuré : comportement inchangé
  const session = await getGateSession();
  return isSessionUnlocked(session.data);
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
