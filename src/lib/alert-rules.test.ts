import { describe, expect, it } from "vitest";
import {
  EARLY_OPPORTUNITY_DEFAULTS,
  buildEarlyOpportunityMessage,
  computeAcceleration,
  matchesEarlyOpportunity,
  normalizeLiquidityUsd,
  readEarlyOpportunityConfig,
  type EarlyOpportunityCandidate,
} from "./early-opportunity.server";
import { matchesSmartWalletEntry } from "./smart-wallet-alerts.server";

const config = readEarlyOpportunityConfig(null);

/** Candidat type : Pump.fun pré-migration (liquidité DEX = 0, donc non mesurée). */
function candidate(overrides: Partial<EarlyOpportunityCandidate> = {}): EarlyOpportunityCandidate {
  return {
    tokenId: "t1",
    mint: "Mint111",
    symbol: "PABLO",
    name: "Pablo",
    score: 49,
    confidence: 0.8,
    buyers: 60,
    liquidityUsd: 0,
    marketCap: 7_800,
    volume24h: 12_000,
    volume1h: 5_000,
    // 5 min à 1,5x le rythme horaire : (volume5m * 12) / volume1h = 1.5
    volume5m: (5_000 * 1.5) / 12,
    ageMinutes: 14,
    pairUrl: null,
    ...overrides,
  };
}

describe("configuration Early Opportunity recalibrée", () => {
  it("utilise les nouveaux seuils par défaut", () => {
    expect(config).toEqual({
      enabled: true,
      minBuyers: 60,
      maxBuyers: 150,
      maxAgeMinutes: 120,
      minLiquidityUsd: 0,
      minVolume1hUsd: 5_000,
      accelerationFactor: 1.5,
      maxVolumeLiquidityRatio: 15,
      solidMinStrength: 80,
    });
    expect(EARLY_OPPORTUNITY_DEFAULTS.maxBuyers).toBe(150);
  });
});

describe("normalizeLiquidityUsd", () => {
  it("traite le 0 de DEX Screener comme non mesuré", () => {
    expect(normalizeLiquidityUsd(0)).toBeNull();
    expect(normalizeLiquidityUsd(null)).toBeNull();
    expect(normalizeLiquidityUsd(5_952.58)).toBe(5_952.58);
  });
});

describe("matchesEarlyOpportunity", () => {
  it("accepte 60 acheteurs / 5 000 $ de volume 1h / accélération 1,5x", () => {
    expect(computeAcceleration(candidate())).toBeCloseTo(1.5, 5);
    expect(matchesEarlyOpportunity(candidate(), config)).toBe(true);
  });

  it("accepte un Pump.fun pré-migration malgré une liquidité DEX à 0", () => {
    expect(matchesEarlyOpportunity(candidate({ liquidityUsd: 0 }), config)).toBe(true);
    const message = buildEarlyOpportunityMessage(candidate({ liquidityUsd: 0 }), config);
    expect(message).toContain("Liquidité : non mesurée");
    expect(message).not.toContain("Liquidité : $0");
  });

  it("rejette sous le seuil de volume 1h", () => {
    expect(matchesEarlyOpportunity(candidate({ volume1h: 4_999 }), config)).toBe(false);
  });

  it("rejette une accélération mesurable inférieure à 1,5x", () => {
    expect(matchesEarlyOpportunity(candidate({ volume5m: 100 }), config)).toBe(false);
  });

  it("ne bloque pas quand l'accélération n'est pas mesurable", () => {
    expect(matchesEarlyOpportunity(candidate({ volume5m: null }), config)).toBe(true);
  });

  it("rejette moins de 60 acheteurs et plus de 150 acheteurs", () => {
    expect(matchesEarlyOpportunity(candidate({ buyers: 59 }), config)).toBe(false);
    expect(matchesEarlyOpportunity(candidate({ buyers: 151 }), config)).toBe(false);
    expect(matchesEarlyOpportunity(candidate({ buyers: 150 }), config)).toBe(true);
  });

  it("rejette un token de plus de 2 h", () => {
    expect(matchesEarlyOpportunity(candidate({ ageMinutes: 121 }), config)).toBe(false);
  });

  it("n'impose aucun score Radar minimum", () => {
    expect(matchesEarlyOpportunity(candidate({ score: null }), config)).toBe(true);
    expect(matchesEarlyOpportunity(candidate({ score: 5 }), config)).toBe(true);
  });

  it("applique un minimum de liquidité seulement s'il est configuré et mesuré", () => {
    const strict = { ...config, minLiquidityUsd: 20_000 };
    expect(matchesEarlyOpportunity(candidate({ liquidityUsd: 0 }), strict)).toBe(true);
    expect(matchesEarlyOpportunity(candidate({ liquidityUsd: 5_000 }), strict)).toBe(false);
    expect(matchesEarlyOpportunity(candidate({ liquidityUsd: 25_000 }), strict)).toBe(true);
  });
});

describe("matchesSmartWalletEntry", () => {
  const base = { walletScore: 70, entryRank: 2, buyers: 100, ageMinutes: 30 };

  it("accepte le rang #2 avec score ≥65 et ≥100 acheteurs", () => {
    expect(matchesSmartWalletEntry(base)).toBe(true);
  });

  it("rejette toujours le rang #1", () => {
    expect(matchesSmartWalletEntry({ ...base, entryRank: 1 })).toBe(false);
  });

  it("accepte le rang #100 mais rejette #101", () => {
    expect(matchesSmartWalletEntry({ ...base, entryRank: 100 })).toBe(true);
    expect(matchesSmartWalletEntry({ ...base, entryRank: 101 })).toBe(false);
  });

  it("rejette un score wallet inférieur à 65", () => {
    expect(matchesSmartWalletEntry({ ...base, walletScore: 64 })).toBe(false);
    expect(matchesSmartWalletEntry({ ...base, walletScore: 65 })).toBe(true);
  });

  it("rejette un token de moins de 100 acheteurs", () => {
    expect(matchesSmartWalletEntry({ ...base, buyers: 99 })).toBe(false);
  });

  it("rejette un token de plus de 2 h", () => {
    expect(matchesSmartWalletEntry({ ...base, ageMinutes: 121 })).toBe(false);
  });
});
