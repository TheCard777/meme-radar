/**
 * Endpoint cron d'enrichissement + scoring (observation uniquement).
 * Authentifié par le secret cron géré par la plateforme ; aucun secret exposé.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/enrich")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        const { enrichRealTokens } = await import("@/lib/enrichment.server");
        try {
          const result = await enrichRealTokens();
          return Response.json({ ok: true, ...result });
        } catch (error) {
          return Response.json(
            { ok: false, error: error instanceof Error ? error.message : "Erreur inconnue" },
            { status: 500 },
          );
        }
      },
    },
  },
});
