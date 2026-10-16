import { describe, expect, it } from "vitest";
import {
  REAL_TRADING_ENABLED,
  dailyStats,
  emptyLedger,
  entryBlocker,
  evaluateEligibility,
  evaluateEntry,
  evaluateSignalProfile,
  stepLedger,
  type MarketView,
} from "./paper-strategy";

const T0 = "2026-10-16T10:00:00.000Z";
const at = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString();

const view = (o: Partial<MarketView> = {}): MarketView => ({
  tokenId: "t1", mint: "MintAAA", symbol: "AAA", ageMinutes: 30, dex: "raydium",
  postMigrationPool: true, opportunityScore: 92, opportunityConfidence: 0.85,
  riskScore: 20, riskConfidence: 0.9, liquidityUsd: 30_000, volume1h: 10_000,
  volume5m: 2_000, priceUsd: 1, newBuyers1h: 50, top10Share: 0.4, ...o,
});

describe("paper strategy V1", () => {
  it("le mode réel est désactivé", () => expect(REAL_TRADING_ENABLED).toBe(false));

  it("éligible quand tout est mesuré et conforme", () =>
    expect(evaluateEligibility(view()).eligible).toBe(true));

  it.each([
    ["pool pré-migration", { dex: "pumpfun", postMigrationPool: false }],
    ["pool inconnu", { dex: null, postMigrationPool: null }],
    ["trop jeune", { ageMinutes: 3 }],
    ["trop vieux", { ageMinutes: 121 }],
    ["score 79", { opportunityScore: 79 }],
    ["risque 30", { riskScore: 30 }],
    ["confiance risque inconnue", { riskConfidence: null }],
    ["confiance score 0.69", { opportunityConfidence: 0.69 }],
    ["confiance risque 0.39", { riskConfidence: 0.39 }],
    ["liquidité 19k", { liquidityUsd: 19_000 }],
    ["volume inconnu", { volume1h: null }],
    ["accélération inconnue", { volume5m: null }],
    ["accélération faible", { volume5m: 500 }],
    ["volume/liquidité anormal", { liquidityUsd: 20_000, volume1h: 400_000, volume5m: 80_000 }],
  ])("refuse : %s", (_l, o) => expect(evaluateEligibility(view(o)).eligible).toBe(false));

  it("ouvre 5 $ puis respecte 3 achats/jour et 15 $", () => {
    const views = ["A", "B", "C", "D"].map((m, i) => view({ mint: m, tokenId: m, symbol: m, opportunityScore: 95 - i }));
    const { ledger, opened } = stepLedger(emptyLedger(), views, T0);
    expect(opened.map((p) => p.mint)).toEqual(["A", "B", "C"]);
    expect(opened.every((p) => p.stakeUsd === 5)).toBe(true);
    expect(dailyStats(ledger, T0).newEntriesUsd).toBe(15);
  });

  it("pas de réentrée le même jour, autorisée le lendemain", () => {
    let l = stepLedger(emptyLedger(), [view()], T0).ledger;
    l = stepLedger(l, [view({ priceUsd: 1.31 })], at(5)).ledger; // TP
    expect(l.closed[0]?.exitReason).toBe("take_profit");
    expect(entryBlocker(l, view(), at(10))).toMatch(/aujourd'hui/);
    expect(entryBlocker(l, view(), "2026-10-17T00:01:00.000Z")).toBeNull();
  });

  it("sorties : stop, risque, liquidité, durée", () => {
    const open = stepLedger(emptyLedger(), [view()], T0).ledger;
    expect(stepLedger(open, [view({ priceUsd: 0.79 })], at(1)).closed[0]?.exitReason).toBe("stop_loss");
    expect(stepLedger(open, [view({ riskScore: 55 })], at(1)).closed[0]?.exitReason).toBe("risk");
    expect(stepLedger(open, [view({ liquidityUsd: 20_000 })], at(1)).closed[0]?.exitReason).toBe("liquidity_drop");
    expect(stepLedger(open, [view()], at(60)).closed[0]?.exitReason).toBe("max_hold");
    expect(stepLedger(open, [view()], at(59)).closed).toHaveLength(0);
  });

  it("coupe-circuit à -15 $ réalisé + latent", () => {
    const l = emptyLedger();
    l.closed.push({
      id: "x", tokenId: "x", mint: "X", symbol: "X", stakeUsd: 15, entryPrice: 1,
      entryLiquidityUsd: 1, openedAt: T0, lastPrice: 0, lastPriceAt: T0,
      closedAt: T0, exitPrice: 0, exitReason: "stop_loss", realizedPnlUsd: -15,
    });
    expect(dailyStats(l, at(1)).circuitBreaker).toBe(true);
    expect(stepLedger(l, [view()], at(1)).opened).toHaveLength(0);
  });

  it("prise de bénéfice +30 % et stop -20 % au dernier prix", () => {
    const open = stepLedger(emptyLedger(), [view()], T0).ledger;
    const tp = stepLedger(open, [view({ priceUsd: 1.3 })], at(2)).closed[0];
    expect(tp?.exitReason).toBe("take_profit");
    expect(tp?.realizedPnlUsd).toBeCloseTo(1.5);
    const sl = stepLedger(open, [view({ priceUsd: 0.8 })], at(2)).closed[0];
    expect(sl?.exitReason).toBe("stop_loss");
    expect(sl?.realizedPnlUsd).toBeCloseTo(-1);
  });

  it("plafond engagé simultané 30 $ (6 positions de 5 $)", () => {
    const l = emptyLedger();
    for (let i = 0; i < 6; i++)
      l.open.push({ id: `o${i}`, tokenId: `o${i}`, mint: `O${i}`, symbol: "O", stakeUsd: 5, entryPrice: 1,
        entryLiquidityUsd: 30_000, openedAt: "2026-10-15T10:00:00.000Z", lastPrice: 1, lastPriceAt: T0 });
    expect(entryBlocker(l, view(), T0)).toMatch(/30 \$/);
  });
});

// Profils réels des signaux gagnants du propriétaire (MemeTrace, SpaceX).
const memeTrace = (o: Partial<MarketView> = {}) =>
  view({
    mint: "HUARG", symbol: "MemeTrace", ageMinutes: 1, dex: "pumpfun", postMigrationPool: false,
    opportunityScore: 82, opportunityConfidence: 0.55, riskScore: null, riskConfidence: 0,
    liquidityUsd: null, volume1h: 39_624, volume5m: 39_624, priceUsd: 0.00001246,
    newBuyers1h: 412, top10Share: 0.215, ...o,
  });
const spaceX = view({
  mint: "E85A", symbol: "SpaceX", ageMinutes: 2, opportunityScore: 76, opportunityConfidence: 0.7,
  riskScore: null, riskConfidence: 0, liquidityUsd: 51_378, volume1h: 18_053, volume5m: 18_053,
  newBuyers1h: 226, top10Share: 0.139,
});

describe("profil signal (2e règle d'entrée)", () => {
  it("accepte les deux signaux gagnants, refusés par la règle standard", () => {
    for (const v of [memeTrace(), spaceX]) {
      const e = evaluateEntry(v);
      expect(e.standard.eligible).toBe(false);
      expect(e.rule).toBe("signal");
    }
  });

  it("préfère la règle standard quand elle passe", () =>
    expect(evaluateEntry(view({ ageMinutes: 8, newBuyers1h: 300, top10Share: 0.2, volume1h: 20_000, volume5m: 3_000 })).rule).toBe("standard"));

  it.each([
    ["trop vieux", { ageMinutes: 11 }],
    ["score 74", { opportunityScore: 74 }],
    ["199 acheteurs", { newBuyers1h: 199 }],
    ["acheteurs inconnus", { newBuyers1h: null }],
    ["top 10 à 26 %", { top10Share: 0.26 }],
    ["top 10 inconnu", { top10Share: null }],
    ["volume 14 999 $", { volume1h: 14_999 }],
    ["risque mesuré 30", { riskScore: 30 }],
    ["prix inconnu", { priceUsd: null }],
  ])("refuse : %s", (_l, o) => {
    expect(evaluateSignalProfile(memeTrace(o)).eligible).toBe(false);
    expect(evaluateEntry(memeTrace(o)).eligible).toBe(false);
  });

  it("risque mesuré < 30 accepté", () => expect(evaluateSignalProfile(memeTrace({ riskScore: 29 })).eligible).toBe(true));

  it("la simulation ouvre une position sur la courbe Pump.fun (liquidité inconnue)", () => {
    const { opened } = stepLedger(emptyLedger(), [memeTrace()], T0);
    expect(opened).toHaveLength(1);
    expect(opened[0]?.entryLiquidityUsd).toBe(0);
  });
});
