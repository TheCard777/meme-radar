/**
 * Suivi individuel des tokens — SERVEUR / WORKER UNIQUEMENT.
 *
 * Branché sur le cycle d'enrichissement existant : aucun second WebSocket,
 * aucune surveillance Solana supplémentaire. Les alertes personnalisées ne
 * partent que pour les tokens dont la cloche est active (`enabled = true`).
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendRawTelegramMessage } from "./telegram.server";
import {
  buildTrackedAlertMessage,
  detectTrackedEvents,
  parseMetrics,
  shouldSendEvent,
  type MomentumState,
  type TrackedMetrics,
} from "./token-tracking";

export interface TrackedTokenRecord {
  id: string;
  token_id: string | null;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  enabled: boolean;
  last_state: string;
  last_metrics: unknown;
}

/** Tokens actuellement suivis (cloche active), indexés par mint. */
export async function loadEnabledTrackedTokens(): Promise<Map<string, TrackedTokenRecord>> {
  const map = new Map<string, TrackedTokenRecord>();
  const { data, error } = await supabaseAdmin
    .from("tracked_tokens")
    .select("id, token_id, token_mint, token_symbol, token_name, enabled, last_state, last_metrics")
    .eq("enabled", true);
  if (error) return map;
  for (const row of (data ?? []) as unknown as TrackedTokenRecord[]) {
    map.set(row.token_mint, row);
  }
  return map;
}

export interface TrackedEvaluationOutcome {
  events: number;
  telegramSent: number;
  error?: string;
}

/**
 * Évalue un token suivi avec les métriques réelles du cycle courant.
 * N'émet une alerte que pour un changement matériel ou un changement d'état,
 * avec déduplication par (token + type d'événement + état + fenêtre).
 */
export async function evaluateTrackedToken(params: {
  tracked: TrackedTokenRecord;
  tokenId: string;
  mint: string;
  symbol: string;
  name: string | null;
  current: TrackedMetrics;
  pairUrl: string | null;
  sendTelegram: boolean;
}): Promise<TrackedEvaluationOutcome> {
  const { tracked, current } = params;
  const outcome: TrackedEvaluationOutcome = { events: 0, telegramSent: 0 };

  // Sécurité : jamais d'alerte personnalisée si la cloche est désactivée.
  if (!tracked.enabled) return outcome;

  const previous = parseMetrics(tracked.last_metrics);
  const { events, state } = detectTrackedEvents({
    current,
    previous,
    previousState: tracked.last_state,
  });

  const persistState = async () => {
    await supabaseAdmin
      .from("tracked_tokens")
      .update({
        last_state: state,
        last_metrics: current as unknown as never,
        last_evaluated_at: new Date().toISOString(),
        token_id: params.tokenId,
        token_symbol: params.symbol,
        token_name: params.name,
      })
      .eq("id", tracked.id);
  };

  if (events.length === 0) {
    await persistState();
    return outcome;
  }

  // Anti-spam : dernier envoi connu par type d'événement.
  const { data: history } = await supabaseAdmin
    .from("tracked_token_alerts")
    .select("event_type, event_state, created_at")
    .eq("token_mint", params.mint)
    .order("created_at", { ascending: false })
    .limit(30);

  const lastByType = new Map<string, { event_state: string; created_at: string }>();
  for (const row of (history ?? []) as Array<{
    event_type: string;
    event_state: string;
    created_at: string;
  }>) {
    if (!lastByType.has(row.event_type)) {
      lastByType.set(row.event_type, { event_state: row.event_state, created_at: row.created_at });
    }
  }

  const sendable = events.filter((event) =>
    shouldSendEvent(event, lastByType.get(event.type) ?? null),
  );

  if (sendable.length === 0) {
    await persistState();
    return outcome;
  }

  const message = buildTrackedAlertMessage({
    symbol: params.symbol,
    name: params.name,
    mint: params.mint,
    state: state as MomentumState,
    events: sendable,
    current,
    pairUrl: params.pairUrl,
  });

  let telegramSent = false;
  let telegramError: string | null = null;
  if (params.sendTelegram) {
    const sent = await sendRawTelegramMessage(message);
    telegramSent = sent.sent;
    telegramError = sent.sent ? null : (sent.reason ?? "Envoi Telegram impossible");
  } else {
    telegramError = "Bot en pause — alerte enregistrée sans envoi Telegram.";
  }

  const rows = sendable.map((event) => ({
    tracked_token_id: tracked.id,
    token_id: params.tokenId,
    token_mint: params.mint,
    token_symbol: params.symbol,
    event_type: event.type,
    event_state: event.state,
    severity: event.severity,
    message: `${event.label} — ${event.detail}`,
    details: { label: event.label, detail: event.detail } as unknown as never,
    telegram_sent: telegramSent,
    telegram_error: telegramError,
  }));

  const { error: insertError } = await supabaseAdmin.from("tracked_token_alerts").insert(rows);
  if (insertError) outcome.error = insertError.message;

  outcome.events = sendable.length;
  outcome.telegramSent = telegramSent ? 1 : 0;

  await persistState();
  return outcome;
}
