CREATE TABLE public.tracked_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid REFERENCES public.tokens(id) ON DELETE CASCADE,
  token_mint text NOT NULL,
  token_symbol text,
  token_name text,
  enabled boolean NOT NULL DEFAULT true,
  last_state text NOT NULL DEFAULT 'unknown',
  last_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_evaluated_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tracked_tokens_mint_unique UNIQUE (token_mint)
);

GRANT SELECT ON public.tracked_tokens TO anon;
GRANT SELECT ON public.tracked_tokens TO authenticated;
GRANT ALL ON public.tracked_tokens TO service_role;

ALTER TABLE public.tracked_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tracked tokens readable"
  ON public.tracked_tokens FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE TRIGGER tracked_tokens_updated
  BEFORE UPDATE ON public.tracked_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX tracked_tokens_enabled_idx ON public.tracked_tokens (enabled);
CREATE INDEX tracked_tokens_token_id_idx ON public.tracked_tokens (token_id);

CREATE TABLE public.tracked_token_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracked_token_id uuid REFERENCES public.tracked_tokens(id) ON DELETE CASCADE,
  token_id uuid REFERENCES public.tokens(id) ON DELETE SET NULL,
  token_mint text NOT NULL,
  token_symbol text,
  event_type text NOT NULL,
  event_state text NOT NULL DEFAULT 'unknown',
  severity text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  telegram_sent boolean NOT NULL DEFAULT false,
  telegram_error text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tracked_token_alerts TO anon;
GRANT SELECT ON public.tracked_token_alerts TO authenticated;
GRANT ALL ON public.tracked_token_alerts TO service_role;

ALTER TABLE public.tracked_token_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tracked token alerts readable"
  ON public.tracked_token_alerts FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX tracked_token_alerts_dedup_idx
  ON public.tracked_token_alerts (token_mint, event_type, created_at DESC);