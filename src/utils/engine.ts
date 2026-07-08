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
  optionType: "call" | "put"
): number {
  const gexVal = gamma * oi * 100 * (spot * spot) * 0.01;
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
  macro: { VIX: number; DXY: number; US10Y: number }
): DailyReport {
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
    const computedGamma = calculateBSGamma(lastPrice, o.strike, tOptionYears, o.iv);

    const gex = calculateGex(computedGamma, o.oi, lastPrice, o.option_type);
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
  const minSpot = lastPrice * 0.92;
  const maxSpot = lastPrice * 1.08;
  const stepsCount = 40;
  const stepSize = (maxSpot - minSpot) / stepsCount;

  for (let i = 0; i <= stepsCount; i++) {
    const hypSpot = minSpot + i * stepSize;
    let hypNetGex = 0;

    for (const o of resolvedOptions) {
      const tOptionDays = Math.max(1, (new Date(o.expiry).getTime() - new Date(snapshotDate).getTime()) / (1000 * 60 * 60 * 24));
      const tOptionYears = tOptionDays / 365;
      const hypGamma = calculateBSGamma(hypSpot, o.strike, tOptionYears, o.iv);
      const gex = calculateGex(hypGamma, o.oi, hypSpot, o.option_type);
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
  flipLevel = Math.round(flipLevel * 10) / 10;

  // 4. Call Wall / Put Wall
  // Standard: Call Wall is highest positive net GEX strike, Put Wall is most negative net GEX strike
  const sortedByGexDesc = [...gexStrikes].sort((a, b) => b.net_gex - a.net_gex);
  const sortedByGexAsc = [...gexStrikes].sort((a, b) => a.net_gex - b.net_gex);

  const callWalls = [
    { strike: sortedByGexDesc[0]?.strike || lastPrice * 1.02, rank: 1, gex: sortedByGexDesc[0]?.net_gex || 0 },
    { strike: sortedByGexDesc[1]?.strike || lastPrice * 1.04, rank: 2, gex: sortedByGexDesc[1]?.net_gex || 0 },
  ];

  const putWalls = [
    { strike: sortedByGexAsc[0]?.strike || lastPrice * 0.98, rank: 1, gex: sortedByGexAsc[0]?.net_gex || 0 },
    { strike: sortedByGexAsc[1]?.strike || lastPrice * 0.96, rank: 2, gex: sortedByGexAsc[1]?.net_gex || 0 },
  ];

  // 5. Max Pain
  let maxPain = lastPrice;
  let minPainValue = Infinity;
  const candidateStrikes = gexStrikes.map((s) => s.strike);

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
      rationale = `目前处于正 Gamma 区间 (${totalNetGex > 100000 ? "极强" : "温和"}对冲压制), 但价格已逼近${distToCallWall < distToPutWall ? ` Call Wall (主力强阻力: ${callWalls[0].strike})` : ` Put Wall (主力强支撑: ${putWalls[0].strike})`} 边缘。大户对冲盘整将转为防守, 注意一旦突破可能引发剧烈的对冲清算，波动率有放大风险。`;
    } else {
      quadrant = "range_bound";
      label = "盤整";
      rationale = `价格处于正 Gamma 安全区内部，远离关键边墙。做市商对冲机制 (Long Gamma, 逆势低买高卖) 将有效压制盘中波动，市场倾向于在 ${putWalls[0].strike} 至 ${callWalls[0].strike} 之间进行高抛低吸的区间震荡。`;
    }
  } else {
    // negative
    if (distToFlip < 0.015) {
      quadrant = "chop_whipsaw";
      label = "負Gamma亂震";
      rationale = `价格极度贴近 Gamma Flip 零轴零界点 (${flipLevel})。在此关键点位，做市商对冲态度可能频繁在 Long Gamma (顺势压制) 和 Short Gamma (顺势追杀) 之间频繁切换，极易引发两端插针、频繁洗盘的无序乱震行情。建议多看少动。`;
    } else {
      quadrant = "trending";
      label = "趨勢/擴張";
      rationale = `处于负 Gamma 深度扩张区。做市商处于 Short Gamma 状态, 必须顺着趋势方向进行对冲 (价格下跌则卖出期货, 价格上涨则买入期货), 这种顺势对冲行为将极大放大日内趋势。突破 ${lastPrice < flipLevel ? "Put Wall 支撑后恐加速下行" : "Call Wall 后恐加速上行"}，维持强趋势扩张预期。`;
    }
  }

  // 7. Generate Daily Plan Notes
  const planNotes: string[] = [];
  if (quadrant === "range_bound") {
    planNotes.push(`【区间高抛低吸】建议在主力 Put Wall (${putWalls[0].strike}) 附近企稳做多，目标看至 Flip 关口 (${flipLevel}) 或 Call Wall (${callWalls[0].strike})。`);
    planNotes.push(`【波动压制】在正 Gamma 压制下，日内极难走出干净的单边大趋势。除非有宏观消息催化，否则不宜盲目追涨杀跌。`);
    planNotes.push(`【Max Pain 磁吸】当前结算价偏向 Max Pain (${maxPain})，收盘大概率向该价格收敛。`);
  } else if (quadrant === "range_at_edge") {
    planNotes.push(`【严防破位】关注 ${distToCallWall < distToPutWall ? `Call Wall ${callWalls[0].strike}` : `Put Wall ${putWalls[0].strike}`} 的防守情况。一旦放量突破且站稳 15 分钟，做市商将不得不空头平仓/买入对冲，产生挤压效应。`);
    planNotes.push(`【分批防御】在边墙附近，如果没有突破信号，可以尝试轻仓反手，但必须严格以墙外 0.3% 作为止损线。`);
  } else if (quadrant === "trending") {
    planNotes.push(`【顺势而为】做市商 Short Gamma 自动对冲将不断放大价格波幅。建议顺日内趋势交易，不轻易抄底。`);
    planNotes.push(`【关键阻力/支撑】若在 Flip 零轴下方运行，反弹至 Flip 级别 (${flipLevel}) 均是强阻力做空机会；下行关注 Expected Move 边缘 (${expectedMoveLow}) 止盈。`);
    planNotes.push(`【波动率飙升】当前 VIX (${macro.VIX}) 处于活跃水平，Short Gamma 环境下日内宽幅震荡加剧，建议降低单笔头寸，放大止损。`);
  } else {
    planNotes.push(`【观望为宜】贴近 Gamma Flip 零轴 (${flipLevel})。价格在此容易产生无逻辑的上下插针扫损，不是干净的开仓点位。`);
    planNotes.push(`【等待突破】等待价格脱离 Flip 零轴 0.5% 以上，确立日内主导 Gamma 状态（正 Gamma 回归或负 Gamma 倾斜）后，再行跟随。`);
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
  } else {
    signals.push({ text: "貼近 Gamma Flip 零軸 (方向不明)", weight: -1 });
  }
  if (status === "negative") {
    signals.push({ text: "負 Gamma 環境 (助漲助跌，趨勢延續)", weight: 1 });
  } else {
    signals.push({ text: "正 Gamma 環境 (抑制波動，區間震盪)", weight: 1 });
  }
  if (distToCallWall < 0.012 || distToPutWall < 0.012) {
    signals.push({ text: "價格逼近主力牆邊緣 (突破風險升高)", weight: -1 });
  }
  if (dataConfidence === "low") {
    signals.push({ text: "數據覆蓋/信度偏低 (結論僅供參考)", weight: -1 });
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
  };
}
