
CREATE TABLE public.bot_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  status text NOT NULL DEFAULT 'paused' CHECK (status IN ('paused','active')),
  telegram_threshold integer NOT NULL DEFAULT 85,
  critical_threshold integer NOT NULL DEFAULT 90,
  signal_categories jsonb NOT NULL DEFAULT '{"smart_money":true,"volume_spike":true,"new_buyers":true,"liquidity_lock":true,"holder_growth":true,"socials":false}'::jsonb,
  telegram_connected boolean NOT NULL DEFAULT false,
  demo_mode boolean NOT NULL DEFAULT true,
  last_scan_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.bot_settings TO anon, authenticated;
GRANT ALL ON public.bot_settings TO service_role;
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bot settings readable" ON public.bot_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "bot settings updatable" ON public.bot_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  name text NOT NULL,
  mint_address text NOT NULL UNIQUE,
  market_cap numeric NOT NULL DEFAULT 0,
  volume_24h numeric NOT NULL DEFAULT 0,
  new_buyers integer NOT NULL DEFAULT 0,
  smart_wallet_count integer NOT NULL DEFAULT 0,
  score integer NOT NULL DEFAULT 0,
  score_factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'watching' CHECK (status IN ('watching','signal','critical','cooling','archived')),
  is_simulated boolean NOT NULL DEFAULT true,
  launched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tokens TO anon, authenticated;
GRANT ALL ON public.tokens TO service_role;
ALTER TABLE public.tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tokens readable" ON public.tokens FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.token_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES public.tokens(id) ON DELETE CASCADE,
  market_cap numeric NOT NULL DEFAULT 0,
  volume numeric NOT NULL DEFAULT 0,
  buyers integer NOT NULL DEFAULT 0,
  score integer NOT NULL DEFAULT 0,
  captured_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.token_snapshots TO anon, authenticated;
GRANT ALL ON public.token_snapshots TO service_role;
ALTER TABLE public.token_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "snapshots readable" ON public.token_snapshots FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.smart_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL UNIQUE,
  label text,
  win_rate numeric NOT NULL DEFAULT 0,
  simulated_pnl numeric NOT NULL DEFAULT 0,
  trade_count integer NOT NULL DEFAULT 0,
  is_simulated boolean NOT NULL DEFAULT true,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.smart_wallets TO anon, authenticated;
GRANT ALL ON public.smart_wallets TO service_role;
ALTER TABLE public.smart_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallets readable" ON public.smart_wallets FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.wallet_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.smart_wallets(id) ON DELETE CASCADE,
  token_id uuid REFERENCES public.tokens(id) ON DELETE SET NULL,
  token_symbol text NOT NULL,
  side text NOT NULL DEFAULT 'buy' CHECK (side IN ('buy','sell')),
  amount_sol numeric NOT NULL DEFAULT 0,
  is_simulated boolean NOT NULL DEFAULT true,
  traded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallet_trades TO anon, authenticated;
GRANT ALL ON public.wallet_trades TO service_role;
ALTER TABLE public.wallet_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trades readable" ON public.wallet_trades FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid REFERENCES public.tokens(id) ON DELETE SET NULL,
  token_symbol text NOT NULL,
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('info','signal','critical')),
  score integer NOT NULL DEFAULT 0,
  message text NOT NULL,
  channel text NOT NULL DEFAULT 'dashboard',
  is_simulated boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.alerts TO anon, authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts readable" ON public.alerts FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER bot_settings_updated BEFORE UPDATE ON public.bot_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tokens_updated BEFORE UPDATE ON public.tokens FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.bot_settings (status, telegram_threshold, critical_threshold, last_scan_at)
VALUES ('paused', 85, 90, now() - interval '12 minutes');

INSERT INTO public.tokens (symbol, name, mint_address, market_cap, volume_24h, new_buyers, smart_wallet_count, score, status, launched_at, score_factors) VALUES
('BONKAI','Bonk Intelligence','SiMuLaTeD1111111111111111111111111111111', 842000, 315000, 1240, 9, 94, 'critical', now() - interval '3 hours', '[{"label":"Smart money inflow","weight":30,"value":28},{"label":"Volume spike","weight":25,"value":24},{"label":"Nouveaux acheteurs","weight":20,"value":18},{"label":"Liquidité verrouillée","weight":15,"value":15},{"label":"Croissance holders","weight":10,"value":9}]'::jsonb),
('SOLCAT','Solana Cat','SiMuLaTeD2222222222222222222222222222222', 415000, 187000, 860, 6, 91, 'critical', now() - interval '7 hours', '[{"label":"Smart money inflow","weight":30,"value":26},{"label":"Volume spike","weight":25,"value":22},{"label":"Nouveaux acheteurs","weight":20,"value":17},{"label":"Liquidité verrouillée","weight":15,"value":15},{"label":"Croissance holders","weight":10,"value":11}]'::jsonb),
('PUMPKN','Pumpkin Season','SiMuLaTeD3333333333333333333333333333333', 268000, 96000, 540, 5, 87, 'signal', now() - interval '11 hours', '[{"label":"Smart money inflow","weight":30,"value":22},{"label":"Volume spike","weight":25,"value":20},{"label":"Nouveaux acheteurs","weight":20,"value":16},{"label":"Liquidité verrouillée","weight":15,"value":15},{"label":"Croissance holders","weight":10,"value":14}]'::jsonb),
('WIFDOG','Wif Dog Reloaded','SiMuLaTeD4444444444444444444444444444444', 132000, 54000, 320, 3, 78, 'watching', now() - interval '2 hours', '[{"label":"Smart money inflow","weight":30,"value":18},{"label":"Volume spike","weight":25,"value":17},{"label":"Nouveaux acheteurs","weight":20,"value":13},{"label":"Liquidité verrouillée","weight":15,"value":15},{"label":"Croissance holders","weight":10,"value":15}]'::jsonb),
('MOONRT','Moon Rocket','SiMuLaTeD5555555555555555555555555555555', 74000, 28000, 190, 2, 66, 'watching', now() - interval '45 minutes', '[{"label":"Smart money inflow","weight":30,"value":12},{"label":"Volume spike","weight":25,"value":15},{"label":"Nouveaux acheteurs","weight":20,"value":11},{"label":"Liquidité verrouillée","weight":15,"value":15},{"label":"Croissance holders","weight":10,"value":13}]'::jsonb),
('DEGENX','Degen Index','SiMuLaTeD6666666666666666666666666666666', 51000, 12000, 90, 1, 48, 'cooling', now() - interval '26 hours', '[{"label":"Smart money inflow","weight":30,"value":8},{"label":"Volume spike","weight":25,"value":9},{"label":"Nouveaux acheteurs","weight":20,"value":7},{"label":"Liquidité verrouillée","weight":15,"value":15},{"label":"Croissance holders","weight":10,"value":9}]'::jsonb),
('FROGGY','Froggy Finance','SiMuLaTeD7777777777777777777777777777777', 196000, 71000, 410, 4, 83, 'signal', now() - interval '5 hours', '[{"label":"Smart money inflow","weight":30,"value":20},{"label":"Volume spike","weight":25,"value":19},{"label":"Nouveaux acheteurs","weight":20,"value":14},{"label":"Liquidité verrouillée","weight":15,"value":15},{"label":"Croissance holders","weight":10,"value":15}]'::jsonb);

INSERT INTO public.token_snapshots (token_id, market_cap, volume, buyers, score, captured_at)
SELECT t.id, t.market_cap * f.k, t.volume_24h * f.k, (t.new_buyers * f.k)::int, greatest(20, (t.score * f.k)::int), now() - (f.h || ' hours')::interval
FROM public.tokens t
CROSS JOIN (VALUES (0.35,6),(0.55,5),(0.7,4),(0.82,3),(0.9,2),(0.97,1),(1.0,0)) AS f(k,h);

INSERT INTO public.smart_wallets (address, label, win_rate, simulated_pnl, trade_count, last_active_at) VALUES
('7xKQmL4aVbNc9pR2sTuW1yZ3dE5fG6hJ8kL0mNpQrSt','Alpha hunter', 72.4, 1284.5, 148, now() - interval '18 minutes'),
('9aBcD3efGh5iJk7lMn1oPq2rSt4uVw6xYz8AbCdEfGh','Early sniper', 64.1, 842.2, 233, now() - interval '1 hour'),
('4mNpQrStUvWxYz1aBcDeFgHiJkLmNoPqRsTuVwXyZ12','Whale mirror', 58.9, 2310.7, 61, now() - interval '3 hours'),
('2zYxWvUtSrQpOnMlKjIhGfEdCbA9876543210zYxWv','Scalper bot', 51.3, -142.8, 512, now() - interval '25 minutes'),
('5qWeRtYuIoPaSdFgHjKlZxCvBnM1234567890qWeRt','Steady accumulator', 68.7, 976.4, 97, now() - interval '6 hours');

INSERT INTO public.wallet_trades (wallet_id, token_id, token_symbol, side, amount_sol, traded_at)
SELECT w.id, t.id, t.symbol, 'buy', round((random()*40 + 2)::numeric, 2), now() - (round(random()*40) || ' minutes')::interval
FROM public.smart_wallets w
CROSS JOIN LATERAL (SELECT * FROM public.tokens ORDER BY random() LIMIT 3) t;

INSERT INTO public.alerts (token_id, token_symbol, level, score, message, channel, created_at)
SELECT t.id, t.symbol,
  CASE WHEN t.score >= 90 THEN 'critical' WHEN t.score >= 85 THEN 'signal' ELSE 'info' END,
  t.score,
  'SIMULATION — ' || t.symbol || ' a atteint un score de ' || t.score || '/100',
  CASE WHEN t.score >= 85 THEN 'telegram' ELSE 'dashboard' END,
  now() - (round(random()*300) || ' minutes')::interval
FROM public.tokens t;
