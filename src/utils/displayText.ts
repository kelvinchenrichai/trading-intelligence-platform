export type UiLang = "zh" | "en" | string;

const exactZh: Record<string, string> = {
  "CME PDF is user-uploaded; this platform does not automatically download or scrape CME data.": "CME PDF 需由使用者自行上傳；本平台不會自動下載或爬取 CME 資料。",
  "Weekly/daily expiry dates are model estimates until an exact contract-calendar resolver is validated. Do not treat preliminary gamma metrics as final trading signals.": "週到期 / 日到期日期目前是模型估算，直到精確合約日曆解析器驗證完成前，不要把初步 gamma 指標視為最終交易訊號。",
  "This first importer stores CME OI, settlement, volume, and CME-published delta. Black-76 GEX calibration is intentionally a separate validation step.": "此版匯入器會保存 CME OI、settlement、volume 與 CME 公布的 delta；Black-76 GEX 校準刻意作為獨立驗證步驟處理。",
  "Session Flow unavailable — currently using CME EOD OI baseline until TradingView webhook events arrive.": "Session Flow 尚未啟用；目前使用 CME EOD OI 盤前基準，等待 TradingView webhook 事件進來後才會更新盤中狀態。",
  "Session Flow unavailable — currently using CME EOD OI baseline.": "Session Flow 尚未啟用；目前使用 CME EOD OI 盤前基準。",
  "Session Flow unavailable — currently using EOD OI baseline.": "Session Flow 尚未啟用；目前使用 EOD OI 盤前基準。",
  "Session Flow unavailable — currently using CME EOD OI baseline. TradingView webhook events will update this state intraday.": "Session Flow 尚未啟用；目前使用 CME EOD OI 盤前基準。TradingView webhook 事件進來後，盤中狀態會自動更新。",
  "No TradingView webhook events received for this model date yet.": "此模型日期尚未收到 TradingView webhook 事件。",
  "TradingView webhook events received and reduced into deterministic session state.": "已收到 TradingView webhook 事件，並依固定規則彙整成盤中狀態。",
  "No exact-date CME PG40 was available for this dashboard date.": "此 Dashboard 日期沒有完全匹配的 CME PG40，因此使用 Proxy 備援模式。",
  "Proxy data is unavailable for this snapshot; no confluence score was computed.": "此快照沒有可用的 Proxy 資料，因此沒有計算共振分數。",
  "This is level confluence only. NDX / SPX proxy data is not used as CME futures options OI consensus.": "這只是價位共振，不是 OI 共識。NDX / SPX proxy 不會被當成 CME futures options 的逐合約 OI 比對來源。",
  "IV / source coverage is not high; keep confidence reduced.": "IV / 資料覆蓋率不是高信心，請降低解讀信心。",
  "This is proxy fallback, not CME official NQ futures options OI.": "目前是 Proxy 備援，不是 CME 官方 NQ futures options OI。",
  "sha256 unique import guard enabled": "已啟用 sha256 重複匯入保護",
  "Unavailable": "尚不可用",
  "Session unavailable": "Session 狀態尚不可用",
  "Supabase is not connected; TradingView session events cannot be loaded yet.": "尚未連接 Supabase，TradingView 盤中事件暫時無法讀取。",
  "Supabase tradingview_events table is missing. Run supabase/003_tradingview_events.sql before using webhook persistence.": "Supabase 缺少 tradingview_events 資料表；使用 webhook 寫入前，請先執行 supabase/003_tradingview_events.sql。",
};

const exactEn: Record<string, string> = {
  "CME PDF 需由使用者自行上傳；本平台不會自動下載或爬取 CME 資料。": "CME PDFs are user-uploaded. This platform does not automatically download or scrape CME data.",
  "週到期 / 日到期日期目前是模型估算，直到精確合約日曆解析器驗證完成前，不要把初步 gamma 指標視為最終交易訊號。": "Weekly/daily expiry dates are model estimates until an exact contract-calendar resolver is validated. Do not treat preliminary gamma metrics as final trading signals.",
  "此版匯入器會保存 CME OI、settlement、volume 與 CME 公布的 delta；Black-76 GEX 校準刻意作為獨立驗證步驟處理。": "This importer stores CME OI, settlement, volume, and CME-published delta. Black-76 GEX calibration remains a separate validation step.",
  "Session Flow 尚未啟用；目前使用 CME EOD OI 盤前基準。TradingView webhook 事件進來後，盤中狀態會自動更新。": "Session Flow is not active yet. The system is currently using the CME EOD OI premarket baseline; TradingView webhook events will update intraday state.",
  "此模型日期尚未收到 TradingView webhook 事件。": "No TradingView webhook events have been received for this model date yet.",
  "已收到 TradingView webhook 事件，並依固定規則彙整成盤中狀態。": "TradingView webhook events have been received and reduced into deterministic session state.",
  "等待價格離開 Gamma Flip zone 後再看牆位確認。": "Wait for price to move away from the Gamma Flip zone, then look for wall confirmation.",
  "不要在 flip 附近追單；此區容易來回洗盤。": "Avoid chasing near the flip zone; this area is prone to chop and whipsaw.",
  "連續 2 根 5m 收在 Call Wall 上方，或連續 2 根 5m 跌破 Put Wall。": "Two consecutive 5m closes above the Call Wall, or two consecutive 5m closes below the Put Wall.",
  "突破後又回到 Flip zone 內。": "Invalidated if price breaks out and then returns into the Flip zone.",
  "反彈不回 Put Wall / Flip 上方時，優先觀察下方支撐反應。": "If rebounds cannot reclaim the Put Wall / Flip, prioritize downside support reactions.",
  "突破後回測不跌回 Call Wall 下方時，優先觀察上方延伸。": "If a breakout retest holds above the Call Wall, prioritize upside extension.",
  "不要在第一根急漲急跌後直接追；等待 2×5m close 與 AVWAP / BOS 確認。": "Do not chase the first impulse candle. Wait for 2×5m close plus AVWAP / BOS confirmation.",
  "收回 Put Wall 或 Flip 上方。": "Invalidated by reclaiming above the Put Wall or Flip.",
  "收回 Call Wall 或 Flip 下方。": "Invalidated by closing back below the Call Wall or Flip.",
  "優先等區間邊界反應；靠近支撐/壓力後看價格確認。": "Prioritize reactions at range boundaries; wait for price confirmation near support/resistance.",
  "避免在 Call/Put Wall 區間中間追單。": "Avoid chasing in the middle of the Call/Put Wall range.",
  "靠近 Put Wall / Call Wall，且價格確認沒有 2×5m 站到牆外。": "Look for confirmation near the Put Wall / Call Wall without 2×5m closes outside the wall.",
  "連續 2 根 5m 收在牆外並伴隨 BOS / ATR 擴張。": "Invalidated by two consecutive 5m closes outside the wall with BOS / ATR expansion.",
};

const statusZh: Record<string, string> = {
  "CME Official EOD Map": "CME 官方 EOD 盤前地圖",
  "NDX Proxy Fallback": "NDX Proxy 備援模式",
  "Hybrid / Confluence": "混合 / 共振模式",
  "No Data": "無資料",
  "CME PG40 Official EOD": "CME PG40 官方 EOD",
  "NDX proxy": "NDX proxy",
  "SPX proxy": "SPX proxy",
  "CME_PG40": "CME PG40 官方資料",
  "NDX_PROXY_FALLBACK": "NDX Proxy 備援",
};

const statusEn: Record<string, string> = Object.fromEntries(Object.entries(statusZh).map(([en, zh]) => [zh, en]));

const regimeZh: Record<string, string> = {
  "No Edge": "無優勢",
  "Neutral / Wait": "中性 / 等待",
  "Consolidation / Pin": "盤整 / Pin",
  "Consolidation / Range": "盤整 / 區間",
  "Expansion Up": "向上擴張",
  "Expansion Down": "向下擴張",
  "No edge / Wait": "無優勢 / 等待",
  "Range Bound": "盤整區間",
  "Range at Edge": "盤整邊界",
  "Trending": "趨勢 / 擴張",
  "Chop/Whipsaw": "雙邊洗盤",
  "High": "高",
  "Medium": "中",
  "Low": "低",
  "Unavailable": "尚不可用",
};
const regimeEn: Record<string, string> = Object.fromEntries(Object.entries(regimeZh).map(([en, zh]) => [zh, en]));

const eventZh: Record<string, string> = {
  GAMMA_FLIP_TOUCH: "觸及 Gamma Flip",
  GAMMA_FLIP_RECLAIM: "重新站回 Gamma Flip",
  GAMMA_FLIP_REJECT: "Gamma Flip 拒絕 / 失敗",
  CALL_WALL_TOUCH: "觸及 Call Wall",
  CALL_WALL_BREAKOUT_2X5M: "Call Wall 連續 2 根 5m 突破",
  PUT_WALL_TOUCH: "觸及 Put Wall",
  PUT_WALL_BREAKDOWN_2X5M: "Put Wall 連續 2 根 5m 跌破",
  WALL_FLIPPED_SUPPORT: "牆位翻成支撐",
  WALL_FLIPPED_RESISTANCE: "牆位翻成壓力",
  BOS_UP: "結構向上突破",
  BOS_DOWN: "結構向下跌破",
  AVWAP_RECLAIM: "重新站回 AVWAP",
  AVWAP_REJECT: "AVWAP 拒絕 / 失敗",
  CONFLUENCE_ZONE_ENTER: "進入共振區",
};

export function translateText(input: string | null | undefined, lang: UiLang): string {
  if (!input) return "—";
  if (lang === "en") return exactEn[input] || regimeEn[input] || statusEn[input] || input;
  if (exactZh[input]) return exactZh[input];
  if (regimeZh[input]) return regimeZh[input];
  if (statusZh[input]) return statusZh[input];

  const iv = input.match(/^CME Black-76 futures-options engine used with NQ multiplier 20\. IV reconstructed ([0-9.]+)%\.$/);
  if (iv) return `使用 CME Black-76 期貨期權引擎，NQ multiplier = 20；已反解 IV 約 ${iv[1]}%。`;

  const proxy = input.match(/^(.+) \/ proxy levels are for confluence only and are not CME futures options OI consensus\.$/);
  if (proxy) return `${proxy[1]} / proxy 僅用於價位共振，不是 CME futures options 的 OI 共識。`;

  const fallback = input.match(/^CME exact-date load\/compute failed for (.+); fell back to NDX proxy: (.+)$/);
  if (fallback) return `${fallback[1]} 的 CME 精確日期資料讀取 / 計算失敗，已退回 NDX proxy：${fallback[2]}`;

  const noImport = input.match(/^NQ: no CME PG40 import found for dashboard date (.+); using NDX Proxy Fallback and clearly marking fallback mode\.$/);
  if (noImport) return `NQ：Dashboard 日期 ${noImport[1]} 沒有 CME PG40 匯入，已使用 NDX Proxy 備援並清楚標示 fallback 模式。`;

  const computed = input.match(/^NQ report computed from exact-date CME PG40 official futures options\. Trade date (.+), futures settle (.+), IV reconstructed ([0-9.]+)%\.$/);
  if (computed) return `NQ 報告已使用完全匹配日期的 CME PG40 官方 futures options 計算。Trade date：${computed[1]}，期貨結算價：${computed[2]}，IV 反解比例：約 ${computed[3]}%。`;

  return input;
}

export function translateEvent(input: string | null | undefined, lang: UiLang): string {
  if (!input) return "—";
  if (lang === "zh") return eventZh[input] || translateText(input, lang);
  return input;
}

export function translateRegime(input: string | null | undefined, lang: UiLang): string {
  return translateText(input, lang);
}

export function translateConfidence(input: string | null | undefined, lang: UiLang): string {
  if (!input) return "—";
  return translateText(input.charAt(0).toUpperCase() + input.slice(1).toLowerCase(), lang);
}
