import { createFileRoute } from "@tanstack/react-router";

/**
 * Endpoint de santé public : scanner Solana + Telegram + base de données.
 * Aucune donnée personnelle, aucun secret, aucune capacité de trading.
 */
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const { getScannerStatus } = await import("@/lib/scanner.server");
        const { getTelegramStatus } = await import("@/lib/telegram.server");

        const [scanner, telegram] = await Promise.all([
          getScannerStatus(),
          getTelegramStatus(),
        ]);

        let database = { ok: true, message: "ok" };
        try {
          // `bot_settings` est réservée au service role : la clé publiable
          // renverrait 401 (GRANT révoqué), ce qui fausserait le statut.
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin
            .from("bot_settings")
            .select("status")
            .limit(1)
            .maybeSingle();
          if (error) throw new Error(error.message);
        } catch (error) {
          database = {
            ok: false,
            message: error instanceof Error ? error.message : "injoignable",
          };
        }


        return Response.json(
          {
            service: "meme-radar",
            tradingEnabled: false,
            scanner: {
              state: scanner.state,
              websocket: scanner.websocket,
              websocketState: scanner.websocketState,
              latencyMs: scanner.latencyMs,
              slot: scanner.slot,
              version: scanner.version,
              demoData: scanner.demoData,
            },
            telegram: {
              configured: telegram.configured,
              chatConfigured: telegram.chatConfigured,
            },
            database,
            checkedAt: new Date().toISOString(),
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
