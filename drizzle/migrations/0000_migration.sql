ALTER TABLE public.tokens
  ADD COLUMN IF NOT EXISTS market_miss_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_enrich_at timestamptz;
CREATE INDEX IF NOT EXISTS tokens_enrich_queue_idx ON public.tokens (is_simulated, launched_at DESC, next_enrich_at);