/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 統一的數據源介面 (DataProvider Interface)
 *
 * 設計目的:讓不同的真實數據源 (marketdata.app / yfinance / 未來的付費源)
 * 可以互相抽換、並存互相核對,而上層的分析引擎 (engine.ts) 完全不需要改動。
 *
 * 重要:所有 provider 回傳的都是「真實市場數據」,不含任何造假 / 亂數。
 * 若某個來源取不到資料,應誠實地丟出錯誤或回傳空陣列,絕不編造。
 */

/** 單一期權合約 (來自某個數據源的原始資料) */
export interface RawOptionContract {
  /** 數據來源名稱,例如 "marketdata" / "yfinance" */
  source: string;
  /** 快照日期 YYYY-MM-DD (資料代表的交易日) */
  snapshot_date: string;
  /** 到期日 YYYY-MM-DD */
  expiry: string;
  strike: number;
  option_type: "call" | "put";
  /** 未平倉量 Open Interest */
  oi: number;
  /** 隱含波動率 (小數,例如 0.15 代表 15%);若來源沒有,設為 null */
  iv: number | null;
  /** 成交量 (若來源沒有,設 0) */
  volume: number;
}

/** 標的現貨 / 指數收盤價 */
export interface UnderlyingQuote {
  /** 標的代碼,例如 "SPX" / "NDX" */
  symbol: string;
  /** 資料日期 YYYY-MM-DD */
  date: string;
  last: number;
  /** 若來源有提供 OHLC 就填,沒有可省略 */
  open?: number;
  high?: number;
  low?: number;
  /** 前一日收盤,用於推估隔夜區間 */
  prev_close?: number;
}

/** 宏觀數據 (無風險利率等) */
export interface MacroSnapshot {
  date: string;
  /** 美國 10 年期公債殖利率 (百分比,例如 4.22) */
  us10y: number | null;
  /** VIX,若取不到設 null */
  vix: number | null;
  /** 美元指數 DXY,若取不到設 null */
  dxy: number | null;
  /** 各欄位的實際來源,方便前端誠實標示 */
  sources: Record<string, string>;
}

/**
 * 數據源介面。每個真實數據源實作這個介面。
 */
export interface OptionsDataProvider {
  /** 來源名稱,用於核對與前端顯示 */
  readonly sourceName: string;
  /** 這個來源的數據是否為延遲/EOD (誠實標示用) */
  readonly isDelayed: boolean;
  /** 人類可讀的延遲說明,例如 "至少延遲 24 小時 (EOD)" */
  readonly delayNote: string;

  /**
   * 取得標的的期權鏈。
   * @param symbol 標的代碼 (SPX / NDX ...)
   * @param maxExpiries 最多取幾個到期日 (由近到遠),用來控制 API 額度
   */
  getOptionChain(symbol: string, maxExpiries: number): Promise<RawOptionContract[]>;

  /** 取得標的收盤價 */
  getUnderlyingQuote(symbol: string): Promise<UnderlyingQuote>;
}

/** 標的對照:期貨 <-> 指數 proxy */
export interface InstrumentMapping {
  /** 期貨代碼,前端顯示用 (NQ / ES) */
  futuresCode: string;
  /** 期貨全名 */
  futuresName: string;
  /** 實際抓取數據用的指數代碼 (NDX / SPX) */
  indexSymbol: string;
  enabled: boolean;
  sort_order: number;
}
