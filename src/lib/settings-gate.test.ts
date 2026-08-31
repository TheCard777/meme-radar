import { describe, expect, it } from "vitest";
import {
  LOCKOUT_MS,
  MAX_FAILED_ATTEMPTS,
  SETTINGS_SESSION_MAX_AGE,
  evaluateThrottle,
  failureMessage,
  isSessionUnlocked,
  registerFailure,
  registerSuccess,
  type SettingsGateSession,
} from "./settings-gate";

const NOW = 1_700_000_000_000;

describe("verrou Paramètres", () => {
  it("considère une session vide comme verrouillée", () => {
    expect(isSessionUnlocked({}, NOW)).toBe(false);
  });

  it("déverrouille après succès et jusqu'à expiration", () => {
    const session = registerSuccess(NOW);
    expect(isSessionUnlocked(session, NOW)).toBe(true);
    expect(isSessionUnlocked(session, NOW + SETTINGS_SESSION_MAX_AGE * 1000 - 1)).toBe(true);
    expect(isSessionUnlocked(session, NOW + SETTINGS_SESSION_MAX_AGE * 1000 + 1)).toBe(false);
  });

  it("incrémente les échecs puis bloque temporairement", () => {
    let session: SettingsGateSession = {};
    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i += 1) {
      session = registerFailure(session, NOW);
      expect(evaluateThrottle(session, NOW).blocked).toBe(false);
      expect(session.failedAttempts).toBe(i);
    }
    session = registerFailure(session, NOW);
    const throttle = evaluateThrottle(session, NOW);
    expect(throttle.blocked).toBe(true);
    expect(throttle.retryAfterSeconds).toBe(LOCKOUT_MS / 1000);
    expect(isSessionUnlocked(session, NOW)).toBe(false);
  });

  it("réautorise les tentatives après la fin du blocage", () => {
    const blocked: SettingsGateSession = { lockedUntil: NOW + LOCKOUT_MS, failedAttempts: 0 };
    const after = evaluateThrottle(blocked, NOW + LOCKOUT_MS + 1);
    expect(after.blocked).toBe(false);
    expect(after.remainingAttempts).toBe(MAX_FAILED_ATTEMPTS);
  });

  it("produit un message d'erreur clair sans divulguer le secret", () => {
    const msg = failureMessage({ blocked: false, retryAfterSeconds: 0, remainingAttempts: 3 });
    expect(msg).toContain("Mot de passe incorrect");
    expect(msg).toContain("3 tentatives restantes");
    const blockedMsg = failureMessage({
      blocked: true,
      retryAfterSeconds: 300,
      remainingAttempts: 0,
    });
    expect(blockedMsg).toContain("Trop de tentatives");
  });
});
