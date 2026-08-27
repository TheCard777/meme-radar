ALTER TABLE public.bot_settings
  ALTER COLUMN early_opportunity_max_buyers SET DEFAULT 150,
  ALTER COLUMN early_opportunity_min_liquidity_usd SET DEFAULT 0,
  ALTER COLUMN early_opportunity_min_volume_1h_usd SET DEFAULT 5000,
  ALTER COLUMN early_opportunity_acceleration_factor SET DEFAULT 1.5,
  ALTER COLUMN smart_wallet_min_buyers SET DEFAULT 100;

UPDATE public.bot_settings
SET early_opportunity_max_buyers = 150,
    early_opportunity_min_buyers = 60,
    early_opportunity_max_age_minutes = 120,
    early_opportunity_min_liquidity_usd = 0,
    early_opportunity_min_volume_1h_usd = 5000,
    early_opportunity_acceleration_factor = 1.5,
    smart_wallet_min_buyers = 100,
    smart_wallet_min_score = 65,
    smart_wallet_rank_max = 100,
    smart_wallet_max_age_minutes = 120;