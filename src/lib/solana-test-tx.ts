/**
 * Transactions de test pour le contrôle de signature Turnkey — module pur.
 * Virement System Program de 0 lamport au format legacy (1 signature vide +
 * message), prêt à être signé. Ces transactions ne sont jamais envoyées.
 */

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Adresse publique sans clé privée connue : cible de la sonde « virement externe ». */
export const INCINERATOR = "1nc1nerator11111111111111111111111111111111";

export function b58decode(str: string): Uint8Array {
  let n = 0n;
  for (const ch of str) {
    const i = B58.indexOf(ch);
    if (i < 0) throw new Error("Adresse base58 invalide");
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const ch of str) {
    if (ch !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

export const toB64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));

/** Virement de 0 lamport `from` → `to` (identiques autorisés), non signé. */
export function zeroTransferTx(from: string, to: string, blockhash: string): Uint8Array {
  const payer = b58decode(from);
  const dest = b58decode(to);
  const hash = b58decode(blockhash);
  if (payer.length !== 32 || dest.length !== 32) throw new Error("Adresse Solana invalide");
  if (hash.length !== 32) throw new Error("Blockhash invalide");
  const self = from === to;
  const system = new Uint8Array(32);
  const keys = self ? [payer, system] : [payer, dest, system];
  const data = new Uint8Array(12);
  data[0] = 2; // SystemInstruction::Transfer, montant 0
  // prettier-ignore
  const msg = Uint8Array.from([
    // En-tête : 1 signataire, 0 signé en lecture seule, 1 non signé en lecture seule (System).
    1, 0, 1,
    keys.length, ...keys.flatMap((k) => Array.from(k)),
    ...hash,
    // 1 instruction : programme System, comptes [payeur, destinataire], données.
    1, keys.length - 1, 2, 0, self ? 0 : 1, data.length, ...data,
  ]);
  return Uint8Array.from([1, ...new Uint8Array(64), ...msg]);
}
