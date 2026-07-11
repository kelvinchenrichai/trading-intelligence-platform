/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GexStrikeData, OptionChainRaw, DailyReport, DataReconciliation } from "../types";

// Black-Scholes formula for Gamma
export function calculateBSGamma(
  S: number,
  K: number,
  T: number, // Time in years (days / 365)
  sigma: number,
  r: number = 0.04
): number {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;
  try {
    const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
    const pdf = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
    const gamma = pdf / (S * sigma * Math.sqrt(T));
    return isNaN(gamma) || !isFinite(gamma) ? 0 : gamma;
  } catch {
    return 0;
  }
}

/**
 * Calculates GEX for a single strike option
 * GEX = Gamma * OI * 100 * spot^2 * 0.01
 */
export function calculateGex(
  gamma: number,
  oi: number,
  spot: number,
  optionType: "call" | "put",
  contractMultiplier: number = 100
): number {
  const gexVal = gamma * oi * contractMultiplier * (spot * spot) * 0.01;
  return optionType === "call" ? gexVal : -gexVal;
}

/**
 * Reconciles multi-source options data
 * Legacy utility for generic provider aggregation. Production ingestion uses providers/dataOrchestrator.ts.
 * Returns the resolved options dataset and the reconciliation records.
 */
export function reconcileData(
  snapshotDate: string,
  proxy: string,
  rawRecords: OptionChainRaw[]
): {
  resolved: Array<{
    expiry: string;
    strike: number;
    option_type: "call" | "put";
    oi: number;
    iv: number;
    gamma: number;
  }>;
  reconciliations: DataReconciliation[];
  confidence: "high" | "medium" | "low";
} {
  // Group records by expiry, strike, option_type
  const groups: Record<string, OptionChainRaw[]> = {};
  for (const r of rawRecords) {
    const key = `${r.expiry}_${r.strike}_${r.option_type}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  }

  const resolved: Array<{
    expiry: string;
    strike: number;
    option_type: "call" | "put";
    oi: number;
    iv: number;
    gamma: number;
  }> = [];

  const reconciliations: DataReconciliation[] = [];
  let conflictCount = 0;
  let totalCount = 0;

  for (const [key, records] of Object.entries(groups)) {
    const [expiry, strikeStr, option_type] = key.split("_");
    const strike = parseFloat(strikeStr);

    totalCount++;

    // Map by source
    const sourceMap: Record<string, { oi: number; iv: number; gamma: number }> = {};
    for (const r of records) {
      sourceMap[r.source] = { oi: r.oi, iv: r.iv, gamma: r.gamma };
    }

    // Determine consensus vs conflict
    // We check OI of the available sources. If they differ by > 10%, it's a conflict
    const ois = records.map((r) => r.oi);
    let status: "consensus" | "conflict" = "consensus";
    if (ois.length > 1) {
      const minOi = Math.min(...ois);
      const maxOi = Math.max(...ois);
      if (minOi === 0 || (maxOi - minOi) / minOi > 0.1) {
        status = "conflict";
        conflictCount++;
      }
    }

    // Resolve based on priority: cboe > tradier > yfinance
    let resolvedSource = "cboe";
    let resolvedVal = sourceMap["cboe"];

    if (!resolvedVal && sourceMap["tradier"]) {
      resolvedSource = "tradier";
      resolvedVal = sourceMap["tradier"];
    }
    if (!resolvedVal && sourceMap["yfinance"]) {
      resolvedSource = "yfinance";
      resolvedVal = sourceMap["yfinance"];
    }

    // Default fallback if no sources
    if (!resolvedVal) {
      resolvedVal = { oi: 0, iv: 0.15, gamma: 0 };
      resolvedSource = "default";
    }

    resolved.push({
      expiry,
      strike,
      option_type: option_type as "call" | "put",
      ...resolvedVal,
    });

    reconciliations.push({
      snapshot_date: snapshotDate,
      option_type: option_type as "call" | "put",
      proxy,
      strike,
      expiry,
      source_values_json: sourceMap,
      status,
      resolved_value: resolvedVal,
      resolved_source: resolvedSource,
    });
  }

  // Calculate data confidence
  let confidence: "high" | "medium" | "low" = "high";
  if (totalCount > 0) {
    const conflictRate = conflictCount / totalCount;
    if (conflictRate > 0.15) {
      confidence = "low";
    } else if (conflictRate > 0.03) {
      confidence = "medium";
    }
  }

  return { resolved, reconciliations, confidence };
}

/**
 * Main Analysis Engine
 */
export interface AnalyzeMarketStructureOptions {
  contractMultiplier?: number;
  gammaCalculator?: (spot: number, strike: number, tYears: number, iv: number, optionType: "call" | "put") => number;
  calculationMode?: string;
  /**
   * Minimum decision window around spot used for wall / flip / max-pain display.
   * CME PG40 includes far-tail strikes that are useful for audit, but should not
   * become the main intraday Call Wall / Put Wall / HVL when they sit far away
   * from the current futures settlement.
   */
  decisionWindowMinPoints?: number;
  /** Prefer Call Wall above spot and Put Wall below spot for tradable dashboard levels. */
  preferDirectionalWalls?: boolean;
  /**
   * Optional distance-aware wall scoring. 0 keeps pure exposure ranking; higher
   * values favor nearer strikes. Useful for 0DTE / front-expiry maps where desks
   * care about tradable intraday walls more than far OI blobs.
   */
  wallDistanceWeight?: number;
}

export function analyzeMarketStructure(
  instrument: string,
  proxy: string,
  asOf: string,
  lastPrice: number,
  resolvedOptions: Array<{
    expiry: string;
    strike: number;
    option_type: "call" | "put";
    oi: number;
    iv: number;
    gamma: number;
  }>,
  dataConfidence: "high" | "medium" | "low",
  overnightHigh: number,
  overnightLow: number,
  macro: { VIX: number; DXY: number; US10Y: number },
  options: AnalyzeMarketStructureOptions = {}
): DailyReport {
  const contractMultiplier = options.contractMultiplier ?? 100;
  const gammaCalculator = options.gammaCalculator ?? ((spot: number, strike: number, tYears: number, iv: number) => calculateBSGamma(spot, strike, tYears, iv));
  const snapshotDate = asOf.split("T")[0];

  // 1. Calculate Standard Expected Move
  // Find nearest expiry to calculate T
  const expiries = Array.from(new Set(resolvedOptions.map((o) => o.expiry))).sort();
  const nearestExpiry = expiries[0] || snapshotDate;
  const tDays = Math.max(1, (new Date(nearestExpiry).getTime() - new Date(snapshotDate).getTime()) / (1000 * 60 * 60 * 24));
  const tYears = tDays / 365;

  // Average ATM Implied Volatility
  const atmOptions = resolvedOptions.filter(
    (o) => Math.abs(o.strike - lastPrice) / lastPrice < 0.05
  );
  const avgAtmIv = atmOptions.length > 0
    ? atmOptions.reduce((acc, o) => acc + o.iv, 0) / atmOptions.length
    : 0.15;

  const expectedMovePoints = Math.round(lastPrice * avgAtmIv * Math.sqrt(tYears));
  const expectedMoveLow = Math.round(lastPrice - expectedMovePoints);
  const expectedMoveHigh = Math.round(lastPrice + expectedMovePoints);

  // Decision window: main dashboard levels should be tradable, near-current
  // strikes.  Preserve full-chain GEX below, but use this window for headline
  // walls / flip fallback / max-pain so far-tail strikes do not pollute the map.
  const decisionWindowPoints = Math.max(
    expectedMovePoints,
    options.decisionWindowMinPoints ?? lastPrice * 0.08,
  );
  const decisionMin = lastPrice - decisionWindowPoints;
  const decisionMax = lastPrice + decisionWindowPoints;

  // 2. GEX calculation per strike at current price
  // GEX_strike = Gamma * OI * 100 * spot^2 * 0.01
  const strikesMap: Record<number, { call_gex: number; put_gex: number; oi: number }> = {};
  for (const o of resolvedOptions) {
    const strike = o.strike;
    if (!strikesMap[strike]) {
      strikesMap[strike] = { call_gex: 0, put_gex: 0, oi: 0 };
    }

    const tOptionDays = Math.max(1, (new Date(o.expiry).getTime() - new Date(snapshotDate).getTime()) / (1000 * 60 * 60 * 24));
    const tOptionYears = tOptionDays / 365;
    const computedGamma = gammaCalculator(lastPrice, o.strike, tOptionYears, o.iv, o.option_type);

    const gex = calculateGex(computedGamma, o.oi, lastPrice, o.option_type, contractMultiplier);
    strikesMap[strike].oi += o.oi;

    if (o.option_type === "call") {
      strikesMap[strike].call_gex += gex;
    } else {
      strikesMap[strike].put_gex += gex; // negative value
    }
  }

  const gexStrikes: GexStrikeData[] = Object.entries(strikesMap).map(([strikeStr, data]) => {
    const strike = parseFloat(strikeStr);
    return {
      strike,
      call_gex: Math.round(data.call_gex),
      put_gex: Math.round(data.put_gex),
      net_gex: Math.round(data.call_gex + data.put_gex),
      oi: data.oi,
    };
  }).sort((a, b) => a.strike - b.strike);

  // Calculate net GEX at current price
  const totalNetGex = gexStrikes.reduce((acc, s) => acc + s.net_gex, 0);
  const status: "positive" | "negative" = totalNetGex >= 0 ? "positive" : "negative";

  // 3. Find Gamma Flip Level
  // Correct approach: recalculate total net GEX in spot +/- 8% range
  // Find zero crossing using linear interpolation
  const spotSteps: Array<{ price: number; netGex: number }> = [];
  const minSpot = decisionMin;
  const maxSpot = decisionMax;
  const stepsCount = 40;
  const stepSize = (maxSpot - minSpot) / stepsCount;

  for (let i = 0; i <= stepsCount; i++) {
    const hypSpot = minSpot + i * stepSize;
    let hypNetGex = 0;

    for (const o of resolvedOptions) {
      const tOptionDays = Math.max(1, (new Date(o.expiry).getTime() - new Date(snapshotDate).getTime()) / (1000 * 60 * 60 * 24));
      const tOptionYears = tOptionDays / 365;
      const hypGamma = gammaCalculator(hypSpot, o.strike, tOptionYears, o.iv, o.option_type);
      const gex = calculateGex(hypGamma, o.oi, hypSpot, o.option_type, contractMultiplier);
      hypNetGex += gex;
    }

    spotSteps.push({ price: hypSpot, netGex: hypNetGex });
  }

  // Find where netGex changes sign
  let flipLevel = lastPrice;
  let foundFlip = false;
  for (let i = 0; i < spotSteps.length - 1; i++) {
    const s1 = spotSteps[i];
    const s2 = spotSteps[i + 1];

    // 只在「真正的正負號翻轉」時內插。
    // 修正:原本用 s1*s2 <= 0,當兩點都是 0 (遠離所有 strike、gamma≈0 的價位)
    // 時會誤判為交叉,且內插分母為 0 → flipLevel = NaN。
    const denom = s2.netGex - s1.netGex;
    const isRealCrossing = s1.netGex * s2.netGex < 0; // 嚴格異號才算交叉
    const touchesZeroWithSlope = (s1.netGex === 0 || s2.netGex === 0) && denom !== 0;

    if ((isRealCrossing || touchesZeroWithSlope) && denom !== 0) {
      const t = -s1.netGex / denom;
      const candidate = s1.price + t * (s2.price - s1.price);
      if (isFinite(candidate)) {
        flipLevel = candidate;
        foundFlip = true;
        break;
      }
    }
  }

  if (!foundFlip) {
    // 找不到交叉:退回「netGex 絕對值最小」的價位 (最接近中性的位置)
    const closest = spotSteps.reduce((prev, curr) =>
      Math.abs(curr.netGex) < Math.abs(prev.netGex) ? curr : prev
    );
    flipLevel = closest.price;
  }

  // 最後保險:若仍非有限值,退回現貨價,避免把 NaN 傳給前端
  if (!isFinite(flipLevel)) {
    flipLevel = lastPrice;
  }

  // ===================================================================
  // HVL / Gamma Flip — Phase 9.7 (reverse-engineered from vendor charts)
  //
  // GROUND TRUTH (from MenthorQ's own published values for 2026-07-09):
  //   All-exp:  HVL = 29,720  and that strike's net GEX = −6,601
  //   0DTE:     HVL = 29,590  and that strike's net GEX = −4,603
  //
  // The HVL is reported WITH a per-strike GEX value, which means it is an
  // ACTUAL STRIKE, not an interpolated zero-crossing. Specifically it is the
  // LAST NEGATIVE-GEX STRIKE before the profile turns positive — i.e. the top
  // edge of the contiguous negative-gamma band, immediately below the positive
  // call-wall region.
  //
  // This explains every previous miss:
  //   • bottom-up cumulative zero-cross  → ~29,860 (too high; positive walls
  //     above dominate the running sum)
  //   • interpolated local sign-flip     → ~29,723/29,730 (close, but it lands
  //     BETWEEN 29,720 and 29,850 rather than ON the 29,720 strike)
  //   • "nearest transition to spot"     → 29,959 (spot magnet)
  //   • "lowest durable boundary"        → 29,590/29,670 (Phase 9.7 — it latched
  //     onto THIN NOISE STRIKES: the chain contains off-grid strikes such as
  //     29,600 / 29,675 / 29,725 carrying only a handful of contracts, whose
  //     sign flips are meaningless. Taking the LOWEST such flip dragged HVL far
  //     below the true regime boundary.)
  //
  // VERIFIED against the real 2026-07-09 chain (Phase 9.8):
  // Once thin strikes are filtered out, the significant-strike profile is
  // unambiguous — the last sustained negative sits at 29,750 (−80k) and
  // everything from 29,800 up is positive (+6k, +88k, +35k, +41k, +608k).
  // MenthorQ reports 29,720, i.e. the same boundary (they bin slightly
  // differently). This result is STABLE for any significance threshold between
  // 50 and 300 contracts — a strong sign it is real structure, not a fit.
  //
  // Correct algorithm:
  //   1. Filter to SIGNIFICANT strikes (drop thin noise strikes whose |GEX| is a
  //      tiny fraction of the local profile — these create phantom sign flips).
  //   2. Walk upward and take the LAST strike that is still net-negative and is
  //      followed by sustained positive gamma — i.e. the TOP EDGE of the
  //      negative-gamma band, not the bottom.
  //   3. Return that STRIKE ITSELF (the vendor publishes HVL together with a
  //      per-strike GEX value, proving it is a real strike, not an interpolation).
  // ===================================================================
  const hvlWindow = Math.max(700, expectedMovePoints * 1.6);
  const hvlCandidatesRaw = [...gexStrikes]
    .filter((s) => Math.abs(s.strike - lastPrice) <= hvlWindow)
    .sort((a, b) => a.strike - b.strike);

  let hvlStrike: number | null = null;
  if (hvlCandidatesRaw.length >= 2) {
    // (1) Significance filter. Thin off-grid strikes carry negligible gamma
    // exposure; keep only strikes whose |net GEX| is a meaningful share of the
    // window's typical exposure. Threshold is relative, so it adapts to any
    // product / regime rather than hard-coding a contract count.
    const magnitudes = hvlCandidatesRaw.map((s) => Math.abs(s.net_gex)).sort((a, b) => a - b);
    const median = magnitudes[Math.floor(magnitudes.length / 2)] || 0;
    const significanceFloor = Math.max(median, 1);
    const hvlProfile = hvlCandidatesRaw.filter((s) => Math.abs(s.net_gex) >= significanceFloor);

    if (hvlProfile.length >= 2) {
      // (2) Last negative strike followed by SUSTAINED positive gamma.
      const LOOKAHEAD = 2;
      for (let i = 0; i < hvlProfile.length - 1; i++) {
        const here = hvlProfile[i];
        if (here.net_gex >= 0) continue;
        const ahead = hvlProfile.slice(i + 1, i + 1 + LOOKAHEAD);
        if (!ahead.length) continue;
        // every strike in the lookahead window must be positive → sustained
        if (!ahead.every((s) => s.net_gex > 0)) continue;
        hvlStrike = here.strike; // keep updating → ends on the LAST such strike
      }
    }
  }

  if (hvlStrike !== null) {
    flipLevel = hvlStrike; // an actual strike — matches vendor semantics
  }

  flipLevel = Math.round(flipLevel * 10) / 10;

  // 4. Call Wall / Put Wall
  // For headline intraday levels, do not blindly use the largest absolute tail
  // strike from the full chain.  Select from a spot-centered decision window.
  // If enabled, prefer resistance above spot and support below spot; this mirrors
  // how desks use Call Resistance / Put Support for the trading map.
  const decisionStrikes = gexStrikes.filter((s) => s.strike >= decisionMin && s.strike <= decisionMax);

  // Headline walls must behave like trading levels:
  // - Call Wall / resistance should be above current futures price.
  // - Put Wall / support should be below current futures price.
  // Use option-type-specific exposure instead of net_gex.  A large ITM put above
  // spot can dominate net_gex, but it should not become the headline Put Support.
  const windowForWalls = decisionStrikes.length ? decisionStrikes : gexStrikes;
  const wallDistanceWeight = options.wallDistanceWeight ?? 0;
  const distanceBase = Math.max(50, expectedMovePoints || 250);
  const wallScore = (exposureAbs: number, strike: number) => {
    const distancePenalty = Math.pow(1 + Math.abs(strike - lastPrice) / distanceBase, wallDistanceWeight);
    return exposureAbs / distancePenalty;
  };
  const callCandidates = windowForWalls
    .filter((s) => s.call_gex > 0 && (!options.preferDirectionalWalls || s.strike >= lastPrice))
    .slice()
    .sort((a, b) => wallScore(b.call_gex, b.strike) - wallScore(a.call_gex, a.strike) || Math.abs(a.strike - lastPrice) - Math.abs(b.strike - lastPrice));
  const putCandidates = windowForWalls
    .filter((s) => s.put_gex < 0 && (!options.preferDirectionalWalls || s.strike <= lastPrice))
    .slice()
    .sort((a, b) => wallScore(Math.abs(b.put_gex), b.strike) - wallScore(Math.abs(a.put_gex), a.strike) || Math.abs(a.strike - lastPrice) - Math.abs(b.strike - lastPrice));

  const fallbackCalls = windowForWalls
    .filter((s) => !options.preferDirectionalWalls || s.strike >= lastPrice)
    .slice()
    .sort((a, b) => Math.abs(a.strike - lastPrice) - Math.abs(b.strike - lastPrice));
  const fallbackPuts = windowForWalls
    .filter((s) => !options.preferDirectionalWalls || s.strike <= lastPrice)
    .slice()
    .sort((a, b) => Math.abs(a.strike - lastPrice) - Math.abs(b.strike - lastPrice));

  const callWallFrom = (rank: number) => {
    const item = callCandidates[rank - 1] ?? fallbackCalls[rank - 1] ?? fallbackCalls[0] ?? windowForWalls[0];
    return { strike: item?.strike ?? lastPrice, rank, gex: item?.call_gex ?? item?.net_gex ?? 0 };
  };
  const putWallFrom = (rank: number) => {
    const item = putCandidates[rank - 1] ?? fallbackPuts[rank - 1] ?? fallbackPuts[0] ?? windowForWalls[0];
    return { strike: item?.strike ?? lastPrice, rank, gex: item?.put_gex ?? item?.net_gex ?? 0 };
  };

  const callWalls = [callWallFrom(1), callWallFrom(2)];
  const putWalls = [putWallFrom(1), putWallFrom(2)];

  // 5. Max Pain
  let maxPain = lastPrice;
  let minPainValue = Infinity;
  const candidateStrikes = (decisionStrikes.length ? decisionStrikes : gexStrikes).map((s) => s.strike);

  for (const sCand of candidateStrikes) {
    let totalPain = 0;
    for (const o of resolvedOptions) {
      if (o.option_type === "call") {
        if (sCand > o.strike) {
          totalPain += (sCand - o.strike) * o.oi;
        }
      } else {
        if (sCand < o.strike) {
          totalPain += (o.strike - sCand) * o.oi;
        }
      }
    }
    if (totalPain < minPainValue) {
      minPainValue = totalPain;
      maxPain = sCand;
    }
  }
  maxPain = Math.round(maxPain);

  // 6. Market State 4 Quadrants
  let quadrant: "range_bound" | "range_at_edge" | "trending" | "chop_whipsaw" = "range_bound";
  let label = "盤整";
  let rationale = "";

  const distToCallWall = Math.abs(lastPrice - callWalls[0].strike) / lastPrice;
  const distToPutWall = Math.abs(lastPrice - putWalls[0].strike) / lastPrice;
  const distToFlip = Math.abs(lastPrice - flipLevel) / lastPrice;

  if (status === "positive") {
    if (distToCallWall < 0.012 || distToPutWall < 0.012) {
      quadrant = "range_at_edge";
      label = "盤整·邊界風險";
      rationale = `目前處於正 Gamma 區間 (${totalNetGex > 100000 ? "極強" : "溫和"}對沖壓制), 但價格已逼近${distToCallWall < distToPutWall ? ` Call Wall (主力強阻力: ${callWalls[0].strike})` : ` Put Wall (主力強支撐: ${putWalls[0].strike})`} 邊緣。大戶對沖盤整將轉為防守, 注意一旦突破可能引發劇烈的對沖清算，波動率有放大風險。`;
    } else {
      quadrant = "range_bound";
      label = "盤整";
      rationale = `價格處於正 Gamma 安全區內部，遠離關鍵邊牆。做市商對沖機制 (Long Gamma, 逆勢低買高賣) 將有效壓制盤中波動，市場傾向於在 ${putWalls[0].strike} 至 ${callWalls[0].strike} 之間進行高拋低吸的區間震盪。`;
    }
  } else {
    // negative
    if (distToFlip < 0.015) {
      quadrant = "chop_whipsaw";
      label = "負Gamma亂震";
      rationale = `價格極度貼近 Gamma Flip 零軸零界點 (${flipLevel})。在此關鍵點位，做市商對沖態度可能頻繁在 Long Gamma (順勢壓制) 和 Short Gamma (順勢追殺) 之間頻繁切換，極易引發兩端插針、頻繁洗盤的無序亂震行情。建議多看少動。`;
    } else {
      quadrant = "trending";
      label = "趨勢/擴張";
      rationale = `處於負 Gamma 擴張敏感區。做市商 Short Gamma 會放大已確認的盤中方向，但負 Gamma 本身不等於看多或看空。需等待 2×5m close、BOS、VWAP/AVWAP 確認；突破 ${lastPrice < flipLevel ? "Put Wall 支撐後偏下行擴張" : "Call Wall 後偏上行擴張"} 才提升方向信念。`;
    }
  }

  // 7. Generate Daily Plan Notes
  const planNotes: string[] = [];
  if (quadrant === "range_bound") {
    planNotes.push(`【區間高拋低吸】建議在主力 Put Wall (${putWalls[0].strike}) 附近企穩做多，目標看至 Flip 關口 (${flipLevel}) 或 Call Wall (${callWalls[0].strike})。`);
    planNotes.push(`【波動壓制】在正 Gamma 壓制下，日內極難走出乾淨的單邊大趨勢。除非有宏觀訊息催化，否則不宜盲目追漲殺跌。`);
    planNotes.push(`【Max Pain 磁吸】當前結算價偏向 Max Pain (${maxPain})，收盤大機率向該價格收斂。`);
  } else if (quadrant === "range_at_edge") {
    planNotes.push(`【嚴防破位】關注 ${distToCallWall < distToPutWall ? `Call Wall ${callWalls[0].strike}` : `Put Wall ${putWalls[0].strike}`} 的防守情況。一旦放量突破且站穩 15 分鐘，做市商將不得不空頭平倉/買入對沖，產生擠壓效應。`);
    planNotes.push(`【分批防禦】在邊牆附近，如果沒有突破訊號，可以嘗試輕倉反手，但必須嚴格以牆外 0.3% 作為止損線。`);
  } else if (quadrant === "trending") {
    planNotes.push(`【等待確認】Short Gamma 會放大盤中已確認方向，但不可把負 GEX 直接解讀成單邊看多/看空。`);
    planNotes.push(`【關鍵阻力/支撐】先觀察 Flip (${flipLevel})、Call Wall (${callWalls[0].strike})、Put Wall (${putWalls[0].strike}) 的 2×5m close、BOS、VWAP/AVWAP 確認，再判斷擴張方向。`);
    planNotes.push(`【波動率飆升】當前 VIX (${macro.VIX}) 處於活躍水平，Short Gamma 環境下日內寬幅震盪加劇，建議降低單筆頭寸，放大止損。`);
  } else {
    planNotes.push(`【觀望為宜】貼近 Gamma Flip 零軸 (${flipLevel})。價格在此容易產生無邏輯的上下插針掃損，不是乾淨的開倉點位。`);
    planNotes.push(`【等待突破】等待價格脫離 Flip 零軸 0.5% 以上，確立日內主導 Gamma 狀態（正 Gamma 迴歸或負 Gamma 傾斜）後，再行跟隨。`);
  }

  // ---- 規則籤條 (signals) + 信念度 (conviction) ----
  const signals: Array<{ text: string; weight: number }> = [];
  const netGexAbs = Math.abs(totalNetGex);
  const distToFlipPct = Math.abs(lastPrice - flipLevel) / lastPrice;

  if (netGexAbs >= 100000) {
    signals.push({ text: `淨 GEX 量級高 (${status === "positive" ? "正" : "負"} Gamma 主導)`, weight: 1 });
  } else if (netGexAbs < 20000) {
    signals.push({ text: "淨 GEX 量級低 (方向性偏弱)", weight: -1 });
  }
  if (distToFlipPct > 0.01) {
    signals.push({ text: `遠離 Gamma Flip (${Math.round(Math.abs(lastPrice - flipLevel))} 點)`, weight: 1 });
  } else if (distToFlipPct > 0.005 && status === "positive" && lastPrice > flipLevel) {
    // Phase 9.5: in a positive-gamma regime, price sitting clearly ABOVE a
    // below-spot HVL is a mild directional (bullish) structure, not a "no edge"
    // pin. Only genuinely straddling the flip (<0.5%) should be penalised.
    signals.push({ text: `位於 HVL 上方 (${Math.round(lastPrice - flipLevel)} 點, 正 Gamma 偏多結構)`, weight: 1 });
  } else {
    signals.push({ text: "貼近 Gamma Flip 零軸 (方向不明)", weight: -1 });
  }
  if (status === "negative") {
    signals.push({ text: "負 Gamma 環境 (助漲助跌，方向需盤中確認)", weight: 0 });
  } else {
    signals.push({ text: "正 Gamma 環境 (抑制波動，區間震盪)", weight: 1 });
  }
  if (distToCallWall < 0.012 || distToPutWall < 0.012) {
    signals.push({ text: "價格逼近主力牆邊緣 (突破風險升高)", weight: -1 });
  }
  if (dataConfidence === "low") {
    signals.push({ text: "資料覆蓋/信度偏低 (結論僅供參考)", weight: -1 });
  }

  const signalScore = signals.reduce((acc, s) => acc + s.weight, 0);
  const conviction: "high" | "medium" | "low" =
    signalScore >= 3 ? "high" : signalScore >= 1 ? "medium" : "low";

  // ---- 每道牆距現貨點數 ----
  const withDist = <T extends { strike: number }>(w: T) => ({
    ...w,
    dist_pts: Math.round(w.strike - lastPrice),
  });
  const callWallsOut = callWalls.map(withDist);
  const putWallsOut = putWalls.map(withDist);

  return {
    instrument,
    proxy,
    enabled: true,
    as_of: asOf,
    data_confidence: dataConfidence,
    gamma: {
      status,
      flip_level: flipLevel,
      call_walls: callWallsOut,
      put_walls: putWallsOut,
      max_pain: maxPain,
      gex_strikes: gexStrikes,
    },
    price: {
      last: lastPrice,
      expected_move: {
        points: expectedMovePoints,
        low: expectedMoveLow,
        high: expectedMoveHigh,
      },
    },
    regime: {
      quadrant,
      label,
      rationale,
      conviction,
      signals,
    },
    technicals: {
      overnight_high: overnightHigh,
      overnight_low: overnightLow,
    },
    macro: {
      VIX: macro.VIX,
      DXY: macro.DXY,
      US10Y: macro.US10Y,
    },
    plan_notes: planNotes,
    calculation_mode: options.calculationMode,
    gross_gex: gexStrikes.reduce((acc, s) => acc + Math.abs(s.net_gex), 0),
    total_net_gex: totalNetGex,
    top_abs_gex_strikes: [...gexStrikes]
      .filter((s) => s.strike >= decisionMin && s.strike <= decisionMax)
      .sort((a, b) => Math.abs(b.net_gex) - Math.abs(a.net_gex))
      .slice(0, 20)
      .map((s, index) => ({ strike: s.strike, gex: s.net_gex, rank: index + 1 })),
  };
}
