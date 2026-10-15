/**
 * Persistance du collecteur via l'API sécurisée Lovable Cloud — WORKER UNIQUEMENT.
 *
 * Le worker n'a JAMAIS la service-role key ni l'URL du backend : il
 * parle uniquement à l'API publique authentifiée par un secret partagé
 * (MEME_RADAR_WORKER_TOKEN). Le WebSocket Solana reste dans le worker.
 *
 * Erreurs temporaires (réseau, 408/425/429/5xx) : retry avec backoff, puis
 * `ApiTransientError` (non fatale). Erreurs permanentes (401/403/400/404…) :
 * `ApiPermanentError`, jamais masquée.
 *
 * Aucun trading, aucune clé privée.
 */

import type { CollectorDesiredState, CollectorReport, CollectorStorage, DetectedToken } from "./store";

export class ApiTransientError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
    this.name = "ApiTransientError";
  }
}

export class ApiPermanentError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiPermanentError";
  }
}

export function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function apiRetryDelayMs(attempt: number, baseMs = 500, maxMs = 8_000): number {
  const exp = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.round(exp / 2 + Math.random() * (exp / 2));
}

export interface ApiStoreOptions {
  retries?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  fetchImpl?: typeof fetch;
}

export class ApiCollectorStore implements CollectorStorage {
  private readonly retries: number;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    options: ApiStoreOptions = {},
  ) {
    this.retries = options.retries ?? 3;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
  }

  private url(action: string, query = ""): string {
    return `${this.baseUrl.replace(/\/+$/, "")}/api/public/worker/${action}${query}`;
  }

  private async callOnce<T>(action: string, method: "GET" | "POST", body: unknown, query: string): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.url(action, query), {
        method,
        headers: {
          authorization: `Bearer ${this.token}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new ApiTransientError(
        `API ${action} réseau: ${error instanceof Error ? error.message : String(error)}`,
        null,
      );
    }
    const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) {
      const message = `API ${action} ${response.status}: ${payload.error ?? "erreur inconnue"}`;
      if (isTransientStatus(response.status)) throw new ApiTransientError(message, response.status);
      throw new ApiPermanentError(message, response.status);
    }
    return payload;
  }

  private async call<T>(action: string, method: "GET" | "POST", body?: unknown, query = ""): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.callOnce<T>(action, method, body, query);
      } catch (error) {
        if (!(error instanceof ApiTransientError) || attempt >= this.retries) throw error;
        await this.sleep(apiRetryDelayMs(attempt));
      }
    }
  }

  async readDesiredState(): Promise<CollectorDesiredState> {
    const payload = await this.call<{ state: { desired_state?: string } | null }>(
      "read",
      "GET",
      undefined,
      "?resource=state",
    );
    return (payload.state?.desired_state as CollectorDesiredState) ?? "stopped";
  }

  async reportState(report: CollectorReport): Promise<void> {
    await this.call("state", "POST", report);
  }

  async insertDetectedToken(token: DetectedToken): Promise<boolean> {
    const payload = await this.call<{ inserted: number }>("tokens", "POST", { tokens: [token] });
    return payload.inserted > 0;
  }

  /** Déclenche le cycle enrichissement + scoring + alertes côté Lovable Cloud. */
  async runEnrichmentCycle(): Promise<Record<string, unknown>> {
    return this.call<Record<string, unknown>>("enrich", "POST", {});
  }
}
