import { createServerFn } from "@tanstack/react-start";

/**
 * Lectures opérationnelles sensibles — SERVEUR UNIQUEMENT.
 *
 * `bot_settings` et `demo_archive` ne sont plus lisibles par le rôle anon :
 * le dashboard passe par ces fonctions serveur qui n'exposent que les champs
 * nécessaires à l'UI (aucun secret, aucune donnée d'infrastructure).
 */

export const getBotSettingsServer = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("bot_settings")
    .select(
      "id, status, telegram_threshold, critical_threshold, signal_categories, telegram_connected, demo_mode, last_scan_at, smart_wallet_alerts_enabled, smart_wallet_alert_threshold",
    )
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Réglages du bot introuvables");
  return data;
});

export const getDemoArchivedCountServer = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("demo_archive").select("rows_removed");
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum, row) => sum + (row.rows_removed ?? 0), 0);
});
