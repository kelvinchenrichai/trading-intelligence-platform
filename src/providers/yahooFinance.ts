/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 備援 / 核對數據源:Yahoo Finance (C 方案)
 *
 * 角色定位:
 *  - 當主源 (marketdata.app) 額度用盡或暫時故障時,作為 fallback。
 *  - 平時作為「第二來源」與主源做交叉核對 (reconcileData),
 *    差異超過閾值就標記為 conflict —— 讓你原本設計的多源核對架構
 *    這次是真的在核對兩個真實來源,而不是假數據。
 *
 * ⚠️ 授權提醒:Yahoo 的公開端點條款模糊,通常僅默許個人研究用途,
 *   不涵蓋公開營利散布。與 marketdata.app 免費層一樣,MVP 驗證階段可用,
 *   一旦公開營利就需要正式授權。這是所有「免費期權數據」的共同紅線。
 *
 * ⚠️ 穩定性提醒:這是非官方端點,Yahoo 可能隨時改格式或擋請求。
 *   因此它只當備援 / 核對,不當唯一數據源。
 *
 * 端點格式 (公開,可能變動):
 *   https://query2.finance.yahoo.com/v7/finance/options/{SYMBOL}
 *   指數符號需加 ^ 前綴,例如 ^SPX / ^NDX
 */

import { OptionsDataProvider, RawOptionContract, UnderlyingQuote } from "./types";
import { normalizeExternalDate } from "./dateUtils";

const BASE = "https://query2.finance.yahoo.com/v7/finance/options";

/** 指數代碼對應到 Yahoo 的 symbol (加 ^ 前綴) */
function toYahooSymbol(symbol: string): string {
  const s = symbol.toUpperCase();
  if (s.startsWith("^")) return s;
  // SPX / NDX / VIX 這類指數在 Yahoo 需要 ^ 前綴
  return `^${s}`;
}

interface YahooOptionLeg {
  strike: number;
  openInterest?: number;
  impliedVolatility?: number;
  volume?: number;
}
interface YahooOptionExpiry {
  expirationDate: number; // unix 秒
  calls: YahooOptionLeg[];
  puts: YahooOptionLeg[];
}
interface YahooOptionsResponse {
  optionChain: {
    result: Array<{
      underlyingSymbol: string;
      expirationDates: number[];
      quote?: { regularMarketPrice?: number; regularMarketPreviousClose?: number };
      options: YahooOptionExpiry[];
    }>;
    error: unknown;
  };
}

export class YahooFinanceProvider implements OptionsDataProvider {
  readonly sourceName = "yahoo";
  readonly isDelayed = true;
  readonly delayNote = "延遲數據 (非官方公開端點,僅供核對 / 備援)";

  /** Yahoo 一次請求只回一個到期日的鏈,需要多個到期日就多打幾次。 */
  async getOptionChain(symbol: string, maxExpiries: number): Promise<RawOptionContract[]> {
    const ySym = toYahooSymbol(symbol);

    // 第一次請求:取得可用到期日清單 + 第一個到期日的鏈
    const first = await this.fetchExpiry(ySym);
    const allExpiries = first.expirationDates.slice(0, maxExpiries);

    const contracts: RawOptionContract[] = [];
    const snapshotDate = new Date().toISOString().split("T")[0];

    // 收錄第一個到期日 (已在 first 裡)
    this.collect(first.options[0], first.underlyingSymbol, snapshotDate, contracts);

    // 其餘到期日各打一次
    for (let i = 1; i < allExpiries.length; i++) {
      try {
        const r = await this.fetchExpiry(ySym, allExpiries[i]);
        this.collect(r.options[0], r.underlyingSymbol, snapshotDate, contracts);
      } catch {
        // 單一到期日失敗不影響整體,略過即可 (誠實:寧缺勿造假)
        continue;
      }
    }

    if (contracts.length === 0) {
      throw new Error(`[yahoo] ${symbol} 取不到任何期權合約。`);
    }
    return contracts;
  }

  async getUnderlyingQuote(symbol: string): Promise<UnderlyingQuote> {
    const ySym = toYahooSymbol(symbol);
    const r = await this.fetchExpiry(ySym);
    const last = r.quote?.regularMarketPrice;
    if (typeof last !== "number") {
      throw new Error(`[yahoo] ${symbol} 取不到現貨報價。`);
    }
    return {
      symbol,
      date: new Date().toISOString().split("T")[0],
      last,
      prev_close: r.quote?.regularMarketPreviousClose,
    };
  }

  private async fetchExpiry(ySym: string, expiryUnix?: number) {
    const url = expiryUnix
      ? `${BASE}/${encodeURIComponent(ySym)}?date=${expiryUnix}`
      : `${BASE}/${encodeURIComponent(ySym)}`;

    const res = await fetch(url, {
      headers: {
        // Yahoo 會擋沒有 UA 的請求
        "User-Agent": "Mozilla/5.0 (compatible; TradingIntel/1.0)",
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(`[yahoo] 請求失敗 HTTP ${res.status} (${ySym})`);
    }
    const data = (await res.json()) as YahooOptionsResponse;
    const result = data.optionChain?.result?.[0];
    if (!result) {
      throw new Error(`[yahoo] 回應格式異常 (${ySym})`);
    }
    return result;
  }

  private collect(
    expiry: YahooOptionExpiry | undefined,
    underlyingSymbol: string,
    snapshotDate: string,
    out: RawOptionContract[]
  ) {
    if (!expiry) return;
    const expDate = normalizeExternalDate(expiry.expirationDate, "yahoo expirationDate");

    for (const c of expiry.calls || []) {
      out.push({
        source: this.sourceName,
        snapshot_date: snapshotDate,
        expiry: expDate,
        strike: c.strike,
        option_type: "call",
        oi: c.openInterest ?? 0,
        iv: typeof c.impliedVolatility === "number" ? c.impliedVolatility : null,
        volume: c.volume ?? 0,
      });
    }
    for (const p of expiry.puts || []) {
      out.push({
        source: this.sourceName,
        snapshot_date: snapshotDate,
        expiry: expDate,
        strike: p.strike,
        option_type: "put",
        oi: p.openInterest ?? 0,
        iv: typeof p.impliedVolatility === "number" ? p.impliedVolatility : null,
        volume: p.volume ?? 0,
      });
    }
  }
}
