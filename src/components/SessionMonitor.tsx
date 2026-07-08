import React, { useEffect, useState } from "react";
import { Activity, AlertTriangle, RefreshCw } from "lucide-react";
import { DailyReport, SessionMonitorState } from "../types";

export const SessionMonitor: React.FC<{ report: DailyReport; lang?: "zh" | "en" }> = ({ report, lang = "zh" }) => {
  const isZh = lang === "zh";
  const [state, setState] = useState<SessionMonitorState | null>(report.session_monitor || null);
  const [error, setError] = useState<string | null>(null);
  const modelDate = report.source_status?.dashboardDate || report.as_of.slice(0, 10);
  const underlying = report.source_status?.cmeUnderlying || report.proxy;
  const load = async () => {
    try {
      const res = await fetch(`/api/tradingview/session?modelDate=${encodeURIComponent(modelDate)}&underlying=${encodeURIComponent(underlying)}`);
      if (!res.ok) throw new Error((await res.json()).error || "Session unavailable");
      setState(await res.json());
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Session unavailable");
      setState(report.session_monitor || null);
    }
  };
  useEffect(() => { load(); }, [modelDate, underlying]);
  const s = state || report.session_monitor;
  if (!s) return null;
  const checks = [
    ["Gamma Flip touched", s.gammaFlipTouched],
    ["Gamma Flip reclaimed", s.gammaFlipReclaimed],
    ["Call Wall touched", s.callWallTouched],
    ["Call Wall breakout 2×5m", s.callWallBreakoutConfirmed],
    ["Put Wall touched", s.putWallTouched],
    ["Put Wall breakdown 2×5m", s.putWallBreakdownConfirmed],
    ["Wall flipped", Boolean(s.wallFlipped)],
  ];
  return (
    <section className="glass-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div><h3 className="font-display font-bold text-sm text-white flex items-center gap-2"><Activity className="w-4 h-4 text-[#2DD4A7]" />Session Monitor / Regime Confirmation</h3><p className="text-xs text-slate-400 mt-1">{isZh ? "接收 TradingView webhook 事件後更新；不重新計算 GEX。" : "Updated by TradingView webhook events; it does not recalculate GEX."}</p></div>
        <button onClick={load} className="p-2 rounded border border-white/5 bg-[#12161A] text-slate-400 hover:text-white"><RefreshCw className="w-4 h-4" /></button>
      </div>
      {error && <div className="mb-4 text-[11px] text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded p-3 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
        <Tile label="Current session regime" value={s.currentSessionRegime} strong />
        <Tile label="Last event" value={s.lastEvent || "—"} />
        <Tile label="Updated at" value={s.updatedAt || "—"} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4 text-[11px] font-mono">
        {checks.map(([label, on]) => <div key={label as string} className={`rounded border px-3 py-2 ${on ? "bg-[#2DD4A7]/10 border-[#2DD4A7]/20 text-[#2DD4A7]" : "bg-[#171E24]/60 border-white/5 text-slate-500"}`}>{label}</div>)}
      </div>
      <p className="mt-4 text-xs text-slate-400 leading-relaxed">{s.explanation}</p>
    </section>
  );
};
function Tile({ label, value, strong=false }: { label: string; value: string; strong?: boolean }) { return <div className="rounded-lg bg-[#171E24]/60 border border-white/5 p-3"><span className="block text-[9px] uppercase text-slate-500 mb-1">{label}</span><span className={`${strong ? "text-[#2DD4A7] text-base" : "text-slate-200"} font-bold break-words`}>{value}</span></div>; }
