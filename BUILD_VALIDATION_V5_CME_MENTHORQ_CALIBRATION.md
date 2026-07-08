# Build Validation — V5 CME Full Expiry Resolver + Comparable GEX

## Scope

V5 focuses on the NQ CME PG40 workflow:

- Broader PG40 section detection for E-mini Nasdaq weekly, monthly, EOM, and Additional Nasdaq daily/MID/THUR/WED sections.
- Estimated daily/weekly/monthly/EOM expiry resolver with transparent warnings.
- Expiry summaries grouped by resolved expiry date instead of separate CME section labels.
- GEX display calibration layer:
  - Raw CME Black-76 GEX remains preserved.
  - Point GEX = Raw / NQ multiplier 20.
  - Comparable GEX is a transparent display-scale calibration for side-by-side review. It is not MenthorQ proprietary logic.
- Data Source Status and Multi Expiration UI now show comparable GEX alongside raw GEX.

## Validation Commands

```bash
npm run lint
npm run build
CME_SAMPLE_PDF="/path/to/Section40_Nasdaq_100_And_E_Mini_Nasdaq_100_Options.pdf" npm run test:cme-parser
```

## Local Validation Result

Using the user-provided 2026-07-07 PG40 sample:

```json
{
  "tradeDate": "2026-07-07",
  "underlyingContract": "NQU2026",
  "futuresSettlement": 29391.5,
  "contractCount": 3999,
  "expiryGroups": 20
}
```

CME Black-76 report sample:

```json
{
  "rawNetGex": -250680215,
  "rawGrossGex": 2591232491,
  "comparableNetGex": -2881382,
  "comparableGrossGex": 14807043,
  "putWall": 29000,
  "gammaFlip": 29483.8,
  "callWall": 30000,
  "expectedMove": { "points": 422, "low": 28970, "high": 29814 }
}
```

Reference benchmark supplied by user from MenthorQ text output:

- Net GEX: -2.88M
- Total GEX: 14.81M
- Put Support: 29,000
- HVL: 29,550
- Call Resistance: 30,000
- 1D Min / Max: 28,977.77 / 29,861.23

## Important Notes

The comparable GEX calibration is intentionally labeled as a display calibration. It must not be marketed as MenthorQ's private formula or exact replication. Raw CME Black-76 values remain available for audit.
