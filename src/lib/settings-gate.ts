/**
 * Logique pure du verrou « Paramètres » (aucun secret, aucun accès réseau).
 *
 * Le verrou protège uniquement l'interface et les API de la section Paramètres.
 * Il n'a aucun effet sur le collector, le worker Railway, le scoring,
 * les alertes Telegram ou le bouton NOW.
 */

export const SETTINGS_SESSION_NAME = "mr-settings-gate";
/** Durée d'une session Paramètres déverrouillée : 8 heures. */
export const SETTINGS_SESSION_MAX_AGE = 60 * 60 * 8;
/** Nombre d'essais ratés avant blocage temporaire. */
export const MAX_FAILED_ATTEMPTS = 5;
/** Durée du blocage temporaire après trop d'essais : 5 minutes. */
export const LOCKOUT_MS = 5 * 60 * 1000;

export type SettingsGateSession = {
  unlocked?: boolean;
  unlockedAt?: number;
  failedAttempts?: number;
  lockedUntil?: number;
};

export type ThrottleState = {
  blocked: boolean;
  retryAfterSeconds: number;
  remainingAttempts: number;
};

/** Évalue le blocage anti-bruteforce pour une session donnée. */
export function evaluateThrottle(
  session: SettingsGateSession,
  now: number = Date.now(),
): ThrottleState {
  const lockedUntil = session.lockedUntil ?? 0;
  if (lockedUntil > now) {
    return {
      blocked: true,
      retryAfterSeconds: Math.ceil((lockedUntil - now) / 1000),
      remainingAttempts: 0,
    };
  }
  const failed = lockedUntil > 0 ? 0 : (session.failedAttempts ?? 0);
  return {
    blocked: false,
    retryAfterSeconds: 0,
    remainingAttempts: Math.max(0, MAX_FAILED_ATTEMPTS - failed),
  };
}

/** Calcule l'état de session après un échec d'authentification. */
export function registerFailure(
  session: SettingsGateSession,
  now: number = Date.now(),
): SettingsGateSession {
  const previous = (session.lockedUntil ?? 0) > 0 && (session.lockedUntil ?? 0) <= now
    ? 0
    : (session.failedAttempts ?? 0);
  const failedAttempts = previous + 1;
  const base: SettingsGateSession = {
    unlocked: false,
    failedAttempts,
  };
  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
    return { ...base, failedAttempts: 0, lockedUntil: now + LOCKOUT_MS };
  }
  return { ...base, lockedUntil: 0 };
}

/** État de session après un déverrouillage réussi. */
export function registerSuccess(now: number = Date.now()): SettingsGateSession {
  return { unlocked: true, unlockedAt: now, failedAttempts: 0, lockedUntil: 0 };
}

/** Une session est valide tant qu'elle est déverrouillée et non expirée. */
export function isSessionUnlocked(
  session: SettingsGateSession,
  now: number = Date.now(),
): boolean {
  if (!session.unlocked) return false;
  const unlockedAt = session.unlockedAt ?? 0;
  if (!unlockedAt) return false;
  return now - unlockedAt < SETTINGS_SESSION_MAX_AGE * 1000;
}

/** Message d'erreur affiché à l'utilisateur (jamais le secret attendu). */
export function failureMessage(state: ThrottleState): string {
  if (state.blocked) {
    const minutes = Math.max(1, Math.ceil(state.retryAfterSeconds / 60));
    return `Trop de tentatives. Réessayez dans ${minutes} min.`;
  }
  return `Mot de passe incorrect. ${state.remainingAttempts} tentative${
    state.remainingAttempts > 1 ? "s" : ""
  } restante${state.remainingAttempts > 1 ? "s" : ""} avant blocage temporaire.`;
}
