/**
 * Persistance du collecteur via l'API sécurisée Lovable Cloud — WORKER UNIQUEMENT.
 *
 * Le worker Railway n'a JAMAIS la service-role key ni l'URL du backend : il
 * parle uniquement à l'API publique authentifiée par un secret partagé
 * (MEME_RADAR_WORKER_TOKEN). Le WebSocket Solana reste dans le worker.
 *
 * Aucun trading, aucune clé privée.
 */

import type { CollectorDesiredState, CollectorReport, CollectorStorage, DetectedToken } from "./store";

export class ApiCollectorStore implements CollectorStorage {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private url(action: string, query = ""): string {
    return `${this.baseUrl.replace(/\/+$/, "")}/api/public/worker/${action}${query}`;
  }

  private async call<T>(action: string, method: "GET" | "POST", body?: unknown, query = ""): Promise<T> {
    const response = await fetch(this.url(action, query), {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) {
      throw new Error(`API ${action} ${response.status}: ${payload.error ?? "erreur inconnue"}`);
    }
    return payload;
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
