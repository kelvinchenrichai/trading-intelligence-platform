/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CME NQ 期貨期權 → GEX 精算 (Black-76)
 *
 * 用 CME 官方 PG40 數據 (期貨期權的 OI / settlement / delta / 期貨結算價) 直接計算
 * GEX,取代「NDX 指數期權 + 基差」的近似解。這是與 MenthorQ 同標的 (NQU2026 期貨
 * 期權) 的精確算法。
 *
 * 為什麼用 Black-76 而非 Black-Scholes:
 *   期貨期權的標的是「期貨」不是「現貨」,Black-76 用 forward price (期貨結算價) 定價,
 *   不含股息/持有成本項,正是 CME 期貨期權的正確模型。
 *
 * IV 來源:CME 提供 settlement (期權結算價),用 Black-76 反解隱含波動率;
 *   若反解失敗則用 delta 粗略回推,再不行退回保守預設 —— 全程不編造。
 *
 * 輸出:轉成與 engine.analyzeMarketStructure 相容的 resolved options,
 *   讓既有引擎 (GEX walls / flip / regime) 可直接沿用。
 */

import { CmeNqOptionContract } from "./types";

/** 標準常態 CDF (Abramowitz-Stegun 近似) */
function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
/** 標準常態 PDF */
function normPdf(x: number): number {
  return 0.3989422804014327 * Math.exp((-x * x) / 2);
}

/** Black-76 d1 */
function d1(F: number, K: number, T: number, sigma: number): number {
  return (Math.log(F / K) + 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
}

/** Black-76 選擇權價格 (未貼現的 undiscounted;GEX 不需貼現因子) */
function black76Price(F: number, K: number, T: number, sigma: number, type: "call" | "put"): number {
  if (T <= 0 || sigma <= 0) {
    return type === "call" ? Math.max(F - K, 0) : Math.max(K - F, 0);
  }
  const D1 = d1(F, K, T, sigma);
  const D2 = D1 - sigma * Math.sqrt(T);
  return type === "call"
    ? F * normCdf(D1) - K * normCdf(D2)
    : K * normCdf(-D2) - F * normCdf(-D1);
}

/** Black-76 gamma (對期貨價 F 的二階導) */
export function black76Gamma(F: number, K: number, T: number, sigma: number): number {
  if (T <= 0 || sigma <= 0 || F <= 0) return 0;
  const D1 = d1(F, K, T, sigma);
  return normPdf(D1) / (F * sigma * Math.sqrt(T));
}

/** 用 settlement 反解隱含波動率 (二分法);失敗回 null */
function impliedVol(price: number, F: number, K: number, T: number, type: "call" | "put"): number | null {
  if (price <= 0 || T <= 0) return null;
  const intrinsic = type === "call" ? Math.max(F - K, 0) : Math.max(K - F, 0);
  if (price < intrinsic - 1e-6) return null; // 價格低於內含值,異常
  let lo = 0.001, hi = 5.0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const p = black76Price(F, K, T, mid, type);
    if (Math.abs(p - price) < 1e-4) return mid;
    if (p > price) hi = mid; else lo = mid;
  }
  const v = (lo + hi) / 2;
  return v > 0.002 && v < 4.99 ? v : null;
}

export interface ResolvedOption {
  expiry: string;
  strike: number;
  option_type: "call" | "put";
  oi: number;
  iv: number;
  gamma: number;
}

export interface CmeGexResult {
  tradeDate: string;
  futuresSettlement: number;
  resolved: ResolvedOption[];
  /** 僅最近到期日 (0DTE / 最近) 的 resolved,供開盤前參考 */
  nearestExpiryResolved: ResolvedOption[];
  nearestExpiryDate: string | null;
  ivReconstructedPct: number; // 有多少比例的 IV 是成功反解的 (品質指標)
}

const FALLBACK_IV = 0.15;


function median(values: number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function clampIv(iv: number): number {
  if (!Number.isFinite(iv) || iv <= 0) return FALLBACK_IV;
  return Math.min(2.5, Math.max(0.03, iv));
}

function interpolateIv(
  strike: number,
  known: Array<{ strike: number; iv: number }>,
  expiryMedian: number | null,
  globalMedian: number | null,
): number {
  const sorted = known
    .filter((item) => Number.isFinite(item.iv) && item.iv > 0)
    .sort((a, b) => a.strike - b.strike);
  if (sorted.length) {
    let left: { strike: number; iv: number } | null = null;
    let right: { strike: number; iv: number } | null = null;
    for (const item of sorted) {
      if (item.strike <= strike) left = item;
      if (item.strike >= strike) {
        right = item;
        break;
      }
    }
    if (left && right && left.strike !== right.strike) {
      const t = (strike - left.strike) / (right.strike - left.strike);
      return clampIv(left.iv + t * (right.iv - left.iv));
    }
    return clampIv((left ?? right ?? sorted[0]).iv);
  }
  return clampIv(expiryMedian ?? globalMedian ?? FALLBACK_IV);
}

/**
 * 把 CME 合約轉成 resolved options (含 Black-76 gamma)。
 * @param contracts 某一 tradeDate 的全部 CME NQ 期權合約
 * @param futuresSettlement 該日期貨結算價 (forward price F)
 */
export function computeCmeGex(
  contracts: CmeNqOptionContract[],
  futuresSettlement: number,
): CmeGexResult {
  const tradeDate = contracts[0]?.tradeDate || "";
  const F = futuresSettlement;
  let ivOk = 0, ivTotal = 0;

  const staged: Array<{
    contract: CmeNqOptionContract;
    T: number;
    directIv: number | null;
  }> = [];

  for (const c of contracts) {
    if (!c.strike || c.openInterest <= 0) continue;
    const tDays = Math.max(
      0.5,
      (new Date(c.expiryDate).getTime() - new Date(c.tradeDate).getTime()) / 86400000,
    );
    const T = tDays / 365;
    ivTotal++;
    let directIv: number | null = null;
    if (typeof c.settlement === "number" && c.settlement > 0) {
      directIv = impliedVol(c.settlement, F, c.strike, T, c.optionType);
    }
    if (directIv !== null) ivOk++;
    staged.push({ contract: c, T, directIv });
  }

  // Do not apply a flat 15% IV to every failed far-tail contract.  First build a
  // per-expiry IV smile from contracts whose settlement can be inverted, then
  // interpolate missing strikes.  Only when an expiry has no usable IV at all do
  // we fall back to the global median / final conservative default.
  const knownByExpiry = new Map<string, Array<{ strike: number; iv: number }>>();
  const allKnownIv: number[] = [];
  for (const item of staged) {
    if (item.directIv === null) continue;
    const iv = clampIv(item.directIv);
    allKnownIv.push(iv);
    const key = item.contract.expiryDate;
    knownByExpiry.set(key, [...(knownByExpiry.get(key) || []), { strike: item.contract.strike, iv }]);
  }
  const globalMedian = median(allKnownIv);
  const expiryMedian = new Map<string, number | null>();
  for (const [expiry, known] of knownByExpiry.entries()) {
    expiryMedian.set(expiry, median(known.map((item) => item.iv)));
  }

  const resolved: ResolvedOption[] = staged.map((item) => {
    const c = item.contract;
    const known = knownByExpiry.get(c.expiryDate) || [];
    const iv = item.directIv !== null
      ? clampIv(item.directIv)
      : interpolateIv(c.strike, known, expiryMedian.get(c.expiryDate) ?? null, globalMedian);
    const gamma = black76Gamma(F, c.strike, item.T, iv);
    return {
      expiry: c.expiryDate,
      strike: c.strike,
      option_type: c.optionType,
      oi: c.openInterest,
      iv,
      gamma,
    };
  });

  resolved.sort((a, b) => (a.expiry === b.expiry ? a.strike - b.strike : a.expiry < b.expiry ? -1 : 1));

  const expiries = Array.from(new Set(resolved.map((r) => r.expiry))).sort();
  const nearestExpiryDate = expiries[0] || null;
  const nearestExpiryResolved = nearestExpiryDate
    ? resolved.filter((r) => r.expiry === nearestExpiryDate)
    : [];

  return {
    tradeDate,
    futuresSettlement: F,
    resolved,
    nearestExpiryResolved,
    nearestExpiryDate,
    ivReconstructedPct: ivTotal > 0 ? Math.round((ivOk / ivTotal) * 100) : 0,
  };
}
