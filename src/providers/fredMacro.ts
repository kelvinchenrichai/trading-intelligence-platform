/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 宏觀數據源:FRED (美國聖路易聯準會經濟數據庫)
 *
 * 這是整個系統裡少數可以名正言順說「真實接入、且允許商用」的數據源。
 * FRED API 免費、公開、明確允許商用,只需要一把免費申請的 API key。
 *
 * 我們用它取得:
 *  - US10Y:10 年期公債殖利率 (series DGS10) → 餵給 Black-Scholes 的無風險利率 r
 *  - VIX:series VIXCLS (Cboe 波動率指數,FRED 有轉載,通常延遲一天)
 *
 * DXY (美元指數) 是 ICE 專有指數,FRED 沒有直接對應的免費 series,
 * 因此這裡對 DXY 誠實回傳 null,不編造。前端會顯示 "N/A" 而非假數字。
 *
 * Key 一律從環境變數 FRED_API_KEY 讀取。
 * 免費申請:https://fred.stlouisfed.org/docs/api/api_key.html
 */

import { MacroSnapshot } from "./types";

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

async function fetchLatestObservation(
  seriesId: string,
  apiKey: string
): Promise<{ date: string; value: number } | null> {
  const url =
    `${FRED_BASE}?series_id=${seriesId}` +
    `&api_key=${apiKey}&file_type=json&sort_order=desc&limit=10`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`[FRED] ${seriesId} 請求失敗 HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    observations?: Array<{ date: string; value: string }>;
  };

  // FRED 用 "." 表示當日無資料 (假日等),往回找第一個有效值
  for (const obs of data.observations || []) {
    if (obs.value && obs.value !== ".") {
      const v = parseFloat(obs.value);
      if (!isNaN(v)) return { date: obs.date, value: v };
    }
  }
  return null;
}

/**
 * 取得最新宏觀快照。取不到的欄位誠實回傳 null。
 */
export async function getMacroFromFred(apiKey?: string): Promise<MacroSnapshot> {
  const key = apiKey || process.env.FRED_API_KEY || "";
  if (!key) {
    throw new Error(
      "[FRED] 找不到 FRED_API_KEY。請在 .env 設定 (免費申請)。不要寫死在程式碼裡。"
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const sources: Record<string, string> = {};

  let us10y: number | null = null;
  let vix: number | null = null;

  try {
    const r = await fetchLatestObservation("DGS10", key);
    if (r) {
      us10y = r.value;
      sources.us10y = `FRED:DGS10 (${r.date})`;
    }
  } catch {
    sources.us10y = "FRED:DGS10 (取得失敗)";
  }

  try {
    const r = await fetchLatestObservation("VIXCLS", key);
    if (r) {
      vix = r.value;
      sources.vix = `FRED:VIXCLS (${r.date})`;
    }
  } catch {
    sources.vix = "FRED:VIXCLS (取得失敗)";
  }

  // DXY 無免費 series,誠實標示
  sources.dxy = "無免費授權來源 (N/A)";

  return { date: today, us10y, vix, dxy: null, sources };
}
