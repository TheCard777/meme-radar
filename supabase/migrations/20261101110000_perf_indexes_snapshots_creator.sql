-- Index de performance : deux requêtes de chaque cycle d'enrichissement (90 s)
-- parcouraient des tables entières et saturaient la base (timeouts, 504).

-- Purge des instantanés > 7 jours (purgeOldSnapshots : captured_at < cutoff).
-- L'index existant (token_id, captured_at) ne sert pas à ce filtre seul.
CREATE INDEX IF NOT EXISTS token_snapshots_captured_idx
  ON public.token_snapshots (captured_at);

-- Déploiements antérieurs d'un créateur (resolveCreator : count par creator_address),
-- exécuté pour chaque nouveau token.
CREATE INDEX IF NOT EXISTS tokens_creator_address_idx
  ON public.tokens (creator_address)
  WHERE creator_address IS NOT NULL;

-- File d'enrichissement des tokens récents (< 2 h) : filtre launched_at.
CREATE INDEX IF NOT EXISTS tokens_real_launched_idx
  ON public.tokens (launched_at DESC)
  WHERE is_simulated = false;
