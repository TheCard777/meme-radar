/**
 * Point d'entrée du worker collecteur Solana (processus long-running 24/7).
 *
 * Usage (hors runtime Lovable, sur un hébergeur type Railway/Fly/VPS) :
 *   SOLANA_RPC_URL=... SOLANA_WS_URL=... SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... bun run src/collector/main.ts
 *
 * Options d'environnement :
 *   COLLECTOR_PROGRAM_FILTER=off  -> désactive le filtre Pump.fun (tous les logs)
 *   COLLECTOR_PROGRAM_ID=<id>     -> remplace le program ID surveillé
 *
 * MODE OBSERVATION UNIQUEMENT : aucun trading, aucune clé privée de wallet.
 */

import { PUMP_FUN_PROGRAM_ID } from "./constants";
import { SolanaLogCollector } from "./collector";
import { CollectorStore } from "./store";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

export async function runCollectorWorker(): Promise<SolanaLogCollector> {
  const rpcUrl = requireEnv("SOLANA_RPC_URL");
  const wsUrl = process.env["SOLANA_WS_URL"] || rpcUrl.replace(/^http/, "ws");
  const store = new CollectorStore(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );

  const filterDisabled = process.env["COLLECTOR_PROGRAM_FILTER"] === "off";
  const programFilter = filterDisabled
    ? null
    : process.env["COLLECTOR_PROGRAM_ID"] || PUMP_FUN_PROGRAM_ID;

  const collector = new SolanaLogCollector({ rpcUrl, wsUrl, programFilter, store });
  await collector.start();

  // Boucle d'enrichissement + scoring + alertes Telegram (observation seule).
  let enrichTimer: ReturnType<typeof setInterval> | null = null;
  if (process.env["COLLECTOR_ENRICH"] !== "off") {
    const intervalMs = Number(process.env["COLLECTOR_ENRICH_INTERVAL_MS"] ?? 90_000);
    const { enrichRealTokens } = await import("../lib/enrichment.server");
    const { analyzeRealWallets } = await import("../lib/wallets.server");
    const cycle = async () => {
      try {
        // 1) Premiers acheteurs réels (on-chain, lecture seule).
        const wallets = await analyzeRealWallets();
        process.stdout.write(
          `${JSON.stringify({ level: "info", scope: "wallets", ...wallets })}\n`,
        );
        // 2) Enrichissement + scoring + alertes Telegram.
        const result = await enrichRealTokens();
        process.stdout.write(
          `${JSON.stringify({ level: "info", scope: "enrichment", ...result })}\n`,
        );
      } catch (error) {
        process.stderr.write(
          `${JSON.stringify({
            level: "error",
            scope: "enrichment",
            message: error instanceof Error ? error.message : String(error),
          })}\n`,
        );
      }
    };
    enrichTimer = setInterval(() => void cycle(), Math.max(30_000, intervalMs));
    void cycle();
  }

  const shutdown = (signal: string) => {
    if (enrichTimer) clearInterval(enrichTimer);
    void collector.stop(signal).finally(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  return collector;
}

// Exécution directe uniquement (jamais lors d'un import par l'app web).
if (process.argv[1] && process.argv[1].endsWith("main.ts")) {
  void runCollectorWorker().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  });
}
