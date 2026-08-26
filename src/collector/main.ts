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

  const shutdown = (signal: string) => {
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
