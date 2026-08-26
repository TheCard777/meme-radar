/**
 * Données de marché — SERVEUR / WORKER UNIQUEMENT.
 *
 * Source : API publique DEX Screener (lecture seule, sans clé). Elle agrège
 * les pools Solana (Pump.fun, Raydium, Meteora…) et renvoie liquidité, volume,
 * transactions et market cap. Aucun ordre n'est jamais transmis.
 */

export interface MarketMetrics {
  mintAddress: string;
  symbol: string | null;
  name: string | null;
  priceUsd: number;
  marketCap: number;
  liquidityUsd: number;
  volume24h: number;
  volume1h: number;
  buyers1h: number;
  priceChange1h: number;
  dex: string;
}

interface DexPair {
  chainId?: string;
  dexId?: string;
  baseToken?: { address?: string; symbol?: string; name?: string };
  priceUsd?: string;
  marketCap?: number;
  fdv?: number;
  liquidity?: { usd?: number };
  volume?: { h24?: number; h1?: number };
  txns?: { h1?: { buys?: number } };
  priceChange?: { h1?: number };
}

const ENDPOINT = "https://api.dexscreener.com/latest/dex/tokens/";
/** DEX Screener accepte jusqu'à 30 adresses par requête. */
export const MARKET_BATCH_SIZE = 30;

function num(value: unknown): number {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Récupère les métriques de marché pour un lot de mints.
 * Les mints sans pool (token trop jeune) sont simplement absents du résultat.
 */
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
    if (existing && existing.liquidityUsd >= liquidityUsd) continue;

    result.set(address, {
      mintAddress: address,
      symbol: pair.baseToken?.symbol ?? null,
      name: pair.baseToken?.name ?? null,
      priceUsd: num(pair.priceUsd),
      marketCap: num(pair.marketCap ?? pair.fdv),
      liquidityUsd,
      volume24h: num(pair.volume?.h24),
      volume1h: num(pair.volume?.h1),
      buyers1h: num(pair.txns?.h1?.buys),
      priceChange1h: num(pair.priceChange?.h1),
      dex: pair.dexId ?? "unknown",
    });
  }

  return result;
}
