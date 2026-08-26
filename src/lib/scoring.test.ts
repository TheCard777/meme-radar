import { describe, expect, it } from "vitest";
import { computeScore, levelForScore, MIN_CONFIDENCE } from "./scoring";

const FULL = {
  liquidityUsd: 55_000,
  volume24h: 240_000,
  volume1h: 40_000,
  buyers1h: 280,
  priceChange1h: 75,
  smartWallets: 5,
  holdersTop10Share: 0.21,
  creatorHistory: 0.95,
  ageMinutes: 45,
};

const EMPTY = {
  liquidityUsd: null,
  volume24h: null,
  volume1h: null,
  buyers1h: null,
  priceChange1h: null,
  smartWallets: null,
  holdersTop10Share: null,
  creatorHistory: null,
  ageMinutes: null,
};

describe("computeScore", () => {
  it("renvoie un score élevé sur des signaux forts et complets", () => {
    const result = computeScore(FULL);
    expect(result.confidence).toBe(1);
    expect(result.score).not.toBeNull();
    expect(result.score!).toBeGreaterThanOrEqual(85);
    expect(result.level === "signal" || result.level === "priority").toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("ne publie aucun score quand les données sont insuffisantes", () => {
    const result = computeScore(EMPTY);
    expect(result.score).toBeNull();
    expect(result.level).toBe("insufficient");
    expect(result.confidence).toBeLessThan(MIN_CONFIDENCE);
    expect(result.missing.length).toBe(7);
  });

  it("renormalise les poids disponibles sans gonfler le score", () => {
    // Uniquement des données de marché médiocres, sans smart money ni créateur.
    const result = computeScore({
      ...EMPTY,
      liquidityUsd: 6_000,
      volume24h: 12_000,
      volume1h: 400,
      buyers1h: 20,
      priceChange1h: 2,
      ageMinutes: 600,
    });
    expect(result.confidence).toBeCloseTo(0.6, 5);
    expect(result.score).not.toBeNull();
    expect(result.score!).toBeLessThan(70);
    expect(result.level).toBe("ignored");
    expect(result.missing).toContain("Smart wallets");
  });

  it("marque les métriques manquantes comme null et jamais 0 implicite", () => {
    const result = computeScore({ ...FULL, smartWallets: null });
    const smart = result.subScores.find((s) => s.key === "smartMoney")!;
    expect(smart.normalized).toBeNull();
    expect(smart.points).toBeNull();
    expect(result.confidence).toBeCloseTo(0.8, 5);
  });
});

describe("levelForScore", () => {
  it("applique les seuils 70 / 85 / 90", () => {
    expect(levelForScore(null)).toBe("insufficient");
    expect(levelForScore(42)).toBe("ignored");
    expect(levelForScore(70)).toBe("watch");
    expect(levelForScore(84)).toBe("watch");
    expect(levelForScore(85)).toBe("signal");
    expect(levelForScore(89)).toBe("signal");
    expect(levelForScore(90)).toBe("priority");
    expect(levelForScore(100)).toBe("priority");
  });
});
