/**
 * Lecture de l'état du collecteur — SERVEUR UNIQUEMENT.
 *
 * Le runtime Lovable (Cloudflare Worker) ne peut pas maintenir un WebSocket
 * long-running : on n'y simule jamais un worker permanent. Si aucun heartbeat
 * récent n'est reçu, l'état affiché est explicitement « worker externe requis ».
 */

import { createClient } from "@supabase/supabase-js";
import { STALE_HEARTBEAT_MS } from "@/collector/constants";

export type CollectorRuntimeState =
  | "stopped"
  | "connecting"
  | "running"
  | "error"
  | "worker_required";

export interface CollectorStatus {
  desiredState: "stopped" | "running";
  runtimeState: CollectorRuntimeState;
  workerAttached: boolean;
  source: string;
  lastHeartbeatAt: string | null;
  lastEventAt: string | null;
  eventsReceived: number;
  tokensConfirmed: number;
  lastSignature: string | null;
  reconnects: number;
  lastError: string | null;
  message: string;
  /** Garde-fou permanent. */
  tradingEnabled: false;
}

function serviceClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export async function getCollectorStatus(): Promise<CollectorStatus> {
  const { data, error } = await serviceClient()
    .from("collector_state")
    .select("*")
    .limit(1)
    .maybeSingle();

  const fallback: CollectorStatus = {
    desiredState: "stopped",
    runtimeState: "worker_required",
    workerAttached: false,
    source: "none",
    lastHeartbeatAt: null,
    lastEventAt: null,
    eventsReceived: 0,
    tokensConfirmed: 0,
    lastSignature: null,
    reconnects: 0,
    lastError: error?.message ?? null,
    message: "État du collecteur indisponible.",
    tradingEnabled: false,
  };
  if (error || !data) return fallback;

  const heartbeat = data["last_heartbeat_at"] as string | null;
  const fresh = heartbeat ? Date.now() - new Date(heartbeat).getTime() < STALE_HEARTBEAT_MS : false;
  const desiredState = (data["desired_state"] as CollectorStatus["desiredState"]) ?? "stopped";
  const reported = data["runtime_state"] as CollectorRuntimeState;

  const runtimeState: CollectorRuntimeState = fresh ? reported : "worker_required";
  const message = fresh
    ? reported === "running"
      ? "Worker collecteur connecté et à l'écoute des logs."
      : reported === "connecting"
        ? "Worker en cours de connexion au WebSocket Solana."
        : reported === "error"
          ? (data["last_error"] as string) || "Le worker signale une erreur."
          : "Worker attaché mais arrêté (surveillance en pause)."
    : desiredState === "running"
      ? "Worker externe requis : le runtime web ne peut pas maintenir un WebSocket 24/7. Démarrez `bun run src/collector/main.ts` sur un hébergeur long-running."
      : "Aucun worker collecteur attaché. Démarrage demandé = stoppé.";

  return {
    desiredState,
    runtimeState,
    workerAttached: fresh,
    source: (data["source"] as string) ?? "none",
    lastHeartbeatAt: heartbeat,
    lastEventAt: (data["last_event_at"] as string) ?? null,
    eventsReceived: Number(data["events_received"] ?? 0),
    tokensConfirmed: Number(data["tokens_confirmed"] ?? 0),
    lastSignature: (data["last_signature"] as string) ?? null,
    reconnects: Number(data["reconnects"] ?? 0),
    lastError: (data["last_error"] as string) ?? null,
    message,
    tradingEnabled: false,
  };
}

export async function setCollectorDesiredState(
  desired: "stopped" | "running",
): Promise<CollectorStatus> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("collector_state")
    .update({ desired_state: desired })
    .eq("singleton", true);
  if (error) throw new Error(error.message);
  return getCollectorStatus();
}
