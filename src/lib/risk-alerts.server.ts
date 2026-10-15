/** Envoi/historique des alertes de risque — SERVEUR / WORKER UNIQUEMENT. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { RiskResult } from "./risk-scoring";
import { sendRawTelegramMessage } from "./telegram.server";
import {
  buildRiskAlertMessage,
  classifyRiskAlert,
  shouldSendRiskAlert,
  type RiskAlertConfig,
  type RiskAlertLevel,
} from "./risk-alerts";

export async function processRiskAlert(params: {
  tokenId: string;
  mint: string;
  symbol: string;
  name: string;
  risk: RiskResult | null;
  liquidityDropRatio: number | null;
  launchedAt: string | null;
  pairUrl: string | null;
  config: RiskAlertConfig;
  botActive: boolean;
}): Promise<{ level: RiskAlertLevel | null; created: boolean; telegramSent: boolean; error: string | null }> {
  const level = classifyRiskAlert(params.risk, params.liquidityDropRatio, params.config);
  if (!level || !params.risk) return { level, created: false, telegramSent: false, error: null };

  const { data: prev } = await supabaseAdmin
    .from("risk_alerts")
    .select("level, created_at")
    .eq("token_mint", params.mint)
    .order("created_at", { ascending: false })
    .limit(1);
  const last = prev?.[0] as { level: RiskAlertLevel; created_at: string } | undefined;
  if (!shouldSendRiskAlert(level, last ? { level: last.level, createdAt: last.created_at } : null, params.config)) {
    return { level, created: false, telegramSent: false, error: null };
  }

  const message = buildRiskAlertMessage({ ...params, level, risk: params.risk });
  let sent = false;
  let telegramError: string | null = params.botActive ? null : "Bot en pause — non envoyé";
  if (params.botActive) {
    try {
      const r = await sendRawTelegramMessage(message, "risk", { copyMint: params.mint });
      sent = r.sent;
      if (!r.sent) telegramError = r.reason ?? "envoi refusé";
    } catch (e) {
      telegramError = e instanceof Error ? e.message : String(e);
    }
  }

  const { error } = await supabaseAdmin.from("risk_alerts").insert({
    token_id: params.tokenId,
    token_mint: params.mint,
    token_symbol: params.symbol,
    level,
    risk_score: params.risk.score,
    confidence: params.risk.confidence,
    factors: params.risk.factors as unknown as never,
    liquidity_drop_ratio: params.liquidityDropRatio,
    telegram_sent: sent,
    telegram_error: telegramError,
    sent_at: sent ? new Date().toISOString() : null,
  });
  return { level, created: !error, telegramSent: sent, error: error?.message ?? (sent ? null : telegramError) };
}
