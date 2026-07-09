-- CME Daily Bulletin (PG40) user-uploaded import foundation.
-- Run once after 001_initial_schema.sql in Supabase SQL Editor.

create table if not exists public.cme_bulletin_imports (
  id uuid primary key default gen_random_uuid(),
  trade_date date not null,
  bulletin_date_text text not null,
  source_file_name text not null,
  sha256 text not null,
  parser_version text not null,
  underlying_contract text not null,
  futures_settlement numeric not null,
  contract_count integer not null check (contract_count > 0),
  status text not null check (status in ('parsed','failed')),
  warnings jsonb not null default '[]'::jsonb,
  summary_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.cme_nq_option_contracts (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.cme_bulletin_imports(id) on delete cascade,
  trade_date date not null,
  underlying_contract text not null,
  option_family text not null,
  option_code text,
  expiry_label text not null,
  expiry_date date not null,
  expiry_precision text not null check (expiry_precision in ('estimated','manual_override')),
  option_type text not null check (option_type in ('call','put')),
  strike numeric not null,
  settlement numeric,
  delta numeric,
  open_interest bigint not null default 0,
  volume bigint not null default 0,
  source_page integer not null,
  raw_row_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (import_id, option_family, expiry_label, option_type, strike, source_page)
);

create unique index if not exists cme_bulletin_imports_sha256_parser_version_uq on public.cme_bulletin_imports(sha256, parser_version);
create index if not exists cme_bulletin_imports_trade_date_idx on public.cme_bulletin_imports(trade_date desc);
create index if not exists cme_nq_option_contracts_import_idx on public.cme_nq_option_contracts(import_id, expiry_date, strike);
create index if not exists cme_nq_option_contracts_trade_date_idx on public.cme_nq_option_contracts(trade_date desc, underlying_contract);

alter table public.cme_bulletin_imports enable row level security;
alter table public.cme_nq_option_contracts enable row level security;
