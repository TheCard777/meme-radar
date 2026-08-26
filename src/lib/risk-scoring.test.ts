import { describe, expect, it } from "vitest";
import {
  computeRisk,
  MIN_RISK_CONFIDENCE,
  riskLevelForScore,
  summarizeRisk,
  type RiskInput,
} from "./risk-scoring";
import { computeLiquidityDrop } from "./liquidity";
import { computeSniperRatio, detectCoordination } from "./coordination";

const unknownInput: RiskInput = {
  holdersTop10Share: null,
  holdersTop20Share: null,
  creatorShare: null,
  creatorPreviousTokens: null,
  lpStatus: "unknown",
  liquidityDropRatio: null,
  coordinationScore: null,
  sniperRatio: null,
};

describe("computeRisk", () => {
  it("ne publie aucun risque quand rien n'est mesuré", () => {
    const result = computeRisk(unknownInput);
    expect(result.score).toBeNull();
    expect(result.level).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.missing.length).toBe(result.factors.length);
  });

  it("ne compte pas un LP inconnu comme rassurant", () => {
    const lp = computeRisk(unknownInput).factors.find((f) => f.key === "lp");
    expect(lp?.normalized).toBeNull();
    expect(lp?.points).toBeNull();
  });

  it("reste null tant que la confiance est sous le seuil", () => {
    const result = computeRisk({ ...unknownInput, sniperRatio: 1 });
    expect(result.confidence).toBeLessThan(MIN_RISK_CONFIDENCE);
    expect(result.score).toBeNull();
  });

  it("publie un risque faible sur un token sain", () => {
    const result = computeRisk({
      ...unknownInput,
      holdersTop20Share: 0.2,
      creatorShare: 0.01,
      creatorPreviousTokens: 0,
      lpStatus: "burned",
      liquidityDropRatio: 0,
    });
    expect(result.confidence).toBeGreaterThanOrEqual(MIN_RISK_CONFIDENCE);
    expect(result.score).toBe(0);
    expect(result.level).toBe("low");
  });

  it("publie un risque critique sur un token concentré et non verrouillé", () => {
    const result = computeRisk({
      holdersTop10Share: 0.9,
      holdersTop20Share: 0.95,
      creatorShare: 0.4,
      creatorPreviousTokens: 12,
      lpStatus: "unlocked",
      liquidityDropRatio: 0.8,
      coordinationScore: 0.9,
      sniperRatio: 0.8,
    });
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.level).toBe("critical");
    expect(result.confidence).toBe(1);
    expect(summarizeRisk(result).length).toBe(3);
  });

  it("renormalise sur le poids réellement mesuré", () => {
    const result = computeRisk({
      ...unknownInput,
      holdersTop20Share: 0.95,
      lpStatus: "unlocked",
    });
    expect(result.confidence).toBeCloseTo(0.45, 5);
    expect(result.score).toBeGreaterThan(80);
  });

  it("mappe correctement les niveaux", () => {
    expect(riskLevelForScore(null)).toBeNull();
    expect(riskLevelForScore(10)).toBe("low");
    expect(riskLevelForScore(40)).toBe("medium");
    expect(riskLevelForScore(60)).toBe("high");
    expect(riskLevelForScore(90)).toBe("critical");
  });
});

describe("computeLiquidityDrop", () => {
  it("renvoie null sans historique suffisant", () => {
    expect(computeLiquidityDrop([{ capturedAt: "2026-01-01T00:00:00Z", liquidityUsd: 5000 }])).toBeNull();
  });

  it("ignore un pic non significatif", () => {
    const points = [10, 20, 5].map((v, i) => ({
      capturedAt: new Date(1_700_000_000_000 + i * 60_000).toISOString(),
      liquidityUsd: v,
    }));
    expect(computeLiquidityDrop(points)).toBeNull();
  });

  it("mesure la baisse depuis le pic", () => {
    const points = [10_000, 50_000, 20_000].map((v, i) => ({
      capturedAt: new Date(1_700_000_000_000 + i * 60_000).toISOString(),
      liquidityUsd: v,
    }));
    expect(computeLiquidityDrop(points)).toBeCloseTo(0.6, 5);
  });

  it("renvoie 0 quand la liquidité est au plus haut", () => {
    const points = [10_000, 20_000, 30_000].map((v, i) => ({
      capturedAt: new Date(1_700_000_000_000 + i * 60_000).toISOString(),
      liquidityUsd: v,
    }));
    expect(computeLiquidityDrop(points)).toBe(0);
  });
});

describe("detectCoordination", () => {
  const base = 1_700_000_000_000;
  const at = (ms: number) => new Date(base + ms).toISOString();

  it("n'évalue rien sans horodatages suffisants", () => {
    const flags = detectCoordination([
      { address: "a", rank: 1, blockTime: at(0) },
      { address: "b", rank: 2, blockTime: null },
    ]);
    expect(flags.coordinationScore).toBeNull();
    expect(flags.simultaneousRatio).toBeNull();
  });

  it("ne signale pas d'achats simultanés quand ils sont étalés", () => {
    const flags = detectCoordination([
      { address: "a", rank: 1, blockTime: at(0) },
      { address: "b", rank: 2, blockTime: at(60_000) },
      { address: "c", rank: 3, blockTime: at(120_000) },
      { address: "d", rank: 4, blockTime: at(180_000) },
    ]);
    expect(flags.largestSimultaneousCluster).toBe(1);
    expect(flags.simultaneousRatio).toBe(0);
  });

  it("détecte un groupe d'achats quasi simultanés", () => {
    const flags = detectCoordination([
      { address: "a", rank: 1, blockTime: at(0) },
      { address: "b", rank: 2, blockTime: at(500) },
      { address: "c", rank: 3, blockTime: at(1_000) },
      { address: "d", rank: 4, blockTime: at(600_000) },
    ]);
    expect(flags.largestSimultaneousCluster).toBe(3);
    expect(flags.simultaneousRatio).toBeCloseTo(0.75, 5);
    expect(flags.coordinationScore).not.toBeNull();
  });

  it("détecte un financeur commun quand il est vérifié", () => {
    const flags = detectCoordination([
      { address: "a", rank: 1, blockTime: at(0), funder: "F" },
      { address: "b", rank: 2, blockTime: at(1_000), funder: "F" },
      { address: "c", rank: 3, blockTime: at(2_000), funder: "G" },
      { address: "d", rank: 4, blockTime: at(3_000), funder: "F" },
    ]);
    expect(flags.fundersChecked).toBe(4);
    expect(flags.largestFunderGroup).toBe(3);
    expect(flags.sharedFunderRatio).toBeCloseTo(0.75, 5);
  });
});

describe("computeSniperRatio", () => {
  const base = 1_700_000_000_000;
  const at = (ms: number) => new Date(base + ms).toISOString();

  it("renvoie null sans date de lancement", () => {
    expect(computeSniperRatio([], null)).toBeNull();
  });

  it("mesure la part d'entrées immédiates", () => {
    const ratio = computeSniperRatio(
      [
        { address: "a", rank: 1, blockTime: at(1_000) },
        { address: "b", rank: 2, blockTime: at(2_000) },
        { address: "c", rank: 3, blockTime: at(600_000) },
        { address: "d", rank: 4, blockTime: at(700_000) },
      ],
      at(0),
    );
    expect(ratio).toBeCloseTo(0.5, 5);
  });
});
