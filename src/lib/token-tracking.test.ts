import { describe, expect, it } from "vitest";
import {
  buildTrackedAlertMessage,
  detectTrackedEvents,
  emptyMetrics,
  momentumState,
  parseMetrics,
  shouldSendEvent,
  TRACKING_THRESHOLDS,
  type TrackedMetrics,
} from "./token-tracking";

function metrics(partial: Partial<TrackedMetrics>): TrackedMetrics {
  return { ...emptyMetrics(), ...partial };
}

describe("detectTrackedEvents", () => {
  it("n'émet rien pour une variation insignifiante (78 -> 79)", () => {
    const previous = metrics({ score: 78, volume1h: 10_000, buyers: 100, liquidityUsd: 50_000, priceChange1h: 2 });
    const current = metrics({ score: 79, volume1h: 10_500, buyers: 102, liquidityUsd: 49_500, priceChange1h: 3 });
    const { events } = detectTrackedEvents({ current, previous, previousState: "stable" });
    expect(events).toHaveLength(0);
  });

  it("émet un changement d'état de momentum", () => {
    const previous = metrics({ priceChange1h: 5 });
    const current = metrics({ priceChange1h: -20 });
    const { events, state } = detectTrackedEvents({ current, previous, previousState: "stable" });
    expect(state).toBe("caution");
    expect(events.some((e) => e.type === "momentum_state")).toBe(true);
  });

  it("détecte une variation matérielle du volume 1h", () => {
    const previous = metrics({ volume1h: 10_000 });
    const current = metrics({ volume1h: 40_000 });
    const { events } = detectTrackedEvents({ current, previous, previousState: "unknown" });
    expect(events.find((e) => e.type === "volume_shift")?.severity).toBe("info");
  });

  it("ignore une hausse de volume sous le seuil absolu", () => {
    const previous = metrics({ volume1h: 500 });
    const current = metrics({ volume1h: 1_500 });
    const { events } = detectTrackedEvents({ current, previous, previousState: "unknown" });
    expect(events.filter((e) => e.type === "volume_shift")).toHaveLength(0);
  });

  it("détecte une entrée significative de smart wallets", () => {
    const previous = metrics({ smartWallets: 1 });
    const current = metrics({ smartWallets: 4 });
    const { events } = detectTrackedEvents({ current, previous, previousState: "unknown" });
    expect(events.some((e) => e.type === "smart_wallets")).toBe(true);
  });

  it("détecte une baisse de liquidité et l'exit signal", () => {
    const previous = metrics({ liquidityUsd: 60_000 });
    const current = metrics({ liquidityUsd: 20_000 });
    const { events, state } = detectTrackedEvents({ current, previous, previousState: "stable" });
    expect(events.some((e) => e.type === "liquidity_drop")).toBe(true);
    expect(events.some((e) => e.type === "exit_signal")).toBe(true);
    expect(state).toBe("degrading");
  });

  it("détecte un passage à une catégorie de risque plus dangereuse", () => {
    const previous = metrics({ riskScore: 40, riskLevel: "medium" });
    const current = metrics({ riskScore: 48, riskLevel: "high" });
    const { events } = detectTrackedEvents({ current, previous, previousState: "unknown" });
    expect(events.some((e) => e.type === "risk_up")).toBe(true);
  });

  it("n'invente rien quand les métriques sont inconnues", () => {
    const { events, state } = detectTrackedEvents({
      current: emptyMetrics(),
      previous: emptyMetrics(),
      previousState: "unknown",
    });
    expect(events).toHaveLength(0);
    expect(state).toBe("unknown");
  });
});

describe("anti-spam", () => {
  const event = {
    type: "volume_shift" as const,
    state: "up:100",
    severity: "info" as const,
    label: "x",
    detail: "y",
  };

  it("autorise un premier envoi", () => {
    expect(shouldSendEvent(event, null)).toBe(true);
  });

  it("bloque le même état dans la fenêtre de cooldown", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const last = { event_state: "up:100", created_at: "2026-01-01T11:45:00Z" };
    expect(shouldSendEvent(event, last, now)).toBe(false);
  });

  it("autorise après le cooldown", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const last = {
      event_state: "up:100",
      created_at: new Date(now.getTime() - TRACKING_THRESHOLDS.cooldownMs - 1).toISOString(),
    };
    expect(shouldSendEvent(event, last, now)).toBe(true);
  });

  it("autorise immédiatement un changement d'état", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const last = { event_state: "down:60", created_at: "2026-01-01T11:59:00Z" };
    expect(shouldSendEvent(event, last, now)).toBe(true);
  });
});

describe("helpers", () => {
  it("parseMetrics est défensif", () => {
    expect(parseMetrics(null)).toEqual(emptyMetrics());
    expect(parseMetrics({ score: "x", buyers: 12 }).buyers).toBe(12);
  });

  it("momentumState reste unknown sans donnée", () => {
    expect(momentumState(emptyMetrics(), emptyMetrics())).toBe("unknown");
  });

  it("le message Telegram mentionne le suivi et aucun trading", () => {
    const message = buildTrackedAlertMessage({
      symbol: "TEST",
      name: "Test",
      mint: "mint",
      state: "caution",
      events: [{ type: "volume_shift", state: "up:100", severity: "info", label: "L", detail: "D" }],
      current: metrics({ score: 70 }),
      pairUrl: null,
    });
    expect(message).toContain("TOKEN SUIVI");
    expect(message).toContain("aucun trading automatique");
  });
});
