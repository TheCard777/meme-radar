/**
 * Collecte des données de coordination — SERVEUR / WORKER UNIQUEMENT.
 * Réutilise `wallet_token_entries` (déjà alimenté par le pipeline wallets) et
 * quelques lectures RPC plafonnées pour identifier un éventuel financeur SOL
 * commun. Aucune écriture on-chain, aucune clé privée.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { rpcCall } from "./solana-rpc.server";
import {
  computeSniperRatio,
  detectCoordination,
  type CoordinationEntry,
  type CoordinationFlags,
} from "./coordination";

/** Nombre maximal de wallets dont on vérifie le financeur (coût RPC). */
export const MAX_FUNDER_LOOKUPS = 8;

/** Premier signataire payeur de la plus ancienne transaction du wallet. */
export async function resolveFunder(address: string): Promise<string | null> {
  const signatures = await rpcCall<Array<{ signature: string }>>("getSignaturesForAddress", [
    address,
    { limit: 1000 },
  ]);
  const oldest = signatures?.[signatures.length - 1]?.signature;
  if (!oldest) return null;
  const tx = await rpcCall<{
    transaction?: { message?: { accountKeys?: Array<{ pubkey?: string; signer?: boolean }> } };
  }>("getTransaction", [oldest, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]);
  const payer = tx?.transaction?.message?.accountKeys?.find((k) => k.signer && k.pubkey)?.pubkey;
  return payer && payer !== address ? payer : null;
}

export interface CoordinationAnalysis extends CoordinationFlags {
  sniperRatio: number | null;
}

export async function analyzeTokenCoordination(
  tokenId: string,
  launchedAt: string | null,
  options: { checkFunders?: boolean } = {},
): Promise<CoordinationAnalysis> {
  const { data } = await supabaseAdmin
    .from("wallet_token_entries")
    .select("wallet_address, entry_rank, block_time")
    .eq("token_id", tokenId)
    .order("entry_rank", { ascending: true })
    .limit(100);

  const entries: CoordinationEntry[] = (
    (data ?? []) as Array<{ wallet_address: string; entry_rank: number; block_time: string | null }>
  ).map((row) => ({
    address: row.wallet_address,
    rank: row.entry_rank,
    blockTime: row.block_time,
  }));

  if (options.checkFunders && process.env["SOLANA_RPC_URL"]) {
    const targets = entries.slice(0, MAX_FUNDER_LOOKUPS);
    for (const entry of targets) {
      entry.funder = await resolveFunder(entry.address);
    }
  }

  const flags = detectCoordination(entries);
  return { ...flags, sniperRatio: computeSniperRatio(entries, launchedAt) };
}
