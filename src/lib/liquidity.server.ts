/**
 * Statut de la liquidité (LP) — SERVEUR / WORKER UNIQUEMENT.
 *
 * Objectif : ne JAMAIS prétendre qu'une LP est verrouillée si ce n'est pas
 * vérifiable. Le statut par défaut est `unknown`.
 *
 * Cas réellement vérifiable en V1 : pool Raydium AMM v4 identifié par
 * DEX Screener. On lit le LP mint dans le compte du pool (layout public,
 * offset 296) puis :
 *  - supply LP = 0            -> `burned`
 *  - plus gros détenteur LP détenu par un programme (contrat de lock) -> `locked`
 *  - sinon                    -> `unlocked`
 * Tout autre AMM (Pump.fun, Meteora, Orca…) reste `unknown`.
 */

import { rpcCall, SYSTEM_PROGRAM } from "./solana-rpc.server";
import type { LpStatus } from "./risk-scoring";

const RAYDIUM_AMM_V4 = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const RAYDIUM_STATE_SIZE = 752;
const LP_MINT_OFFSET = 296;

export interface LpAssessment {
  status: LpStatus;
  notes: string[];
}

/** Extrait l'adresse du pool depuis une URL DEX Screener, sinon null. */
export function pairAddressFromUrl(pairUrl: string | null | undefined): string | null {
  if (!pairUrl) return null;
  const segment = pairUrl.split("?")[0]?.split("/").filter(Boolean).pop() ?? "";
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(segment) ? segment : null;
}

function base58Encode(bytes: Uint8Array): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      carry += digits[i]! << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let leading = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    leading += "1";
  }
  return leading + digits.reverse().map((d) => ALPHABET[d]).join("");
}

export async function assessLpStatus(pairUrl: string | null): Promise<LpAssessment> {
  const pair = pairAddressFromUrl(pairUrl);
  if (!pair) {
    return { status: "unknown", notes: ["Pool non identifié — statut LP non vérifiable."] };
  }

  const account = await rpcCall<{
    value?: { owner?: string; data?: [string, string] } | null;
  }>("getAccountInfo", [pair, { encoding: "base64" }]);

  const value = account?.value;
  if (!value?.data || value.owner !== RAYDIUM_AMM_V4) {
    return {
      status: "unknown",
      notes: [
        "AMM non supporté pour la vérification LP (seul Raydium AMM v4 est vérifiable en V1) — statut inconnu.",
      ],
    };
  }

  let raw: Uint8Array;
  try {
    const binary = atob(value.data[0]);
    raw = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return { status: "unknown", notes: ["Compte du pool illisible — statut LP inconnu."] };
  }
  if (raw.length < RAYDIUM_STATE_SIZE) {
    return { status: "unknown", notes: ["Layout de pool inattendu — statut LP inconnu."] };
  }

  const lpMint = base58Encode(raw.slice(LP_MINT_OFFSET, LP_MINT_OFFSET + 32));

  const supply = await rpcCall<{ value?: { amount?: string } }>("getTokenSupply", [lpMint]);
  const total = Number(supply?.value?.amount ?? Number.NaN);
  if (!Number.isFinite(total)) {
    return { status: "unknown", notes: ["Supply LP illisible — statut LP inconnu."] };
  }
  if (total === 0) {
    return { status: "burned", notes: [`LP mint ${lpMint} : supply nulle (LP brûlée).`] };
  }

  const largest = await rpcCall<{ value?: Array<{ address?: string; amount?: string }> }>(
    "getTokenLargestAccounts",
    [lpMint],
  );
  const top = largest?.value?.[0];
  if (!top?.address) {
    return { status: "unknown", notes: ["Détenteurs LP inconnus — statut LP inconnu."] };
  }

  const holder = await rpcCall<{
    value?: { data?: { parsed?: { info?: { owner?: string } } } } | null;
  }>("getAccountInfo", [top.address, { encoding: "jsonParsed" }]);
  const owner = holder?.value?.data?.parsed?.info?.owner ?? null;
  if (!owner) {
    return { status: "unknown", notes: ["Propriétaire LP non résolu — statut LP inconnu."] };
  }

  const ownerAccount = await rpcCall<{ value?: { owner?: string } | null }>("getAccountInfo", [
    owner,
    { encoding: "jsonParsed" },
  ]);
  const ownerProgram = ownerAccount?.value?.owner ?? null;
  if (ownerProgram && ownerProgram !== SYSTEM_PROGRAM) {
    return {
      status: "locked",
      notes: [`Principal détenteur LP contrôlé par un programme (${ownerProgram}).`],
    };
  }

  return {
    status: "unlocked",
    notes: ["LP détenue par un compte utilisateur : retrait possible à tout moment."],
  };
}
