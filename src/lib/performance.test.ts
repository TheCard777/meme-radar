import { describe, expect, it } from "vitest";
import { computeOutcomes, summarizeCohort } from "@/lib/performance";
import { aggregateWallet, MIN_WALLET_SAMPLE } from "@/lib/wallets.server";

const base = new Date("2026-01-01T00:00:00.000Z").getTime();
const at = (min: number) => new Date(base + min * 60_000).toISOString();

describe("computeOutcomes", () => {
  it("calcule les multiples réels et laisse les horizons non couverts inconnus", () => {
    const outcomes = computeOutcomes(
      [
        {
          id: "a1",
          token_id: "t1",
          token_symbol: "ABC",
          score: 92,
          created_at: at(0),
          price_usd_at_alert: 1,
        },
      ],
      [
        { token_id: "t1", captured_at: at(6), price_usd: 2 },
        { token_id: "t1", captured_at: at(20), price_usd: 3 },
      ],
    );
    const outcome = outcomes[0]!;
    expect(outcome.cohort).toBe("90-100");
    expect(outcome.horizons[5]).toBeNull();
    expect(outcome.horizons[15]).toBeCloseTo(2);
    expect(outcome.maxMultiple).toBeCloseTo(3);
    expect(outcome.horizons[1440]).toBeCloseTo(3);
  });

  it("laisse tout inconnu sans prix de référence", () => {
    const outcomes = computeOutcomes(
      [
        {
          id: "a2",
          token_id: "t2",
          token_symbol: "XYZ",
          score: 87,
          created_at: at(0),
          price_usd_at_alert: null,
        },
      ],
      [{ token_id: "t2", captured_at: at(10), price_usd: 5 }],
    );
    expect(outcomes[0]!.cohort).toBe("85-89");
    expect(outcomes[0]!.maxMultiple).toBeNull();
  });

  it("résume une cohorte avec la taille d'échantillon", () => {
    const outcomes = computeOutcomes(
      [
        { id: "a", token_id: "t", token_symbol: "A", score: 95, created_at: at(0), price_usd_at_alert: 1 },
        { id: "b", token_id: "t", token_symbol: "A", score: 91, created_at: at(0), price_usd_at_alert: 1 },
      ],
      [{ token_id: "t", captured_at: at(30), price_usd: 0.4 }],
    );
    const stats = summarizeCohort(outcomes, "90-100");
    expect(stats.sample).toBe(2);
    expect(stats.measured).toBe(2);
    expect(stats.lossRate).toBe(1);
    expect(stats.survivalRate).toBe(0);
  });
});

describe("aggregateWallet", () => {
  it("ne publie aucun score sous l'échantillon minimal", () => {
    const wallet = aggregateWallet({ address: "W", ranks: [1, 2], tokenSucceeded: [true, true] });
    expect(wallet.tokensTracked).toBeLessThan(MIN_WALLET_SAMPLE);
    expect(wallet.score).toBeNull();
    expect(wallet.successRate).toBeNull();
    expect(wallet.dataSufficient).toBe(false);
  });

  it("calcule un score réel quand les données suffisent", () => {
    const wallet = aggregateWallet({
      address: "W",
      ranks: [1, 3, 40, 2],
      tokenSucceeded: [true, true, false, true],
    });
    expect(wallet.dataSufficient).toBe(true);
    expect(wallet.earlyEntries).toBe(3);
    expect(wallet.successRate).toBeCloseTo(0.75);
    expect(wallet.score).toBeGreaterThan(0);
    expect(wallet.reasons.join(" ")).toContain("inconnus");
  });
});

describe("cohorte 75-84 (profil signal)", () => {
  it("compte les signaux à 76 et 82, ignore sous 75", () => {
    const alert = (id: string, score: number) => ({
      id, token_id: id, token_symbol: id, score, created_at: "2026-10-16T09:00:00.000Z", price_usd_at_alert: 1,
    });
    const snap = (id: string, price: number) => ({ token_id: id, captured_at: "2026-10-16T09:10:00.000Z", price_usd: price });
    const outcomes = computeOutcomes(
      [alert("a", 76), alert("b", 82), alert("c", 74)],
      [snap("a", 1.5), snap("b", 0.6), snap("c", 2)],
    );
    expect(outcomes.map((o) => o.cohort)).toEqual(["75-84", "75-84"]);
    const stats = summarizeCohort(outcomes, "75-84");
    expect(stats.sample).toBe(2);
    expect(stats.lossRate).toBe(0.5);
  });
});
