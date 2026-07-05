/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * BacktestValidation — 第三層回測:預測 vs 實際
 *
 * 對每個交易日 D,取當日預測的關鍵水位 (Call Wall 壓力 / Put Wall 支撐 / Gamma Flip),
 * 對照「隔一個交易日 D+1」的實際收盤,驗證預測準不準:
 *  - 支撐是否守住:D+1 收盤 >= D 的 Put Wall → 命中
 *  - 壓力是否有效:D+1 收盤 <= D 的 Call Wall → 命中
 *  - Flip 方向:D 收盤在 flip 上/下,對照 D+1 走勢是否延續
 *
 * 這是「付費高級版」功能。透過 tier prop 控制:非付費時顯示鎖定遮罩 + 升級提示,
 * 但底層計算邏輯仍在,方便你 (擁有者) 驗證。
 *
 * 資料來源:直接用 /api/history 已回傳的欄位,不需要改後端。
 */

import React, { useState, useEffect } from "react";
import { Lock, Target, TrendingUp, TrendingDown, CheckCircle2, XCircle } from "lucide-react";

interface HistoryItem {
  date: string;
  close: number;
  flip_level: number;
  status: "positive" | "negative";
  quadrant: string;
  label: string;
  call_wall_1: number;
  put_wall_1: number;
  confidence: "high" | "medium" | "low";
}

interface BacktestValidationProps {
  instrument: string;
  lang?: "zh" | "en";
  /** 功能分級:"free" 顯示鎖定;"premium" | "owner" 完整顯示 */
  tier?: "free" | "premium" | "owner";
}

interface DayResult {
  date: string;
  nextDate: string;
  close: number;
  nextClose: number;
  callWall: number;
  putWall: number;
  flip: number;
  supportHeld: boolean;      // 隔日收盤是否守住支撐
  resistanceHeld: boolean;   // 隔日收盤是否未破壓力
  flipCorrect: boolean;      // flip 方向是否正確
  movePct: number;           // 隔日相對變動 %
}

export const BacktestValidation: React.FC<BacktestValidationProps> = ({
  instrument,
  lang = "zh",
  tier = "owner",
}) => {
  const isZh = lang === "zh";
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/history?instrument=${instrument}`);
        if (!res.ok) throw new Error(`Failed to load history for ${instrument}`);
        const data = await res.json();
        if (!cancelled) {
          // 依日期由舊到新排序
          const sorted = [...data].sort((a, b) => (a.date < b.date ? -1 : 1));
          setHistory(sorted);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Could not load history");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [instrument]);

  // 計算逐日預測 vs 實際
  const results: DayResult[] = [];
  for (let i = 0; i < history.length - 1; i++) {
    const d = history[i];
    const next = history[i + 1];
    if (
      d.close == null || next.close == null ||
      d.call_wall_1 == null || d.put_wall_1 == null || d.flip_level == null
    ) continue;

    const supportHeld = next.close >= d.put_wall_1;
    const resistanceHeld = next.close <= d.call_wall_1;
    // flip 方向:D 收盤在 flip 之上 → 預期偏多(隔日續漲或持平);之下 → 偏空
    const dAboveFlip = d.close >= d.flip_level;
    const nextMovedUp = next.close >= d.close;
    const flipCorrect = dAboveFlip === nextMovedUp;
    const movePct = ((next.close - d.close) / d.close) * 100;

    results.push({
      date: d.date,
      nextDate: next.date,
      close: d.close,
      nextClose: next.close,
      callWall: d.call_wall_1,
      putWall: d.put_wall_1,
      flip: d.flip_level,
      supportHeld,
      resistanceHeld,
      flipCorrect,
      movePct,
    });
  }

  // 命中率統計
  const n = results.length;
  const supportRate = n ? (results.filter((r) => r.supportHeld).length / n) * 100 : 0;
  const resistanceRate = n ? (results.filter((r) => r.resistanceHeld).length / n) * 100 : 0;
  const flipRate = n ? (results.filter((r) => r.flipCorrect).length / n) * 100 : 0;

  // 付費鎖定遮罩
  if (tier === "free") {
    return (
      <div className="glass-card p-6 relative overflow-hidden">
        <div className="flex items-center gap-3 mb-2">
          <Target className="w-5 h-5 text-indigo-400" />
          <h3 className="font-display font-bold text-sm text-white">
            {isZh ? "預測 vs 實際回測驗證" : "Prediction vs Actual Backtest"}
          </h3>
          <span className="text-[9px] uppercase font-bold font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
            {isZh ? "高級版" : "Premium"}
          </span>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <Lock className="w-8 h-8 text-indigo-400/60" />
          <p className="text-sm text-slate-300 max-w-md leading-relaxed">
            {isZh
              ? "此功能會逐日對照系統預測的支撐/壓力/Gamma Flip 與隔日實際收盤,計算命中率,協助你驗證模型準確度。升級高級版即可解鎖。"
              : "Backtest the model's predicted support/resistance/flip against the next day's actual close. Upgrade to Premium to unlock."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-3 mb-4">
        <Target className="w-5 h-5 text-indigo-400" />
        <div>
          <h3 className="font-display font-bold text-sm text-white">
            {isZh ? "預測 vs 實際回測驗證" : "Prediction vs Actual Backtest"}
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {isZh
              ? "逐日對照:當日預測水位 vs 隔一交易日實際收盤"
              : "Daily: predicted levels vs next trading day's actual close"}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="h-32 flex items-center justify-center text-xs font-mono text-slate-400">
          {isZh ? "載入歷史數據中…" : "Loading history…"}
        </div>
      ) : error ? (
        <div className="p-4 bg-red-500/5 text-red-400 border border-red-500/15 rounded text-xs text-center font-mono">
          {error}
        </div>
      ) : n === 0 ? (
        <div className="p-6 text-center text-xs font-mono text-slate-400">
          {isZh
            ? "歷史數據不足(至少需要 2 個交易日才能回測)。持續累積每日數據後即可使用。"
            : "Not enough history yet (need at least 2 trading days). Keep accumulating daily snapshots."}
        </div>
      ) : (
        <>
          {/* 命中率摘要 */}
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div className="bg-[#171E24]/60 p-3 rounded border border-white/5 text-center">
              <span className="text-[9px] text-slate-500 uppercase block mb-1">
                {isZh ? "支撐守住率" : "Support Held"}
              </span>
              <span className="text-lg font-bold" style={{ color: supportRate >= 60 ? "#22C55E" : "#EAB308" }}>
                {supportRate.toFixed(0)}%
              </span>
            </div>
            <div className="bg-[#171E24]/60 p-3 rounded border border-white/5 text-center">
              <span className="text-[9px] text-slate-500 uppercase block mb-1">
                {isZh ? "壓力有效率" : "Resistance Held"}
              </span>
              <span className="text-lg font-bold" style={{ color: resistanceRate >= 60 ? "#22C55E" : "#EAB308" }}>
                {resistanceRate.toFixed(0)}%
              </span>
            </div>
            <div className="bg-[#171E24]/60 p-3 rounded border border-white/5 text-center">
              <span className="text-[9px] text-slate-500 uppercase block mb-1">
                {isZh ? "Flip 方向命中" : "Flip Direction"}
              </span>
              <span className="text-lg font-bold" style={{ color: flipRate >= 60 ? "#22C55E" : "#EAB308" }}>
                {flipRate.toFixed(0)}%
              </span>
            </div>
          </div>

          {/* 逐日明細表 */}
          <div className="overflow-x-auto rounded-lg border border-white/5">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-[#161C22]/80 text-slate-400 border-b border-white/5">
                <tr>
                  <th className="p-2.5">{isZh ? "預測日" : "Pred. Day"}</th>
                  <th className="p-2.5 text-right">{isZh ? "當日收" : "Close"}</th>
                  <th className="p-2.5 text-right">{isZh ? "隔日收" : "Next Close"}</th>
                  <th className="p-2.5 text-right">{isZh ? "變動" : "Move"}</th>
                  <th className="p-2.5 text-center">{isZh ? "支撐" : "Supp."}</th>
                  <th className="p-2.5 text-center">{isZh ? "壓力" : "Resist."}</th>
                  <th className="p-2.5 text-center">{isZh ? "Flip" : "Flip"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 bg-[#12161A]/40">
                {results.slice().reverse().map((r, idx) => (
                  <tr key={idx} className="hover:bg-[#161C22]/50 transition-all">
                    <td className="p-2.5 text-slate-300">{r.date}</td>
                    <td className="p-2.5 text-right text-slate-200">{r.close}</td>
                    <td className="p-2.5 text-right text-slate-200">{r.nextClose}</td>
                    <td className="p-2.5 text-right" style={{ color: r.movePct >= 0 ? "#22C55E" : "#EF4444" }}>
                      {r.movePct >= 0 ? "+" : ""}{r.movePct.toFixed(2)}%
                    </td>
                    <td className="p-2.5 text-center">
                      {r.supportHeld
                        ? <CheckCircle2 className="w-3.5 h-3.5 inline" style={{ color: "#22C55E" }} />
                        : <XCircle className="w-3.5 h-3.5 inline" style={{ color: "#EF4444" }} />}
                    </td>
                    <td className="p-2.5 text-center">
                      {r.resistanceHeld
                        ? <CheckCircle2 className="w-3.5 h-3.5 inline" style={{ color: "#22C55E" }} />
                        : <XCircle className="w-3.5 h-3.5 inline" style={{ color: "#EF4444" }} />}
                    </td>
                    <td className="p-2.5 text-center">
                      {r.flipCorrect
                        ? <TrendingUp className="w-3.5 h-3.5 inline" style={{ color: "#22C55E" }} />
                        : <TrendingDown className="w-3.5 h-3.5 inline" style={{ color: "#EF4444" }} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">
            {isZh
              ? "說明:支撐=隔日收盤 ≥ 當日 Put Wall;壓力=隔日收盤 ≤ 當日 Call Wall;Flip=當日收盤相對 Flip 的位置是否正確預示隔日方向。此為機械化統計,非投資建議。"
              : "Support = next close ≥ Put Wall; Resistance = next close ≤ Call Wall; Flip = whether close vs flip correctly signaled next-day direction. Mechanical stats, not investment advice."}
          </p>
        </>
      )}
    </div>
  );
};
