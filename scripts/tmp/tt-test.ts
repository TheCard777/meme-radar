import { supabaseAdmin } from "../../src/integrations/supabase/client.server";
import { loadEnabledTrackedTokens, evaluateTrackedToken } from "../../src/lib/token-tracking.server";

const MINT = "a81neCR8AViQSeno7iDYdVe9RzMKNF2wDX7zmgNpump";
const ID = "4ef03d64-7cf6-4346-a1b9-faee882fee8f";

// 1. cloche OFF -> aucune alerte
const off = await evaluateTrackedToken({
  tracked: { id: ID, token_id: null, token_mint: MINT, token_symbol: "RST", token_name: "RST", enabled: false, last_state: "accelerating", last_metrics: { volume1h: 100000, buyers1h: 200, liquidityUsd: 90000, riskScore: 10, riskLevel: "low", smartWallets: 5, score: 80, priceChange1h: 20 } },
  tokenId: ID, mint: MINT, symbol: "RST", name: "RST",
  current: { volume1h: 5000, buyers1h: 10, liquidityUsd: 20000, riskScore: 80, riskLevel: "critical", smartWallets: 0, score: 30, priceChange1h: -60 } as never,
  pairUrl: null, sendTelegram: false,
});
console.log("cloche OFF:", JSON.stringify(off));

// 2. cloche ON -> alerte + Telegram
await supabaseAdmin.from("tracked_tokens").update({ enabled: true }).eq("id", ID);
const enabled = await loadEnabledTrackedTokens();
console.log("suivis actifs:", [...enabled.keys()]);
const rec = enabled.get(MINT)!;
const on = await evaluateTrackedToken({
  tracked: { ...rec, last_state: "accelerating", last_metrics: { volume1h: 100000, buyers1h: 200, liquidityUsd: 90000, riskScore: 10, riskLevel: "low", smartWallets: 5, score: 80, priceChange1h: 20 } },
  tokenId: rec.token_id ?? ID, mint: MINT, symbol: "RST", name: "RST",
  current: { volume1h: 5000, buyers1h: 10, liquidityUsd: 20000, riskScore: 80, riskLevel: "critical", smartWallets: 0, score: 30, priceChange1h: -60 } as never,
  pairUrl: null, sendTelegram: true,
});
console.log("cloche ON:", JSON.stringify(on));

const { data } = await supabaseAdmin.from("tracked_token_alerts").select("event_type,severity,telegram_sent,telegram_error").eq("token_mint", MINT);
console.log("alertes:", JSON.stringify(data));

// cleanup
await supabaseAdmin.from("tracked_token_alerts").delete().eq("token_mint", MINT);
await supabaseAdmin.from("tracked_tokens").update({ enabled: false, last_state: "unknown", last_metrics: null }).eq("id", ID);
console.log("nettoyage ok");
