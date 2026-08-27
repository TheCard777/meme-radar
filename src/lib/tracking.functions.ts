import { createServerFn } from "@tanstack/react-start";

type ToggleInput = {
  tokenId: string;
  mint: string;
  symbol: string | null;
  name: string | null;
  enabled: boolean;
};

/**
 * Active / désactive le suivi personnalisé d'un token (cloche 🔔).
 * Aucune donnée historique n'est supprimée : la ligne est conservée et
 * seul `enabled` change.
 */
export const toggleTrackedTokenServer = createServerFn({ method: "POST" })
  .inputValidator((input: ToggleInput) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tracked_tokens")
      .upsert(
        {
          token_id: data.tokenId,
          token_mint: data.mint,
          token_symbol: data.symbol,
          token_name: data.name,
          enabled: data.enabled,
        },
        { onConflict: "token_mint" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, enabled: data.enabled };
  });
