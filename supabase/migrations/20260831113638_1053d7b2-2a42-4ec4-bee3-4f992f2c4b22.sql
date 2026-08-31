CREATE TABLE public.telegram_recipients (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null unique,
  label text not null default 'Destinataire',
  role text not null default 'secondary' check (role in ('owner','secondary')),
  is_active boolean not null default true,
  prefs jsonb not null default '{"early_opportunity":true,"smart_wallet":true,"risk":true,"tracking":true,"now":false,"general":true}'::jsonb,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT ALL ON public.telegram_recipients TO service_role;
ALTER TABLE public.telegram_recipients ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.telegram_invites (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  label text not null default 'Invité',
  prefs jsonb not null default '{"early_opportunity":true,"smart_wallet":true,"risk":true,"tracking":true,"now":false,"general":true}'::jsonb,
  expires_at timestamptz not null,
  used_at timestamptz,
  recipient_id uuid references public.telegram_recipients(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT ALL ON public.telegram_invites TO service_role;
ALTER TABLE public.telegram_invites ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER telegram_recipients_updated BEFORE UPDATE ON public.telegram_recipients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER telegram_invites_updated BEFORE UPDATE ON public.telegram_invites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX telegram_recipients_active_idx ON public.telegram_recipients (is_active);
CREATE INDEX telegram_invites_expires_idx ON public.telegram_invites (expires_at);