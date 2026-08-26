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

const REQUIRED_WORKER_ENV = [
  "SOLANA_RPC_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

const OPTIONAL_WORKER_ENV = [
  "SOLANA_WS_URL",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
] as const;

class MissingWorkerEnvironmentError extends Error {
  constructor(readonly missingNames: string[]) {
    super(`Variables d'environnement obligatoires manquantes : ${missingNames.join(", ")}`);
    this.name = "MissingWorkerEnvironmentError";
  }
}

function readWorkerEnvironment(): {
  rpcUrl: string;
  wsUrl: string;
  backendUrl: string;
  backendServiceKey: string;
} {
  const missingNames = REQUIRED_WORKER_ENV.filter((name) => !process.env[name]?.trim());
  if (missingNames.length > 0) throw new MissingWorkerEnvironmentError([...missingNames]);

  // Le contrôle ci-dessus garantit ces valeurs sans assertion non-null.
  const rpcUrl = process.env["SOLANA_RPC_URL"]?.trim();
  const backendUrl = process.env["SUPABASE_URL"]?.trim();
  const backendServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim();
  if (!rpcUrl || !backendUrl || !backendServiceKey) {
    throw new MissingWorkerEnvironmentError([...REQUIRED_WORKER_ENV]);
  }

  return {
    rpcUrl,
    wsUrl: process.env["SOLANA_WS_URL"]?.trim() || rpcUrl.replace(/^http/, "ws"),
    backendUrl,
    backendServiceKey,
  };
}

export async function runCollectorWorker(): Promise<SolanaLogCollector> {
  const environment = readWorkerEnvironment();
  const store = new CollectorStore(environment.backendUrl, environment.backendServiceKey);

  process.stdout.write(
    `${JSON.stringify({
      level: "info",
      scope: "worker",
      event: "environment_validated",
      required: REQUIRED_WORKER_ENV,
      optionalConfigured: OPTIONAL_WORKER_ENV.filter((name) => Boolean(process.env[name]?.trim())),
      optionalMissing: OPTIONAL_WORKER_ENV.filter((name) => !process.env[name]?.trim()),
      tradingEnabled: false,
    })}\n`,
  );

  const filterDisabled = process.env["COLLECTOR_PROGRAM_FILTER"] === "off";
  const programFilter = filterDisabled
    ? null
    : process.env["COLLECTOR_PROGRAM_ID"] || PUMP_FUN_PROGRAM_ID;

  const collector = new SolanaLogCollector({
    rpcUrl: environment.rpcUrl,
    wsUrl: environment.wsUrl,
    programFilter,
    store,
  });
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
const entry = process.argv[1] ?? "";
if (entry.endsWith("main.ts") || entry.endsWith("worker.mjs")) {
  void runCollectorWorker().catch((error) => {
    const missingNames =
      error instanceof MissingWorkerEnvironmentError ? error.missingNames : undefined;
    process.stderr.write(
      `${JSON.stringify({
        level: "error",
        scope: "worker",
        event: missingNames ? "environment_invalid" : "startup_failed",
        message: error instanceof Error ? error.message : String(error),
        ...(missingNames ? { missingNames } : {}),
        tradingEnabled: false,
      })}\n`,
    );
    process.exit(1);
  });
}
