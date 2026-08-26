import { createServerFn } from "@tanstack/react-start";
import type { BotStatus, SignalCategories } from "./radar-types";

type SettingsInput = {
  id: string;
  patch: Partial<{
    status: BotStatus;
    telegram_threshold: number;
    critical_threshold: number;
    signal_categories: SignalCategories;
    last_scan_at: string;
    smart_wallet_alerts_enabled: boolean;
    smart_wallet_alert_threshold: number;
  }>;
};

export const updateBotSettingsServer = createServerFn({ method: "POST" })
  .inputValidator((input: SettingsInput) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("bot_settings")
      .update(data.patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });