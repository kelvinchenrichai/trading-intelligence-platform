/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * WallComparison — 三方水位對照表
 *
 * 讓你每天手動輸入 MenthorQ / gexmon 的關鍵水位 (Call Wall / Put Wall / Zero Gamma),
 * 跟你系統當日自動算出的水位並排,自動計算差距,建立有紀律的驗證流程。
 *
 * 儲存:用後端 /api/config 那種持久化太重,這裡用簡單方式 —— 存在瀏覽器 (localStorage)。
 * 注意:localStorage 只存在這台裝置/瀏覽器。若要跨裝置,未來可改存 Supabase。
 */

import React, { useEffect, useState } from "react";
import { GitCompareArrows, Save, Trash2 } from "lucide-react";

interface SystemLevels {
  callWall?: number;
  putWall?: number;
  flip?: number;
  spot?: number;
}

interface WallComparisonProps {
  lang?: "zh" | "en";
  instrument: string;
  date: string;
  /** 你系統當日算出的水位 (由父層從 report 帶入) */
  system?: SystemLevels;
}

interface Entry {
  menthorq: { callWall: string; putWall: string; flip: string };
  gexmon: { callWall: string; putWall: string; flip: string };
}

const EMPTY: Entry = {
  menthorq: { callWall: "", putWall: "", flip: "" },
  gexmon: { callWall: "", putWall: "", flip: "" },
};

const KEY = (inst: string, date: string) => `wallcmp:${inst}:${date}`;

export const WallComparison: React.FC<WallComparisonProps> = ({ lang = "zh", instrument, date, system }) => {
  const isZh = lang === "zh";
  const [entry, setEntry] = useState<Entry>(EMPTY);
  const [saved, setSaved] = useState(false);

  // 載入這個標的+日期已存的資料
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY(instrument, date));
      setEntry(raw ? JSON.parse(raw) : EMPTY);
    } catch {
      setEntry(EMPTY);
    }
    setSaved(false);
  }, [instrument, date]);

  const save = () => {
    try {
      localStorage.setItem(KEY(instrument, date), JSON.stringify(entry));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
  };

  const clear = () => {
    try {
      localStorage.removeItem(KEY(instrument, date));
    } catch {}
    setEntry(EMPTY);
  };

  const num = (s: string) => {
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  };

  // 計算差距 (對照值 − 系統值)
  const diff = (ref: string, sys?: number) => {
    const r = num(ref);
    if (r === null || sys === undefined) return null;
    return Math.round(r - sys);
  };

  const diffCell = (ref: string, sys?: number) => {
    const d = diff(ref, sys);
    if (d === null) return <span className="text-slate-600">—</span>;
    const abs = Math.abs(d);
    const color = abs <= 50 ? "#2DD4A7" : abs <= 150 ? "#F2A93B" : "#F2545B";
    return <span style={{ color }} className="font-bold">{d >= 0 ? "+" : ""}{d}</span>;
  };

  const rows: Array<{ label: string; key: "callWall" | "putWall" | "flip"; sys?: number }> = [
    { label: isZh ? "壓力 Call Wall" : "Call Wall", key: "callWall", sys: system?.callWall },
    { label: isZh ? "支撐 Put Wall" : "Put Wall", key: "putWall", sys: system?.putWall },
    { label: isZh ? "零軸 Flip/ZG" : "Zero Gamma", key: "flip", sys: system?.flip },
  ];

  const input = (src: "menthorq" | "gexmon", key: "callWall" | "putWall" | "flip") => (
    <input
      type="number"
      value={entry[src][key]}
      onChange={(e) => setEntry({ ...entry, [src]: { ...entry[src], [key]: e.target.value } })}
      placeholder="—"
      className="w-20 bg-black/30 border border-white/10 rounded px-2 py-1 text-center text-xs font-mono text-slate-200 focus:border-[#2DD4A7]/40 outline-none"
    />
  );

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <GitCompareArrows className="w-5 h-5 text-indigo-400" />
          <div>
            <h3 className="font-display font-bold text-sm text-white">
              {isZh ? "三方水位對照表" : "Cross-Source Wall Comparison"}
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {isZh
                ? `${instrument} · ${date} · 手動輸入 MenthorQ / gexmon 水位與系統對照`
                : `${instrument} · ${date} · Compare against MenthorQ / gexmon`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={save} className="flex items-center gap-1.5 bg-[#2DD4A7] text-black px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer hover:brightness-110">
            <Save className="w-3.5 h-3.5" /> {saved ? (isZh ? "已存" : "Saved") : (isZh ? "儲存" : "Save")}
          </button>
          <button onClick={clear} className="flex items-center gap-1.5 bg-[#1C242B] border border-white/10 text-slate-400 px-3 py-1.5 rounded-lg text-xs cursor-pointer hover:text-white">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-slate-400 border-b border-white/5">
              <th className="text-left p-2">{isZh ? "水位" : "Level"}</th>
              <th className="text-center p-2 text-[#2DD4A7]">{isZh ? "你的系統" : "Yours"}</th>
              <th className="text-center p-2">MenthorQ</th>
              <th className="text-center p-2">{isZh ? "差距" : "Δ"}</th>
              <th className="text-center p-2">gexmon</th>
              <th className="text-center p-2">{isZh ? "差距" : "Δ"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-white/5">
                <td className="p-2 text-slate-300">{r.label}</td>
                <td className="p-2 text-center text-[#2DD4A7] font-bold">{r.sys ?? "—"}</td>
                <td className="p-2 text-center">{input("menthorq", r.key)}</td>
                <td className="p-2 text-center">{diffCell(entry.menthorq[r.key], r.sys)}</td>
                <td className="p-2 text-center">{input("gexmon", r.key)}</td>
                <td className="p-2 text-center">{diffCell(entry.gexmon[r.key], r.sys)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">
        {isZh
          ? "差距顏色:綠 ≤50 點 (很接近)、黃 ≤150 點 (可接受)、紅 >150 點 (需檢查數據源或演算法)。牆差 1-2 個 strike 屬正常。資料存於本機瀏覽器。"
          : "Green ≤50 pts, amber ≤150, red >150. Stored locally in your browser."}
      </p>
    </div>
  );
};
