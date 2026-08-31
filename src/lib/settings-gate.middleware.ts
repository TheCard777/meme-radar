import { createMiddleware } from "@tanstack/react-start";
import { SETTINGS_UNLOCK_HEADER, readUnlockToken } from "./settings-gate.client";

/**
 * Attache le jeton de déverrouillage des Paramètres aux appels server fn.
 * N'a aucun effet sur le worker Railway ni sur les API publiques.
 */
export const attachSettingsUnlock = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const token = typeof window === "undefined" ? null : readUnlockToken();
    return next({ headers: token ? { [SETTINGS_UNLOCK_HEADER]: token } : {} });
  },
);
