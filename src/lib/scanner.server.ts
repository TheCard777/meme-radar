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

export type WebsocketState = "absent" | "configured" | "verified" | "failed";

export interface ScannerStatus {
  state: ScannerState;
  /** Endpoint RPC masqué (host uniquement), jamais le token d'API. */
  endpoint: string | null;
  websocket: boolean;
  /** Détail du canal temps réel : absent / configuré / handshake vérifié / échec. */
  websocketState: WebsocketState;
  websocketMessage: string;
  latencyMs: number | null;
  /** Slot courant du cluster si la connexion est saine. */
  slot: number | null;
  /** Version du nœud si disponible. */
  version: string | null;
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

  async slot(): Promise<number> {
    return this.rpcCall<number>("getSlot");
  }

  async version(): Promise<string | null> {
    const res = await this.rpcCall<{ "solana-core"?: string }>("getVersion");
    return res?.["solana-core"] ?? null;
  }

  /** URL WebSocket configurée, plus repli dérivé du endpoint RPC. */
  get wsCandidates(): string[] {
    const list: string[] = [];
    if (this.config.wsUrl) list.push(this.config.wsUrl);
    const derived = this.config.rpcUrl.replace(/^http/, "ws");
    if (!list.includes(derived)) list.push(derived);
    return list;
  }

  private async tryWebsocket(url: string, timeoutMs: number): Promise<boolean> {
    // 1) Runtime Worker : upgrade via fetch.
    try {
      const res = await fetch(url.replace(/^ws/, "http"), {
        headers: { Upgrade: "websocket" },
      });
      const socket = (res as unknown as { webSocket?: { accept: () => void; close: () => void } })
        .webSocket;
      if (res.status === 101 && socket) {
        socket.accept();
        socket.close();
        return true;
      }
      if (res.status === 101) return true;
    } catch {
      // le runtime ne supporte pas l'upgrade via fetch → fallback ci-dessous
    }

    // 2) Runtime Node : constructeur WebSocket global.
    const WS = (globalThis as { WebSocket?: new (url: string) => any }).WebSocket;
    if (!WS) return false;
    return await new Promise<boolean>((resolve) => {
      let done = false;
      const ws = new WS(url);
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        try {
          ws.close();
        } catch {
          /* noop */
        }
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      ws.onopen = () => {
        clearTimeout(timer);
        finish(true);
      };
      ws.onerror = () => {
        clearTimeout(timer);
        finish(false);
      };
    });
  }

  /**
   * Vérifie le canal temps réel sans souscrire à quoi que ce soit :
   * simple handshake WebSocket, fermé immédiatement. Si l'URL configurée est
   * refusée (endpoint premium non inclus dans le plan), on teste le WebSocket
   * standard dérivé du RPC.
   */
  async checkWebsocket(
    timeoutMs = 4000,
  ): Promise<{ state: WebsocketState; message: string; url: string | null }> {
    const candidates = this.wsCandidates;
    if (candidates.length === 0) {
      return {
        state: "absent",
        message: "Aucune URL WebSocket configurée (SOLANA_WS_URL).",
        url: null,
      };
    }

    for (const [index, candidate] of candidates.entries()) {
      const ok = await this.tryWebsocket(candidate, timeoutMs);
      if (ok) {
        return {
          state: "verified",
          message:
            index === 0
              ? "Handshake WebSocket vérifié sur l'endpoint configuré (souscriptions temps réel possibles)."
              : "Endpoint WebSocket configuré refusé — repli sur le WebSocket standard du RPC, handshake vérifié.",
          url: candidate,
        };
      }
    }

    return {
      state: "failed",
      message:
        "Aucun handshake WebSocket accepté (endpoint temps réel refusé par le fournisseur). Le RPC HTTP reste utilisable en polling.",
      url: null,
    };
  }
}

}

export async function getScannerStatus(): Promise<ScannerStatus> {
  const config = readSolanaConfig();
  if (!config) {
    return {
      state: "not_configured",
      endpoint: null,
      websocket: false,
      websocketState: "absent",
      websocketMessage: "Aucune URL WebSocket configurée (SOLANA_WS_URL).",
      latencyMs: null,
      slot: null,
      version: null,
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

    const [ws, slot, version] = await Promise.all([
      connection.checkWebsocket(),
      connection.slot().catch(() => null),
      connection.version().catch(() => null),
    ]);

    return {
      state: ok ? "connected" : "unreachable",
      endpoint: maskEndpoint(config.rpcUrl),
      websocket: ws.state === "verified" || ws.state === "configured",
      websocketState: ws.state,
      websocketMessage: ws.message,
      latencyMs,
      slot,
      version,
      message: ok
        ? `Connexion RPC Solana opérationnelle en lecture seule (${latencyMs} ms${slot ? `, slot ${slot}` : ""}).`
        : `Le nœud RPC répond « ${result} ».`,
      demoData: !ok,
    };
  } catch (error) {
    return {
      state: "error",
      endpoint: maskEndpoint(config.rpcUrl),
      websocket: false,
      websocketState: config.wsUrl ? "failed" : "absent",
      websocketMessage: config.wsUrl
        ? "WebSocket non vérifié : le RPC HTTP est en erreur."
        : "Aucune URL WebSocket configurée (SOLANA_WS_URL).",
      latencyMs: null,
      slot: null,
      version: null,
      message: error instanceof Error ? error.message : "Erreur RPC inconnue",
      demoData: true,
    };
  }
}
