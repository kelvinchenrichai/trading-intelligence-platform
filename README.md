# Trading Intelligence Platform — V2 CME Import Foundation

This version keeps the existing NDX/SPX research path and adds a separate, user-uploaded CME Daily Bulletin PG40 importer for NQ futures options.

## New in V2

- Private `CME official EOD import` screen in the dashboard.
- Protected PDF upload endpoint: `POST /api/cme/import`.
- Parses CME Section 40 NQ option rows from a user-provided PDF using coordinate-preserving Poppler extraction.
- Persists CME import metadata and rows in Supabase tables created by `supabase/002_cme_bulletin_import.sql`.
- Stores source filename, SHA-256, parser version, page number, raw parsed row, settlement, OI, volume, delta, expiry group, and estimated expiry date.
- Does **not** auto-download / scrape CME PDFs.

## Deploy update

1. Run `supabase/002_cme_bulletin_import.sql` once in Supabase SQL Editor.
2. Replace your GitHub repository with this project update.
3. Render will rebuild. The Docker image installs `poppler-utils` for PDF parsing.
4. Keep `AUTO_REFRESH_ON_START=false`.
5. Open the homepage and use the CME importer with your existing `REFRESH_API_TOKEN`.

## Current scope

This is the durable CME data-ingestion foundation. It does not yet represent a final Black-76 GEX / dealer-flow engine. Expiry dates for weekly/daily products are explicitly marked `estimated` until contract-calendar validation is completed.
