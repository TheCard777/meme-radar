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
          const url = process.env["SUPABASE_URL"];
          const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
          if (!url || !key) throw new Error("configuration manquante");
          const res = await fetch(`${url}/rest/v1/bot_settings?select=status&limit=1`, {
            headers: { apikey: key },
          });
          if (!res.ok) throw new Error(`REST ${res.status}`);
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
              latencyMs: scanner.latencyMs,
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
