import { describe, expect, it } from "vitest";
import {
  isRetryableStatus,
  nextEnrichAfterMiss,
  noMarketDelayMs,
  NO_MARKET_MAX_OLD_MS,
  NO_MARKET_MAX_RECENT_MS,
  retryDelayMs,
  splitBatch,
} from "./enrich-queue";

describe("enrich queue", () => {
  it("backoff progressif plafonné plus court pour les récents", () => {
    expect(noMarketDelayMs(1, 0)).toBe(120_000);
    expect(noMarketDelayMs(2, 0)).toBe(240_000);
    expect(noMarketDelayMs(10, 0)).toBe(NO_MARKET_MAX_RECENT_MS);
    expect(noMarketDelayMs(30, 3 * 3600_000)).toBe(NO_MARKET_MAX_OLD_MS);
  });
  it("incrémente le compteur et programme la prochaine tentative", () => {
    const now = new Date("2026-10-15T00:00:00Z");
    const r = nextEnrichAfterMiss(0, "2026-10-14T23:50:00Z", now);
    expect(r.market_miss_count).toBe(1);
    expect(r.next_enrich_at).toBe("2026-10-15T00:02:00.000Z");
  });
  it("réserve la majorité du lot aux récents", () => {
    expect(splitBatch(30)).toEqual({ recent: 24, old: 6 });
  });
  it("erreurs temporaires", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(404)).toBe(false);
    expect(retryDelayMs("2", 0)).toBe(2000);
    expect(retryDelayMs(null, 1)).toBe(2000);
    expect(retryDelayMs("999", 0)).toBe(10_000);
  });
});
