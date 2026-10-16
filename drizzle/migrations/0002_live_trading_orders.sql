CREATE TABLE public.trade_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mint text NOT NULL,
  symbol text,
  stake_usd numeric NOT NULL,
  token_amount_raw text NOT NULL,
  token_decimals int NOT NULL DEFAULT 6,
  entry_price_usd numeric NOT NULL,
  entry_liquidity_usd numeric,
  status text NOT NULL DEFAULT 'open',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  exit_reason text,
  realized_pnl_usd numeric,
  buy_signature text,
  sell_signature text
);
REVOKE ALL ON public.trade_positions FROM anon, authenticated;
GRANT ALL ON public.trade_positions TO service_role;
ALTER TABLE public.trade_positions ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX trade_positions_one_open_per_mint ON public.trade_positions (mint) WHERE status = 'open';

CREATE TABLE public.trade_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  side text NOT NULL,
  mint text NOT NULL,
  symbol text,
  position_id uuid,
  usd_amount numeric NOT NULL,
  in_amount_raw text NOT NULL,
  expected_out_raw text NOT NULL,
  min_out_raw text NOT NULL,
  out_decimals int NOT NULL,
  price_usd numeric,
  liquidity_usd numeric,
  slippage_bps int NOT NULL,
  price_impact_pct numeric,
  fee_lamports bigint NOT NULL DEFAULT 0,
  route text,
  exit_reason text,
  unsigned_tx text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  signature text,
  error text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.trade_orders FROM anon, authenticated;
GRANT ALL ON public.trade_orders TO service_role;
ALTER TABLE public.trade_orders ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX trade_orders_one_active ON public.trade_orders (mint, side) WHERE status IN ('pending','sending');
CREATE INDEX trade_orders_created_idx ON public.trade_orders (created_at DESC);

ALTER TABLE public.bot_settings
  ADD COLUMN IF NOT EXISTS live_kill_switch boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS live_trading_armed boolean NOT NULL DEFAULT false;