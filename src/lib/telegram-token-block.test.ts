import { describe, expect, it } from "vitest";
import {
  ageFromLaunch,
  contractLinkLines,
  copyMintKeyboard,
  dexscreenerTokenUrl,
  solscanTokenUrl,
} from "./telegram-token-block";
import { buildAlertMessage } from "./signal-alert-message";
import { buildTrackedAlertMessage } from "./token-tracking";
import { buildNowSnapshotMessage } from "./now-snapshot";
import type { ScoringResult } from "./scoring";

const MINT = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsUpump";

const scoring = {
  score: 72,
  confidence: 0.8,
  level: "signal",
  subScores: [],
  missing: [],
} as unknown as ScoringResult;

describe("bloc contrat Telegram", () => {
  it("liens Solscan et DexScreener construits sur le même mint exact", () => {
    expect(solscanTokenUrl(MINT)).toBe(`https://solscan.io/token/${MINT}`);
    expect(dexscreenerTokenUrl(MINT)).toBe(`https://dexscreener.com/solana/${MINT}`);
    const lines = contractLinkLines(MINT, "https://dexscreener.com/solana/PAIRxyz");
    expect(lines).toHaveLength(3);
    expect(contractLinkLines(MINT, null)).toHaveLength(2);
  });

  it("encode le composant URL sans modifier la valeur copiée", () => {
    const odd = "abc/def?x";
    expect(solscanTokenUrl(odd)).toBe("https://solscan.io/token/abc%2Fdef%3Fx");
    expect(copyMintKeyboard(odd)?.inline_keyboard[0]?.[0]?.copy_text.text).toBe(odd);
  });

  it("clavier copy_text avec la valeur exacte du mint", () => {
    const kb = copyMintKeyboard(MINT);
    expect(kb).toEqual({
      inline_keyboard: [[{ text: "📋 Copier le CA", copy_text: { text: MINT } }]],
    });
    expect(copyMintKeyboard("")).toBeNull();
    expect(copyMintKeyboard("x".repeat(257))).toBeNull();
  });

  it("âge lisible depuis launched_at", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    expect(ageFromLaunch("2026-01-01T10:30:00Z", now)).toBe("1 h 30 min");
    expect(ageFromLaunch(null, now)).toBe("Non disponible");
    expect(ageFromLaunch("pas-une-date", now)).toBe("Non disponible");
  });
});

describe("message SIGNAL / PRIORITÉ", () => {
  it("CA intégral, liens exacts et métriques manquantes en « Non disponible »", () => {
    const msg = buildAlertMessage({
      symbol: "<b>PEPE&</b>",
      name: 'Nom "spécial" <script>',
      mint: MINT,
      scoring,
      metrics: undefined,
      level: "priority",
      launchedAt: null,
    });
    const lines = msg.split("\n");
    expect(lines).toContain(MINT);
    expect(msg).toContain(`https://solscan.io/token/${MINT}`);
    expect(msg).toContain(`https://dexscreener.com/solana/${MINT}`);
    expect(msg).toContain("💧 Liquidité : Non disponible");
    expect(msg).toContain("💰 Market cap : Non disponible");
    expect(msg).toContain("⏱️ Âge : Non disponible");
    expect(msg).toContain("⭐ Score Meme Radar : 72/100");
    // Texte brut : les caractères spéciaux restent tels quels, sans balisage.
    expect(msg).toContain("$<b>PEPE&</b>");
    expect(msg).toContain('Nom "spécial" <script>');
  });

  it("affiche liquidité, market cap et âge mesurés", () => {
    const msg = buildAlertMessage({
      symbol: "TEST",
      name: "Test",
      mint: MINT,
      scoring,
      metrics: { liquidityUsd: 42000, marketCap: 120000, pairUrl: "https://dexscreener.com/solana/PAIR" } as never,
      level: "signal",
      launchedAt: new Date(Date.now() - 45 * 60_000).toISOString(),
    });
    expect(msg).toMatch(/Liquidité : 42\s000 \$/);
    expect(msg).toContain("⏱️ Âge : 45 min");
    expect(msg).toContain("🔗 Paire DEX : https://dexscreener.com/solana/PAIR");
  });
});

describe("autres notifications", () => {
  it("suivi 🔔 et NOW contiennent le CA intégral", () => {
    const tracked = buildTrackedAlertMessage({
      symbol: "T",
      name: null,
      mint: MINT,
      state: "neutral" as never,
      events: [],
      current: { score: null, riskScore: null, riskLevel: null, liquidityUsd: null, volume1h: null, buyers: null } as never,
      pairUrl: null,
    });
    expect(tracked.split("\n")).toContain(MINT);
    expect(tracked).toContain(`https://dexscreener.com/solana/${MINT}`);
  });

  it("NOW contient CA + deux liens", () => {
    const msg = buildNowSnapshotMessage({
      symbol: "N", name: null, mint: MINT, launchedAt: null, marketCap: null, liquidityUsd: null,
      volume24h: null, volume1h: null, buyers: null, buyers1h: null, smartWallets: null, score: null,
      scoreConfidence: null, riskScore: null, riskLevel: null, lpStatus: null, holdersTop10Share: null,
      topFactors: [], pairUrl: null, isSimulated: false,
    });
    expect(msg.split("\n")).toContain(MINT);
    expect(msg).toContain(`https://solscan.io/token/${MINT}`);
    expect(msg).toContain(`https://dexscreener.com/solana/${MINT}`);
  });
});
