ALTER TABLE public.bot_settings
  ADD COLUMN IF NOT EXISTS early_opportunity_min_volume_1h_usd numeric NOT NULL DEFAULT 30000,
  ADD COLUMN IF NOT EXISTS early_opportunity_acceleration_factor numeric NOT NULL DEFAULT 2;

ALTER TABLE public.bot_settings
  ALTER COLUMN early_opportunity_min_liquidity_usd SET DEFAULT 20000;

UPDATE public.bot_settings SET
  early_opportunity_min_liquidity_usd = 20000,
  early_opportunity_min_buyers = 60,
  early_opportunity_max_buyers = 100,
  early_opportunity_max_age_minutes = 120,
  early_opportunity_min_volume_1h_usd = 30000,
  early_opportunity_acceleration_factor = 2;

ALTER TABLE public.early_opportunity_alerts
  ADD COLUMN IF NOT EXISTS volume_1h_usd numeric,
  ADD COLUMN IF NOT EXISTS acceleration numeric,
  ADD COLUMN IF NOT EXISTS early_strength integer;