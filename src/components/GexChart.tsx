import React, { useMemo, useRef, useState } from "react";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell } from "recharts";
import { GexStrikeData } from "../types";

type ViewMode = "trade" | "top" | "full";
type FilterMode = "all" | "oi" | "top50" | "spot500" | "spot1000" | "spot1500";

interface GexChartProps {
  gexData: GexStrikeData[];
  spotPrice: number;
  flipLevel: number;
  lang?: "zh" | "en";
  callWall?: number;
  putWall?: number;
}

const POS = "#22C55E";
const NEG = "#EF4444";
const PROFILE = "#EAB308";
const FLIP = "#F2A93B";
const SPOT = "#818CF8";

const fmt = (val: number) => {
  const a = Math.abs(val);
  const s = val >= 0 ? "+" : "-";
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(0)}k`;
  return `${s}${a.toFixed(0)}`;
};

export const GexChart: React.FC<GexChartProps> = ({ gexData, spotPrice, flipLevel, lang = "zh", callWall, putWall }) => {
  const isZh = lang === "zh";
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<ViewMode>("trade");
  const [filter, setFilter] = useState<FilterMode>("spot1000");
  const sorted = useMemo(() => [...gexData].sort((a, b) => a.strike - b.strike), [gexData]);
  const resolvedCallWall = callWall ?? [...sorted].sort((a, b) => b.net_gex - a.net_gex)[0]?.strike;
  const resolvedPutWall = putWall ?? [...sorted].sort((a, b) => a.net_gex - b.net_gex)[0]?.strike;

  const includeKeyLevels = (rows: GexStrikeData[]) => {
    const levels = [spotPrice, flipLevel, resolvedCallWall, resolvedPutWall].filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    const extras = levels.map((lvl) => sorted.reduce((prev, curr) => Math.abs(curr.strike - lvl) < Math.abs(prev.strike - lvl) ? curr : prev, sorted[0])).filter(Boolean);
    const map = new Map<number, GexStrikeData>();
    [...rows, ...extras].forEach((r) => map.set(r.strike, r));
    return [...map.values()].sort((a, b) => a.strike - b.strike);
  };

  const visible = useMemo(() => {
    let rows = sorted;
    const activeFilter = view === "trade" ? "spot1000" : view === "top" ? "top50" : filter;
    if (activeFilter === "oi") rows = rows.filter((r) => r.oi > 0);
    if (activeFilter === "top50") rows = includeKeyLevels([...rows].sort((a, b) => Math.abs(b.net_gex) - Math.abs(a.net_gex)).slice(0, 50));
    if (activeFilter === "spot500") rows = rows.filter((r) => Math.abs(r.strike - spotPrice) <= 500);
    if (activeFilter === "spot1000") rows = rows.filter((r) => Math.abs(r.strike - spotPrice) <= 1000);
    if (activeFilter === "spot1500") rows = rows.filter((r) => Math.abs(r.strike - spotPrice) <= 1500);
    return includeKeyLevels(rows).sort((a, b) => a.strike - b.strike);
  }, [sorted, view, filter, spotPrice, flipLevel, resolvedCallWall, resolvedPutWall]);

  let cumulative = 0;
  const withProfileAsc = visible.map((d) => { cumulative += d.net_gex; return { ...d, profile: cumulative }; });
  const chartData = [...withProfileAsc].reverse();
  const totalNet = sorted.reduce((acc, s) => acc + s.net_gex, 0);
  const totalGross = sorted.reduce((acc, s) => acc + Math.abs(s.net_gex), 0);
  const chartHeight = Math.max(360, visible.length * 16);
  const frameHeight = view === "full" ? 850 : Math.min(680, chartHeight + 20);

  const nearestStrike = (target?: number) => target === undefined ? undefined : visible.reduce((prev, curr) => Math.abs(curr.strike - target) < Math.abs(prev.strike - target) ? curr : prev, visible[0])?.strike;
  const jumpTo = (target: "top" | "bottom" | "spot" | "flip" | "call" | "put" | "topgex") => {
    const el = scrollRef.current;
    if (!el) return;
    if (target === "top") { el.scrollTop = 0; return; }
    if (target === "bottom") { el.scrollTop = el.scrollHeight; return; }
    let strike = spotPrice;
    if (target === "flip") strike = flipLevel;
    if (target === "call" && resolvedCallWall) strike = resolvedCallWall;
    if (target === "put" && resolvedPutWall) strike = resolvedPutWall;
    if (target === "topgex") strike = [...visible].sort((a, b) => Math.abs(b.net_gex) - Math.abs(a.net_gex))[0]?.strike || spotPrice;
    const ascendingIndex = visible.findIndex((r) => r.strike >= strike);
    const reverseIndex = ascendingIndex < 0 ? 0 : visible.length - ascendingIndex - 1;
    el.scrollTop = Math.max(0, reverseIndex * 16 - el.clientHeight / 2);
  };

  const axisFmt = (v: number) => {
    const a = Math.abs(v);
    if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
    return `${v}`;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d: GexStrikeData & { profile?: number } = payload[0].payload;
    return <div className="bg-[#12161A]/95 border border-white/10 rounded-lg p-3.5 shadow-2xl font-mono text-xs space-y-1 backdrop-blur-md"><div className="text-slate-400 border-b border-white/5 pb-1.5 mb-1.5 flex justify-between items-center gap-6"><span>STRIKE</span><span className="text-white font-bold text-sm">{d.strike}</span></div><LineRow label="Call GEX" value={fmt(d.call_gex)} color={POS} /><LineRow label="Put GEX" value={fmt(d.put_gex)} color={NEG} /><LineRow label="Net GEX" value={fmt(d.net_gex)} color={d.net_gex >= 0 ? POS : NEG} bold /><LineRow label="Cumulative" value={fmt(d.profile || 0)} color={PROFILE} /><div className="text-[10px] text-slate-500 pt-1">OI: {d.oi.toLocaleString()}</div></div>;
  };

  return (
    <div id="gex-chart-container" className="glass-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div><h3 className="font-display font-bold text-sm text-white uppercase tracking-wider">{isZh ? "📊 GEX Profile / Full Chain" : "📊 GEX Profile / Full Chain"}</h3><p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-3xl">{isZh ? "Trade View 預設只看 Spot ±1000；Full Chain 固定高度且內部滾動，不拉爆頁面。" : "Trade View shows Spot ±1000 by default; Full Chain uses internal scrolling."}</p></div>
        <div className="flex flex-wrap gap-2 text-xs">
          {(["trade", "top", "full"] as ViewMode[]).map((m) => <button key={m} onClick={() => setView(m)} className={`px-3 py-1.5 rounded border ${view === m ? "bg-[#2DD4A7] text-black border-[#2DD4A7]" : "bg-[#12161A] text-slate-400 border-white/5 hover:text-white"}`}>{m === "trade" ? "Trade View" : m === "top" ? "Top GEX View" : "Full Chain View"}</button>)}
        </div>
      </div>
      {view === "full" && <div className="flex flex-wrap items-center gap-2 mb-4 text-[11px]"><span className="text-slate-400 mr-1">Filter:</span>{(["all", "oi", "top50", "spot500", "spot1000", "spot1500"] as FilterMode[]).map((f) => <button key={f} onClick={() => setFilter(f)} className={`px-2.5 py-1 rounded border ${filter === f ? "bg-indigo-500 text-white border-indigo-500" : "bg-[#12161A] text-slate-400 border-white/5"}`}>{f === "all" ? "Show All" : f === "oi" ? "OI > 0" : f === "top50" ? "Top 50 abs GEX" : f.replace("spot", "Spot ±")}</button>)}</div>}
      {view === "full" && <div className="flex flex-wrap gap-2 mb-4 text-[11px]"><span className="text-slate-400 mr-1">Jump:</span>{(["spot", "flip", "call", "put", "topgex", "top", "bottom"] as const).map((j) => <button key={j} onClick={() => jumpTo(j)} className="px-2.5 py-1 rounded border border-white/5 bg-[#12161A] text-slate-300 hover:text-white">{j === "topgex" ? "Top GEX" : j[0].toUpperCase()+j.slice(1)}</button>)}</div>}

      <div ref={scrollRef} className="w-full font-mono text-[10px] select-none rounded-lg border border-white/5 bg-[#0F1419]/40" style={{ height: frameHeight, overflowY: view === "full" ? "auto" : "hidden" }}>
        <div style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart layout="vertical" data={chartData} margin={{ top: 10, right: 70, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1D252C" horizontal={false} />
              <XAxis type="number" stroke="#64748B" tickLine={false} axisLine={false} tickFormatter={axisFmt} domain={["dataMin", "dataMax"]} />
              <YAxis type="category" dataKey="strike" stroke="#64748B" tickLine={false} axisLine={false} width={58} interval={Math.max(0, Math.floor(visible.length / 28))} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.02)" }} />
              <ReferenceLine x={0} stroke="#2C3843" strokeWidth={1} />
              {resolvedCallWall !== undefined && <ReferenceLine y={nearestStrike(resolvedCallWall)} stroke={NEG} strokeWidth={1.5} strokeDasharray="6 4" label={{ value: `Call Wall: ${resolvedCallWall}`, position: "right", fill: NEG, fontSize: 9, fontWeight: "bold" }} />}
              {resolvedPutWall !== undefined && <ReferenceLine y={nearestStrike(resolvedPutWall)} stroke={POS} strokeWidth={1.5} strokeDasharray="6 4" label={{ value: `Put Wall: ${resolvedPutWall}`, position: "right", fill: POS, fontSize: 9, fontWeight: "bold" }} />}
              {visible.length > 0 && <ReferenceLine y={nearestStrike(flipLevel)} stroke={FLIP} strokeWidth={1.5} strokeDasharray="4 4" label={{ value: `Zero Gamma: ${flipLevel}`, position: "left", fill: FLIP, fontSize: 9, fontWeight: "bold" }} />}
              {visible.length > 0 && <ReferenceLine y={nearestStrike(spotPrice)} stroke={SPOT} strokeWidth={1.5} label={{ value: `Spot: ${spotPrice}`, position: "left", fill: SPOT, fontSize: 9, fontWeight: "bold" }} />}
              <Bar dataKey="net_gex" barSize={11}>{chartData.map((entry, idx) => <Cell key={`c-${idx}`} fill={entry.net_gex >= 0 ? POS : NEG} />)}</Bar>
              <Line type="monotone" dataKey="profile" stroke={PROFILE} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mt-4 pt-4 border-t border-white/5 font-mono text-xs">
        <Metric label="Call Wall" value={resolvedCallWall ?? "N/A"} cls="text-[#EF4444]" />
        <Metric label="Put Wall" value={resolvedPutWall ?? "N/A"} cls="text-[#22C55E]" />
        <Metric label="Gamma Flip" value={flipLevel} cls="text-[#F2A93B]" />
        <Metric label="Total Net GEX" value={fmt(totalNet)} cls={totalNet >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"} />
        <Metric label="Total Gross GEX" value={fmt(totalGross)} cls="text-slate-200" />
        <Metric label="Total Strikes" value={sorted.length} cls="text-slate-200" />
        <Metric label="Visible" value={visible.length} cls="text-slate-200" />
      </div>
    </div>
  );
};
function LineRow({ label, value, color, bold=false }: { label: string; value: string; color: string; bold?: boolean }) { return <div className="flex justify-between gap-6"><span className="text-slate-400">{label}:</span><span className={bold ? "font-extrabold" : "font-semibold"} style={{ color }}>{value}</span></div>; }
function Metric({ label, value, cls }: { label: string; value: string | number; cls: string }) { return <div className="bg-[#171E24]/60 p-3 rounded border border-white/5 text-center"><span className="text-[9px] text-slate-500 uppercase block mb-1">{label}</span><span className={`text-sm font-bold ${cls}`}>{value}</span></div>; }
