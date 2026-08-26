/**
 * API sécurisée du worker Meme Radar (Railway) — MODE OBSERVATION UNIQUEMENT.
 *
 * Le worker long-running conserve le WebSocket Solana : cette API ne fait
 * qu'écrire/lire les données côté Lovable Cloud. Aucune clé de service n'est
 * jamais transmise au worker ni au navigateur ; l'authentification repose sur
 * un secret partagé (MEME_RADAR_WORKER_TOKEN) stocké côté backend.
 *
 * Aucun trading, aucune clé privée de wallet.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

type Json = Record<string, unknown>;

function log(event: string, payload: Json = {}): void {
  // Logs de diagnostic : jamais de secret, jamais de valeur d'environnement.
  console.log(JSON.stringify({ scope: "worker-api", event, at: new Date().toISOString(), ...payload }));
}

async function authenticate(request: Request, action: string): Promise<Response | null> {
  const expected = process.env["MEME_RADAR_WORKER_TOKEN"];
  if (!expected) {
    log("misconfigured", { action });
    return Response.json({ ok: false, error: "worker_token_not_configured" }, { status: 500 });
  }
  const match = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "");
  const token = match?.[1];
  if (!token) {
    log("unauthorized", { action, reason: "missing_bearer" });
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  if (!timingSafeEqual(digest(token), digest(expected))) {
    log("unauthorized", { action, reason: "bad_token" });
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return null;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/* ------------------------------- schémas ------------------------------- */

const tokensSchema = z.object({
  tokens: z
    .array(
      z.object({
        mintAddress: z.string().min(32).max(64),
        signature: z.string().min(16).max(128),
        source: z.string().min(1).max(64),
        symbol: z.string().max(32).optional(),
        name: z.string().max(120).optional(),
      }),
    )
    .min(1)
    .max(50),
});

const snapshotsSchema = z.object({
  snapshots: z
    .array(
      z.object({
        mintAddress: z.string().min(32).max(64),
        marketCap: z.number().finite().nonnegative().default(0),
        volume: z.number().finite().nonnegative().default(0),
        liquidityUsd: z.number().finite().nonnegative().default(0),
        priceUsd: z.number().finite().nonnegative().default(0),
        buyers: z.number().int().nonnegative().default(0),
        score: z.number().min(0).max(100).default(0),
      }),
    )
    .min(1)
    .max(200),
});

const walletsSchema = z.object({
  wallets: z
    .array(
      z.object({
        address: z.string().min(32).max(64),
        smartWalletScore: z.number().min(0).max(100).nullable().default(null),
        earlyEntries: z.number().int().nonnegative().default(0),
        tokensTracked: z.number().int().nonnegative().default(0),
        successCount: z.number().int().nonnegative().default(0),
        successRate: z.number().min(0).max(1).nullable().default(null),
        medianMultiple: z.number().nullable().default(null),
        dataSufficient: z.boolean().default(false),
        reasons: z.array(z.string().max(300)).max(20).default([]),
      }),
    )
    .max(200)
    .default([]),
  entries: z
    .array(
      z.object({
        walletAddress: z.string().min(32).max(64),
        mintAddress: z.string().min(32).max(64),
        signature: z.string().min(16).max(128),
        entryRank: z.number().int().positive(),
        amountRaw: z.number().nullable().default(null),
        blockTime: z.string().datetime().nullable().default(null),
      }),
    )
    .max(500)
    .default([]),
});

const scoresSchema = z.object({
  scores: z
    .array(
      z.object({
        mintAddress: z.string().min(32).max(64),
        score: z.number().min(0).max(100),
        scoreFactors: z.array(z.record(z.unknown())).max(40).default([]),
        scoreConfidence: z.number().min(0).max(1).default(0),
        dataSufficient: z.boolean().default(false),
        missingMetrics: z.array(z.string().max(60)).max(40).default([]),
        status: z.enum(["watching", "signal", "critical", "cooling", "archived"]).optional(),
        smartWalletCount: z.number().int().nonnegative().optional(),
      }),
    )
    .min(1)
    .max(100),
});

const alertsSchema = z.object({
  mintAddress: z.string().min(32).max(64),
  level: z.enum(["signal", "critical"]),
  score: z.number().min(0).max(100),
  message: z.string().min(1).max(4000),
  channel: z.string().max(40).default("telegram"),
  priceUsdAtAlert: z.number().nullable().default(null),
  marketCapAtAlert: z.number().nullable().default(null),
  /** État anti-spam à persister sur le token. */
  alertLevel: z.enum(["none", "signal", "priority"]),
  alertedScore: z.number().min(0).max(100).optional(),
});

const stateSchema = z.object({
  runtimeState: z.enum(["stopped", "connecting", "running", "error"]),
  source: z.string().max(120),
  lastError: z.string().max(500).nullable().default(null),
  eventsReceived: z.number().int().nonnegative().default(0),
  tokensConfirmed: z.number().int().nonnegative().default(0),
  reconnects: z.number().int().nonnegative().default(0),
  lastSignature: z.string().max(128).nullable().default(null),
  lastEventAt: z.string().nullable().default(null),
});

/* ------------------------------ handlers ------------------------------- */

async function handlePost(action: string, body: unknown): Promise<Response> {
  const db = await admin();

  switch (action) {
    case "tokens": {
      const { tokens } = tokensSchema.parse(body);
      let inserted = 0;
      const duplicates: string[] = [];
      for (const token of tokens) {
        const short = `${token.mintAddress.slice(0, 4)}…${token.mintAddress.slice(-4)}`;
        const { data, error } = await db
          .from("tokens")
          .insert({
            mint_address: token.mintAddress,
            symbol: token.symbol ?? short,
            name: token.name ?? `Token ${short}`,
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
          if (error.code === "23505") {
            duplicates.push(token.mintAddress);
            continue;
          }
          throw new Error(error.message);
        }
        if (!data?.id) continue;
        inserted += 1;
        await db.from("token_snapshots").insert({
          token_id: data.id,
          market_cap: 0,
          volume: 0,
          buyers: 0,
          score: 0,
        });
      }
      log("tokens_ingested", { received: tokens.length, inserted, duplicates: duplicates.length });
      return Response.json({ ok: true, inserted, duplicates: duplicates.length });
    }

    case "snapshots": {
      const { snapshots } = snapshotsSchema.parse(body);
      const ids = await mintIds(
        db,
        snapshots.map((s) => s.mintAddress),
      );
      const rows = snapshots
        .filter((s) => ids.has(s.mintAddress))
        .map((s) => ({
          token_id: ids.get(s.mintAddress) as string,
          market_cap: s.marketCap,
          volume: s.volume,
          liquidity_usd: s.liquidityUsd,
          price_usd: s.priceUsd,
          buyers: s.buyers,
          score: s.score,
        }));
      if (rows.length > 0) {
        const { error } = await db.from("token_snapshots").insert(rows);
        if (error) throw new Error(error.message);
      }
      log("snapshots_ingested", { received: snapshots.length, inserted: rows.length });
      return Response.json({ ok: true, inserted: rows.length, unknownMints: snapshots.length - rows.length });
    }

    case "wallets": {
      const { wallets, entries } = walletsSchema.parse(body);
      let walletsUpserted = 0;
      if (wallets.length > 0) {
        const { error } = await db.from("smart_wallets").upsert(
          wallets.map((w) => ({
            address: w.address,
            is_simulated: false,
            smart_wallet_score: w.smartWalletScore,
            early_entries: w.earlyEntries,
            tokens_tracked: w.tokensTracked,
            success_count: w.successCount,
            success_rate: w.successRate,
            median_multiple: w.medianMultiple,
            data_sufficient: w.dataSufficient,
            reasons: w.reasons,
            last_active_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "address" },
        );
        if (error) throw new Error(error.message);
        walletsUpserted = wallets.length;
      }

      let entriesInserted = 0;
      if (entries.length > 0) {
        const ids = await mintIds(
          db,
          entries.map((e) => e.mintAddress),
        );
        const rows = entries
          .filter((e) => ids.has(e.mintAddress))
          .map((e) => ({
            token_id: ids.get(e.mintAddress) as string,
            wallet_address: e.walletAddress,
            mint_address: e.mintAddress,
            signature: e.signature,
            entry_rank: e.entryRank,
            amount_raw: e.amountRaw,
            block_time: e.blockTime,
          }));
        if (rows.length > 0) {
          const { error } = await db
            .from("wallet_token_entries")
            .upsert(rows, { onConflict: "wallet_address,token_id", ignoreDuplicates: true });
          if (error) throw new Error(error.message);
          entriesInserted = rows.length;
        }
      }
      log("wallets_ingested", { walletsUpserted, entriesInserted });
      return Response.json({ ok: true, walletsUpserted, entriesInserted });
    }

    case "scores": {
      const { scores } = scoresSchema.parse(body);
      let updated = 0;
      for (const s of scores) {
        const patch: Record<string, unknown> = {
          score: s.score,
          score_factors: s.scoreFactors,
          score_confidence: s.scoreConfidence,
          data_sufficient: s.dataSufficient,
          missing_metrics: s.missingMetrics,
          last_enriched_at: new Date().toISOString(),
        };
        if (s.status) patch["status"] = s.status;
        if (s.smartWalletCount !== undefined) patch["smart_wallet_count"] = s.smartWalletCount;
        const { error } = await db
          .from("tokens")
          .update(patch as never)
          .eq("mint_address", s.mintAddress)
          .eq("is_simulated", false);
        if (error) throw new Error(error.message);
        updated += 1;
      }
      log("scores_ingested", { updated });
      return Response.json({ ok: true, updated });
    }

    case "alerts": {
      const alert = alertsSchema.parse(body);
      const { data: token, error: tokenError } = await db
        .from("tokens")
        .select("id, symbol, is_simulated")
        .eq("mint_address", alert.mintAddress)
        .eq("is_simulated", false)
        .maybeSingle();
      if (tokenError) throw new Error(tokenError.message);
      if (!token) {
        log("alert_rejected", { reason: "unknown_or_simulated_token" });
        return Response.json({ ok: false, error: "token_not_found_or_simulated" }, { status: 404 });
      }

      const { error } = await db.from("alerts").insert({
        token_id: token.id,
        token_mint: alert.mintAddress,
        token_symbol: token.symbol,
        level: alert.level,
        score: alert.score,
        message: alert.message,
        channel: alert.channel,
        price_usd_at_alert: alert.priceUsdAtAlert,
        market_cap_at_alert: alert.marketCapAtAlert,
        is_simulated: false,
      });
      if (error) throw new Error(error.message);

      const { error: stateError } = await db
        .from("tokens")
        .update({
          alert_level: alert.alertLevel,
          alerted_score: alert.alertedScore ?? alert.score,
          last_alert_at: new Date().toISOString(),
        } as never)
        .eq("id", token.id);
      if (stateError) throw new Error(stateError.message);

      log("alert_recorded", { level: alert.level, score: alert.score });
      return Response.json({ ok: true });
    }

    case "state": {
      const report = stateSchema.parse(body);
      const { error } = await db
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
      if (error) throw new Error(error.message);
      return Response.json({ ok: true });
    }

    case "enrich": {
      // Le calcul (DEX Screener + RPC + scoring + Telegram) s'exécute côté
      // Lovable Cloud, là où les secrets vivent. Le worker ne fait que déclencher.
      const { analyzeRealWallets } = await import("@/lib/wallets.server");
      const { enrichRealTokens } = await import("@/lib/enrichment.server");
      const wallets = await analyzeRealWallets();
      const enrichment = await enrichRealTokens();
      log("enrich_cycle", {
        tokensAnalyzed: wallets.tokensAnalyzed,
        enriched: enrichment.enriched,
        alertsCreated: enrichment.alertsCreated,
      });
      return Response.json({ ok: true, wallets, ...enrichment });
    }

    default:
      return Response.json({ ok: false, error: "unknown_action" }, { status: 404 });
  }
}

async function mintIds(
  db: Awaited<ReturnType<typeof admin>>,
  mints: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(mints)];
  const { data, error } = await db
    .from("tokens")
    .select("id, mint_address")
    .in("mint_address", unique)
    .eq("is_simulated", false);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((row) => [row.mint_address as string, row.id as string]));
}

async function handleGet(action: string, url: URL): Promise<Response> {
  const db = await admin();
  if (action !== "read") return Response.json({ ok: false, error: "unknown_action" }, { status: 404 });

  const resource = url.searchParams.get("resource") ?? "state";
  switch (resource) {
    case "state": {
      const { data } = await db
        .from("collector_state")
        .select("desired_state, runtime_state, last_heartbeat_at")
        .limit(1)
        .maybeSingle();
      return Response.json({ ok: true, state: data ?? null });
    }
    case "settings": {
      const { data } = await db
        .from("bot_settings")
        .select("status, telegram_threshold, critical_threshold, signal_categories, demo_mode")
        .limit(1)
        .maybeSingle();
      return Response.json({ ok: true, settings: data ?? null });
    }
    case "tokens": {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
      const { data, error } = await db
        .from("tokens")
        .select(
          "id, mint_address, symbol, score, status, alert_level, last_alert_at, last_enriched_at, launched_at",
        )
        .eq("is_simulated", false)
        .order("launched_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return Response.json({ ok: true, tokens: data ?? [] });
    }
    case "wallets": {
      const { data, error } = await db
        .from("smart_wallets")
        .select("address, smart_wallet_score, tokens_tracked, early_entries, data_sufficient")
        .eq("is_simulated", false)
        .order("smart_wallet_score", { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return Response.json({ ok: true, wallets: data ?? [] });
    }
    default:
      return Response.json({ ok: false, error: "unknown_resource" }, { status: 400 });
  }
}

export const Route = createFileRoute("/api/public/worker/$action")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const denied = await authenticate(request, params.action);
        if (denied) return denied;
        try {
          return await handleGet(params.action, new URL(request.url));
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown_error";
          log("error", { action: params.action, method: "GET", message });
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
      POST: async ({ request, params }) => {
        const denied = await authenticate(request, params.action);
        if (denied) return denied;
        try {
          const body = await request.json().catch(() => ({}));
          log("request", { action: params.action, method: "POST" });
          return await handlePost(params.action, body);
        } catch (error) {
          if (error instanceof z.ZodError) {
            log("invalid_payload", { action: params.action, issues: error.issues.length });
            return Response.json({ ok: false, error: "invalid_payload", issues: error.issues }, { status: 400 });
          }
          const message = error instanceof Error ? error.message : "unknown_error";
          log("error", { action: params.action, method: "POST", message });
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
