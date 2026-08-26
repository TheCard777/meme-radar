/**
 * Persistance du collecteur — SERVEUR / WORKER UNIQUEMENT.
 * Écrit l'état du collecteur et les tokens réellement détectés (is_simulated = false).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type CollectorRuntimeState = "stopped" | "connecting" | "running" | "error";
export type CollectorDesiredState = "stopped" | "running";

export interface CollectorReport {
  runtimeState: CollectorRuntimeState;
  source: string;
  lastError: string | null;
  eventsReceived: number;
  tokensConfirmed: number;
  reconnects: number;
  lastSignature: string | null;
  lastEventAt: string | null;
}

export interface DetectedToken {
  mintAddress: string;
  signature: string;
  source: string;
}

export class CollectorStore {
  private readonly client: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async readDesiredState(): Promise<CollectorDesiredState> {
    const { data } = await this.client
      .from("collector_state")
      .select("desired_state")
      .limit(1)
      .maybeSingle();
    return (data?.["desired_state"] as CollectorDesiredState) ?? "stopped";
  }

  async reportState(report: CollectorReport): Promise<void> {
    await this.client
      .from("collector_state")
      .update({
        runtime_state: report.runtimeState,
        source: report.source,
        last_error: report.lastError,
        events_received: report.eventsReceived,
        tokens_confirmed: report.tokensConfirmed,
        reconnects: report.reconnects,
        last_signature: report.lastSignature,
        last_event_at: report.lastEventAt,
        last_heartbeat_at: new Date().toISOString(),
      })
      .eq("singleton", true);
  }

  /** Insère un token réel + un snapshot initial. Renvoie false si déjà connu. */
  async insertDetectedToken(token: DetectedToken): Promise<boolean> {
    const short = `${token.mintAddress.slice(0, 4)}…${token.mintAddress.slice(-4)}`;
    const { data, error } = await this.client
      .from("tokens")
      .insert({
        mint_address: token.mintAddress,
        symbol: short,
        name: `Token ${short}`,
        is_simulated: false,
        detection_source: token.source,
        detection_signature: token.signature,
        status: "watching",
        score: 0,
        launched_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();

    if (error) {
      // 23505 = doublon (mint ou signature déjà enregistré)
      if (error.code === "23505") return false;
      throw new Error(error.message);
    }
    if (!data?.["id"]) return false;

    await this.client.from("token_snapshots").insert({
      token_id: data["id"] as string,
      market_cap: 0,
      volume: 0,
      buyers: 0,
      score: 0,
    });
    return true;
  }
}
