# V1.0.1 Hotfix validation

Validated on the packaged source on 2026-07-05:

- `npm ci` — passed
- `npm run lint` — passed
- `npm run build` — passed
- `npm run test:smoke` — passed
- Provider mock test — passed

The provider mock test verifies that MarketData.app chains are requested using the official expiration-list endpoint and ISO expiration filters, that Unix/ISO date values normalize correctly, and that the retired `dateformat` parameter is absent.
