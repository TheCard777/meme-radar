CREATE INDEX IF NOT EXISTS token_snapshots_captured_idx
  ON public.token_snapshots (captured_at);
CREATE INDEX IF NOT EXISTS tokens_creator_address_idx
  ON public.tokens (creator_address)
  WHERE creator_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS tokens_real_launched_idx
  ON public.tokens (launched_at DESC)
  WHERE is_simulated = false;