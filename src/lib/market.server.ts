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

/** Cache mémoire par mint (30 s) + pause globale après un 429 / 1015. */
const CACHE_TTL_MS = 30_000;
const MIN_COOLDOWN_MS = 60_000;
const cache = new Map<string, { at: number; value: MarketMetrics | null }>();
let cooldownUntil = 0;

/** Secondes restantes avant de pouvoir réinterroger DEX Screener (0 = libre). */
export function dexScreenerCooldownSeconds(): number {
  return Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
}

export async function fetchMarketMetrics(
  mints: string[],
): Promise<Map<string, MarketMetrics>> {
  const result = new Map<string, MarketMetrics>();
  if (mints.length === 0) return result;

  const now = Date.now();
  const wanted = mints.slice(0, MARKET_BATCH_SIZE);
  const missing = wanted.filter((m) => {
    const c = cache.get(m);
    if (c && now - c.at < CACHE_TTL_MS) {
      if (c.value) result.set(m, c.value);
      return false;
    }
    return true;
  });
  if (missing.length === 0) return result;
  if (now < cooldownUntil) {
    throw new Error(`DEX Screener limite les requêtes (429) — réessayez dans ${dexScreenerCooldownSeconds()} s`);
  }

  const { retryDelayMs } = await import("./enrich-queue");
  const url = `${ENDPOINT}${missing.join(",")}`;
  const MAX_ATTEMPTS = 2;
  let response: Response | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      response = await fetch(url, { headers: { accept: "application/json" } });
    } catch (networkError) {
      if (attempt === MAX_ATTEMPTS - 1) throw networkError;
      await new Promise((r) => setTimeout(r, retryDelayMs(null, attempt)));
      continue;
    }
    // 429 / 1015 : on ne réessaie pas, on met tout en pause.
    if (response.status === 429 || response.status === 403) {
      const ra = Number.parseFloat(response.headers.get("retry-after") ?? "");
      cooldownUntil = Date.now() + Math.max(MIN_COOLDOWN_MS, Number.isFinite(ra) ? ra * 1000 : 0);
      throw new Error(`DEX Screener limite les requêtes (429) — réessayez dans ${dexScreenerCooldownSeconds()} s`);
    }
    if (response.ok || response.status < 500 || attempt === MAX_ATTEMPTS - 1) break;
    await new Promise((r) => setTimeout(r, retryDelayMs(response!.headers.get("retry-after"), attempt)));
  }
  if (!response || !response.ok) {
    throw new Error(
      `DEX Screener ${response?.status ?? "réseau"}: ${response ? (await response.text()).slice(0, 200) : ""}`,
    );
  }
  const payload = (await response.json()) as { pairs?: DexPair[] | null };
  const fetchedAt = Date.now();
  for (const m of missing) cache.set(m, { at: fetchedAt, value: null });
  if (cache.size > 2000) for (const [k, v] of cache) if (fetchedAt - v.at > CACHE_TTL_MS) cache.delete(k);

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
      volume5m: num(pair.volume?.m5),

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
