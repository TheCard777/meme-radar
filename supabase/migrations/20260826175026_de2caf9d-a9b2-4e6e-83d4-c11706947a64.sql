ALTER TABLE public.tokens
  ADD COLUMN IF NOT EXISTS liquidity_usd numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_usd numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_change_1h numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS volume_1h numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS market_source text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS last_enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS alerted_score integer NOT NULL DEFAULT 0;

ALTER TABLE public.token_snapshots
  ADD COLUMN IF NOT EXISTS liquidity_usd numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS tokens_last_enriched_idx ON public.tokens (last_enriched_at NULLS FIRST);