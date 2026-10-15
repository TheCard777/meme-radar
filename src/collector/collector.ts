/**
 * Collecteur Solana V1 — MODE OBSERVATION UNIQUEMENT.
 *
 * - Souscription WebSocket `logsSubscribe` aux logs d'un programme de lancement.
 * - Reconnexion automatique avec backoff exponentiel + jitter.
 * - Heartbeat applicatif (getHealth via WS `ping` JSON-RPC) et watchdog.
 * - Logs structurés JSON (stdout) pour un déploiement long-running externe.
 * - Aucun achat, aucune vente, aucune clé privée, aucun envoi Telegram.
 *
 * Ce module ne dépend d'aucune API navigateur : il tourne sous Node/Bun 24/7.
 */

import {
  BACKOFF_MAX_MS,
  BACKOFF_MIN_MS,
  COLLECTOR_SOURCE,
  CREATE_LOG_MARKERS,
  DESIRED_STATE_POLL_MS,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  PUMP_FUN_PROGRAM_ID,
  TRADING_ENABLED,
} from "./constants";
import type { CollectorRuntimeState, CollectorStorage } from "./store";

export interface CollectorOptions {
  rpcUrl: string;
  wsUrl: string;
  /** Filtrer sur le program ID de lancement (désactivable). */
  programFilter: string | null;
  store: CollectorStorage;
  log?: (entry: Record<string, unknown>) => void;
}

interface LogsNotification {
  signature: string;
  logs: string[];
  err: unknown;
}

function structuredLog(entry: Record<string, unknown>) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), scope: "collector", ...entry }) + "\n",
  );
}

export class SolanaLogCollector {
  private ws: WebSocket | null = null;
  private subscriptionId: number | null = null;
  private rpcId = 1;
  private attempt = 0;
  private stopped = true;
  private lastMessageAt = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private readonly seenSignatures = new Set<string>();
  private reconnectScheduled = false;
  private endpointIndex = 0;

  private stats = {
    eventsReceived: 0,
    tokensConfirmed: 0,
    reconnects: 0,
    lastSignature: null as string | null,
    lastEventAt: null as string | null,
  };

  private readonly log: (entry: Record<string, unknown>) => void;

  constructor(private readonly options: CollectorOptions) {
    this.log = options.log ?? structuredLog;
    if (TRADING_ENABLED) throw new Error("Trading interdit dans cette application");
  }

  /** Démarre la boucle : suit `desired_state` en base et (re)connecte. */
  async start(): Promise<void> {
    this.stopped = false;
    this.log({ level: "info", event: "worker_start", programFilter: this.options.programFilter });
    await this.syncDesiredState();
    this.pollTimer = setInterval(() => {
      void this.syncDesiredState();
    }, DESIRED_STATE_POLL_MS);
  }

  async stop(reason = "manual"): Promise<void> {
    this.stopped = true;
    this.teardownSocket();
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.log({ level: "info", event: "worker_stop", reason });
    await this.report("stopped");
  }

  /**
   * Ne lève jamais : une panne transitoire de l'API est journalisée et le
   * prochain poll réessaie (l'état courant du WebSocket est conservé).
   * Une erreur permanente (ex. 401 jeton invalide) est journalisée en
   * `level: "error"` avec `permanent: true` à chaque poll, jamais masquée.
   */
  private async syncDesiredState() {
    try {
      const desired = await this.options.store.readDesiredState();
      if (desired === "running" && !this.ws && !this.stopped) {
        void this.connectLoop();
      } else if (desired === "stopped" && this.ws) {
        this.teardownSocket();
        this.log({ level: "info", event: "stopped_by_desired_state" });
        await this.report("stopped");
      } else if (this.ws) {
        await this.report("running");
      }
    } catch (error) {
      const name = error instanceof Error ? error.name : "Error";
      this.log({
        level: name === "ApiTransientError" ? "warn" : "error",
        event: "desired_state_sync_failed",
        permanent: name !== "ApiTransientError",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** URL configurée puis repli dérivé du RPC (certains endpoints premium refusent). */
  private get endpoints(): string[] {
    const derived = this.options.rpcUrl.replace(/^http/, "ws");
    return this.options.wsUrl === derived ? [derived] : [this.options.wsUrl, derived];
  }

  private get currentEndpoint(): string {
    const list = this.endpoints;
    return list[this.endpointIndex % list.length]!;
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectScheduled) return;
    this.reconnectScheduled = true;
    this.attempt += 1;
    this.endpointIndex += 1;
    const delay = this.backoffDelay();
    this.log({ level: "info", event: "reconnect_scheduled", attempt: this.attempt, delay });
    setTimeout(() => {
      this.reconnectScheduled = false;
      void this.connectLoop();
    }, delay);
  }

  private backoffDelay(): number {
    const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** this.attempt);
    return Math.round(base * (0.5 + Math.random() * 0.5));
  }

  private teardownSocket() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* noop */
      }
    }
    this.ws = null;
    this.subscriptionId = null;
  }

  private async connectLoop(): Promise<void> {
    if (this.stopped || this.ws) return;
    await this.report("connecting");
    try {
      await this.connect();
      this.attempt = 0;
    } catch (error) {
      this.stats.reconnects += 1;
      this.log({
        level: "error",
        event: "connect_failed",
        attempt: this.attempt + 1,
        endpoint: new URL(this.currentEndpoint).host,
        error: error instanceof Error ? error.message : String(error),
      });
      await this.report("error", error instanceof Error ? error.message : String(error));
      this.scheduleReconnect();
    }
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const endpoint = this.currentEndpoint;
      const ws = new WebSocket(endpoint);
      this.ws = ws;
      let settled = false;

      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        this.teardownSocket();
        reject(new Error(message));
      };

      const timeout = setTimeout(() => fail("Délai de handshake WebSocket dépassé"), 15_000);

      ws.onopen = () => {
        clearTimeout(timeout);
        settled = true;
        this.lastMessageAt = Date.now();
        this.log({ level: "info", event: "ws_open", endpoint: new URL(endpoint).host });
        this.subscribe(ws);
        this.startHeartbeat();
        void this.report("running");
        resolve();
      };

      ws.onmessage = (message) => {
        this.lastMessageAt = Date.now();
        void this.handleMessage(String((message as MessageEvent).data));
      };

      ws.onerror = () => {
        if (!settled) fail("Erreur WebSocket pendant la connexion");
      };

      ws.onclose = () => {
        clearTimeout(timeout);
        if (!settled) {
          fail("WebSocket fermé pendant la connexion");
          return;
        }
        this.log({ level: "warn", event: "ws_close" });
        this.teardownSocket();
        this.stats.reconnects += 1;
        this.scheduleReconnect();
      };
    });
  }

  private subscribe(ws: WebSocket) {
    const filter = this.options.programFilter
      ? { mentions: [this.options.programFilter] }
      : "all";
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: this.rpcId++,
        method: "logsSubscribe",
        params: [filter, { commitment: "confirmed" }],
      }),
    );
    this.log({ level: "info", event: "subscribe_sent", filter });
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      const idleMs = Date.now() - this.lastMessageAt;
      if (idleMs > HEARTBEAT_TIMEOUT_MS) {
        this.log({ level: "warn", event: "heartbeat_timeout", idleMs });
        this.teardownSocket();
        this.scheduleReconnect();
        return;
      }
      try {
        this.ws?.send(JSON.stringify({ jsonrpc: "2.0", id: this.rpcId++, method: "ping" }));
      } catch {
        /* la fermeture est gérée par onclose */
      }
      void this.report("running");
    }, HEARTBEAT_INTERVAL_MS);
  }

  private async handleMessage(raw: string) {
    let payload: any;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    if (payload.result != null && typeof payload.result === "number" && payload.id) {
      this.subscriptionId = payload.result;
      this.log({ level: "info", event: "subscribed", subscriptionId: payload.result });
      return;
    }

    if (payload.method !== "logsNotification") return;
    const value = payload.params?.result?.value as LogsNotification | undefined;
    if (!value?.signature) return;

    this.stats.eventsReceived += 1;
    this.stats.lastSignature = value.signature;
    this.stats.lastEventAt = new Date().toISOString();

    if (value.err) return;
    if (this.seenSignatures.has(value.signature)) return;

    // Parsing conservateur : on ne retient que les logs contenant explicitement
    // un marqueur de création. Tout le reste est ignoré (pas de supposition).
    const isCreate = (value.logs ?? []).some((line) =>
      CREATE_LOG_MARKERS.some((marker) => line.startsWith(marker)),
    );
    if (!isCreate) return;

    this.seenSignatures.add(value.signature);
    if (this.seenSignatures.size > 5000) {
      this.seenSignatures.clear();
    }

    try {
      const mint = await this.resolveMint(value.signature);
      if (!mint) {
        this.log({ level: "debug", event: "create_unresolved", signature: value.signature });
        return;
      }
      const inserted = await this.options.store.insertDetectedToken({
        mintAddress: mint,
        signature: value.signature,
        source: COLLECTOR_SOURCE,
      });
      if (inserted) {
        this.stats.tokensConfirmed += 1;
        this.log({ level: "info", event: "token_confirmed", mint, signature: value.signature });
      }
    } catch (error) {
      this.log({
        level: "error",
        event: "persist_failed",
        signature: value.signature,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Récupère l'adresse de mint via getTransaction (lecture seule). */
  private async resolveMint(signature: string): Promise<string | null> {
    const res = await fetch(this.options.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: this.rpcId++,
        method: "getTransaction",
        params: [
          signature,
          { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
        ],
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as any;
    const tx = body?.result;
    if (!tx) return null;

    const instructions: any[] = [
      ...(tx.transaction?.message?.instructions ?? []),
      ...(tx.meta?.innerInstructions ?? []).flatMap((i: any) => i.instructions ?? []),
    ];
    for (const ix of instructions) {
      const type = ix?.parsed?.type;
      if (type === "initializeMint" || type === "initializeMint2") {
        const mint = ix?.parsed?.info?.mint;
        if (typeof mint === "string") return mint;
      }
    }
    const balance = (tx.meta?.postTokenBalances ?? [])[0]?.mint;
    return typeof balance === "string" ? balance : null;
  }

  private async report(state: CollectorRuntimeState, error?: string) {
    await this.reportUnsafe(state, error).catch((failure: unknown) => {
      this.log({
        level: "warn",
        event: "report_state_failed",
        message: failure instanceof Error ? failure.message : String(failure),
      });
    });
  }

  private async reportUnsafe(state: CollectorRuntimeState, error?: string) {
    await this.options.store.reportState({
      runtimeState: state,
      source: this.options.programFilter
        ? `${COLLECTOR_SOURCE}:${PUMP_FUN_PROGRAM_ID.slice(0, 6)}`
        : "all-logs",
      lastError: error ?? null,
      ...this.stats,
    });
  }
}
