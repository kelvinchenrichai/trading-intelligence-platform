/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 期貨基差調整 (Futures Basis Adjustment)
 *
 * 問題:GEX 引擎用 NDX/SPX「指數」期權計算水位,但使用者交易的是 NQ/ES「期貨」。
 * 期貨與指數之間存在基差 (basis = 期貨價 − 指數價),不調整的話,算出的
 * Call Wall / Put Wall / Flip 無法直接畫在 NQ/ES 圖上。
 *
 * 解法 (與 GEXmon 等產品同一做法):抓當下期貨報價,算出基差,把報告中
 * 所有價格水位整體平移到期貨座標。指數期權的 GEX「結構」不變,只是換座標。
 *
 * 期貨報價來源:Yahoo Finance 免費 chart 端點 (NQ=F / ES=F 前月合約)。
 * 若抓取失敗,誠實地不調整 (basis=0) 並回報,絕不編造。
 */

import { DailyReport } from "../types";

const CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

/** 期貨代碼 → Yahoo 期貨符號 */
const FUTURES_SYMBOL: Record<string, string> = {
  NQ: "NQ=F",
  ES: "ES=F",
};

export interface BasisInfo {
  futuresSymbol: string;
  futuresLast: number;
  indexLast: number;
  basis: number;
}

/** 抓期貨最新價並計算基差;失敗回傳 null (呼叫端不調整即可) */
export async function fetchFuturesBasis(
  futuresCode: string,
  indexLast: number
): Promise<BasisInfo | null> {
  const ySym = FUTURES_SYMBOL[futuresCode.toUpperCase()];
  if (!ySym || !isFinite(indexLast) || indexLast <= 0) return null;

  try {
    const url = `${CHART_BASE}/${encodeURIComponent(ySym)}?range=1d&interval=1d`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TradingIntel/1.0)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const meta = data?.chart?.result?.[0]?.meta;
    const futuresLast: number | undefined =
      meta?.regularMarketPrice ?? meta?.previousClose;
    if (typeof futuresLast !== "number" || !isFinite(futuresLast)) return null;

    const basis = futuresLast - indexLast;
    // 合理性防呆:NQ/ES 基差通常在指數的 ±3% 內;超出代表抓錯,寧可不調
    if (Math.abs(basis) / indexLast > 0.03) return null;

    return { futuresSymbol: ySym, futuresLast, indexLast, basis };
  } catch {
    return null;
  }
}

/** 對單一數值做基差平移 (保留一位小數) */
function shift(v: unknown, basis: number): number | unknown {
  return typeof v === "number" && isFinite(v) ? Math.round((v + basis) * 10) / 10 : v;
}

/**
 * 把報告中所有「價格水位」平移到期貨座標。
 * 防禦式寫法:欄位存在才調,結構有變也不會炸。
 * (預期波動的 points 是「寬度」不平移;low/high 是「水位」要平移。)
 */
export function applyBasisToReport(report: DailyReport, basis: number): void {
  if (!isFinite(basis) || basis === 0) return;
  const r = report as any;

  if (r.price) {
    r.price.last = shift(r.price.last, basis);
    r.price.overnight_high = shift(r.price.overnight_high, basis);
    r.price.overnight_low = shift(r.price.overnight_low, basis);
    if (r.price.expected_move) {
      r.price.expected_move.low = shift(r.price.expected_move.low, basis);
      r.price.expected_move.high = shift(r.price.expected_move.high, basis);
    }
  }

  if (r.gamma) {
    r.gamma.flip_level = shift(r.gamma.flip_level, basis);
    r.gamma.max_pain = shift(r.gamma.max_pain, basis);
    for (const w of r.gamma.call_walls || []) w.strike = shift(w.strike, basis);
    for (const w of r.gamma.put_walls || []) w.strike = shift(w.strike, basis);
  }

  for (const s of r.gex_strikes || []) s.strike = shift(s.strike, basis);
  for (const g of r.gex_ranks || []) g.strike = shift(g.strike, basis);
}
