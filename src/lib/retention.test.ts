import { describe, expect, it } from "vitest";
import { snapshotCutoff, SNAPSHOT_RETENTION_DAYS } from "./retention";

describe("rétention des instantanés", () => {
  it("la date limite est 7 jours avant maintenant", () => {
    const now = new Date("2026-10-16T12:00:00.000Z");
    expect(snapshotCutoff(now)).toBe("2026-10-09T12:00:00.000Z");
    expect(SNAPSHOT_RETENTION_DAYS).toBe(7);
  });
  it("une rétention personnalisée décale la limite", () => {
    expect(snapshotCutoff(new Date("2026-10-16T00:00:00.000Z"), 1)).toBe("2026-10-15T00:00:00.000Z");
  });
});
