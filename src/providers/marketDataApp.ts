/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 主數據源:marketdata.app (A 方案)
 *
 * 使用 marketdata.app 的 REST API 取得 SPX / NDX 指數期權鏈。
 * - 免費 "Free Forever" 層:每天 100 credits,只給至少 24 小時前的 EOD 數據。
 *   前一交易日的數據會在隔天美東 09:30 之後才開放取用 —— 這正好符合
 *   「拿昨日 + 開盤前數據算今天」的使用場景。
 * - Token 一律從環境變數讀取,絕不寫死在程式碼裡。
 *
 * ⚠️ 授權提醒:免費層僅授權「個人 / 內部使用」。若要公開營利、對外散布或
 *   公開顯示,必須另外向 marketdata.app 洽談商用授權 (可能還需交易所授權)。
 *   詳見 README 的「合規」章節。
 *
 * API 文件:https://www.marketdata.app/docs/api/options/chain/
 */

import { OptionsDataProvider, RawOptionContract, UnderlyingQuote } from "./types";

const BASE_URL = "https://api.marketdata.app/v1";

interface OptionChainResponse {
  s: string; // "ok" | "no_data" | "error"
  optionSymbol?: string[];
  underlying?: string[];
  expiration?: number[]; // unix timestamp (秒)
  strike?: number[];
  side?: string[]; // "call" | "put"
  openInterest?: number[];
  iv?: (number | null)[];
  volume?: number[];
  updated?: number[];
  errmsg?: string;
}

interface IndexQuoteResponse {
  s: string;
  symbol?: string[];
  last?: number[];
  updated?: number[];
  errmsg?: string;
}

/** 把 unix 秒轉成 YYYY-MM-DD (以 UTC 為準,期權到期日不受時區小時影響) */
function unixToDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().split("T")[0];
}

export class MarketDataAppProvider implements OptionsDataProvider {
  readonly sourceName = "marketdata";
  readonly isDelayed = true;
  readonly delayNote = "至少延遲 24 小時 (免費層 EOD;前一交易日資料於隔日美東 09:30 後開放)";

  private token: string;

  constructor(token?: string) {
    // Token 只從環境變數讀,呼叫端也可傳入 (但仍應來自 env,不該是明碼字串)
    this.token = token || process.env.MARKETDATA_TOKEN || "";
    if (!this.token) {
      throw new Error(
        "[MarketDataAppProvider] 找不到 MARKETDATA_TOKEN。請在 .env 檔設定,不要寫死在程式碼裡。"
      );
    }
  }

  private authHeaders() {
    return { Authorization: `Bearer ${this.token}` };
  }

  /**
   * 取得指數收盤價。免費層走 delayed/EOD。
   * marketdata.app 的指數報價端點:/v1/indices/quotes/{symbol}/
   */
  async getUnderlyingQuote(symbol: string): Promise<UnderlyingQuote> {
    const url = `${BASE_URL}/indices/quotes/${encodeURIComponent(symbol)}/`;
    const res = await fetch(url, { headers: this.authHeaders() });

    if (res.status === 203 || res.status === 200) {
      const data = (await res.json()) as IndexQuoteResponse;
      if (data.s !== "ok" || !data.last || data.last.length === 0) {
        throw new Error(
          `[marketdata] 指數 ${symbol} 無報價資料 (s=${data.s}, ${data.errmsg || ""})`
        );
      }
      const dateStr = data.updated?.[0] ? unixToDate(data.updated[0]) : new Date().toISOString().split("T")[0];
      return { symbol, date: dateStr, last: data.last[0] };
    }

    throw new Error(`[marketdata] 指數報價請求失敗:HTTP ${res.status}`);
  }

  /**
   * 取得期權鏈。
   *
   * 為了節省免費層額度,只抓「由近到遠的前 N 個到期日」,並用 API 端的
   * strikeLimit 把每個到期日的行權價限制在價平附近。
   *
   * 免費層固定回傳延遲/EOD 數據,不需要 (也不能) 指定 mode=live。
   */
  async getOptionChain(symbol: string, maxExpiries: number): Promise<RawOptionContract[]> {
    // strikeLimit=30 表示每個到期日抓價平上下各約 30 檔;可依需求調整
    // dte 相關過濾放在下面用 expiry 迴圈控制,這裡先抓全部再截斷
    const url =
      `${BASE_URL}/options/chain/${encodeURIComponent(symbol)}/` +
      `?strikeLimit=40&dateformat=timestamp`;

    const res = await fetch(url, { headers: this.authHeaders() });

    if (res.status !== 200 && res.status !== 203) {
      // 204 = 免費層在 cached 模式下沒有資料;其它為錯誤
      if (res.status === 204) {
        throw new Error(`[marketdata] ${symbol} 目前無可用的 EOD 期權資料 (204)。`);
      }
      throw new Error(`[marketdata] 期權鏈請求失敗:HTTP ${res.status}`);
    }

    const data = (await res.json()) as OptionChainResponse;
    if (data.s !== "ok" || !data.strike || data.strike.length === 0) {
      throw new Error(
        `[marketdata] ${symbol} 期權鏈無資料 (s=${data.s}, ${data.errmsg || ""})`
      );
    }

    const n = data.strike.length;
    const contracts: RawOptionContract[] = [];

    // 先蒐集所有到期日,決定要保留哪幾個 (由近到遠取 maxExpiries 個)
    const expirySet = new Set<string>();
    const expiryByIdx: string[] = [];
    for (let i = 0; i < n; i++) {
      const exp = data.expiration?.[i] ? unixToDate(data.expiration[i]) : "";
      expiryByIdx.push(exp);
      if (exp) expirySet.add(exp);
    }
    const keptExpiries = new Set(
      Array.from(expirySet).sort().slice(0, maxExpiries)
    );

    const snapshotDate =
      data.updated?.[0] ? unixToDate(data.updated[0]) : new Date().toISOString().split("T")[0];

    for (let i = 0; i < n; i++) {
      const expiry = expiryByIdx[i];
      if (!keptExpiries.has(expiry)) continue;

      const side = (data.side?.[i] || "").toLowerCase();
      if (side !== "call" && side !== "put") continue;

      contracts.push({
        source: this.sourceName,
        snapshot_date: snapshotDate,
        expiry,
        strike: data.strike[i],
        option_type: side as "call" | "put",
        oi: data.openInterest?.[i] ?? 0,
        iv: data.iv?.[i] ?? null,
        volume: data.volume?.[i] ?? 0,
      });
    }

    if (contracts.length === 0) {
      throw new Error(`[marketdata] ${symbol} 篩選後無有效合約 (檢查到期日/行權價範圍)。`);
    }

    return contracts;
  }
}
