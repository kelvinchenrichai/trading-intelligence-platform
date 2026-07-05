# Build validation — 2026-07-05

The packaged source was validated in a clean Node 22 environment.

## Passed

```text
npm ci
npm run lint
npm run build
npm run test:smoke
```

Additional production API smoke checks passed:

- `GET /api/health` returns structured `unconfigured` state without credentials.
- `GET /api/daily-report?instrument=NQ` returns HTTP `503` and `NO_SNAPSHOT` when no verified snapshot exists.
- `POST /api/trigger-scrape` is protected by default and returns HTTP `403` until private testing explicitly enables `ALLOW_PUBLIC_MANUAL_REFRESH=true`.

## Not live-validated yet

No MarketData.app token, FRED key, or Supabase project was supplied while this artifact was built. Therefore live provider retrieval and Supabase insert/read tests must be performed after you add the keys described in `DEPLOYMENT_GUIDE_ZH.md`.

## Non-blocking note

The frontend build reports one size warning: the main JavaScript bundle is about 813 kB before gzip. The app builds successfully; code splitting can be a later performance task, not a deployment blocker.

## Docker note

The Dockerfile was reviewed against the same commands but could not be executed here because Docker is not installed in this environment.
