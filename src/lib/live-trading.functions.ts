import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const guard = async () => {
  const { requireSettingsUnlocked } = await import("./settings-gate.server");
  await requireSettingsUnlocked();
  return import("./live-trading.server");
};
const mint = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
const uuid = z.string().uuid();

export const getLiveOverview = createServerFn({ method: "POST" }).handler(async () => {
  const s = await guard();
  const r = await s.liveOverview();
  return JSON.parse(JSON.stringify(r)) as typeof r;
});

export const createLiveBuy = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ mint }).parse(d))
  .handler(async ({ data }) => {
    const s = await guard();
    try { return { ok: true as const, id: await s.createBuyOrder(data.mint) }; }
    catch (e) {
      const reasons = (e as { reasons?: string[] }).reasons ?? null;
      return { ok: false as const, error: e instanceof Error ? e.message.split("\n")[0] : "Erreur", reasons };
    }
  });

export const createLiveSell = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ positionId: uuid, reason: z.string().max(40).nullable() }).parse(d))
  .handler(async ({ data }) => {
    const s = await guard();
    try { return { ok: true as const, id: await s.createSellOrder(data.positionId, data.reason) }; }
    catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : "Erreur" }; }
  });

export const confirmLiveOrder = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data }) => (await guard()).confirmOrder(data.id));

export const cancelLiveOrder = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data }) => { await (await guard()).cancelOrder(data.id); return { ok: true }; });

export const setLiveKillSwitch = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ on: z.boolean() }).parse(d))
  .handler(async ({ data }) => { await (await guard()).setKillSwitch(data.on); return { ok: true }; });

export const setLiveArmed = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ on: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    try { await (await guard()).setArmed(data.on); return { ok: true as const }; }
    catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : "Erreur" }; }
  });

export const testLiveSignature = createServerFn({ method: "POST" }).handler(async () => {
  try { return { ok: true as const, message: (await (await guard()).testTurnkeySignature()).message }; }
  catch (e) { return { ok: false as const, message: e instanceof Error ? e.message : "Erreur" }; }
});
