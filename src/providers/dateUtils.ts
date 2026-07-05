/**
 * Date normalization for external market-data APIs.
 *
 * Providers sometimes return timestamps in seconds, milliseconds, ISO strings,
 * date-only strings, or numeric strings depending on endpoint / account mode.
 * This module accepts those supported representations and fails with a provider-
 * readable error instead of allowing `Date#toISOString()` to throw "Invalid time value".
 */
export type ExternalDateValue = number | string | null | undefined;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const NUMERIC = /^-?\d+(?:\.\d+)?$/;

export function normalizeExternalDate(value: ExternalDateValue, fieldName: string): string {
  if (value === null || value === undefined || value === "") {
    throw new Error(`${fieldName} is missing`);
  }

  let date: Date;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${fieldName} is not finite`);
    }
    // Unix seconds are currently used by MarketData.app / Yahoo. Milliseconds are
    // also accepted defensively for APIs or serialization layers that return them.
    const milliseconds = Math.abs(value) < 10_000_000_000 ? value * 1000 : value;
    date = new Date(milliseconds);
  } else {
    const raw = value.trim();
    if (!raw) throw new Error(`${fieldName} is empty`);

    if (DATE_ONLY.test(raw)) {
      // Keep date-only expiry values stable and avoid timezone conversion.
      return raw;
    }

    if (NUMERIC.test(raw)) {
      return normalizeExternalDate(Number(raw), fieldName);
    }

    date = new Date(raw);
  }

  if (Number.isNaN(date.getTime())) {
    const preview = typeof value === "string" ? JSON.stringify(value.slice(0, 80)) : String(value);
    throw new Error(`${fieldName} is invalid (${preview})`);
  }

  return date.toISOString().slice(0, 10);
}

export function firstValidExternalDate(
  values: ExternalDateValue[] | undefined,
  fallback: string,
  fieldName: string
): string {
  for (const value of values || []) {
    try {
      return normalizeExternalDate(value, fieldName);
    } catch {
      // A single malformed array element should not discard a valid snapshot.
    }
  }
  return fallback;
}

export function isIsoDate(value: string): boolean {
  return DATE_ONLY.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}
