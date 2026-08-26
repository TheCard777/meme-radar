import { createServerFn } from "@tanstack/react-start";
import type { CollectorStatus } from "./collector.server";

/** Statut du collecteur (lecture seule, aucun secret exposé). */
export const fetchCollectorStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<CollectorStatus> => {
    const { getCollectorStatus } = await import("./collector.server");
    return getCollectorStatus();
  },
);

/**
 * Start/Stop du collecteur : n'écrit que `desired_state`.
 * Aucun ordre, aucun trading, aucune alerte Telegram envoyée ici.
 */
export const setCollectorState = createServerFn({ method: "POST" })
  .inputValidator((input: { desired: "stopped" | "running" }) => {
    if (input?.desired !== "stopped" && input?.desired !== "running") {
      throw new Error("État demandé invalide");
    }
    return input;
  })
  .handler(async ({ data }): Promise<CollectorStatus> => {
    const { setCollectorDesiredState } = await import("./collector.server");
    return setCollectorDesiredState(data.desired);
  });
