/**
 * Primary provider: MarketData.app.
 *
 * The provider intentionally retrieves a small, explicit list of expirations and
 * then queries each expiration. The chain endpoint defaults to one expiration
 * when no expiration filter is provided, so selecting expirations first is both
 * more correct and easier to diagnose than requesting a broad chain and slicing
 * response rows locally.
 */
import { OptionsDataProvider, RawOptionContract, UnderlyingQuote } from "./types";
import { ExternalDateValue, firstValidExternalDate, normalizeExternalDate } from "./dateUtils";

const BASE_URL = "https://api.marketdata.app/v1";

type ApiNumber = number | string | null | undefined;

interface OptionChainResponse {
  s: string;
  optionSymbol?: string[];
  underlying?: string[];
  expiration?: ExternalDateValue[];
  strike?: ApiNumber[];
  side?: string[];
  openInterest?: ApiNumber[];
  iv?: ApiNumber[];
  volume?: ApiNumber[];
  updated?: ExternalDateValue[];
  errmsg?: string;
}

interface ExpirationsResponse {
  s: string;
  expirations?: ExternalDateValue[];
  updated?: ExternalDateValue[];
  errmsg?: string;
}

interface IndexQuoteResponse {
  s: string;
  symbol?: string[];
  last?: ApiNumber[];
  updated?: ExternalDateValue[];
  errmsg?: string;
}

function toFiniteNumber(value: ApiNumber, fallback = 0): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveFiniteNumber(value: ApiNumber): number | null {
  const parsed = toFiniteNumber(value, NaN);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export class MarketDataAppProvider implements OptionsDataProvider {
  readonly sourceName = "marketdata";
  readonly isDelayed = true;
  readonly delayNote = "依帳號權限取得延遲或歷史期權資料；免費/未授權帳號通常為至少 1 個交易日歷史資料。";

  private token: string;

  constructor(token?: string) {
    this.token = token || process.env.MARKETDATA_TOKEN || "";
    if (!this.token) {
      throw new Error("[marketdata] MARKETDATA_TOKEN is not configured.");
    }
  }

  private authHeaders() {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
      "User-Agent": "Trading-Intelligence-Platform/1.0",
    };
  }

  private async requestJson<T>(url: string, context: string): Promise<T> {
    const res = await fetch(url, { headers: this.authHeaders() });
    const creditInfo = [
      res.headers.get("x-api-ratelimit-consumed"),
      res.headers.get("x-api-ratelimit-remaining"),
    ].filter(Boolean).join("/");

    if (!res.ok && res.status !== 203) {
      const text = await res.text().catch(() => "");
      const suffix = text ? `: ${text.slice(0, 240)}` : "";
      const credits = creditInfo ? ` [credits consumed/remaining ${creditInfo}]` : "";
      throw new Error(`[marketdata] ${context} failed with HTTP ${res.status}${credits}${suffix}`);
    }

    let payload: T;
    try {
      payload = (await res.json()) as T;
    } catch {
      throw new Error(`[marketdata] ${context} returned a non-JSON response.`);
    }
    return payload;
  }

  async getUnderlyingQuote(symbol: string): Promise<UnderlyingQuote> {
    const url = `${BASE_URL}/indices/quotes/${encodeURIComponent(symbol)}/`;
    const data = await this.requestJson<IndexQuoteResponse>(url, `index quote ${symbol}`);
    const last = positiveFiniteNumber(data.last?.[0]);
    if (data.s !== "ok" || last === null) {
      throw new Error(`[marketdata] index quote ${symbol} has no usable last price (s=${data.s}, ${data.errmsg || "no detail"}).`);
    }

    return {
      symbol,
      date: firstValidExternalDate(data.updated, todayUtc(), `marketdata ${symbol} quote updated`),
      last,
    };
  }

  async getOptionChain(symbol: string, maxExpiries: number): Promise<RawOptionContract[]> {
    const requestedCount = Math.max(1, Math.min(Number.isFinite(maxExpiries) ? Math.floor(maxExpiries) : 1, 6));
    const expirationUrl = `${BASE_URL}/options/expirations/${encodeURIComponent(symbol)}/`;
    const expirationData = await this.requestJson<ExpirationsResponse>(expirationUrl, `${symbol} expiration list`);

    if (expirationData.s !== "ok" || !expirationData.expirations?.length) {
      throw new Error(`[marketdata] ${symbol} has no usable expiration list (s=${expirationData.s}, ${expirationData.errmsg || "no detail"}).`);
    }

    const expirationDates = Array.from(new Set(
      expirationData.expirations.flatMap((value) => {
        try {
          return [normalizeExternalDate(value, `marketdata ${symbol} expiration`)];
        } catch {
          return [];
        }
      })
    )).sort().slice(0, requestedCount);

    if (!expirationDates.length) {
      throw new Error(`[marketdata] ${symbol} returned expirations, but none could be parsed as dates.`);
    }

    const allContracts: RawOptionContract[] = [];
    const perExpiryErrors: string[] = [];

    for (const expiration of expirationDates) {
      try {
        const chain = await this.fetchExpirationChain(symbol, expiration);
        allContracts.push(...chain);
      } catch (error: any) {
        perExpiryErrors.push(`${expiration}: ${error?.message || String(error)}`);
      }
    }

    if (!allContracts.length) {
      const detail = perExpiryErrors.length ? ` Details: ${perExpiryErrors.join(" | ")}` : "";
      throw new Error(`[marketdata] ${symbol} returned no usable option contracts for ${expirationDates.join(", ")}.${detail}`);
    }

    return allContracts;
  }

  private async fetchExpirationChain(symbol: string, expiration: string): Promise<RawOptionContract[]> {
    // The official API accepts ISO 8601 dates for expiration. We deliberately do
    // not use the old unsupported `dateformat` query parameter.
    // 覆蓋範圍:預設價平上下各約 120 檔 (STRIKE_LIMIT 環境變數可調)。
    // 先前 40 檔太窄,導致 Call/Put Wall 只是局部高點、Flip 落在掃描邊界。
    const strikeLimit = Number.parseInt(process.env.STRIKE_LIMIT || "120", 10);
    const url = `${BASE_URL}/options/chain/${encodeURIComponent(symbol)}/?expiration=${encodeURIComponent(expiration)}&strikeLimit=${strikeLimit}`;
    const data = await this.requestJson<OptionChainResponse>(url, `${symbol} chain ${expiration}`);

    if (data.s !== "ok" || !data.strike?.length) {
      throw new Error(`chain has no rows (s=${data.s}, ${data.errmsg || "no detail"}).`);
    }

    const snapshotDate = firstValidExternalDate(data.updated, todayUtc(), `marketdata ${symbol} chain updated`);
    const contracts: RawOptionContract[] = [];
    const rejected = { invalidExpiry: 0, invalidStrike: 0, invalidSide: 0 };

    for (let i = 0; i < data.strike.length; i++) {
      const side = (data.side?.[i] || "").toLowerCase();
      if (side !== "call" && side !== "put") {
        rejected.invalidSide++;
        continue;
      }

      const strike = positiveFiniteNumber(data.strike[i]);
      if (strike === null) {
        rejected.invalidStrike++;
        continue;
      }

      let rowExpiry = expiration;
      try {
        // APIs commonly echo expiration per row. Prefer it when valid; fall back
        // to the requested expiration when a row field is missing or malformed.
        if (data.expiration?.[i] !== undefined && data.expiration?.[i] !== null) {
          rowExpiry = normalizeExternalDate(data.expiration[i], `marketdata ${symbol} row expiration`);
        }
      } catch {
        rejected.invalidExpiry++;
        continue;
      }

      contracts.push({
        source: this.sourceName,
        snapshot_date: snapshotDate,
        expiry: rowExpiry,
        strike,
        option_type: side,
        oi: Math.max(0, Math.trunc(toFiniteNumber(data.openInterest?.[i], 0))),
        iv: positiveFiniteNumber(data.iv?.[i]),
        volume: Math.max(0, Math.trunc(toFiniteNumber(data.volume?.[i], 0))),
      });
    }

    if (!contracts.length) {
      throw new Error(`chain rows could not be normalized (invalid expiry=${rejected.invalidExpiry}, strike=${rejected.invalidStrike}, side=${rejected.invalidSide}).`);
    }

    return contracts;
  }
}
