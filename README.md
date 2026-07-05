# Trading Intelligence Platform (TIP) — Research MVP

A private, durable **NQ / ES pre-market options-structure research tool** built on NDX / SPX option proxies. The production path uses no simulated market data. It persists daily reports, provider reconciliation records, raw option contracts, and macro snapshots to Supabase.

## What this build does

- MarketData.app primary data provider; Yahoo Finance fallback / reconciliation provider.
- FRED macro lookup with transparent fallbacks.
- OI-based Gamma Exposure (GEX) proxy, Gamma Flip, Call Wall, Put Wall, Expected Move, and regime output.
- Supabase persistence for snapshot history and Audit Ledger.
- `/api/health` and user-visible data-source failure states.
- Railway-ready web service and separate scheduled refresh service.

## What it does not claim to do

This is **not** a real-time OPRA feed, direct dealer-positioning system, trade-execution engine, payment platform, or investment-advice product. It uses delayed / EOD data and an OI-based proxy model.

## Start here

Read **[DEPLOYMENT_GUIDE_ZH.md](./DEPLOYMENT_GUIDE_ZH.md)** for the complete Chinese deployment and test procedure.

## Required production variables

```env
MARKETDATA_TOKEN=
FRED_API_KEY=
SUPABASE_URL=
SUPABASE_SECRET_KEY=
MAX_EXPIRIES=4
NODE_ENV=production
```

Copy `.env.example` to `.env` for local work. Never commit `.env`.

## Commands

```bash
npm ci
npm run dev
npm run lint
npm run build
npm run refresh
```

## Database migration

Run `supabase/001_initial_schema.sql` once in the Supabase SQL Editor before the first refresh.
