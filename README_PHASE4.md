# Kelvin CME Phase 4 — Supabase status + latest CME dashboard fix

Replace this file in your repo:

- `src/db/realDatabase.ts`

## What it fixes

- Prevents a non-critical Supabase error from `refresh_runs`, `daily_reports`, or `tradingview_events` from poisoning `store.lastError` and blocking CME PG40 reads.
- Stops the UI from incorrectly showing `資料狀態：尚未連接 Supabase` when Supabase CME import tables are actually working.
- Allows `/api/daily-report?instrument=NQ` to read the newest CME import, such as `2026-07-08 · cme-pg40-v0.3.0-optiontype-column-resolver`, even if the proxy snapshot store is degraded.

## Deploy steps

1. Copy `src/db/realDatabase.ts` into your repo.
2. Commit and deploy.
3. Hard refresh the browser.
4. Open `/api/health` and confirm `persistence` is `durable`.
5. Open `/api/daily-report?instrument=NQ` and confirm the report uses the newest CME import.

## Expected validation

- Dashboard default date should become `2026-07-08`.
- Parser should show `cme-pg40-v0.3.0-optiontype-column-resolver`.
- Contract count should show about `4,628` for the latest 7/8 import.
