import { DailyReport, ExpiryGexSummary, OfficialProxyConfluence, PlaybookOutput, SessionMonitorState, TradingViewPayloads } from "../types";
import { analyzeMarketStructure } from "../utils/engine";
import { black76Gamma, ResolvedOption } from "./cmeGex";
import { CmeNqOptionContract } from "./types";

export const NQ_FUTURES_MULTIPLIER = 20;

export interface CmeImportWithContracts {
  id: string;
  tradeDate: string;
  underlyingContract: string;
  futuresSettlement: number;
  contractCount: number;
  fileName?: string | null;
  sha256?: string | null;
  parserVersion?: string | null;
  createdAt?: string | null;
  warnings: string[];
  summary?: any;
  contracts: CmeNqOptionContract[];
}

const fmtMoney = (n: number) => {
  const abs = Math.abs(n);
  const sign = n >= 0 ? "+" : "-";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}k`;
  return `${sign}${abs.toFixed(0)}`;
};

function dte(tradeDate: string, expiryDate: string): number {
  return Math.max(0, Math.ceil((new Date(expiryDate).getTime() - new Date(tradeDate).getTime()) / 86400000));
}

export function analyzeCmeResolved(
  underlying: string,
  tradeDate: string,
  futuresSettlement: number,
  resolved: ResolvedOption[],
  confidence: "high" | "medium" | "low",
  macro: { VIX: number; DXY: number; US10Y: number },
): DailyReport {
  return analyzeMarketStructure(
    "NQ",
    `${underlying} (CME)`,
    `${tradeDate}T16:00:00-04:00`,
    futuresSettlement,
    resolved,
    confidence,
    Math.round(futuresSettlement * 1.003),
    Math.round(futuresSettlement * 0.997),
    macro,
    {
      contractMultiplier: NQ_FUTURES_MULTIPLIER,
      gammaCalculator: (spot, strike, tYears, iv) => black76Gamma(spot, strike, tYears, iv),
      calculationMode: "CME_BLACK_76",
    },
  );
}

function gammaPivotFromGex(strikes: DailyReport["gamma"]["gex_strikes"]): number | null {
  if (!strikes.length) return null;
  let cumulative = 0;
  let best = { strike: strikes[0].strike, abs: Infinity };
  for (const item of [...strikes].sort((a, b) => a.strike - b.strike)) {
    cumulative += item.net_gex;
    const abs = Math.abs(cumulative);
    if (abs < best.abs) best = { strike: item.strike, abs };
  }
  return best.strike;
}

function summarizeExpiry(label: string, expiryDate: string, tradeDate: string, report: DailyReport, allGrossGex: number): ExpiryGexSummary {
  const gex = report.gamma.gex_strikes;
  const netGex = gex.reduce((acc, s) => acc + s.net_gex, 0);
  const grossGex = gex.reduce((acc, s) => acc + Math.abs(s.net_gex), 0);
  const positiveGex = gex.filter((s) => s.net_gex > 0).reduce((acc, s) => acc + s.net_gex, 0);
  const negativeGex = gex.filter((s) => s.net_gex < 0).reduce((acc, s) => acc + s.net_gex, 0);
  return {
    label,
    expiryDate,
    dte: dte(tradeDate, expiryDate),
    callWall: report.gamma.call_walls[0]?.strike ?? null,
    putWall: report.gamma.put_walls[0]?.strike ?? null,
    gammaFlip: report.gamma.flip_level ?? null,
    gammaPivot: gammaPivotFromGex(gex),
    netGex,
    grossGex,
    positiveGex,
    negativeGex,
    expiryStructureImpactPct: allGrossGex > 0 ? Math.round((netGex / allGrossGex) * 1000) / 10 : 0,
    strikeCount: gex.length,
    gexStrikes: gex,
  };
}

export function buildCmeExpiryBreakdown(
  cme: CmeImportWithContracts,
  resolved: ResolvedOption[],
  confidence: "high" | "medium" | "low",
  macro: { VIX: number; DXY: number; US10Y: number },
): { expiryBreakdown: ExpiryGexSummary[]; selectedPanels: ExpiryGexSummary[] } {
  const allReport = analyzeCmeResolved(cme.underlyingContract, cme.tradeDate, cme.futuresSettlement, resolved, confidence, macro);
  const allGrossGex = allReport.gamma.gex_strikes.reduce((acc, s) => acc + Math.abs(s.net_gex), 0);

  const byExpiry = new Map<string, ResolvedOption[]>();
  for (const option of resolved) {
    const bucket = byExpiry.get(option.expiry) || [];
    bucket.push(option);
    byExpiry.set(option.expiry, bucket);
  }

  const labels = new Map<string, string>();
  for (const contract of cme.contracts) {
    if (!labels.has(contract.expiryDate)) labels.set(contract.expiryDate, contract.expiryLabel);
  }

  const expiryBreakdown = [...byExpiry.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([expiryDate, items]) => {
    const report = analyzeCmeResolved(cme.underlyingContract, cme.tradeDate, cme.futuresSettlement, items, confidence, macro);
    return summarizeExpiry(labels.get(expiryDate) || expiryDate, expiryDate, cme.tradeDate, report, allGrossGex);
  });

  const selected = new Map<string, ExpiryGexSummary>();
  const sorted = [...expiryBreakdown].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  if (sorted[0]) selected.set("First Expiration", { ...sorted[0], label: `First Expiration · ${sorted[0].label}` });
  if (sorted[1]) selected.set("Next Expiration", { ...sorted[1], label: `Next Expiration · ${sorted[1].label}` });
  const byGross = [...expiryBreakdown].sort((a, b) => b.grossGex - a.grossGex);
  if (byGross[0]) selected.set("Highest GEX", { ...byGross[0], label: `Highest GEX Expiry · ${byGross[0].label}` });
  if (byGross[1]) selected.set("2nd Highest GEX", { ...byGross[1], label: `2nd Highest GEX Expiry · ${byGross[1].label}` });
  return { expiryBreakdown, selectedPanels: [...selected.values()] };
}

export function buildCmeAuditStatus(cme: CmeImportWithContracts) {
  const totalCallOi = cme.contracts.filter((c) => c.optionType === "call").reduce((acc, c) => acc + c.openInterest, 0);
  const totalPutOi = cme.contracts.filter((c) => c.optionType === "put").reduce((acc, c) => acc + c.openInterest, 0);
  const totalVolume = cme.contracts.reduce((acc, c) => acc + c.volume, 0);
  const expiries = new Set(cme.contracts.map((c) => c.expiryDate));
  return {
    tradeDate: cme.tradeDate,
    underlyingContract: cme.underlyingContract,
    futuresSettlement: cme.futuresSettlement,
    parsedContractsCount: cme.contracts.length,
    expiryGroupsCount: expiries.size,
    totalCallOi,
    totalPutOi,
    totalVolume,
    pdfHash: cme.sha256 || null,
    importTimestamp: cme.createdAt || null,
    parserVersion: cme.parserVersion || cme.summary?.parserVersion || null,
    warnings: cme.warnings || [],
    duplicateStatus: "sha256 unique import guard enabled",
  };
}

export function buildTradingViewPayloads(report: DailyReport): TradingViewPayloads {
  const callWalls = report.gamma.call_walls.slice(0, 10).map((w) => Math.round(w.strike));
  const putWalls = report.gamma.put_walls.slice(0, 10).map((w) => Math.round(w.strike));
  while (callWalls.length < 10) callWalls.push(0);
  while (putWalls.length < 10) putWalls.push(0);

  const source = report.data_mode || "NDX_PROXY_FALLBACK";
  const tradeDate = report.source_status?.dashboardDate || report.as_of.slice(0, 10);
  const underlying = report.source_status?.cmeUnderlying || report.proxy;
  const ng = Math.round(report.total_net_gex ?? report.gamma.gex_strikes.reduce((acc, s) => acc + s.net_gex, 0));
  const levels = [
    [report.gamma.flip_level, "ZG", "ZERO GAMMA", "Zero Gamma~Dealer flip zone", 0],
    [report.gamma.call_walls[0]?.strike, "CW", "Call Wall", `Tot GEX:${fmtMoney(report.gamma.call_walls[0]?.gex ?? 0)}~Distance:${report.gamma.call_walls[0]?.dist_pts ?? 0}`, report.gamma.call_walls[0]?.gex ?? 0],
    [report.gamma.put_walls[0]?.strike, "PW", "Put Wall", `Tot GEX:${fmtMoney(report.gamma.put_walls[0]?.gex ?? 0)}~Distance:${report.gamma.put_walls[0]?.dist_pts ?? 0}`, report.gamma.put_walls[0]?.gex ?? 0],
    [report.gamma.max_pain, "MP", "Max Pain", "Max Pain", 0],
    [report.price.expected_move.high, "EH", "Expected Move High", "1σ upper", 0],
    [report.price.expected_move.low, "EL", "Expected Move Low", "1σ lower", 0],
  ].filter((item) => typeof item[0] === "number");
  const profile = [...report.gamma.gex_strikes]
    .sort((a, b) => Math.abs(b.net_gex) - Math.abs(a.net_gex))
    .slice(0, 40)
    .map((s) => `${Math.round(s.strike)},${Math.round(s.net_gex / 1e6)},${s.net_gex >= 0 ? 1 : -1}`)
    .join(";");

  return {
    simpleCsv: `cw1,cw2,cw3,cw4,cw5,cw6,cw7,cw8,cw9,cw10,${callWalls.join(",")},pw1,pw2,pw3,pw4,pw5,pw6,pw7,pw8,pw9,pw10,${putWalls.join(",")},gammaFlip,${report.gamma.flip_level}`,
    keyValue: `res=${report.gamma.call_walls[0]?.strike ?? ""}; sup=${report.gamma.put_walls[0]?.strike ?? ""}; flip=${report.gamma.flip_level}; maxpain=${report.gamma.max_pain}; emlow=${report.price.expected_move.low}; emhigh=${report.price.expected_move.high}; regime=${report.gamma.status}; ng=${ng}; source=${source}; tradeDate=${tradeDate}; underlying=${underlying}`,
    compact: `S:40.0|D:${tradeDate}|U:${underlying}|M:${source}|SPOT:${report.price.last}|L:${levels.map((l) => l.join(",")).join(";")}|P:${profile}`,
  };
}

export function buildDefaultSessionMonitor(report: DailyReport): SessionMonitorState {
  const nearFlip = Math.abs(report.price.last - report.gamma.flip_level) <= Math.max(40, report.price.last * 0.0025);
  const isPositive = report.gamma.status === "positive";
  return {
    lastEvent: null,
    gammaFlipTouched: nearFlip,
    gammaFlipReclaimed: false,
    callWallTouched: false,
    callWallBreakoutConfirmed: false,
    putWallTouched: false,
    putWallBreakdownConfirmed: false,
    wallFlipped: null,
    currentSessionRegime: nearFlip ? "Neutral / Wait" : isPositive ? "Consolidation / Pin" : "No Edge",
    explanation: "Session Flow unavailable — currently using CME EOD OI baseline. TradingView webhook events will update this state intraday.",
    updatedAt: null,
  };
}

export function buildPlaybook(report: DailyReport): PlaybookOutput {
  const spot = report.price.last;
  const callWall = report.gamma.call_walls[0]?.strike ?? null;
  const putWall = report.gamma.put_walls[0]?.strike ?? null;
  const flip = report.gamma.flip_level;
  const nearFlip = Math.abs(spot - flip) <= Math.max(40, spot * 0.0025);
  const warnings = [...(report.source_status?.sourceWarnings || [])];
  if (report.data_confidence !== "high") warnings.push("IV / source coverage is not high; keep confidence reduced.");
  if (report.data_mode === "NDX_PROXY_FALLBACK") warnings.push("This is proxy fallback, not CME official NQ futures options OI.");

  if (nearFlip) {
    return {
      bias: "No edge / Wait",
      favor: "等待價格離開 Gamma Flip zone 後再看牆位確認。",
      avoid: "不要在 flip 附近追單；此區容易來回洗盤。",
      trigger: "連續 2 根 5m 收在 Call Wall 上方，或連續 2 根 5m 跌破 Put Wall。",
      invalidation: "突破後又回到 Flip zone 內。",
      keyLevels: [{ label: "Gamma Flip", level: flip }, { label: "Call Wall", level: callWall }, { label: "Put Wall", level: putWall }],
      confidence: report.data_confidence,
      warnings,
    };
  }
  if (report.gamma.status === "negative") {
    const down = spot < flip;
    return {
      bias: down ? "Expansion Down" : "Expansion Up",
      favor: down ? "反彈不回 Put Wall / Flip 上方時，優先觀察下方支撐反應。" : "突破後回測不跌回 Call Wall 下方時，優先觀察上方延伸。",
      avoid: "不要在第一根急漲急跌後直接追；等待 2×5m close 與 AVWAP / BOS 確認。",
      trigger: down ? "2×5m close below Put Wall + BOS_DOWN。" : "2×5m close above Call Wall + BOS_UP。",
      invalidation: down ? "收回 Put Wall 或 Flip 上方。" : "收回 Call Wall 或 Flip 下方。",
      keyLevels: [{ label: "Put Wall", level: putWall }, { label: "Call Wall", level: callWall }, { label: "Expected Move Low", level: report.price.expected_move.low }, { label: "Expected Move High", level: report.price.expected_move.high }],
      confidence: report.data_confidence,
      warnings,
    };
  }
  return {
    bias: "Consolidation / Range",
    favor: "優先等區間邊界反應；靠近支撐/壓力後看價格確認。",
    avoid: "避免在 Call/Put Wall 區間中間追單。",
    trigger: "靠近 Put Wall / Call Wall，且價格確認沒有 2×5m 站到牆外。",
    invalidation: "連續 2 根 5m 收在牆外並伴隨 BOS / ATR 擴張。",
    keyLevels: [{ label: "Call Wall", level: callWall }, { label: "Put Wall", level: putWall }, { label: "Max Pain", level: report.gamma.max_pain }, { label: "Gamma Flip", level: flip }],
    confidence: report.data_confidence,
    warnings,
  };
}

export function buildConfluence(cmeReport: DailyReport, proxyReport?: DailyReport): OfficialProxyConfluence {
  if (!proxyReport) {
    return { score: "Unavailable", note: "Proxy data is unavailable for this snapshot; no confluence score was computed." };
  }
  const cmeCall = cmeReport.gamma.call_walls[0]?.strike ?? null;
  const cmePut = cmeReport.gamma.put_walls[0]?.strike ?? null;
  const proxyCall = proxyReport.gamma.call_walls[0]?.strike ?? null;
  const proxyPut = proxyReport.gamma.put_walls[0]?.strike ?? null;
  const callDiff = cmeCall !== null && proxyCall !== null ? Math.round(cmeCall - proxyCall) : null;
  const putDiff = cmePut !== null && proxyPut !== null ? Math.round(cmePut - proxyPut) : null;
  const maxDiff = Math.max(Math.abs(callDiff ?? 999999), Math.abs(putDiff ?? 999999));
  const score = maxDiff <= 100 ? "High" : maxDiff <= 300 ? "Medium" : "Low";
  return {
    cmeCallWall: cmeCall,
    proxyCallWall: proxyCall,
    callWallDiffPts: callDiff,
    cmePutWall: cmePut,
    proxyPutWall: proxyPut,
    putWallDiffPts: putDiff,
    cmeRegime: cmeReport.regime.label,
    proxyRegime: proxyReport.regime.label,
    score,
    note: "This is level confluence only. NDX / SPX proxy data is not used as CME futures options OI consensus.",
  };
}
