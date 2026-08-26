CREATE TABLE public.smart_wallet_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  token_mint text NOT NULL,
  token_id uuid REFERENCES public.tokens(id) ON DELETE SET NULL,
  token_symbol text,
  wallet_score numeric,
  transaction_signature text,
  first_entry_detected_at timestamptz NOT NULL DEFAULT now(),
  telegram_sent boolean NOT NULL DEFAULT false,
  telegram_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT smart_wallet_alerts_unique_entry UNIQUE (wallet_address, token_mint)
);

GRANT SELECT ON public.smart_wallet_alerts TO anon, authenticated;
GRANT ALL ON public.smart_wallet_alerts TO service_role;

ALTER TABLE public.smart_wallet_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "smart wallet alerts readable"
ON public.smart_wallet_alerts FOR SELECT
TO anon, authenticated
USING (true);

CREATE TRIGGER smart_wallet_alerts_updated
BEFORE UPDATE ON public.smart_wallet_alerts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.bot_settings
  ADD COLUMN IF NOT EXISTS smart_wallet_alerts_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS smart_wallet_alert_threshold integer NOT NULL DEFAULT 75;