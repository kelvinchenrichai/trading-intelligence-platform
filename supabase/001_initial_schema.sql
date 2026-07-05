-- Trading Intelligence Platform: durable research snapshots
-- Run this once in Supabase Dashboard > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.refresh_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('success', 'partial', 'failed')),
  snapshot_date date not null,
  snapshot_timestamp timestamptz not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  source_names jsonb not null default '[]'::jsonb,
  source_status jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  refresh_run_id uuid not null references public.refresh_runs(id) on delete cascade,
  snapshot_date date not null,
  instrument text not null check (instrument in ('NQ', 'ES')),
  proxy text not null check (proxy in ('NDX', 'SPX')),
  as_of timestamptz not null,
  data_confidence text not null check (data_confidence in ('high', 'medium', 'low')),
  report_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (snapshot_date, instrument)
);

create table if not exists public.reconciliation_records (
  id uuid primary key default gen_random_uuid(),
  refresh_run_id uuid not null references public.refresh_runs(id) on delete cascade,
  snapshot_date date not null,
  snapshot_timestamp timestamptz not null,
  proxy text not null,
  expiry date not null,
  strike numeric not null,
  option_type text not null check (option_type in ('call', 'put')),
  source_values_json jsonb not null,
  status text not null check (status in ('consensus', 'conflict')),
  resolved_value jsonb not null,
  resolved_source text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.macro_snapshots (
  id uuid primary key default gen_random_uuid(),
  refresh_run_id uuid not null references public.refresh_runs(id) on delete cascade,
  snapshot_date date not null unique,
  source text not null,
  vix numeric,
  dxy numeric,
  us10y numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.option_contracts (
  id uuid primary key default gen_random_uuid(),
  refresh_run_id uuid not null references public.refresh_runs(id) on delete cascade,
  snapshot_date date not null,
  proxy text not null,
  source text not null,
  expiry date not null,
  strike numeric not null,
  option_type text not null check (option_type in ('call', 'put')),
  oi bigint not null default 0,
  iv numeric,
  volume bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (snapshot_date, proxy, source, expiry, strike, option_type)
);

create index if not exists daily_reports_instrument_date_idx on public.daily_reports (instrument, snapshot_date desc);
create index if not exists reconciliation_proxy_date_idx on public.reconciliation_records (proxy, snapshot_date, expiry, strike);
create index if not exists option_contracts_proxy_date_idx on public.option_contracts (proxy, snapshot_date, expiry, strike);
create index if not exists refresh_runs_completed_idx on public.refresh_runs (completed_at desc);

-- All application data is private. The server uses the Supabase secret/service-role key.
-- Do not expose that key in Vite / browser variables.
alter table public.refresh_runs enable row level security;
alter table public.daily_reports enable row level security;
alter table public.reconciliation_records enable row level security;
alter table public.macro_snapshots enable row level security;
alter table public.option_contracts enable row level security;
