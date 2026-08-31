import { createServerFn } from "@tanstack/react-start";
import {
  evaluateThrottle,
  failureMessage,
  isSessionUnlocked,
  registerFailure,
  registerSuccess,
} from "./settings-gate";

export type SettingsGateStatus = {
  configured: boolean;
  unlocked: boolean;
  blocked: boolean;
  retryAfterSeconds: number;
};

export const getSettingsGateStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<SettingsGateStatus> => {
    const { getGateSession, isGateConfigured, isSettingsUnlocked } = await import(
      "./settings-gate.server"
    );
    if (!isGateConfigured()) {
      return { configured: false, unlocked: true, blocked: false, retryAfterSeconds: 0 };
    }
    const session = await getGateSession();
    const throttle = evaluateThrottle(session.data);
    return {
      configured: true,
      unlocked: (await isSettingsUnlocked()) || isSessionUnlocked(session.data),
      blocked: throttle.blocked,
      retryAfterSeconds: throttle.retryAfterSeconds,
    };
  },
);

export const unlockSettings = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string }) => ({
    password: typeof data?.password === "string" ? data.password : "",
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string; token?: string }> => {
    const { getGateSession, isGateConfigured, issueUnlockToken, passwordMatches } = await import(
      "./settings-gate.server"
    );
    if (!isGateConfigured()) {
      return {
        ok: false,
        message:
          "Verrou non configuré : ajoutez le secret SETTINGS_PASSWORD dans les paramètres du projet.",
      };
    }

    const session = await getGateSession();
    const throttle = evaluateThrottle(session.data);
    if (throttle.blocked) {
      return { ok: false, message: failureMessage(throttle) };
    }

    const expected = process.env["SETTINGS_PASSWORD"]!;
    if (!data.password || !passwordMatches(data.password, expected)) {
      const next = registerFailure(session.data);
      await session.update(next);
      return { ok: false, message: failureMessage(evaluateThrottle(next)) };
    }

    await session.update(registerSuccess());
    // Jeton de repli : utilisé uniquement si le cookie de session est bloqué
    // (aperçu affiché en iframe). Il ne contient jamais le mot de passe.
    return { ok: true, token: issueUnlockToken() };
  });

export const lockSettings = createServerFn({ method: "POST" }).handler(async () => {
  const { getGateSession } = await import("./settings-gate.server");
  const session = await getGateSession();
  await session.clear();
  return { ok: true as const };
});
