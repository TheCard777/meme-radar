/**
 * Données de marché et on-chain — SERVEUR / WORKER UNIQUEMENT.
 *
 * Sources :
 * - API publique DEX Screener (lecture seule, sans clé) : prix, market cap,
 *   liquidité, volume, transactions.
 * - RPC Solana déjà configuré (SOLANA_RPC_URL) en lecture seule : concentration
 *   des holders via getTokenLargestAccounts + getTokenSupply.
 *
 * Toute métrique introuvable vaut `null` : elle n'est jamais devinée.
 * Aucun ordre n'est jamais transmis, aucune clé privée n'est utilisée.
 */

export interface MarketMetrics {
  mintAddress: string;
  symbol: string | null;
  name: string | null;
  priceUsd: number | null;
  marketCap: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  volume1h: number | null;
  /** Volume des 5 dernières minutes (null si non fourni par la source). */
  volume5m: number | null;
  buyers1h: number | null;
  priceChange1h: number | null;
  dex: string | null;
  pairUrl: string | null;
}

interface DexPair {
  chainId?: string;
  dexId?: string;
  url?: string;
  baseToken?: { address?: string; symbol?: string; name?: string };
  priceUsd?: string;
  marketCap?: number;
  fdv?: number;
  liquidity?: { usd?: number };
  volume?: { h24?: number; h1?: number; m5?: number };
  txns?: { h1?: { buys?: number } };
  priceChange?: { h1?: number };
}


const ENDPOINT = "https://api.dexscreener.com/latest/dex/tokens/";
/** DEX Screener accepte jusqu'à 30 adresses par requête. */
export const MARKET_BATCH_SIZE = 30;

/** Convertit en nombre fini, sinon null (jamais 0 par défaut). */
function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function fetchMarketMetrics(
  mints: string[],
): Promise<Map<string, MarketMetrics>> {
  const result = new Map<string, MarketMetrics>();
  if (mints.length === 0) return result;

  const response = await fetch(`${ENDPOINT}${mints.slice(0, MARKET_BATCH_SIZE).join(",")}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`DEX Screener ${response.status}: ${await response.text()}`);
  }
  const payload = (await response.json()) as { pairs?: DexPair[] | null };

  for (const pair of payload.pairs ?? []) {
    const address = pair.baseToken?.address;
    if (!address || (pair.chainId && pair.chainId !== "solana")) continue;

    const liquidityUsd = num(pair.liquidity?.usd);
    const existing = result.get(address);
    // On garde le pool le plus liquide par token.
    if (existing && (existing.liquidityUsd ?? 0) >= (liquidityUsd ?? 0)) continue;

    result.set(address, {
      mintAddress: address,
      symbol: pair.baseToken?.symbol ?? null,
      name: pair.baseToken?.name ?? null,
      priceUsd: num(pair.priceUsd),
      marketCap: num(pair.marketCap) ?? num(pair.fdv),
      liquidityUsd,
      volume24h: num(pair.volume?.h24),
      volume1h: num(pair.volume?.h1),
      buyers1h: num(pair.txns?.h1?.buys),
      priceChange1h: num(pair.priceChange?.h1),
      dex: pair.dexId ?? null,
      pairUrl: pair.url ?? `https://dexscreener.com/solana/${address}`,
    });
  }

  return result;
}

/**
 * Part de l'offre détenue par les 10 plus gros comptes (0-1), ou null si le RPC
 * n'est pas configuré ou ne répond pas. Lecture seule.
 */
export async function fetchHolderConcentration(mint: string): Promise<number | null> {
  const rpcUrl = process.env["SOLANA_RPC_URL"];
  if (!rpcUrl) return null;

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint] },
        { jsonrpc: "2.0", id: 2, method: "getTokenSupply", params: [mint] },
      ]),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as Array<{
      id: number;
      result?: {
        value?: unknown;
      };
    }>;

    const largest = payload.find((p) => p.id === 1)?.result?.value as
      | Array<{ amount?: string }>
      | undefined;
    const supply = payload.find((p) => p.id === 2)?.result?.value as
      | { amount?: string }
      | undefined;

    const total = Number(supply?.amount ?? 0);
    if (!Array.isArray(largest) || !Number.isFinite(total) || total <= 0) return null;

    const top = largest
      .slice(0, 10)
      .reduce((sum, account) => sum + Number(account.amount ?? 0), 0);
    if (!Number.isFinite(top) || top <= 0) return null;

    return Math.max(0, Math.min(1, top / total));
  } catch {
    return null;
  }
}
