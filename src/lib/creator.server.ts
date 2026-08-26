/**
 * Résolution du créateur / deployer — SERVEUR / WORKER UNIQUEMENT.
 *
 * Le deployer est identifié comme le signataire payeur de la plus ancienne
 * transaction observable du mint. Si le RPC ne remonte pas assez loin dans
 * l'historique, le créateur reste `null` (jamais deviné).
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { rpcCall } from "./solana-rpc.server";

export interface CreatorInfo {
  address: string | null;
  /** Tokens précédemment détectés avec le même deployer (null = inconnu). */
  previousTokens: number | null;
  /** Ventes du créateur sur le token courant — non mesurable en V1. */
  soldRatio: null;
  notes: string[];
}

export async function resolveCreator(mint: string, tokenId?: string): Promise<CreatorInfo> {
  const notes: string[] = [];
  const signatures = await rpcCall<Array<{ signature: string }>>("getSignaturesForAddress", [
    mint,
    { limit: 1000 },
  ]);

  if (!signatures || signatures.length === 0) {
    return {
      address: null,
      previousTokens: null,
      soldRatio: null,
      notes: ["Historique du mint indisponible via le RPC — créateur non résolu."],
    };
  }

  const oldest = signatures[signatures.length - 1]!.signature;
  const tx = await rpcCall<{
    transaction?: { message?: { accountKeys?: Array<{ pubkey?: string; signer?: boolean }> } };
  }>("getTransaction", [oldest, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]);

  const keys = tx?.transaction?.message?.accountKeys ?? [];
  const address = keys.find((k) => k.signer && k.pubkey)?.pubkey ?? null;

  if (!address) {
    return {
      address: null,
      previousTokens: null,
      soldRatio: null,
      notes: ["Signataire de création non identifiable sur la transaction la plus ancienne."],
    };
  }

  if (signatures.length >= 1000) {
    notes.push(
      "Historique tronqué par le RPC (1000 signatures) — le deployer peut être approximatif.",
    );
  }

  // Déploiements antérieurs : uniquement ceux réellement observés par le radar.
  let previousTokens: number | null = null;
  const query = supabaseAdmin
    .from("tokens")
    .select("id", { count: "exact", head: true })
    .eq("is_simulated", false)
    .eq("creator_address", address);
  const { count, error } = tokenId ? await query.neq("id", tokenId) : await query;
  if (!error) previousTokens = count ?? 0;
  notes.push("Déploiements antérieurs comptés uniquement parmi les tokens déjà détectés.");
  notes.push("Ventes du créateur : non mesurables de façon fiable en V1 — inconnues.");

  return { address, previousTokens, soldRatio: null, notes };
}
