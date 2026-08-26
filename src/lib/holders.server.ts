/**
 * Concentration NETTE des holders — SERVEUR / WORKER UNIQUEMENT.
 *
 * Améliore l'ancien top-10 brut : les comptes identifiables comme LP/pool,
 * burn ou comptes protocolaires (détenus par un programme) sont exclus, et la
 * liste des exclusions est conservée pour traçabilité.
 *
 * Toute donnée non résolue reste `null` : rien n'est deviné.
 */

import { BURN_ADDRESSES, PROTOCOL_OWNERS, rpcCall, SYSTEM_PROGRAM } from "./solana-rpc.server";

export interface HolderExclusion {
  account: string;
  owner: string | null;
  reason: "burn" | "protocol" | "program-owned";
  share: number | null;
}

export interface HolderBreakdown {
  /** Part nette des 10 plus gros holders réels, 0-1 ou null. */
  top10Share: number | null;
  /** Part nette des 20 plus gros holders réels, 0-1 ou null. */
  top20Share: number | null;
  /** Part de l'offre détenue par le créateur, 0-1 ou null si non résolu. */
  creatorShare: number | null;
  /** Comptes exclus du calcul (traçabilité). */
  excluded: HolderExclusion[];
  /** Nombre de comptes réellement pris en compte. */
  accountsConsidered: number;
  notes: string[];
}

interface LargestAccount {
  address?: string;
  amount?: string;
}

interface ParsedAccount {
  owner?: string;
  data?: { parsed?: { info?: { owner?: string } } };
}

const EMPTY: HolderBreakdown = {
  top10Share: null,
  top20Share: null,
  creatorShare: null,
  excluded: [],
  accountsConsidered: 0,
  notes: ["Concentration indisponible (RPC absent ou sans réponse)"],
};

export async function fetchHolderBreakdown(
  mint: string,
  options: { creatorAddress?: string | null } = {},
): Promise<HolderBreakdown> {
  const [largestRes, supplyRes] = await Promise.all([
    rpcCall<{ value?: LargestAccount[] }>("getTokenLargestAccounts", [mint]),
    rpcCall<{ value?: { amount?: string } }>("getTokenSupply", [mint]),
  ]);

  const largest = largestRes?.value;
  const total = Number(supplyRes?.value?.amount ?? 0);
  if (!Array.isArray(largest) || largest.length === 0 || !Number.isFinite(total) || total <= 0) {
    return { ...EMPTY, excluded: [], notes: [...EMPTY.notes] };
  }

  const accounts = largest
    .slice(0, 20)
    .map((a) => ({ address: a.address ?? "", amount: Number(a.amount ?? 0) }))
    .filter((a) => a.address && Number.isFinite(a.amount) && a.amount > 0);

  // Propriétaires réels des comptes de tokens (jsonParsed).
  const ownerInfo = await rpcCall<{ value?: Array<ParsedAccount | null> }>("getMultipleAccounts", [
    accounts.map((a) => a.address),
    { encoding: "jsonParsed" },
  ]);
  const owners = accounts.map((_, index) => {
    const parsed = ownerInfo?.value?.[index];
    return parsed?.data?.parsed?.info?.owner ?? null;
  });

  // Un propriétaire détenu par un programme (≠ System Program) est un compte
  // protocolaire (vault de pool, escrow, contrat de lock), pas un holder réel.
  const distinctOwners = [...new Set(owners.filter((o): o is string => Boolean(o)))];
  const ownerAccounts = distinctOwners.length
    ? await rpcCall<{ value?: Array<{ owner?: string } | null> }>("getMultipleAccounts", [
        distinctOwners,
        { encoding: "jsonParsed" },
      ])
    : null;
  const programOwned = new Set<string>();
  distinctOwners.forEach((owner, index) => {
    const info = ownerAccounts?.value?.[index];
    if (info && info.owner && info.owner !== SYSTEM_PROGRAM) programOwned.add(owner);
  });

  const excluded: HolderExclusion[] = [];
  const kept: Array<{ owner: string | null; share: number }> = [];

  accounts.forEach((account, index) => {
    const owner = owners[index] ?? null;
    const share = account.amount / total;
    const isBurn = BURN_ADDRESSES.has(account.address) || (owner ? BURN_ADDRESSES.has(owner) : false);
    const isProtocol = owner ? PROTOCOL_OWNERS.has(owner) : false;
    const isProgramOwned = owner ? programOwned.has(owner) : false;

    if (isBurn) excluded.push({ account: account.address, owner, reason: "burn", share });
    else if (isProtocol) excluded.push({ account: account.address, owner, reason: "protocol", share });
    else if (isProgramOwned)
      excluded.push({ account: account.address, owner, reason: "program-owned", share });
    else kept.push({ owner, share });
  });

  const sorted = kept.sort((a, b) => b.share - a.share);
  const sum = (n: number) => sorted.slice(0, n).reduce((total_, item) => total_ + item.share, 0);

  const notes: string[] = [];
  if (accounts.length < 20) {
    notes.push(`Le RPC n'expose que ${accounts.length} comptes — top 20 partiel.`);
  }
  if (excluded.length > 0) {
    notes.push(`${excluded.length} compte(s) exclu(s) : LP/pool, burn ou compte protocolaire.`);
  }
  notes.push(
    "Seuls les comptes identifiables sont exclus ; un pool non reconnu peut rester compté.",
  );

  let creatorShare: number | null = null;
  if (options.creatorAddress) {
    const creator = options.creatorAddress;
    const matched = kept.filter((k) => k.owner === creator);
    creatorShare = matched.length > 0 ? matched.reduce((t, k) => t + k.share, 0) : null;
    if (creatorShare === null) {
      notes.push("Le créateur n'apparaît pas dans les plus gros comptes — part non résolue.");
    }
  }

  const clamp = (v: number) => Math.max(0, Math.min(1, v));

  return {
    top10Share: sorted.length > 0 ? clamp(sum(10)) : null,
    top20Share: sorted.length > 0 ? clamp(sum(20)) : null,
    creatorShare: creatorShare === null ? null : clamp(creatorShare),
    excluded,
    accountsConsidered: sorted.length,
    notes,
  };
}
