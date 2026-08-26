/**
 * Couche scanner Solana — SERVEUR UNIQUEMENT.
 *
 * V1 : aucune exécution d'ordre, aucune clé privée, aucun wallet secret.
 * Cette couche est une abstraction de connexion (RPC HTTP + WebSocket) prête
 * à recevoir un vrai fournisseur (Helius, Triton, QuickNode…) plus tard.
 *
 * Tant que SOLANA_RPC_URL n'est pas configuré, le scanner est explicitement
 * "non configuré" : on ne prétend jamais scanner le mainnet.
 */

/** Garde-fou permanent : aucune fonctionnalité de trading dans cette app. */
export const TRADING_ENABLED = false as const;

export type ScannerState = "not_configured" | "connected" | "unreachable" | "error";

export interface ScannerStatus {
  state: ScannerState;
  /** Endpoint RPC masqué (host uniquement), jamais le token d'API. */
  endpoint: string | null;
  websocket: boolean;
  latencyMs: number | null;
  message: string;
  /** true tant que les données affichées proviennent des seeds de simulation. */
  demoData: boolean;
}

function maskEndpoint(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "endpoint invalide";
  }
}

export interface SolanaConnectionConfig {
  rpcUrl: string;
  wsUrl: string | null;
}

/** Lit la configuration RPC depuis les secrets serveur (jamais côté client). */
export function readSolanaConfig(): SolanaConnectionConfig | null {
  const rpcUrl = process.env["SOLANA_RPC_URL"];
  if (!rpcUrl) return null;
  return { rpcUrl, wsUrl: process.env["SOLANA_WS_URL"] ?? null };
}

/**
 * Abstraction minimale de connexion. Le futur scanner temps réel s'appuiera
 * sur `rpcCall` (HTTP) et sur `wsUrl` (souscriptions logsSubscribe /
 * accountSubscribe) sans changer l'UI ni le schéma de base.
 */
export class SolanaScannerConnection {
  constructor(private readonly config: SolanaConnectionConfig) {}

  get wsUrl(): string | null {
    return this.config.wsUrl;
  }

  async rpcCall<T>(method: string, params: unknown[] = []): Promise<T> {
    const response = await fetch(this.config.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!response.ok) {
      throw new Error(`RPC ${method} a répondu ${response.status}`);
    }
    const payload = (await response.json()) as { result?: T; error?: { message: string } };
    if (payload.error) throw new Error(payload.error.message);
    return payload.result as T;
  }

  async health(): Promise<string> {
    return this.rpcCall<string>("getHealth");
  }
}

export async function getScannerStatus(): Promise<ScannerStatus> {
  const config = readSolanaConfig();
  if (!config) {
    return {
      state: "not_configured",
      endpoint: null,
      websocket: false,
      latencyMs: null,
      message:
        "Aucun fournisseur RPC Solana configuré. Le dashboard affiche des données de simulation.",
      demoData: true,
    };
  }

  const connection = new SolanaScannerConnection(config);
  const startedAt = Date.now();
  try {
    const result = await connection.health();
    const latencyMs = Date.now() - startedAt;
    const ok = result === "ok";
    return {
      state: ok ? "connected" : "unreachable",
      endpoint: maskEndpoint(config.rpcUrl),
      websocket: Boolean(config.wsUrl),
      latencyMs,
      message: ok
        ? "Connexion RPC Solana opérationnelle (lecture seule)."
        : `Le nœud RPC répond « ${result} ».`,
      demoData: !ok,
    };
  } catch (error) {
    return {
      state: "error",
      endpoint: maskEndpoint(config.rpcUrl),
      websocket: Boolean(config.wsUrl),
      latencyMs: null,
      message: error instanceof Error ? error.message : "Erreur RPC inconnue",
      demoData: true,
    };
  }
}
