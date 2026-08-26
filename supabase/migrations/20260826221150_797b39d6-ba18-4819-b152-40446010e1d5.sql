ALTER TABLE public.bot_settings
  ADD COLUMN IF NOT EXISTS smart_wallet_min_score integer NOT NULL DEFAULT 65,
  ADD COLUMN IF NOT EXISTS smart_wallet_min_buyers integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS smart_wallet_max_age_minutes integer NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS smart_wallet_rank_max integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS early_opportunity_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS early_opportunity_min_score integer NOT NULL DEFAULT 65,
  ADD COLUMN IF NOT EXISTS early_opportunity_min_buyers integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS early_opportunity_max_buyers integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS early_opportunity_max_age_minutes integer NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS early_opportunity_min_liquidity_usd numeric NOT NULL DEFAULT 50000;

CREATE TABLE IF NOT EXISTS public.early_opportunity_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid REFERENCES public.tokens(id) ON DELETE SET NULL,
  token_mint text NOT NULL,
  token_symbol text,
  score integer,
  buyers integer,
  liquidity_usd numeric,
  market_cap numeric,
  age_minutes integer,
  telegram_sent boolean NOT NULL DEFAULT false,
  telegram_error text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT early_opportunity_alerts_token_mint_key UNIQUE (token_mint)
);

GRANT SELECT ON public.early_opportunity_alerts TO anon, authenticated;
GRANT ALL ON public.early_opportunity_alerts TO service_role;

ALTER TABLE public.early_opportunity_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Early opportunity alerts are readable"
  ON public.early_opportunity_alerts FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS early_opportunity_alerts_detected_at_idx
  ON public.early_opportunity_alerts (detected_at DESC);