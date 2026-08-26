ALTER TABLE public.tokens
  ADD COLUMN IF NOT EXISTS risk_score integer,
  ADD COLUMN IF NOT EXISTS risk_level text,
  ADD COLUMN IF NOT EXISTS risk_factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS risk_confidence numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS holders_top20_share numeric,
  ADD COLUMN IF NOT EXISTS creator_share numeric,
  ADD COLUMN IF NOT EXISTS creator_address text,
  ADD COLUMN IF NOT EXISTS creator_previous_tokens integer,
  ADD COLUMN IF NOT EXISTS lp_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS coordination_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS holders_excluded jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.tokens
  DROP CONSTRAINT IF EXISTS tokens_lp_status_check;
ALTER TABLE public.tokens
  ADD CONSTRAINT tokens_lp_status_check
  CHECK (lp_status IN ('burned','locked','unlocked','unknown'));

ALTER TABLE public.tokens
  DROP CONSTRAINT IF EXISTS tokens_risk_level_check;
ALTER TABLE public.tokens
  ADD CONSTRAINT tokens_risk_level_check
  CHECK (risk_level IS NULL OR risk_level IN ('low','medium','high','critical'));