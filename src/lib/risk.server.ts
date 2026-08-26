/**
 * Agrégation du RISQUE par token — SERVEUR / WORKER UNIQUEMENT.
 *
 * Réunit holders nets, créateur, statut LP, retrait de liquidité et
 * coordination, puis délègue le calcul au module pur `risk-scoring.ts`.
 * Aucune donnée n'est inventée : tout ce qui n'est pas mesuré reste `null`.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchHolderBreakdown, type HolderBreakdown } from "./holders.server";
import { resolveCreator } from "./creator.server";
import { assessLpStatus } from "./liquidity.server";
import { computeLiquidityDrop } from "./liquidity";
import { analyzeTokenCoordination, type CoordinationAnalysis } from "./coordination.server";
import { computeRisk, type LpStatus, type RiskResult } from "./risk-scoring";

export interface TokenRiskAssessment {
  risk: RiskResult;
  holders: HolderBreakdown;
  coordination: CoordinationAnalysis;
  creatorAddress: string | null;
  creatorPreviousTokens: number | null;
  lpStatus: LpStatus;
  lpNotes: string[];
  liquidityDropRatio: number | null;
}

async function fetchLiquidityDrop(tokenId: string): Promise<number | null> {
  const { data } = await supabaseAdmin
    .from("token_snapshots")
    .select("captured_at, liquidity_usd")
    .eq("token_id", tokenId)
    .order("captured_at", { ascending: false })
    .limit(30);
  const points = ((data ?? []) as Array<{ captured_at: string; liquidity_usd: number | null }>).map(
    (row) => ({ capturedAt: row.captured_at, liquidityUsd: row.liquidity_usd }),
  );
  return computeLiquidityDrop(points);
}

export async function assessTokenRisk(params: {
  tokenId: string;
  mint: string;
  launchedAt: string | null;
  pairUrl: string | null;
  knownCreator?: string | null;
  knownCreatorPreviousTokens?: number | null;
  checkFunders?: boolean;
}): Promise<TokenRiskAssessment> {
  let creatorAddress = params.knownCreator ?? null;
  let creatorPreviousTokens = params.knownCreatorPreviousTokens ?? null;

  if (!creatorAddress) {
    const creator = await resolveCreator(params.mint, params.tokenId);
    creatorAddress = creator.address;
    creatorPreviousTokens = creator.previousTokens;
  }

  const [holders, lp, liquidityDropRatio, coordination] = await Promise.all([
    fetchHolderBreakdown(params.mint, { creatorAddress }),
    assessLpStatus(params.pairUrl),
    fetchLiquidityDrop(params.tokenId),
    analyzeTokenCoordination(params.tokenId, params.launchedAt, {
      checkFunders: params.checkFunders ?? false,
    }),
  ]);

  const risk = computeRisk({
    holdersTop10Share: holders.top10Share,
    holdersTop20Share: holders.top20Share,
    creatorShare: holders.creatorShare,
    creatorPreviousTokens,
    lpStatus: lp.status,
    liquidityDropRatio,
    coordinationScore: coordination.coordinationScore,
    sniperRatio: coordination.sniperRatio,
  });

  return {
    risk,
    holders,
    coordination,
    creatorAddress,
    creatorPreviousTokens,
    lpStatus: lp.status,
    lpNotes: lp.notes,
    liquidityDropRatio,
  };
}
