import { createServerFn } from "@tanstack/react-start";
import type { EnrichmentResult } from "./enrichment.server";

/**
 * Lance un cycle d'enrichissement + scoring sur les tokens réels.
 * Observation uniquement : aucun ordre n'est passé.
 */
export const runEnrichmentCycle = createServerFn({ method: "POST" }).handler(
  async (): Promise<EnrichmentResult> => {
    const { enrichRealTokens } = await import("./enrichment.server");
    return enrichRealTokens();
  },
);
