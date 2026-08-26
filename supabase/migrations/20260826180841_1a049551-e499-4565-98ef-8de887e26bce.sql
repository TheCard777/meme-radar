
-- 1) Archivage des données de démonstration
CREATE TABLE IF NOT EXISTS public.demo_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  rows_removed integer NOT NULL DEFAULT 0,
  archived_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.demo_archive TO anon, authenticated;
GRANT ALL ON public.demo_archive TO service_role;
ALTER TABLE public.demo_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo archive readable" ON public.demo_archive FOR SELECT USING (true);

INSERT INTO public.demo_archive (table_name, rows_removed)
SELECT 'wallet_trades', count(*) FROM public.wallet_trades WHERE is_simulated = true;
INSERT INTO public.demo_archive (table_name, rows_removed)
SELECT 'alerts', count(*) FROM public.alerts WHERE is_simulated = true;
INSERT INTO public.demo_archive (table_name, rows_removed)
SELECT 'smart_wallets', count(*) FROM public.smart_wallets WHERE is_simulated = true;
INSERT INTO public.demo_archive (table_name, rows_removed)
SELECT 'tokens', count(*) FROM public.tokens WHERE is_simulated = true;

DELETE FROM public.wallet_trades WHERE is_simulated = true;
DELETE FROM public.alerts WHERE is_simulated = true;
DELETE FROM public.wallet_trades WHERE wallet_id IN (SELECT id FROM public.smart_wallets WHERE is_simulated = true);
DELETE FROM public.smart_wallets WHERE is_simulated = true;
DELETE FROM public.token_snapshots WHERE token_id IN (SELECT id FROM public.tokens WHERE is_simulated = true);
DELETE FROM public.wallet_trades WHERE token_id IN (SELECT id FROM public.tokens WHERE is_simulated = true);
DELETE FROM public.alerts WHERE token_id IN (SELECT id FROM public.tokens WHERE is_simulated = true);
DELETE FROM public.tokens WHERE is_simulated = true;

UPDATE public.bot_settings SET demo_mode = false;

-- 2) Smart wallets réels
ALTER TABLE public.smart_wallets
  ADD COLUMN IF NOT EXISTS smart_wallet_score numeric,
  ADD COLUMN IF NOT EXISTS early_entries integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tokens_tracked integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS success_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS success_rate numeric,
  ADD COLUMN IF NOT EXISTS median_multiple numeric,
  ADD COLUMN IF NOT EXISTS data_sufficient boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS smart_wallets_address_key ON public.smart_wallets (address);

CREATE TABLE IF NOT EXISTS public.wallet_token_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  token_id uuid NOT NULL REFERENCES public.tokens(id) ON DELETE CASCADE,
  mint_address text NOT NULL,
  signature text NOT NULL,
  entry_rank integer NOT NULL DEFAULT 0,
  amount_raw numeric,
  block_time timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wallet_address, token_id)
);
CREATE INDEX IF NOT EXISTS wallet_token_entries_wallet_idx ON public.wallet_token_entries (wallet_address);
CREATE INDEX IF NOT EXISTS wallet_token_entries_token_idx ON public.wallet_token_entries (token_id);
GRANT SELECT ON public.wallet_token_entries TO anon, authenticated;
GRANT ALL ON public.wallet_token_entries TO service_role;
ALTER TABLE public.wallet_token_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallet entries readable" ON public.wallet_token_entries FOR SELECT USING (true);

-- 3) Mesure post-signal
ALTER TABLE public.token_snapshots ADD COLUMN IF NOT EXISTS price_usd numeric NOT NULL DEFAULT 0;
ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS token_mint text,
  ADD COLUMN IF NOT EXISTS price_usd_at_alert numeric,
  ADD COLUMN IF NOT EXISTS market_cap_at_alert numeric;

ALTER TABLE public.tokens
  ADD COLUMN IF NOT EXISTS wallets_analyzed_at timestamptz,
  ADD COLUMN IF NOT EXISTS early_buyers_found integer NOT NULL DEFAULT 0;
