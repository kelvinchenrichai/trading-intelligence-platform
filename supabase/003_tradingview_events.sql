-- TradingView webhook events + session confirmation layer.
-- Run after 001_initial_schema.sql and 002_cme_bulletin_import.sql.

create table if not exists public.tradingview_events (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  source text not null default 'tradingview',
  symbol text,
  interval text,
  event text not null check (event in (
    'GAMMA_FLIP_TOUCH',
    'GAMMA_FLIP_RECLAIM',
    'GAMMA_FLIP_REJECT',
    'CALL_WALL_TOUCH',
    'CALL_WALL_BREAKOUT_2X5M',
    'PUT_WALL_TOUCH',
    'PUT_WALL_BREAKDOWN_2X5M',
    'WALL_FLIPPED_SUPPORT',
    'WALL_FLIPPED_RESISTANCE',
    'BOS_UP',
    'BOS_DOWN',
    'AVWAP_RECLAIM',
    'AVWAP_REJECT',
    'CONFLUENCE_ZONE_ENTER'
  )),
  side text,
  level_type text,
  level numeric,
  price numeric,
  model_date date,
  underlying text,
  data_mode text,
  payload_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists tradingview_events_model_date_idx on public.tradingview_events(model_date desc, underlying, received_at desc);
create index if not exists tradingview_events_event_idx on public.tradingview_events(event, received_at desc);

alter table public.tradingview_events enable row level security;
