import { createServerFn } from "@tanstack/react-start";
import type { MarketView } from "./paper-strategy";

type Input = { openMints: string[] };

/**
 * Lecture seule pour la simulation (paper trading) : tokens réels récents +
 * métriques de marché publiques DEX Screener. Aucune signature, aucun
 * ordre, aucune clé, aucune écriture en base.
 */
export const getPaperMarketViews = createServerFn({ method: "POST" })
  .inputValidator((input: Input) => {
    const mints = Array.isArray(input?.openMints) ? input.openMints : [];
    return {
      openMints: mints.filter((m) => typeof m === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,48}$/.test(m)).slice(0, 20),
    };
  })
  .handler(async ({ data }): Promise<{ at: string; views: MarketView[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchMarketMetrics } = await import("./market.server");
    const { PAPER_STRATEGY_V1: cfg, isPostMigrationDex } = await import("./paper-strategy");
    const now = Date.now();
    // Fenêtre et score couvrant les deux règles d'entrée (standard et profil signal).
    const since = new Date(now - cfg.maxAgeMinutes * 60_000).toISOString();
    const minScore = Math.min(cfg.minOpportunityScore, cfg.signalProfile.minScore);
    const cols =
      "id, mint_address, symbol, launched_at, score, score_confidence, data_sufficient, risk_score, risk_confidence, new_buyers, holders_top10_share";

    const recent = await supabaseAdmin
      .from("tokens")
      .select(cols)
      .eq("is_simulated", false)
      .gte("launched_at", since)
      .gte("score", minScore)
      .order("score", { ascending: false })
      .limit(30);
    if (recent.error) throw new Error(recent.error.message);
    const rows = [...(recent.data ?? [])];
    if (data.openMints.length) {
      const open = await supabaseAdmin
        .from("tokens")
        .select(cols)
        .eq("is_simulated", false)
        .in("mint_address", data.openMints);
      if (open.error) throw new Error(open.error.message);
      for (const r of open.data ?? []) if (!rows.some((x) => x.id === r.id)) rows.push(r);
    }

    const mints = rows.map((r) => r.mint_address);
    const market = new Map<string, Awaited<ReturnType<typeof fetchMarketMetrics>> extends Map<string, infer V> ? V : never>();
    for (let i = 0; i < mints.length; i += 30) {
      const m = await fetchMarketMetrics(mints.slice(i, i + 30));
      m.forEach((v, k) => market.set(k, v));
    }
    const views: MarketView[] = rows.map((r) => {
      const m = market.get(r.mint_address);
      const launched = Date.parse(r.launched_at);
      return {
        tokenId: r.id,
        mint: r.mint_address,
        symbol: m?.symbol ?? r.symbol,
        ageMinutes: Number.isFinite(launched) ? (now - launched) / 60_000 : null,
        dex: m?.dex ?? null,
        postMigrationPool: isPostMigrationDex(m?.dex ?? null),
        opportunityScore: r.data_sufficient ? r.score : null,
        opportunityConfidence: r.score_confidence ?? null,
        riskScore: r.risk_score ?? null,
        riskConfidence: r.risk_confidence ?? null,
        liquidityUsd: m?.liquidityUsd ?? null,
        volume1h: m?.volume1h ?? null,
        volume5m: m?.volume5m ?? null,
        priceUsd: m?.priceUsd ?? null,
        newBuyers1h: r.new_buyers ?? null,
        top10Share: r.holders_top10_share ?? null,
      };
    });
    return { at: new Date(now).toISOString(), views };
  });
