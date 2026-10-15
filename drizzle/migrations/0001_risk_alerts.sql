CREATE TABLE IF NOT EXISTS public.risk_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid,
  token_mint text NOT NULL,
  token_symbol text,
  level text NOT NULL CHECK (level IN ('high','critical','urgent')),
  risk_score integer,
  confidence numeric,
  factors jsonb,
  liquidity_drop_ratio numeric,
  telegram_sent boolean NOT NULL DEFAULT false,
  telegram_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_mint_created ON public.risk_alerts (token_mint, created_at DESC);
GRANT ALL ON public.risk_alerts TO service_role;
ALTER TABLE public.risk_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_settings
  ADD COLUMN IF NOT EXISTS risk_alerts_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS risk_alert_min_confidence numeric NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS risk_alert_cooldown_minutes integer NOT NULL DEFAULT 360,
  ADD COLUMN IF NOT EXISTS early_opportunity_max_volume_liquidity_ratio numeric NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS early_opportunity_solid_min_strength integer NOT NULL DEFAULT 80;