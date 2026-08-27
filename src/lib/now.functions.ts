import { createServerFn } from "@tanstack/react-start";

type NowInput = { mint: string };

/**
 * ⚡ NOW — envoi ponctuel d'un snapshot Telegram pour un token.
 * Ne crée aucun suivi et ne modifie aucune préférence d'alerte.
 */
export const sendNowSnapshotServer = createServerFn({ method: "POST" })
  .inputValidator((input: NowInput) => {
    if (!input || typeof input.mint !== "string" || input.mint.length < 32) {
      throw new Error("Mint invalide");
    }
    return { mint: input.mint };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendRawTelegramMessage } = await import("./telegram.server");
    const { buildNowSnapshotMessage } = await import("./now-snapshot");

    const { data: token, error } = await supabaseAdmin
      .from("tokens")
      .select("*")
      .eq("mint_address", data.mint)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!token) throw new Error("Token introuvable");

    const row = token as unknown as Record<string, unknown>;
    const metrics = (row["market_metrics"] ?? null) as Record<string, unknown> | null;
    const num = (value: unknown): number | null =>
      typeof value === "number" && Number.isFinite(value) ? value : null;

    const factors = Array.isArray(row["score_factors"])
      ? (row["score_factors"] as Array<Record<string, unknown>>)
          .filter((f) => typeof f["label"] === "string")
          .map((f) => ({
            label: String(f["label"]),
            detail: typeof f["detail"] === "string" ? f["detail"] : undefined,
          }))
      : [];

    const message = buildNowSnapshotMessage({
      symbol: String(row["symbol"] ?? "?"),
      name: typeof row["name"] === "string" ? row["name"] : null,
      mint: data.mint,
      launchedAt: typeof row["launched_at"] === "string" ? row["launched_at"] : null,
      marketCap: num(row["market_cap"]) ?? num(metrics?.["marketCap"]),
      liquidityUsd: num(row["liquidity_usd"]) ?? num(metrics?.["liquidityUsd"]),
      volume24h: num(row["volume_24h"]) ?? num(metrics?.["volume24h"]),
      volume1h: num(row["volume_1h"]) ?? num(metrics?.["volume1h"]),
      buyers: num(row["new_buyers"]),
      buyers1h: num(metrics?.["buyers1h"]),
      smartWallets: num(row["smart_wallet_count"]),
      score: num(row["score"]),
      scoreConfidence: num(row["score_confidence"]),
      riskScore: num(row["risk_score"]),
      riskLevel: typeof row["risk_level"] === "string" ? row["risk_level"] : null,
      lpStatus: typeof row["lp_status"] === "string" ? row["lp_status"] : null,
      holdersTop10Share: num(row["holders_top10_share"]),
      topFactors: factors,
      pairUrl: typeof metrics?.["pairUrl"] === "string" ? (metrics["pairUrl"] as string) : null,
      isSimulated: Boolean(row["is_simulated"]),
    });

    const sent = await sendRawTelegramMessage(message);
    if (!sent.sent) throw new Error(sent.reason ?? "Envoi Telegram impossible");
    return { ok: true as const };
  });
