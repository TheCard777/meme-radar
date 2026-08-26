/**
 * Appels RPC Solana en LECTURE SEULE — SERVEUR / WORKER UNIQUEMENT.
 * Aucune signature, aucune clé privée, aucun ordre.
 */

interface RpcResponse<T> {
  result?: T;
  error?: { message?: string };
}

export function hasRpc(): boolean {
  return Boolean(process.env["SOLANA_RPC_URL"]);
}

export async function rpcCall<T>(method: string, params: unknown[]): Promise<T | null> {
  const url = process.env["SOLANA_RPC_URL"];
  if (!url) return null;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as RpcResponse<T>;
    if (payload.error) return null;
    return payload.result ?? null;
  } catch {
    return null;
  }
}

export const SYSTEM_PROGRAM = "11111111111111111111111111111111";

/** Adresses de burn publiquement connues. */
export const BURN_ADDRESSES = new Set<string>([
  "1nc1nerator11111111111111111111111111111111",
  "11111111111111111111111111111111",
]);

/** Programmes/AMM connus dont les comptes ne sont pas des holders réels. */
export const PROTOCOL_OWNERS = new Set<string>([
  // Raydium
  "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
  "routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS",
  // Pump.fun
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
  "39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg",
  // Meteora
  "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
  "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
  // Orca / Whirlpool
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
]);
