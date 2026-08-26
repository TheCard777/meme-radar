/**
 * Point d'entrée du worker collecteur Solana (processus long-running 24/7).
 *
 * Deux modes de persistance :
 *  - MODE API (recommandé, Railway) : le worker parle uniquement à l'API
 *    sécurisée Meme Radar via MEME_RADAR_API_URL + MEME_RADAR_WORKER_TOKEN.
 *    Aucune service-role key, aucune URL backend côté Railway.
 *  - MODE DIRECT (héritage, local) : SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *
 * Le WebSocket Solana reste TOUJOURS dans ce worker : il n'est jamais
 * remplacé par une fonction serveur.
 *
 * MODE OBSERVATION UNIQUEMENT : aucun trading, aucune clé privée de wallet.
 */

import { PUMP_FUN_PROGRAM_ID } from "./constants";
import { SolanaLogCollector } from "./collector";
import { ApiCollectorStore } from "./api-store";
import { CollectorStore } from "./store";
import type { CollectorStorage } from "./store";

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

const env = (name: string): string | undefined => process.env[name]?.trim() || undefined;

interface WorkerEnvironment {
  rpcUrl: string;
  wsUrl: string;
  mode: "api" | "direct";
  apiUrl?: string;
  apiToken?: string;
  backendUrl?: string;
  backendServiceKey?: string;
}

function readWorkerEnvironment(): WorkerEnvironment {
  const missing: string[] = [];
  const rpcUrl = env("SOLANA_RPC_URL");
  if (!rpcUrl) missing.push("SOLANA_RPC_URL");

  const apiUrl = env("MEME_RADAR_API_URL");
  const apiToken = env("MEME_RADAR_WORKER_TOKEN");
  const backendUrl = env("SUPABASE_URL");
  const backendServiceKey = env("SUPABASE_SERVICE_ROLE_KEY");

  const apiMode = Boolean(apiUrl || apiToken) || !(backendUrl && backendServiceKey);
  if (apiMode) {
    if (!apiUrl) missing.push("MEME_RADAR_API_URL");
    if (!apiToken) missing.push("MEME_RADAR_WORKER_TOKEN");
  }

  if (missing.length > 0 || !rpcUrl) throw new MissingWorkerEnvironmentError(missing);

  return {
    rpcUrl,
    wsUrl: env("SOLANA_WS_URL") ?? rpcUrl.replace(/^http/, "ws"),
    mode: apiMode ? "api" : "direct",
    ...(apiUrl ? { apiUrl } : {}),
    ...(apiToken ? { apiToken } : {}),
    ...(backendUrl ? { backendUrl } : {}),
    ...(backendServiceKey ? { backendServiceKey } : {}),
  };
}

export async function runCollectorWorker(): Promise<SolanaLogCollector> {
  const environment = readWorkerEnvironment();

  let store: CollectorStorage;
  let apiStore: ApiCollectorStore | null = null;
  if (environment.mode === "api") {
    apiStore = new ApiCollectorStore(environment.apiUrl as string, environment.apiToken as string);
    store = apiStore;
  } else {
    store = new CollectorStore(
      environment.backendUrl as string,
      environment.backendServiceKey as string,
    );
  }

  process.stdout.write(
    `${JSON.stringify({
      level: "info",
      scope: "worker",
      event: "environment_validated",
      persistenceMode: environment.mode,
      optionalConfigured: OPTIONAL_WORKER_ENV.filter((name) => Boolean(env(name))),
      optionalMissing: OPTIONAL_WORKER_ENV.filter((name) => !env(name)),
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
    const runCycle = apiStore
      ? // Mode API : le calcul s'exécute côté Lovable Cloud (secrets restants là-bas).
        async () => apiStore.runEnrichmentCycle()
      : async () => {
          const { analyzeRealWallets } = await import("../lib/wallets.server");
          const { enrichRealTokens } = await import("../lib/enrichment.server");
          const wallets = await analyzeRealWallets();
          const result = await enrichRealTokens();
          return { wallets, ...result } as Record<string, unknown>;
        };

    const cycle = async () => {
      try {
        const result = await runCycle();
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
