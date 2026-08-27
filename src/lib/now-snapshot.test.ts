import { describe, expect, it } from "vitest";
import { buildNowSnapshotMessage, missingFields, type NowSnapshotInput } from "./now-snapshot";

const base: NowSnapshotInput = {
  symbol: "TEST",
  name: "Test Token",
  mint: "So11111111111111111111111111111111111111112",
  launchedAt: new Date(Date.now() - 90 * 60_000).toISOString(),
  marketCap: 120_000,
  liquidityUsd: 42_000,
  volume24h: 310_000,
  volume1h: 55_000,
  buyers: 180,
  buyers1h: 40,
  smartWallets: 6,
  score: 71,
  scoreConfidence: 0.8,
  riskScore: 34,
  riskLevel: "medium",
  lpStatus: "burned",
  holdersTop10Share: 0.22,
  topFactors: [{ label: "Volume 1h élevé", detail: "55 000 $" }],
  pairUrl: "https://dexscreener.com/solana/pair",
  isSimulated: false,
};

describe("now snapshot", () => {
  it("contient le titre NOW et les métriques clés", () => {
    const msg = buildNowSnapshotMessage(base);
    expect(msg.startsWith("⚡ NOW")).toBe(true);
    expect(msg).toContain("$TEST");
    expect(msg).toContain("1 h 30 min");
    expect(msg).toContain("71/100");
    expect(msg).toContain("34/100 (medium)");
    expect(msg).toContain("https://solscan.io/token/");
    expect(msg).toContain("https://dexscreener.com/solana/pair");
  });

  it("marque explicitement les données inconnues sans les inventer", () => {
    const partial: NowSnapshotInput = {
      ...base,
      volume1h: null,
      buyers1h: null,
      riskScore: null,
      riskLevel: null,
      lpStatus: "unknown",
    };
    const missing = missingFields(partial);
    expect(missing).toContain("volume 1h");
    expect(missing).toContain("risk score");
    expect(missing).toContain("statut LP");
    const msg = buildNowSnapshotMessage(partial);
    expect(msg).toContain("Données non mesurées");
    expect(msg).toContain("non mesuré");
  });
});

describe("now snapshot — fraîcheur", () => {
  it("affiche l'ancienneté des données non rafraîchies", () => {
    const msg = buildNowSnapshotMessage({
      ...base,
      refreshedAt: new Date().toISOString(),
      staleFields: [{ label: "risk score", ageMinutes: 42 }],
    });
    expect(msg).toContain("Données non rafraîchies à l'instant");
    expect(msg).toContain("risk score — il y a 42 min");
    expect(msg).toContain("rafraîchie à la demande");
  });
});
