# Kelvin CME Phase 7 Replacement Files

Purpose: align the CME PG40 dashboard more closely to the MenthorQ paid-reference screenshots.

Replace these files in your repo:

- `src/types.ts`
- `src/utils/engine.ts`
- `src/cme/report.ts`
- `src/db/realDatabase.ts`
- `src/components/DataSourceStatus.tsx`
- `src/components/MultiExpirationMap.tsx`
- `src/components/AuditPanel.tsx`

Changes:

1. Adds explicit `CME Data Date` vs `Target Session` UI.
   - Example: CME Data Date = 2026-07-08, Target Session = 2026-07-09.
   - Target session is calculated as the next regular weekday after the CME trade date.

2. Multi-expiration map now uses the target session date.
   - Expiries before target session are excluded from First / Next / Highest panels.
   - DTE is calculated from target session, not the EOD data date.

3. All-expiration GEX calculation filters out expired contracts for the target session view.
   - Raw CME audit still shows the full imported row count.

4. HVL / Gamma Flip refinement.
   - Keeps the theoretical Black-76 zero-gamma scan.
   - If a near-spot strike-level profile transition is materially closer to spot, it is used as the display HVL.
   - This is meant to reduce the 50-100 pt drift versus MenthorQ-style HVL lines.

5. Premarket bias is now more MenthorQ-style.
   - Negative GEX near HVL is treated as structurally expansion-prone but execution-wait, not as high range probability.
   - Bear/Bull/Range probabilities should move closer to MenthorQ's conditional bearish expansion view.

6. Trade-path targets are ordered by distance.
   - Bullish path: nearby resistance / EM High before final Call Wall.
   - Bearish path: nearby support / EM Low before final Put Wall.

7. Multi-expiry audit cleanup.
   - Gamma Pivot can show `Audit` by itself without marking the entire expiry invalid.

No PG40 re-import is required for UI/source-status changes, but because this changes active-expiry filtering and HVL display logic, hard refresh the dashboard after deployment.

Build validation: `npm run build` passed locally. Vite emitted only a bundle-size warning.
