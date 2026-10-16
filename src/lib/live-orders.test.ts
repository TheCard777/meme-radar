import { describe, expect, it } from "vitest";
import { allPass, liveBuyBlocker, preflight, sendBlocker, type PreflightInput } from "./live-orders";

const NOW = "2026-10-16T10:00:00.000Z";
const pos = (mint: string, openedAt = NOW, status: "open" | "closed" = "open") => ({ mint, stakeUsd: 5, openedAt, status });

describe("live gates", () => {
  it("bloque si un seul verrou manque", () => {
    expect(sendBlocker({ envFlag: false, armed: true, killSwitch: false })).toMatch(/LIVE_TRADING/);
    expect(sendBlocker({ envFlag: true, armed: false, killSwitch: false })).toMatch(/armé/);
    expect(sendBlocker({ envFlag: true, armed: true, killSwitch: true })).toMatch(/urgence/);
    expect(sendBlocker({ envFlag: true, armed: true, killSwitch: false })).toBeNull();
  });
});

describe("limites capital", () => {
  it("autorise un premier achat", () => expect(liveBuyBlocker([], "A", NOW, 0, 0)).toBeNull());
  it("pas de doublon ni réentrée", () => {
    expect(liveBuyBlocker([pos("A")], "A", NOW, 0, 0)).toMatch(/déjà ouverte/);
    expect(liveBuyBlocker([pos("A", NOW, "closed")], "A", NOW, 0, 0)).toMatch(/aujourd'hui/);
  });
  it("3 achats / 15 $ par jour", () =>
    expect(liveBuyBlocker([pos("A"), pos("B"), pos("C")], "D", NOW, 0, 0)).toMatch(/3 achats/));
  it("30 $ engagés", () => {
    const old = ["A", "B", "C", "D", "E", "F"].map((m) => pos(m, "2026-10-15T10:00:00.000Z"));
    expect(liveBuyBlocker(old, "G", NOW, 0, 0)).toMatch(/30 \$/);
  });
  it("coupe-circuit -15 $", () => expect(liveBuyBlocker([], "A", NOW, -10, -5)).toMatch(/Coupe-circuit/));
});

describe("preflight", () => {
  const base: PreflightInput = {
    side: "buy", usdAmount: 5, quoteMint: "M", expectedMint: "M", slippageBps: 300, priceImpactPct: 0.5,
    feeLamports: 100_000, quotePriceUsd: 1.02, marketPriceUsd: 1, expectedOutRaw: "5000000",
    expiresAt: "2026-10-16T10:01:00.000Z", nowIso: NOW,
  };
  it("passe quand tout est conforme", () => expect(allPass(preflight(base))).toBe(true));
  it.each([
    ["mauvais token", { quoteMint: "X" }],
    ["montant > 5 $", { usdAmount: 6 }],
    ["slippage 5 %", { slippageBps: 500 }],
    ["impact 4 %", { priceImpactPct: 4 }],
    ["impact inconnu", { priceImpactPct: null }],
    ["frais trop élevés", { feeLamports: 5_000_000 }],
    ["prix écart 10 %", { quotePriceUsd: 1.1 }],
    ["expiré après 60 s", { nowIso: "2026-10-16T10:01:01.000Z" }],
  ])("refuse : %s", (_l, o) => expect(allPass(preflight({ ...base, ...o }))).toBe(false));
});
