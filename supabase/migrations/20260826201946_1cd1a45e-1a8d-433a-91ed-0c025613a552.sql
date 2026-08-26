DROP POLICY IF EXISTS "bot settings updatable" ON public.bot_settings;
DROP POLICY IF EXISTS "collector_state desired state updatable" ON public.collector_state;
REVOKE UPDATE ON public.bot_settings FROM anon, authenticated;
REVOKE UPDATE ON public.collector_state FROM anon, authenticated;
GRANT ALL ON public.bot_settings TO service_role;
GRANT ALL ON public.collector_state TO service_role;