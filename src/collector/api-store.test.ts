import { describe, expect, it } from "vitest";
import { ApiCollectorStore, ApiPermanentError, ApiTransientError, isTransientStatus } from "./api-store";

function fakeFetch(statuses: number[]) {
  let i = 0;
  const calls = { n: 0 };
  const impl = (async () => {
    calls.n++;
    const status = statuses[Math.min(i++, statuses.length - 1)]!;
    return new Response(JSON.stringify(status === 200 ? { state: { desired_state: "running" } } : { error: "x" }), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}
const noSleep = async () => {};

describe("ApiCollectorStore retry", () => {
  it("classe les statuts", () => {
    expect(isTransientStatus(503)).toBe(true);
    expect(isTransientStatus(429)).toBe(true);
    expect(isTransientStatus(401)).toBe(false);
    expect(isTransientStatus(404)).toBe(false);
  });

  it("réessaie un 503 transitoire puis réussit", async () => {
    const f = fakeFetch([503, 500, 200]);
    const store = new ApiCollectorStore("https://x", "t", { fetchImpl: f.impl, sleep: noSleep });
    await expect(store.readDesiredState()).resolves.toBe("running");
    expect(f.calls.n).toBe(3);
  });

  it("lève ApiTransientError après épuisement des essais", async () => {
    const f = fakeFetch([503]);
    const store = new ApiCollectorStore("https://x", "t", { fetchImpl: f.impl, sleep: noSleep, retries: 2 });
    await expect(store.readDesiredState()).rejects.toBeInstanceOf(ApiTransientError);
    expect(f.calls.n).toBe(3);
  });

  it("ne réessaie pas et ne masque pas un 401 permanent", async () => {
    const f = fakeFetch([401]);
    const store = new ApiCollectorStore("https://x", "t", { fetchImpl: f.impl, sleep: noSleep });
    await expect(store.readDesiredState()).rejects.toBeInstanceOf(ApiPermanentError);
    expect(f.calls.n).toBe(1);
  });

  it("traite une erreur réseau comme transitoire", async () => {
    let n = 0;
    const impl = (async () => {
      n++;
      if (n === 1) throw new Error("ECONNRESET");
      return new Response(JSON.stringify({ state: { desired_state: "stopped" } }), { status: 200 });
    }) as unknown as typeof fetch;
    const store = new ApiCollectorStore("https://x", "t", { fetchImpl: impl, sleep: noSleep });
    await expect(store.readDesiredState()).resolves.toBe("stopped");
  });
});
