import { createFileRoute } from "@tanstack/react-router";

/**
 * Health du collecteur : état demandé, état réel, activité, compteurs.
 * Aucune donnée personnelle, aucun secret, aucune capacité de trading.
 */
export const Route = createFileRoute("/api/public/collector-health")({
  server: {
    handlers: {
      GET: async () => {
        const { getCollectorStatus } = await import("@/lib/collector.server");
        const status = await getCollectorStatus();
        return Response.json(
          { service: "meme-radar-collector", ...status },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
