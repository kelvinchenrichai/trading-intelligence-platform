import { DailyReport, ExpiryGexSummary, GexDisplayCalibration, OfficialProxyConfluence, PlaybookOutput, SessionMonitorState, TradingViewPayloads } from "../types";
import { analyzeMarketStructure, AnalyzeMarketStructureOptions } from "../utils/engine";
import { black76Gamma, ResolvedOption } from "./cmeGex";
import { CmeNqOptionContract } from "./types";

export const NQ_FUTURES_MULTIPLIER = 20;
export const NQ_COMPARABLE_NET_DIVISOR = 87;
export const NQ_COMPARABLE_GROSS_DIVISOR = 175;

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

export function addTradingDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) added += 1;
  }
  return d.toISOString().slice(0, 10);
}

export function targetSessionDateForTradeDate(tradeDate: string): string {
  // CME PG40 is an EOD bulletin.  The trading map prepared from it is for the
  // next regular trading session, not for the finished EOD trade date.
  return addTradingDays(tradeDate, 1);
}

export function activeForTargetSession<T extends { expiry: string }>(items: T[], targetSessionDate: string): T[] {
  return items.filter((item) => item.expiry >= targetSessionDate);
}

function dte(anchorDate: string, expiryDate: string): number {
  return Math.max(0, Math.ceil((new Date(expiryDate).getTime() - new Date(anchorDate).getTime()) / 86400000));
}

export function analyzeCmeResolved(
  underlying: string,
  tradeDate: string,
  futuresSettlement: number,
  resolved: ResolvedOption[],
  confidence: "high" | "medium" | "low",
  macro: { VIX: number; DXY: number; US10Y: number },
  engineOverrides: Partial<AnalyzeMarketStructureOptions> = {},
): DailyReport {
  const report = analyzeMarketStructure(
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
      // CME full chains include far-tail strikes used for audit.  Headline
      // trading levels should stay near the futures settlement / expected move.
      decisionWindowMinPoints: 1000,
      preferDirectionalWalls: true,
      ...engineOverrides,
    },
  );
  return attachCmeGexDisplayCalibration(report);
}

export function attachCmeGexDisplayCalibration(report: DailyReport): DailyReport {
  const rawNetGex = Math.round(report.total_net_gex ?? report.gamma.gex_strikes.reduce((acc, s) => acc + s.net_gex, 0));
  const rawGrossGex = Math.round(report.gross_gex ?? report.gamma.gex_strikes.reduce((acc, s) => acc + Math.abs(s.net_gex), 0));
  const calibration: GexDisplayCalibration = {
    rawNetGex,
    rawGrossGex,
    pointNetGex: Math.round(rawNetGex / NQ_FUTURES_MULTIPLIER),
    pointGrossGex: Math.round(rawGrossGex / NQ_FUTURES_MULTIPLIER),
    comparableNetGex: Math.round(rawNetGex / NQ_COMPARABLE_NET_DIVISOR),
    comparableGrossGex: Math.round(rawGrossGex / NQ_COMPARABLE_GROSS_DIVISOR),
    contractMultiplier: NQ_FUTURES_MULTIPLIER,
    comparableDivisor: NQ_COMPARABLE_NET_DIVISOR,
    comparableNetDivisor: NQ_COMPARABLE_NET_DIVISOR,
    comparableGrossDivisor: NQ_COMPARABLE_GROSS_DIVISOR,
    mode: "COMPARABLE_SCALE",
    benchmark: {
      vendor: "MenthorQ text benchmark supplied by user",
      tradeDate: "2026-07-07",
      netGex: -2_880_000,
      totalGex: 14_810_000,
      putSupport: 29_000,
      callResistance: 30_000,
      hvl: 29_550,
    },
    note: "Comparable GEX is a transparent display calibration for side-by-side review. It is not MenthorQ's proprietary formula and raw CME Black-76 values are preserved.",
  };
  return { ...report, gex_display: calibration };
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

function summarizeExpiry(label: string, expiryDate: string, targetSessionDate: string, report: DailyReport, allGrossGex: number): ExpiryGexSummary {
  const gex = report.gamma.gex_strikes;
  const netGex = gex.reduce((acc, s) => acc + s.net_gex, 0);
  const grossGex = gex.reduce((acc, s) => acc + Math.abs(s.net_gex), 0);
  const positiveGex = gex.filter((s) => s.net_gex > 0).reduce((acc, s) => acc + s.net_gex, 0);
  const negativeGex = gex.filter((s) => s.net_gex < 0).reduce((acc, s) => acc + s.net_gex, 0);
  const comparableNetDivisor = report.gex_display?.comparableNetDivisor ?? NQ_COMPARABLE_NET_DIVISOR;
  const comparableGrossDivisor = report.gex_display?.comparableGrossDivisor ?? NQ_COMPARABLE_GROSS_DIVISOR;
  return {
    label,
    expiryDate,
    dte: dte(targetSessionDate, expiryDate),
    callWall: report.gamma.call_walls[0]?.strike ?? null,
    putWall: report.gamma.put_walls[0]?.strike ?? null,
    gammaFlip: report.gamma.flip_level ?? null,
    gammaPivot: gammaPivotFromGex(gex),
    netGex,
    grossGex,
    rawNetGex: netGex,
    rawGrossGex: grossGex,
    pointNetGex: Math.round(netGex / NQ_FUTURES_MULTIPLIER),
    pointGrossGex: Math.round(grossGex / NQ_FUTURES_MULTIPLIER),
    comparableNetGex: Math.round(netGex / comparableNetDivisor),
    comparableGrossGex: Math.round(grossGex / comparableGrossDivisor),
    positiveGex,
    negativeGex,
    expiryStructureImpactPct: allGrossGex > 0 ? Math.round((netGex / allGrossGex) * 1000) / 10 : 0,
    strikeCount: gex.length,
    gexStrikes: gex,
  };
}

function roundToNearest(value: number, step = 5): number {
  return Math.round(value / step) * step;
}

/**
 * Phase 9.5: choose a front-expiry (0DTE/1DTE) wall that respects structural
 * resonance, not just raw GEX magnitude. Given the raw strongest-in-band pick,
 * upgrade it to a nearby structurally-dominant strike when that strike:
 *   - matches the all-expiry wall (multi-expiry resonance), and/or
 *   - is a round-number level (integer strike like 30,000 / 29,500), and/or
 *   - is the first significant barrier between spot and the raw pick.
 * The upgrade only fires when the resonant strike carries at least ~55% of the
 * raw pick's exposure, so we never replace a genuinely dominant level with a
 * weak round number.
 */
function preferResonantWall(
  strikes: DailyReport["gamma"]["gex_strikes"],
  rawPick: number | null,
  allExpWall: number | null,
  spot: number,
  bandMin: number,
  bandMax: number,
  side: "call" | "put",
): number | null {
  if (rawPick === null) return allExpWall;
  const exposureAt = (strike: number): number => {
    const s = strikes.find((x) => x.strike === strike);
    if (!s) return 0;
    return side === "call" ? Math.max(Math.abs(s.call_gex), Math.abs(s.net_gex)) : Math.max(Math.abs(s.put_gex), Math.abs(s.net_gex));
  };
  const isRound = (v: number) => v % 500 === 0 || v % 1000 === 0;
  const rawExp = exposureAt(rawPick);
  if (rawExp <= 0) return rawPick;

  // Candidate resonant levels: all-exp wall + any round strike strictly between
  // spot and the raw pick (inclusive of the all-exp wall).
  const between = strikes
    .map((s) => s.strike)
    .filter((k) => (side === "call" ? k >= spot && k <= rawPick : k <= spot && k >= rawPick))
    .filter((k) => k >= bandMin && k <= bandMax);
  const candidates = new Set<number>();
  if (allExpWall !== null && allExpWall >= bandMin && allExpWall <= bandMax) candidates.add(allExpWall);
  for (const k of between) if (isRound(k)) candidates.add(k);

  let best = rawPick;
  let bestScore = rawExp; // raw pick baseline
  for (const c of candidates) {
    if (c === rawPick) continue;
    const exp = exposureAt(c);
    let score = exp;
    const isResonant = allExpWall !== null && c === allExpWall;
    if (isResonant) score *= 1.6; // resonance bonus
    if (isRound(c)) score *= 1.25; // round-number bonus
    // Exposure floor: a resonant all-exp wall only needs to carry real (not
    // trivial) exposure — 30% — because multi-expiry agreement is itself strong
    // evidence. A non-resonant round number still needs 55% to upgrade.
    const floor = isResonant ? 0.30 : 0.55;
    if (exp >= rawExp * floor && score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

function nearestProfileFlip(strikes: DailyReport["gamma"]["gex_strikes"], spot: number, windowPoints: number): number | null {
  const near = [...strikes]
    .filter((s) => Math.abs(s.strike - spot) <= windowPoints)
    .sort((a, b) => a.strike - b.strike);
  for (let i = 1; i < near.length; i++) {
    const a = near[i - 1];
    const b = near[i];
    if (!a || !b) continue;
    if (a.net_gex === 0) return a.strike;
    if ((a.net_gex < 0 && b.net_gex > 0) || (a.net_gex > 0 && b.net_gex < 0)) {
      const denom = Math.abs(a.net_gex) + Math.abs(b.net_gex);
      const t = denom > 0 ? Math.abs(a.net_gex) / denom : 0.5;
      return roundToNearest(a.strike + t * (b.strike - a.strike), 1);
    }
  }
  return null;
}

function strongestStrikeInBand(
  strikes: DailyReport["gamma"]["gex_strikes"],
  minStrike: number,
  maxStrike: number,
  side: "call" | "put",
  anchor?: number | null,
): number | null {
  const candidates = strikes
    .filter((s) => s.strike >= minStrike && s.strike <= maxStrike)
    .filter((s) => side === "call" ? s.call_gex > 0 || s.net_gex > 0 : s.put_gex < 0 || s.net_gex < 0);
  if (!candidates.length) return null;
  const anchorLevel = anchor ?? ((minStrike + maxStrike) / 2);
  const scored = candidates
    .map((s) => {
      const exposure = side === "call" ? Math.max(Math.abs(s.call_gex), Math.abs(s.net_gex)) : Math.max(Math.abs(s.put_gex), Math.abs(s.net_gex));
      // MenthorQ-style intraday walls are not always the absolute-largest tail
      // blob; favor meaningful exposure that sits near the expected tradable
      // path / benchmark anchor.
      const distancePenalty = 1 + Math.abs(s.strike - anchorLevel) / Math.max(50, Math.abs(maxStrike - minStrike));
      return { strike: s.strike, score: exposure / distancePenalty };
    })
    .sort((a, b) => b.score - a.score || Math.abs(a.strike - anchorLevel) - Math.abs(b.strike - anchorLevel));
  return scored[0]?.strike ?? null;
}

function alignExpirySummaryToMenthorqStyle(
  summary: ExpiryGexSummary,
  allReport: DailyReport,
): ExpiryGexSummary {
  const spot = allReport.price.last;
  const em = Math.max(200, allReport.price.expected_move.points || 400);
  const allFlip = allReport.gamma.flip_level;
  const allCall = allReport.gamma.call_walls[0]?.strike ?? null;
  const allPut = allReport.gamma.put_walls[0]?.strike ?? null;
  const currentCall = summary.callWall;
  const currentPut = summary.putWall;
  let callWall = currentCall;
  let putWall = currentPut;
  let gammaFlip = summary.gammaFlip;

  // Front expirations should behave like a trading map, not a raw max-OI map.
  // For 0DTE/1DTE, prefer intraday barriers around the EM path:
  //   - call resistance above spot, often between 0.35x and 1.30x EM
  //   - put support below spot, often around EM low / all-exp put support
  // This specifically prevents 28,500 or 29,350 from becoming the active 0DTE
  // put wall when the paid benchmark uses the 29,000 defense zone.
  if (summary.dte <= 1) {
    const callMin = spot + Math.max(120, em * 0.32);
    const callMax = spot + Math.max(500, em * 1.35);
    const callAnchor = summary.dte === 0 ? spot + em * 0.55 : (allCall ?? spot + em);
    const rawFrontCall = strongestStrikeInBand(summary.gexStrikes, callMin, callMax, "call", callAnchor)
      ?? (allCall !== null && allCall >= callMin && allCall <= callMax + 200 ? allCall : null);
    // Phase 9.5: a 0DTE call wall is a trading barrier, not a raw max-GEX pick.
    // Apply resonance + round-number bonuses so a slightly-larger far strike
    // (e.g. 30,400) cannot outrank a structurally dominant nearer level
    // (e.g. 30,000 = all-exp call wall + integer + first resistance above spot).
    const frontCall = preferResonantWall(
      summary.gexStrikes, rawFrontCall, allCall, spot, callMin, callMax, "call",
    );
    if (frontCall !== null) callWall = frontCall;

    const putMin = spot - Math.max(750, em * 1.55);
    const putMax = spot - Math.max(120, em * 0.25);
    const putAnchor = allPut ?? allReport.price.expected_move.low;
    const rawFrontPut = strongestStrikeInBand(summary.gexStrikes, putMin, putMax, "put", putAnchor)
      ?? (allPut !== null && allPut >= putMin - 150 && allPut <= putMax + 100 ? allPut : null);
    const frontPut = preferResonantWall(
      summary.gexStrikes, rawFrontPut, allPut, spot, putMin, putMax, "put",
    );
    if (frontPut !== null) putWall = frontPut;
  }

  // Phase 9.6: front-expiry (0DTE/1DTE) HVL must be a real regime boundary
  // BELOW the call wall, never a far-tail cross above it. The old logic could
  // return e.g. 30,320 (above the 30,000 call wall) which is meaningless as a
  // 0DTE HVL. We now:
  //   1. compute a boundary flip = lowest durable negative→positive transition
  //      in the front window (same method as all-exp),
  //   2. hard-guard: HVL may not sit at/above the call wall — if it does, or if
  //      no boundary is found, fall back to the all-exp flip.
  const frontBoundary = frontRegimeBoundary(summary.gexStrikes, spot, Math.max(700, em * 1.6));
  const callWallForGuard = callWall ?? (allCall ?? spot + em);
  let resolvedFlip: number | null = null;
  if (frontBoundary !== null && frontBoundary < callWallForGuard - 20) {
    resolvedFlip = frontBoundary;
  } else if (typeof gammaFlip === "number" && gammaFlip < callWallForGuard - 20 && Math.abs(gammaFlip - spot) <= Math.max(650, em * 1.4)) {
    resolvedFlip = gammaFlip;
  } else {
    // Last resort: benchmark-style nearby transition, else all-exp flip — but
    // always clamped below the call wall.
    const profileFlip = nearestProfileFlip(summary.gexStrikes, spot, Math.max(550, em * 1.4));
    if (profileFlip !== null && profileFlip < callWallForGuard - 20) resolvedFlip = profileFlip;
    else resolvedFlip = Math.min(allFlip, callWallForGuard - 40);
  }
  gammaFlip = Math.round(resolvedFlip * 10) / 10;

  return { ...summary, callWall, putWall, gammaFlip };
}

/**
 * Phase 9.6: front-expiry regime boundary = lowest durable negative→positive
 * net-GEX transition within the near-spot window. Mirrors the all-exp HVL logic
 * so 0DTE / 1DTE HVL lines are consistent and never snap to a far tail cross.
 */
function frontRegimeBoundary(
  strikes: DailyReport["gamma"]["gex_strikes"],
  spot: number,
  windowPoints: number,
): number | null {
  const ps = strikes
    .filter((s) => Math.abs(s.strike - spot) <= windowPoints)
    .sort((a, b) => a.strike - b.strike);
  if (ps.length < 2) return null;
  const LOOKAHEAD = 3;
  const cands: Array<{ price: number; posMass: number }> = [];
  for (let i = 0; i < ps.length - 1; i++) {
    const a = ps[i];
    const b = ps[i + 1];
    if (!(a.net_gex < 0 && b.net_gex > 0)) continue;
    let ahead = 0;
    for (let k = i + 1; k < Math.min(ps.length, i + 1 + LOOKAHEAD); k++) ahead += ps[k].net_gex;
    if (ahead <= 0) continue;
    const denom = b.net_gex - a.net_gex;
    const price = denom !== 0 ? a.strike + (-a.net_gex / denom) * (b.strike - a.strike) : a.strike;
    cands.push({ price, posMass: ahead });
  }
  if (!cands.length) return null;
  const massFloor = Math.max(...cands.map((c) => c.posMass)) * 0.25;
  const durable = cands.filter((c) => c.posMass >= massFloor).sort((x, y) => x.price - y.price);
  return durable[0]?.price ?? null;
}

export function buildCmeExpiryBreakdown(
  cme: CmeImportWithContracts,
  resolved: ResolvedOption[],
  confidence: "high" | "medium" | "low",
  macro: { VIX: number; DXY: number; US10Y: number },
): { expiryBreakdown: ExpiryGexSummary[]; selectedPanels: ExpiryGexSummary[] } {
  const targetSessionDate = targetSessionDateForTradeDate(cme.tradeDate);
  const activeResolved = activeForTargetSession(resolved, targetSessionDate);
  const allReport = analyzeCmeResolved(cme.underlyingContract, cme.tradeDate, cme.futuresSettlement, activeResolved.length ? activeResolved : resolved, confidence, macro);
  const allGrossGex = allReport.gamma.gex_strikes.reduce((acc, s) => acc + Math.abs(s.net_gex), 0);

  const byExpiry = new Map<string, ResolvedOption[]>();
  for (const option of (activeResolved.length ? activeResolved : resolved)) {
    const bucket = byExpiry.get(option.expiry) || [];
    bucket.push(option);
    byExpiry.set(option.expiry, bucket);
  }

  const labels = new Map<string, string>();
  for (const contract of cme.contracts) {
    if (!labels.has(contract.expiryDate)) labels.set(contract.expiryDate, contract.expiryLabel);
  }

  const expiryBreakdown = [...byExpiry.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([expiryDate, items]) => {
    const expiryDte = dte(targetSessionDate, expiryDate);
    const report = analyzeCmeResolved(
      cme.underlyingContract,
      cme.tradeDate,
      cme.futuresSettlement,
      items,
      confidence,
      macro,
      expiryDte <= 2
        ? { decisionWindowMinPoints: 650, wallDistanceWeight: 0.85 }
        : expiryDte <= 10
          ? { decisionWindowMinPoints: 900, wallDistanceWeight: 0.35 }
          : { wallDistanceWeight: 0.15 },
    );
    const summary = summarizeExpiry(labels.get(expiryDate) || expiryDate, expiryDate, targetSessionDate, report, allGrossGex);
    return alignExpirySummaryToMenthorqStyle(summary, allReport);
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
    targetSessionDate: targetSessionDateForTradeDate(cme.tradeDate),
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
    warnings: [
      ...(cme.warnings || []),
      ...(cme.contractCount && cme.contracts.length < cme.contractCount
        ? [`Dashboard fetched only ${cme.contracts.length}/${cme.contractCount} stored CME rows. Supabase pagination must be fixed before trusting this map.`]
        : []),
    ],
    duplicateStatus: "sha256 + parser_version import guard enabled; paginated contract fetch enabled",
  };
}

export function buildTradingViewPayloads(report: DailyReport): TradingViewPayloads {
  const callWalls = report.gamma.call_walls.slice(0, 10).map((w) => Math.round(w.strike));
  const putWalls = report.gamma.put_walls.slice(0, 10).map((w) => Math.round(w.strike));
  while (callWalls.length < 10) callWalls.push(0);
  while (putWalls.length < 10) putWalls.push(0);

  const source = report.data_mode || "NDX_PROXY_FALLBACK";
  const tradeDate = report.source_status?.cmeTargetSessionDate || report.source_status?.dashboardDate || report.as_of.slice(0, 10);
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
    gammaFlipRejected: false,
    bosUp: false,
    bosDown: false,
    avwapReclaim: false,
    avwapReject: false,
    currentSessionRegime: nearFlip ? "Neutral / Wait" : isPositive ? "Consolidation / Pin" : "No Edge",
    explanation: "Session Flow unavailable — currently using CME EOD OI baseline. TradingView webhook events will update this state intraday.",
    updatedAt: null,
  };
}

function confidenceRank(value: "high" | "medium" | "low") {
  return value === "high" ? 3 : value === "medium" ? 2 : 1;
}

function confidenceFromRank(value: number): "high" | "medium" | "low" {
  return value >= 3 ? "high" : value >= 2 ? "medium" : "low";
}

function capConfidence(value: "high" | "medium" | "low", cap: "high" | "medium" | "low") {
  return confidenceFromRank(Math.min(confidenceRank(value), confidenceRank(cap)));
}

function roundTradableLevel(level: number): number {
  // MenthorQ-style route levels are trading landmarks, not every 10-point
  // strike.  Use 50-point increments for readability while preserving major
  // walls / EM values added explicitly below.
  return Math.round(level / 50) * 50;
}

function uniqueOrderedLevels(levels: Array<number | null | undefined>, direction: "up" | "down", minGap = 75): number[] {
  const cleaned = levels
    .filter((x): x is number => typeof x === "number" && Number.isFinite(x))
    .map((x) => Math.round(x));
  const sorted = direction === "up" ? cleaned.sort((a, b) => a - b) : cleaned.sort((a, b) => b - a);
  const unique: number[] = [];
  for (const level of sorted) {
    if (!unique.some((x) => Math.abs(x - level) < minGap)) unique.push(level);
  }
  return unique;
}

function buildDirectionalPath(report: DailyReport, direction: "up" | "down"): number[] {
  const spot = report.price.last;
  const em = report.price.expected_move;
  const searchWindow = Math.max(1200, em.points * 2.5);
  const minActionDistance = Math.max(80, em.points * 0.18);

  if (direction === "up") {
    const resistanceCandidates = report.gamma.gex_strikes
      .filter((s) => s.strike > spot + minActionDistance && Math.abs(s.strike - spot) <= searchWindow)
      .filter((s) => s.net_gex > 0 || s.call_gex > 0)
      .map((s) => {
        const exposure = Math.max(Math.abs(s.call_gex), Math.abs(s.net_gex));
        const rounded = roundTradableLevel(s.strike);
        const distancePenalty = 1 + Math.abs(s.strike - spot) / Math.max(250, em.points);
        return { strike: rounded, score: exposure / distancePenalty };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((x) => x.strike);

    const structural = [
      spot + 150,
      spot + 230,
      em.high,
      ...report.gamma.call_walls.map((w) => w.strike),
    ].map((x) => roundTradableLevel(x));

    return uniqueOrderedLevels([
      ...structural,
      ...resistanceCandidates,
      em.high,
      ...report.gamma.call_walls.map((w) => w.strike),
    ].filter((x): x is number => typeof x === "number" && x > spot + 40), "up", 85).slice(0, 5);
  }

  const supportCandidates = report.gamma.gex_strikes
    .filter((s) => s.strike < spot - minActionDistance && Math.abs(s.strike - spot) <= searchWindow)
    .filter((s) => s.net_gex < 0 || s.put_gex < 0)
    .map((s) => {
      const exposure = Math.max(Math.abs(s.put_gex), Math.abs(s.net_gex));
      const rounded = roundTradableLevel(s.strike);
      const distancePenalty = 1 + Math.abs(s.strike - spot) / Math.max(250, em.points);
      return { strike: rounded, score: exposure / distancePenalty };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 14)
    .map((x) => x.strike);

  const structural = [
    spot - 170,
    spot - 270,
    em.low,
    ...report.gamma.put_walls.map((w) => w.strike),
    spot - 700,
    spot - 950,
  ].map((x) => roundTradableLevel(x));

  return uniqueOrderedLevels([
    ...structural,
    ...supportCandidates,
    em.low,
    ...report.gamma.put_walls.map((w) => w.strike),
  ].filter((x): x is number => typeof x === "number" && x < spot - 40), "down", 85).slice(0, 7);
}

function pathText(levels: number[]) {
  return levels.length ? levels.map((x) => Math.round(x)).join(" → ") : "等待牆位確認";
}

function buildPremarketBias(report: DailyReport, nearFlip: boolean): PlaybookOutput["premarketBias"] {
  const spot = report.price.last;
  const flip = report.gamma.flip_level;
  const callWall = report.gamma.call_walls[0]?.strike ?? null;
  const putWall = report.gamma.put_walls[0]?.strike ?? null;
  const emLow = report.price.expected_move.low;
  const emHigh = report.price.expected_move.high;
  const isNegative = report.gamma.status === "negative";
  const isPositive = report.gamma.status === "positive";
  const flipDistancePts = Math.round(spot - flip);
  const flipBuffer = Math.max(35, Math.round(report.price.expected_move.points * 0.12));
  const bullishBreak = Math.round(flip + flipBuffer);
  const bearishBreak = Math.round(flip - flipBuffer);

  const positiveGex = report.gamma.gex_strikes.filter((s) => s.net_gex > 0).reduce((acc, s) => acc + s.net_gex, 0);
  const negativeGexAbs = Math.abs(report.gamma.gex_strikes.filter((s) => s.net_gex < 0).reduce((acc, s) => acc + s.net_gex, 0));
  const putDominance = positiveGex > 0 ? negativeGexAbs / positiveGex : 1;

  let bearish = 35;
  let bullish = 35;
  let range = 30;
  let score = 0;

  if (isNegative) {
    // MenthorQ-style: Negative GEX is an expansion-prone structure.  Near-HVL
    // means wait for execution confirmation, not a high range probability.
    bearish = 66;
    bullish = 24;
    range = 10;
    score = -1.7;
    if (putDominance >= 1.25) { bearish += 5; bullish -= 3; range -= 2; score -= 0.35; }
    if (spot < flip) { bearish += 4; bullish -= 2; score -= 0.25; }
    if (spot > flip + flipBuffer) { bullish += 8; bearish -= 6; score += 0.5; }
  } else if (isPositive) {
    // Phase 9.5: positive gamma is range-prone by default, but the location of
    // price relative to HVL and the call/put wall asymmetry still tilt the tone.
    // Price ABOVE HVL heading into a stacked call wall = mild bullish test bias,
    // not flat "range 45%". This matches the vendor's "medium-confidence bull".
    const aboveHvl = spot > flip;
    const callMass = report.gamma.call_walls.reduce((a, w) => a + Math.abs(w.gex ?? 0), 0);
    const putMass = report.gamma.put_walls.reduce((a, w) => a + Math.abs(w.gex ?? 0), 0);
    const callHeavy = callMass > putMass * 1.3; // upside walls dominate
    if (aboveHvl) {
      bullish = 42;
      range = 38;
      bearish = 20;
      score = 0.7;
      // A heavy call wall overhead caps upside conviction slightly (resistance).
      if (callHeavy) { bullish -= 4; range += 4; score -= 0.2; }
    } else {
      bullish = 24;
      range = 40;
      bearish = 36;
      score = -0.3;
    }
  }

  bearish = Math.max(5, Math.min(85, Math.round(bearish)));
  bullish = Math.max(5, Math.min(85, Math.round(bullish)));
  range = Math.max(isNegative ? 5 : 5, Math.min(isNegative ? 15 : 60, Math.round(range)));
  const total = bearish + bullish + range;
  const probabilities = {
    bullish: Math.round((bullish / total) * 100),
    bearish: Math.round((bearish / total) * 100),
    range: Math.round((range / total) * 100),
  };

  const bullishPath = buildDirectionalPath(report, "up");
  const bearishPath = buildDirectionalPath(report, "down");

  let direction: NonNullable<PlaybookOutput["premarketBias"]>["direction"] = "wait";
  let label = "無優勢 / 等待確認";
  if (isNegative) {
    direction = probabilities.bearish >= 55 ? "bearish" : "wait";
    label = nearFlip ? "結構偏空 / Flip 等待" : "條件性偏空擴張";
  } else if (report.regime.quadrant === "range_bound") {
    direction = "range";
    label = "盤整區間 / 邊界交易";
  } else if (probabilities.bullish > probabilities.bearish + 10) {
    direction = "bullish";
    label = isPositive ? "正 Gamma 偏多測試" : "條件性偏多";
  }

  const confidence = capConfidence(report.regime.conviction ?? report.data_confidence, nearFlip ? "low" : report.data_confidence);
  const summary = isNegative
    ? `盤前結構偏空擴張：Net GEX 為負，且下方 Put/GEX 防守厚度高於上方推動力。執行上仍要等價格離開 HVL / Flip zone；目前距離 Flip 約 ${Math.abs(flipDistancePts)} 點，不可在中間追單。`
    : direction === "range"
      ? `盤前偏區間：正 Gamma / 邊界未破時，優先看 ${putWall ?? "Put Wall"} 到 ${callWall ?? "Call Wall"} 的反應，不追中間價。`
      : `盤前等待確認：先看 ${Math.round(flip)} 附近能否被接受，再判斷偏多或偏空。`;

  return {
    direction,
    label,
    confidence,
    score: Math.round(score * 10) / 10,
    probabilities,
    summary,
    bullishTrigger: `偏多條件：2×5m close above ${bullishBreak} + VWAP reclaim / BOS_UP；目標路徑：${pathText(bullishPath.length ? bullishPath : [emHigh, callWall].filter((x): x is number => typeof x === "number"))}。`,
    bearishTrigger: `偏空條件：2×5m close below ${bearishBreak} + VWAP rejection / BOS_DOWN；目標路徑：${pathText(bearishPath.length ? bearishPath : [emLow, putWall].filter((x): x is number => typeof x === "number"))}。`,
    bullishPath,
    bearishPath,
    triggerLevels: {
      flip: Math.round(flip * 10) / 10,
      bullishBreak,
      bearishBreak,
      noEdgeLow: bearishBreak,
      noEdgeHigh: bullishBreak,
    },
    invalidation: `若突破後重新回到 ${bearishBreak}～${bullishBreak} 的 Flip zone，或價格在 ${Math.round(flip)} 附近反覆穿越，盤前偏向失效，回到 No Edge。`,
    notes: [
      "這是盤前條件推演，不是喊單；方向必須由 TradingView 盤中確認。",
      "Negative GEX 代表容易放大已確認方向；貼近 HVL 代表執行要等待，不代表盤整機率高。",
    ],
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
  if (nearFlip) warnings.push("Price is inside the Gamma Flip zone; cap directional confidence and wait for confirmation.");
  if (report.data_mode === "NDX_PROXY_FALLBACK") warnings.push("This is proxy fallback, not CME official NQ futures options OI.");
  const premarketBias = buildPremarketBias(report, nearFlip);
  const baseConfidence = capConfidence(report.regime.conviction ?? report.data_confidence, report.data_confidence);
  const nearFlipConfidence = capConfidence(baseConfidence, "medium");

  if (nearFlip) {
    return {
      bias: "No edge / Wait",
      premarketBias,
      favor: "等待價格離開 Gamma Flip zone 後再看牆位確認。",
      avoid: "不要在 flip 附近追單；此區容易來回洗盤。",
      trigger: "連續 2 根 5m 收在 Call Wall 上方，或連續 2 根 5m 跌破 Put Wall。",
      invalidation: "突破後又回到 Flip zone 內。",
      keyLevels: [{ label: "Gamma Flip", level: flip }, { label: "Call Wall", level: callWall }, { label: "Put Wall", level: putWall }],
      confidence: nearFlipConfidence,
      warnings,
    };
  }
  if (report.gamma.status === "negative") {
    return {
      bias: "Negative GEX / Wait",
      premarketBias,
      favor: "Negative GEX 代表破位後容易放大，但方向必須由盤中價格確認；先觀察 HVL / Gamma Flip、Call Wall、Put Wall 的收盤確認。",
      avoid: "不要把 Negative GEX 直接解讀成單邊看空或看多；等待 2×5m close、BOS、VWAP / AVWAP 確認後再判斷擴張方向。",
      trigger: "下方：2×5m close below Put Wall + BOS_DOWN。上方：2×5m close above Call Wall + BOS_UP。",
      invalidation: "價格反覆穿越 Gamma Flip / HVL，且沒有站到 Call/Put Wall 外側，視為 chop / no edge。",
      keyLevels: [{ label: "Gamma Flip / HVL", level: flip }, { label: "Put Wall", level: putWall }, { label: "Call Wall", level: callWall }, { label: "Expected Move Low", level: report.price.expected_move.low }, { label: "Expected Move High", level: report.price.expected_move.high }],
      confidence: capConfidence(baseConfidence, "medium"),
      warnings,
    };
  }
  return {
    bias: "Consolidation / Range",
    premarketBias,
    favor: "優先等區間邊界反應；靠近支撐/壓力後看價格確認。",
    avoid: "避免在 Call/Put Wall 區間中間追單。",
    trigger: "靠近 Put Wall / Call Wall，且價格確認沒有 2×5m 站到牆外。",
    invalidation: "連續 2 根 5m 收在牆外並伴隨 BOS / ATR 擴張。",
    keyLevels: [{ label: "Call Wall", level: callWall }, { label: "Put Wall", level: putWall }, { label: "Max Pain", level: report.gamma.max_pain }, { label: "Gamma Flip", level: flip }],
    confidence: capConfidence(baseConfidence, nearFlip ? "medium" : "high"),
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
