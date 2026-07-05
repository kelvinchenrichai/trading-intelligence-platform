/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 數據整合層 (Data Orchestrator)
 *
 * 這是新架構的心臟,取代原本 database.ts 裡那個「造假亂數」的邏輯。
 * 流程:
 *   1. 用「主源」(marketdata.app) 抓期權鏈;失敗則 fallback 到備援源 (yahoo)。
 *   2. 若兩個源都成功,做「真實的多源核對」:同一 (expiry, strike, type) 的
 *      OI 若跨源差異 > 閾值 → 標記 conflict (沿用你原本的設計精神)。
 *   3. 補算缺失的 IV / Gamma:有些來源不給 IV,我們用 Black-Scholes 從價格反推
 *      或用來源 IV;Gamma 一律用 engine 的 calculateBSGamma 現算,確保一致。
 *   4. 輸出成 engine.ts 的 analyzeMarketStructure 需要的 resolved 格式。
 *
 * 關鍵原則:全程使用真實數據。任何取不到的欄位都誠實標記,絕不用亂數填補。
 */

import { OptionsDataProvider, RawOptionContract } from "./types";
import { calculateBSGamma } from "../utils/engine";
import { DataReconciliation, SourceStatus } from "../types";
import { isIsoDate } from "./dateUtils";

export interface ResolvedOption {
  expiry: string;
  strike: number;
  option_type: "call" | "put";
  oi: number;
  iv: number;
  gamma: number;
}

export interface OrchestratedResult {
  snapshotDate: string;
  lastPrice: number;
  prevClose: number | null;
  resolved: ResolvedOption[];
  reconciliations: DataReconciliation[];
  confidence: "high" | "medium" | "low";
  /** 實際用到的來源名稱,前端誠實顯示 */
  sourcesUsed: string[];
  sourceStatus: SourceStatus[];
  rawContracts: RawOptionContract[];
}

/** OI 跨源差異超過此比例即視為 conflict */
const CONFLICT_THRESHOLD = 0.1;

/** 若某來源缺 IV,退回這個保守預設 (並在 confidence 上反映) */
const FALLBACK_IV = 0.15;

/**
 * Preserves provider diagnostics when all option sources fail. The caller can
 * expose safe source-level statuses through /api/health instead of reducing
 * every failure to a generic "no snapshot" message.
 */
export class OptionDataFetchError extends Error {
  readonly sourceStatus: SourceStatus[];

  constructor(message: string, sourceStatus: SourceStatus[]) {
    super(message);
    this.name = "OptionDataFetchError";
    this.sourceStatus = sourceStatus;
  }
}

interface OrchestratorConfig {
  primary: OptionsDataProvider;
  /** 備援 / 核對源,可為空 */
  secondary?: OptionsDataProvider;
  maxExpiries: number;
}

export async function orchestrateOptionData(
  indexSymbol: string,
  config: OrchestratorConfig
): Promise<OrchestratedResult> {
  const sourcesUsed: string[] = [];
  const checkedAt = new Date().toISOString();
  const sourceStatus: SourceStatus[] = [];

  // ---- Step 1: 抓主源期權鏈 ----
  let primaryChain: RawOptionContract[] = [];
  let primaryError: string | null = null;
  try {
    primaryChain = await config.primary.getOptionChain(indexSymbol, config.maxExpiries);
    sourcesUsed.push(config.primary.sourceName);
    sourceStatus.push({
      source: config.primary.sourceName,
      state: "ok",
      isDelayed: config.primary.isDelayed,
      delayNote: config.primary.delayNote,
      checkedAt,
    });
  } catch (e: any) {
    primaryError = e?.message || String(e);
    sourceStatus.push({
      source: config.primary.sourceName,
      state: "failed",
      isDelayed: config.primary.isDelayed,
      delayNote: config.primary.delayNote,
      detail: primaryError,
      checkedAt,
    });
  }

  // ---- Step 2: 抓備援 / 核對源 ----
  let secondaryChain: RawOptionContract[] = [];
  if (config.secondary) {
    try {
      secondaryChain = await config.secondary.getOptionChain(indexSymbol, config.maxExpiries);
      sourcesUsed.push(config.secondary.sourceName);
      sourceStatus.push({
        source: config.secondary.sourceName,
        state: "ok",
        isDelayed: config.secondary.isDelayed,
        delayNote: config.secondary.delayNote,
        checkedAt,
      });
    } catch (e: any) {
      sourceStatus.push({
        source: config.secondary.sourceName,
        state: "failed",
        isDelayed: config.secondary.isDelayed,
        delayNote: config.secondary.delayNote,
        detail: e?.message || String(e),
        checkedAt,
      });
    }
  }

  // 若主源失敗,用備援頂上 (誠實:此時只有單源,confidence 會降級)
  const havePrimary = primaryChain.length > 0;
  const haveSecondary = secondaryChain.length > 0;

  if (!havePrimary && !haveSecondary) {
    const detail = sourceStatus
      .map((item) => `${item.source}: ${item.detail || item.state}`)
      .join(" | ");
    throw new OptionDataFetchError(
      `無法取得 ${indexSymbol} 的任何真實期權數據。${detail || `主源錯誤: ${primaryError || "未知"}`}`,
      sourceStatus
    );
  }

  // ---- Step 3: 取得現貨價 (優先主源,退備援) ----
  let lastPrice = 0;
  let prevClose: number | null = null;
  try {
    const q = havePrimary
      ? await config.primary.getUnderlyingQuote(indexSymbol)
      : await config.secondary!.getUnderlyingQuote(indexSymbol);
    lastPrice = q.last;
    prevClose = q.prev_close ?? null;
  } catch {
    // 若報價端點失敗,用期權鏈的 ATM 附近推估 (仍是真實資料,只是間接)
    lastPrice = estimateSpotFromChain(havePrimary ? primaryChain : secondaryChain);
  }

  const snapshotDate =
    (havePrimary ? primaryChain[0]?.snapshot_date : secondaryChain[0]?.snapshot_date) ||
    new Date().toISOString().split("T")[0];

  // ---- Step 4: 多源核對 + 解析 ----
  const { resolved, reconciliations, confidence } = reconcileRealSources(
    snapshotDate,
    indexSymbol,
    primaryChain,
    secondaryChain,
    lastPrice
  );

  return {
    snapshotDate,
    lastPrice,
    prevClose,
    resolved,
    reconciliations,
    confidence,
    sourcesUsed,
    sourceStatus,
    rawContracts: [...primaryChain, ...secondaryChain],
  };
}

/** 用期權鏈裡 OI 最集中的行權價作為現貨估計 (真實資料的間接推估) */
function estimateSpotFromChain(chain: RawOptionContract[]): number {
  if (chain.length === 0) return 0;
  // 取所有出現過的 strike 中位數作為粗估
  const strikes = Array.from(new Set(chain.map((c) => c.strike))).sort((a, b) => a - b);
  return strikes[Math.floor(strikes.length / 2)];
}

/**
 * 真實多源核對。key = expiry_strike_type。
 * - 兩源都有:比 OI 差異,超閾值標 conflict,取值優先主源。
 * - 只有一源:直接採用,標 consensus (但整體 confidence 會因單源而下降)。
 * - IV 缺失:退回 FALLBACK_IV。
 * - Gamma:一律用 calculateBSGamma 現算,確保與 engine 完全一致。
 */
function reconcileRealSources(
  snapshotDate: string,
  proxy: string,
  primaryChain: RawOptionContract[],
  secondaryChain: RawOptionContract[],
  spot: number
): {
  resolved: ResolvedOption[];
  reconciliations: DataReconciliation[];
  confidence: "high" | "medium" | "low";
} {
  const keyOf = (c: RawOptionContract) => `${c.expiry}_${c.strike}_${c.option_type}`;

  const groups: Record<string, { primary?: RawOptionContract; secondary?: RawOptionContract }> = {};
  for (const c of primaryChain) {
    const k = keyOf(c);
    (groups[k] = groups[k] || {}).primary = c;
  }
  for (const c of secondaryChain) {
    const k = keyOf(c);
    (groups[k] = groups[k] || {}).secondary = c;
  }

  const resolved: ResolvedOption[] = [];
  const reconciliations: DataReconciliation[] = [];
  let conflictCount = 0;
  let totalCount = 0;
  let ivMissingCount = 0;

  for (const [key, g] of Object.entries(groups)) {
    const [expiry, strikeStr, option_type] = key.split("_");
    const strike = parseFloat(strikeStr);
    // Never feed invalid externally-sourced dates into the pricing engine. A bad
    // row is skipped while other valid strikes/expiries remain usable.
    if (!isIsoDate(expiry) || !Number.isFinite(strike) || strike <= 0) continue;
    totalCount++;

    // 決定採用值:優先主源
    const chosen = g.primary || g.secondary!;
    const otherOi = g.primary && g.secondary
      ? (chosen === g.primary ? g.secondary.oi : g.primary.oi)
      : null;

    // 判斷 conflict
    let status: "consensus" | "conflict" = "consensus";
    if (otherOi !== null && otherOi !== undefined) {
      const a = chosen.oi;
      const b = otherOi;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      if (lo === 0 ? hi > 0 : (hi - lo) / lo > CONFLICT_THRESHOLD) {
        status = "conflict";
        conflictCount++;
      }
    }

    // IV:採用值的 IV,缺失則 fallback
    let iv = chosen.iv;
    if (iv === null || iv === undefined || iv <= 0) {
      iv = FALLBACK_IV;
      ivMissingCount++;
    }

    // Gamma:一律用 BS 現算 (T 由 expiry 推)
    const tDays = Math.max(
      1,
      (new Date(expiry).getTime() - new Date(snapshotDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    const gamma = calculateBSGamma(spot, strike, tDays / 365, iv);

    resolved.push({
      expiry,
      strike,
      option_type: option_type as "call" | "put",
      oi: chosen.oi,
      iv,
      gamma,
    });

    // 核對紀錄 (前端 Audit 面板可查)
    const sourceValues: Record<string, { oi: number; iv: number; gamma: number }> = {};
    if (g.primary) {
      const pIv = g.primary.iv ?? FALLBACK_IV;
      sourceValues[g.primary.source] = {
        oi: g.primary.oi,
        iv: pIv,
        gamma: calculateBSGamma(spot, strike, tDays / 365, pIv),
      };
    }
    if (g.secondary) {
      const sIv = g.secondary.iv ?? FALLBACK_IV;
      sourceValues[g.secondary.source] = {
        oi: g.secondary.oi,
        iv: sIv,
        gamma: calculateBSGamma(spot, strike, tDays / 365, sIv),
      };
    }

    reconciliations.push({
      snapshot_date: snapshotDate,
      snapshot_timestamp: new Date().toISOString(),
      proxy,
      strike,
      expiry,
      option_type: option_type as "call" | "put",
      source_values_json: sourceValues,
      status,
      resolved_value: { oi: chosen.oi, iv, gamma },
      resolved_source: chosen.source,
    });
  }

  // Confidence:綜合 conflict 率 + IV 缺失率 + 是否單源
  const conflictRate = totalCount > 0 ? conflictCount / totalCount : 0;
  const ivMissRate = totalCount > 0 ? ivMissingCount / totalCount : 0;
  const singleSource = primaryChain.length === 0 || secondaryChain.length === 0;

  let confidence: "high" | "medium" | "low" = "high";
  if (conflictRate > 0.15 || ivMissRate > 0.3 || (singleSource && ivMissRate > 0.15)) {
    confidence = "low";
  } else if (conflictRate > 0.03 || ivMissRate > 0.1 || singleSource) {
    confidence = "medium";
  }

  // 依 strike 排序,輸出穩定
  resolved.sort((a, b) =>
    a.expiry === b.expiry ? a.strike - b.strike : a.expiry < b.expiry ? -1 : 1
  );

  return { resolved, reconciliations, confidence };
}
