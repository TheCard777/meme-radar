import { describe, expect, it } from "vitest";
import {
  buildRiskAlertMessage,
  classifyRiskAlert,
  RISK_ALERT_DEFAULTS,
  shouldSendRiskAlert,
} from "./risk-alerts";
import { computeRisk, type RiskResult } from "./risk-scoring";
import {
  EARLY_OPPORTUNITY_DEFAULTS,
  buildEarlyOpportunityMessage,
  earlyTier,
  matchesEarlyOpportunity,
  volumeLiquidityRatio,
  type EarlyOpportunityCandidate,
} from "./early-opportunity.server";

const risk = (score: number | null, confidence = 0.8): RiskResult => ({
  score,
  level: score === null ? null : score >= 75 ? "critical" : score >= 55 ? "high" : "low",
  confidence,
  factors: [],
  missing: [],
});
const cfg = RISK_ALERT_DEFAULTS;
const MINT = "HrbYv65uD8imZNUEWGEWtGK7W7rtgsjoLcrusfwxpump";

describe("classifyRiskAlert", () => {
  it("seuils high / critical", () => {
    expect(classifyRiskAlert(risk(54), null, cfg)).toBeNull();
    expect(classifyRiskAlert(risk(55), null, cfg)).toBe("high");
    expect(classifyRiskAlert(risk(74), null, cfg)).toBe("high");
    expect(classifyRiskAlert(risk(75), null, cfg)).toBe("critical");
  });
  it("données manquantes / confiance insuffisante → aucune alerte", () => {
    expect(classifyRiskAlert(null, null, cfg)).toBeNull();
    expect(classifyRiskAlert(risk(null), null, cfg)).toBeNull();
    expect(classifyRiskAlert(risk(90, 0.3), null, cfg)).toBeNull();
  });
  it("chute de liquidité mesurée → urgent, jamais si non mesurée", () => {
    expect(classifyRiskAlert(risk(60), 0.6, cfg)).toBe("urgent");
    expect(classifyRiskAlert(risk(60), null, cfg)).toBe("high");
    expect(classifyRiskAlert(risk(40), 0.9, cfg)).toBeNull();
  });
  it("intégration avec computeRisk : inconnu ≠ risque", () => {
    const r = computeRisk({
      holdersTop10Share: null, holdersTop20Share: null, creatorShare: null,
      creatorPreviousTokens: null, lpStatus: "unknown", liquidityDropRatio: null,
      coordinationScore: null, sniperRatio: null,
    });
    expect(classifyRiskAlert(r, null, cfg)).toBeNull();
  });
});

describe("shouldSendRiskAlert", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();
  it("première alerte envoyée", () => expect(shouldSendRiskAlert("high", null, cfg, now)).toBe(true));
  it("même niveau pendant le cooldown → non", () =>
    expect(shouldSendRiskAlert("high", { level: "high", createdAt: ago(10) }, cfg, now)).toBe(false));
  it("même niveau après cooldown → oui", () =>
    expect(shouldSendRiskAlert("high", { level: "high", createdAt: ago(400) }, cfg, now)).toBe(true));
  it("aggravation high → critical → oui immédiatement", () =>
    expect(shouldSendRiskAlert("critical", { level: "high", createdAt: ago(1) }, cfg, now)).toBe(true));
  it("baisse critical → high pendant cooldown → non", () =>
    expect(shouldSendRiskAlert("high", { level: "critical", createdAt: ago(1) }, cfg, now)).toBe(false));
  it("désactivé → non", () =>
    expect(shouldSendRiskAlert("urgent", null, { ...cfg, enabled: false }, now)).toBe(false));
});

describe("buildRiskAlertMessage", () => {
  it("mint complet, liens exacts, libellé potentiel", () => {
    const msg = buildRiskAlertMessage({ level: "critical", symbol: "X<b>", name: "N", mint: MINT, risk: risk(87, 0.82) });
    expect(msg).toContain("POTENTIEL RUG PULL");
    expect(msg).not.toContain("RUG PULL CONFIRMÉ");
    expect(msg.split("\n")).toContain(MINT);
    expect(msg).toContain(`https://solscan.io/token/${MINT}`);
    expect(msg).toContain(`https://dexscreener.com/solana/${MINT}`);
    expect(msg).toContain("87/100");
    expect(msg).toContain("82 %");
  });
});

describe("Early Opportunity — qualité", () => {
  const config = { ...EARLY_OPPORTUNITY_DEFAULTS };
  const base: EarlyOpportunityCandidate = {
    tokenId: "t", mint: MINT, symbol: "S", name: "N", score: 70, confidence: 0.7,
    buyers: 80, liquidityUsd: 20_000, marketCap: 50_000, volume24h: null,
    volume1h: 20_000, volume5m: 3_000, ageMinutes: 30, pairUrl: null,
    distinctBuyers: 80, buyTxns1h: 140,
  };
  it("traction forte → solide", () => {
    expect(matchesEarlyOpportunity(base, config)).toBe(true);
    expect(earlyTier(base, config)).toBe("solid");
  });
  it("volume élevé sur pool trop peu profond → rejeté", () => {
    const c = { ...base, liquidityUsd: 1_000, volume1h: 50_000 };
    expect(volumeLiquidityRatio(c)).toBe(50);
    expect(matchesEarlyOpportunity(c, config)).toBe(false);
  });
  it("traction faible (décélération) → rejeté", () =>
    expect(matchesEarlyOpportunity({ ...base, volume5m: 500 }, config)).toBe(false));
  it("pré-migration sans pool → accepté, liquidité affichée non mesurée, palier à surveiller sans accélération", () => {
    const c = { ...base, liquidityUsd: 0, volume5m: null };
    expect(matchesEarlyOpportunity(c, config)).toBe(true);
    expect(earlyTier(c, config)).toBe("watch");
    expect(buildEarlyOpportunityMessage(c, config)).toContain("non mesurée");
  });
  it("risque élevé → avertissement visible et jamais « solide »", () => {
    const c = { ...base, riskScore: 80, riskLevel: "critical" };
    expect(earlyTier(c, config)).toBe("watch");
    expect(buildEarlyOpportunityMessage(c, config)).toContain("⚠️ ATTENTION : Risk Score 80/100");
  });
  it("distingue acheteurs distincts et transactions d'achat", () => {
    const msg = buildEarlyOpportunityMessage(base, config);
    expect(msg).toContain("Acheteurs distincts mesurés : 80");
    expect(msg).toContain("Transactions d'achat 1h : 140");
  });
});
