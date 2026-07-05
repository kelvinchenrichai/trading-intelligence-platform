/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface TranslationSet {
  // Navigation & General
  title: string;
  subtitle: string;
  joinPro: string;
  freeTier: string;
  activeView: string;
  loadReport: string;
  tradingDays: string;
  
  // Scraper
  scrapeButton: string;
  scrapingText: string;
  scrapeSuccess: string;

  // Global Status Strip
  asOfDate: string;
  ledgerRating: string;
  confidenceHigh: string;
  confidenceMedium: string;
  confidenceLow: string;
  dxyIndex: string;
  us10yYield: string;

  // Report Card Headers & Sections
  marketStructureState: string;
  gammaEnvironment: string;
  positiveGamma: string;
  negativeGamma: string;
  priceRelativeGauge: string;
  relativeGaugeDesc: string;
  keyPriceParameters: string;
  lastSpotPrice: string;
  points: string;
  expectedMove: string;
  emDownside: string;
  emUpside: string;
  maxPainLevel: string;
  maxPainDesc: string;
  overnightHigh: string;
  overnightLow: string;
  structureLevelLadder: string;
  majorCallWall: string;
  majorPutWall: string;
  majorFlip: string;
  activeSpot: string;
  actionGuidelines: string;

  // GEX Ranks Section
  gexRanksTitle: string;
  gexRanksDesc: string;
  gexRankLabel: string;
  callsDominant: string;
  putsDominant: string;
  hedgingEffect: string;
  longGammaMagnet: string;
  shortGammaAccelerant: string;

  // Historical Section & Date range
  historicalTitle: string;
  historicalDesc: string;
  dateRange: string;
  range5d: string;
  range10d: string;
  range20d: string;
  rangeAll: string;
  historicalChartTitle: string;
  historicalChartDesc: string;
  tableTab: string;
  chartTab: string;
  regimeOverlay: string;

  // Verification Q&A
  verificationTitle: string;
  verificationDesc: string;
  q1: string;
  a1: string;
  q2: string;
  a2: string;
  q3: string;
  a3: string;

  // Regime mapping
  range_bound: string;
  range_at_edge: string;
  trending: string;
  chop_whipsaw: string;
}

export const translations: Record<"zh" | "en", TranslationSet> = {
  zh: {
    title: "量化期權做市商 GEX 敞口與市場結構終端",
    subtitle: "實時跨交易所期權鏈數據核對、Gamma 敞口分析及莊家對沖流跟蹤",
    joinPro: "加入專業版流 (PRO)",
    freeTier: "免費版額度",
    activeView: "當前視圖",
    loadReport: "載入此日",
    tradingDays: "個交易日記錄",
    
    scrapeButton: "更新 EOD 資料快照",
    scrapingText: "正在抓取並對齊期權鏈、執行 Black-Scholes 敞口估算與數據仲裁...",
    scrapeSuccess: "成功抓取並整合期權數據！當前解析日期為：",

    asOfDate: "數據更新時間 (美東)",
    ledgerRating: "賬簿核對置信度",
    confidenceHigh: "高置信度 (極低偏差)",
    confidenceMedium: "中置信度 (微幅偏差)",
    confidenceLow: "低置信度 (高偏差仲裁)",
    dxyIndex: "美元指數 (DXY)",
    us10yYield: "十年期美債收益率 (US10Y)",

    marketStructureState: "市場結構運行狀態 (Regime)",
    gammaEnvironment: "做市商 Gamma 環境",
    positiveGamma: "▲ 正 Gamma 環境 (Long Gamma)",
    negativeGamma: "▼ 負 Gamma 環境 (Short Gamma)",
    priceRelativeGauge: "當前價格相對做市商防禦牆定位 (Dealer Alignment)",
    relativeGaugeDesc: "相對於主要做市商期權持倉牆的實時價格百分比位置",
    keyPriceParameters: "核心量化價格指標",
    lastSpotPrice: "當前現貨指數 / 期貨價格",
    points: "點",
    expectedMove: "期權隱含 1標準差 預期波動範圍 (Expected Move)",
    emDownside: "預期波動下限 (EM Low)",
    emUpside: "預期波動上限 (EM High)",
    maxPainLevel: "最大痛點結算價 (Max Pain)",
    maxPainDesc: "買賣權買方期權價值歸零最優價",
    overnightHigh: "隔夜電子盤最高點",
    overnightLow: "隔夜電子盤最低點",
    structureLevelLadder: "做市商关键期权防禦牆階梯 (Dealer Walls)",
    majorCallWall: "最大買權曝險牆 (Major Call Wall - 阻力天花板)",
    majorPutWall: "最大賣權曝險牆 (Major Put Wall - 支撐地板)",
    majorFlip: "Gamma Flip 零軸分水嶺 (多空轉換軸)",
    activeSpot: "當前指數位置 (現貨價格)",
    actionGuidelines: "基於做市商敞口的量化操盤指南",

    gexRanksTitle: "🎯 關鍵 GEX 淨敞口水位 (GEX Ranks 1-4)",
    gexRanksDesc: "參考前一交易日市場數據，當前全市場 Gamma 曝險最高的前 4 個關鍵期權行權價 (Strikes)。莊家在這些位置擁有最大對沖頭寸，極具支撐阻力參考價值。",
    gexRankLabel: "曝險順位",
    callsDominant: "買權主導 (Calls Dominant)",
    putsDominant: "賣權主導 (Puts Dominant)",
    hedgingEffect: "莊家對沖效應：",
    longGammaMagnet: "正 Gamma 磁吸/阻力效應。價格靠近此處會被做市商的逆勢對沖壓制波動，極難單邊跌破/漲破，通常表現為強支撐或強阻力。",
    shortGammaAccelerant: "負 Gamma 加速/突破效應。價格觸及此處會觸發做市商順勢砍倉對沖，一旦失守/突破將引發Gamma擠壓，產生極強的單邊加速。",

    historicalTitle: "歷史數據回測與模型成功率日誌 (Last 20 Days)",
    historicalDesc: "回測過去 20 個交易日的模型分類準確度、Gamma Flip 偏離度以及關鍵支撐阻力牆的實時防禦成效。點擊展開。",
    dateRange: "回測日期範圍:",
    range5d: "5 交易日",
    range10d: "10 交易日",
    range20d: "20 交易日",
    rangeAll: "全部歷史",
    historicalChartTitle: "📈 量化結構多維歷史疊加圖 (Historical Overlay Chart)",
    historicalChartDesc: "動態監測 Regime 波動區間、Gamma Flip 分水嶺、做市商 Call/Put Walls 與指數收盤價的歷史演變關係。通過此圖可直觀印證多空趨勢轉換與邊界防禦效率。",
    tableTab: "📋 數據賬簿 (Ledger Table)",
    chartTab: "📊 交互圖表 (Interactive Chart)",
    regimeOverlay: "Regime 市場運行狀態",

    verificationTitle: "🔍 數據來源與計算方法說明",
    verificationDesc: "本終端分析的是 NQ / ES 期貨對應的指數期權 (NDX / SPX)。數據為延遲 / 收盤 (EOD) 數據，僅供研究參考，非即時、非投資建議。以下說明實際的數據來源與計算方式：",
    q1: "1. 期權數據來源與多源核對 (Data Sources & Reconciliation)",
    a1: "期權鏈 (OI、IV) 主要來自 marketdata.app (彙整 OPRA 官方期權報價) 的延遲 / EOD 數據，並以 Yahoo Finance 作為備援與交叉核對來源。同一行權價的未平倉量 (OI) 若兩來源差異超過 10%，會在核對面板標記為 'Conflict'，取值以主來源優先。核對紀錄透明可查。請注意:免費數據源僅授權個人 / 研究用途。",
    q2: "2. Black-Scholes Gamma 計算 (BS Greeks)",
    a2: "Gamma 使用 Black-Scholes 公式計算。無風險利率 (r) 取自 FRED 的美國十年期公債殖利率 (DGS10)，為真實數據；若 FRED 暫時無法取得，則退回 4% 預設值並於介面標示。到期時間 (T) 由各合約到期日推算，結合 OI 生成 GEX。",
    q3: "3. 預期波動範圍 (Expected Move)",
    a3: "1 標準差預期波動範圍由 ATM 隱含波動率 (IV) 推算。當價格突破此範圍，市場結構分類會相應地從「盤整」轉為「趨勢擴張」。此為根據當日 EOD 數據的機械化計算結果，非對未來走勢的保證或預測。",

    range_bound: "盤整 (Range Bound)",
    range_at_edge: "盤整·邊界風險 (Range at Edge)",
    trending: "趨勢/擴張 (Trending)",
    chop_whipsaw: "雙邊洗盤 (Chop/Whipsaw)",
  },
  en: {
    title: "Quant Option Dealer GEX Exposure & Market Structure Terminal",
    subtitle: "Real-time Multi-exchange Option Chain Reconciliation, Gamma Exposure Tracking, and Dealer Hedging Flows",
    joinPro: "Join PRO Flow",
    freeTier: "Free Tier Quota",
    activeView: "Active View",
    loadReport: "Load Day",
    tradingDays: "Trading Days Logs",
    
    scrapeButton: "Refresh EOD Data Snapshot",
    scrapingText: "Scraping & Aligning Option Chains, calculating Black-Scholes exposure, and executing multi-source arbitration...",
    scrapeSuccess: "Option data consolidated successfully! Active resolution date:",

    asOfDate: "Data As-Of (EST)",
    ledgerRating: "Ledger Sync Rating",
    confidenceHigh: "High Confidence (No Discrepancies)",
    confidenceMedium: "Medium Confidence (Minor Variations Resolved)",
    confidenceLow: "Low Confidence (High Variance Reconciled)",
    dxyIndex: "US Dollar Index (DXY)",
    us10yYield: "Ten-Year Treasury Yield (US10Y)",

    marketStructureState: "Market Structure State (Regime)",
    gammaEnvironment: "Dealer Gamma Environment",
    positiveGamma: "▲ Positive Gamma Environment (Long Gamma)",
    negativeGamma: "▼ Negative Gamma Environment (Short Gamma)",
    priceRelativeGauge: "Price Location Relative to Dealer Walls (Dealer Alignment)",
    relativeGaugeDesc: "Real-time percentage position of spot price relative to dealer option boundaries",
    keyPriceParameters: "Key Quantitative Price Parameters",
    lastSpotPrice: "Last Spot Index / Futures Price",
    points: "points",
    expectedMove: "Options Implied 1-Std expected range (Expected Move)",
    emDownside: "Expected Downside (EM Low)",
    emUpside: "Expected Upside (EM High)",
    maxPainLevel: "Standard Max Pain Level",
    maxPainDesc: "Lowest option payouts strike on expiry for buyers",
    overnightHigh: "Overnight Electronic High",
    overnightLow: "Overnight Electronic Low",
    structureLevelLadder: "Dealer Option Wall Ladder",
    majorCallWall: "Major Call Wall (Rank 1 - Major Ceiling)",
    majorPutWall: "Major Put Wall (Rank 1 - Major Floor)",
    majorFlip: "Gamma Flip Axis (Zero-GEX Pivot)",
    activeSpot: "Active Spot Index Price",
    actionGuidelines: "Structure-Based Quantitative Guidelines",

    gexRanksTitle: "🎯 Key GEX Net Exposure Levels (GEX Ranks 1-4)",
    gexRanksDesc: "Based on previous day's trading, the top 4 Strikes with the highest net absolute Gamma Exposure. Dealers hold maximum hedge inventory here, making them extremely strong reference levels.",
    gexRankLabel: "Exposure Rank",
    callsDominant: "Calls Dominant",
    putsDominant: "Puts Dominant",
    hedgingEffect: "Dealer Hedging Effect: ",
    longGammaMagnet: "Positive Gamma Magnet/Cushion. Spot approaching this level is met with contrarian dealer hedging (buying low, selling high), suppressing volatility and acting as a solid wall.",
    shortGammaAccelerant: "Negative Gamma Accelerant. Spot approaching this level triggers dealer trend-following hedging (selling breakdowns, buying breakouts), which may fuel intense trend acceleration.",

    historicalTitle: "Historical Review & Success Backtest Logs (Last 20 Days)",
    historicalDesc: "Backtest past 20 trading days for model quadrant classification accuracy, Gamma Flip deviations, and real-time support/resistance wall defense rates. Click to expand.",
    dateRange: "Backtest Window:",
    range5d: "5 Days",
    range10d: "10 Days",
    range20d: "20 Days",
    rangeAll: "All Logs",
    historicalChartTitle: "📈 Multi-Dimensional Historical Overlay Chart",
    historicalChartDesc: "Dynamically monitor the historical relationship between the Regime quadrant, Gamma Flip pivot, dealer Call/Put Walls, and the index close price. Easily verify boundary defense performance.",
    tableTab: "📋 Ledger Table",
    chartTab: "📊 Interactive Chart",
    regimeOverlay: "Regime Classification Status",

    verificationTitle: "🔍 Data Sources & Methodology",
    verificationDesc: "This terminal analyzes the index options (NDX / SPX) underlying the NQ / ES futures. Data is delayed / end-of-day (EOD), provided for research reference only — it is not real-time and not investment advice. Below is how the data is actually sourced and computed:",
    q1: "1. Options Data Sources & Reconciliation",
    a1: "Option chain data (OI, IV) comes primarily from marketdata.app (aggregating official OPRA options quotes) on a delayed / EOD basis, with Yahoo Finance as a backup and cross-check source. If Open Interest for a given strike differs by more than 10% between sources, it is flagged as 'Conflict' in the audit panel, with the primary source taking precedence. Reconciliation records are transparent. Note: free data sources are licensed for personal / research use only.",
    q2: "2. Black-Scholes Gamma Computation",
    a2: "Gamma is computed using the Black-Scholes formula. The risk-free rate (r) is taken from the FRED US 10-Year Treasury yield (DGS10) — real data; if FRED is temporarily unavailable, it falls back to a 4% default (indicated in the UI). Time to expiry (T) is derived per contract and combined with OI to generate GEX.",
    q3: "3. Expected Move",
    a3: "The 1-standard-deviation expected move is derived from ATM implied volatility (IV). If price breaks out of this range, the market-structure classification transitions from Range-Bound to Trending accordingly. This is a mechanical calculation based on that day's EOD data — not a guarantee or prediction of future price movement.",

    range_bound: "Range Bound",
    range_at_edge: "Range at Edge",
    trending: "Trending",
    chop_whipsaw: "Chop/Whipsaw",
  }
};
