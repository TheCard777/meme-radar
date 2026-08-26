ALTER TABLE public.tokens
  ADD COLUMN IF NOT EXISTS market_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS missing_metrics jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS score_confidence numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS data_sufficient boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS holders_top10_share numeric,
  ADD COLUMN IF NOT EXISTS alert_level text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS last_alert_at timestamptz;