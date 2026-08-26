CREATE TABLE IF NOT EXISTS public.collector_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  desired_state text NOT NULL DEFAULT 'stopped' CHECK (desired_state IN ('stopped','running')),
  runtime_state text NOT NULL DEFAULT 'stopped' CHECK (runtime_state IN ('stopped','connecting','running','error')),
  source text NOT NULL DEFAULT 'none',
  last_heartbeat_at timestamptz,
  last_event_at timestamptz,
  events_received bigint NOT NULL DEFAULT 0,
  tokens_confirmed bigint NOT NULL DEFAULT 0,
  last_signature text,
  reconnects integer NOT NULL DEFAULT 0,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.collector_state TO anon;
GRANT SELECT, UPDATE ON public.collector_state TO authenticated;
GRANT ALL ON public.collector_state TO service_role;

ALTER TABLE public.collector_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "collector_state readable by everyone"
  ON public.collector_state FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "collector_state desired state updatable"
  ON public.collector_state FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER collector_state_updated
  BEFORE UPDATE ON public.collector_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.collector_state (singleton) VALUES (true) ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.tokens ADD COLUMN IF NOT EXISTS detection_source text NOT NULL DEFAULT 'seed';
ALTER TABLE public.tokens ADD COLUMN IF NOT EXISTS detection_signature text;

CREATE UNIQUE INDEX IF NOT EXISTS tokens_detection_signature_key
  ON public.tokens (detection_signature) WHERE detection_signature IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tokens_mint_address_key
  ON public.tokens (mint_address);