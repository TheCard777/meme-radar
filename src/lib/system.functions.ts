import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Fonctions serveur de supervision (health, scanner, Telegram, état du bot).
 * Aucune fonction de trading : lecture / statut / réglage de surveillance seulement.
 */

export interface SystemHealth {
  tradingEnabled: false;
  scanner: {
    state: "not_configured" | "connected" | "unreachable" | "error";
    endpoint: string | null;
    websocket: boolean;
    latencyMs: number | null;
    message: string;
    demoData: boolean;
  };
  telegram: {
    configured: boolean;
    chatConfigured: boolean;
    botUsername: string | null;
    message: string;
  };
  database: { ok: boolean; message: string };
  botStatus: "paused" | "active" | "unknown";
  checkedAt: string;
}

function serverSupabase() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
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

export const getSystemHealth = createServerFn({ method: "GET" }).handler(
  async (): Promise<SystemHealth> => {
    const { getScannerStatus } = await import("./scanner.server");
    const { getTelegramStatus } = await import("./telegram.server");

    const [scanner, telegram] = await Promise.all([getScannerStatus(), getTelegramStatus()]);

    let database = { ok: true, message: "Base de données joignable." };
    let botStatus: SystemHealth["botStatus"] = "unknown";
    try {
      const { data, error } = await serverSupabase()
        .from("bot_settings")
        .select("status")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      botStatus = (data?.status as SystemHealth["botStatus"]) ?? "unknown";
    } catch (error) {
      database = {
        ok: false,
        message: error instanceof Error ? error.message : "Base injoignable",
      };
    }

    return {
      tradingEnabled: false,
      scanner,
      telegram,
      database,
      botStatus,
      checkedAt: new Date().toISOString(),
    };
  },
);

/**
 * Active = état de surveillance demandé, Pause = arrêt demandé.
 * Écrit uniquement dans bot_settings ; ne déclenche aucun ordre.
 */
export const setBotState = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; status: "paused" | "active" }) => {
    if (!input?.id) throw new Error("Identifiant de réglages manquant");
    if (input.status !== "paused" && input.status !== "active") {
      throw new Error("Statut invalide");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const { getScannerStatus } = await import("./scanner.server");
    const supabase = serverSupabase();
    const { error } = await supabase
      .from("bot_settings")
      .update({
        status: data.status,
        last_scan_at: data.status === "active" ? new Date().toISOString() : null,
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    const scanner = await getScannerStatus();
    return {
      status: data.status,
      scannerState: scanner.state,
      demoData: scanner.demoData,
      message:
        scanner.state === "connected"
          ? data.status === "active"
            ? "Surveillance demandée — scanner Solana connecté (lecture seule)."
            : "Arrêt de la surveillance demandé."
          : data.status === "active"
            ? "Surveillance demandée — aucun RPC Solana connecté, données de simulation."
            : "Arrêt de la surveillance demandé — données conservées.",
    };
  });
