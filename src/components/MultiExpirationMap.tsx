import React from "react";
import { CalendarDays, Layers } from "lucide-react";
import { DailyReport, ExpiryGexSummary } from "../types";

const fmt = (n: number) => {
  const a = Math.abs(n);
  const sign = n >= 0 ? "+" : "-";
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(0)}k`;
  return `${sign}${a.toFixed(0)}`;
};

export const MultiExpirationMap: React.FC<{ report: DailyReport; lang?: "zh" | "en" }> = ({ report, lang = "zh" }) => {
  const isZh = lang === "zh";
  const panels = report.selected_expiry_panels || [];
  const all = report.expiry_breakdown || [];
  const divisor = report.gex_display?.comparableDivisor || null;
  const showCmp = Boolean(report.gex_display);
  if (!panels.length && !all.length) return null;
  return (
    <section className="glass-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h3 className="font-display font-bold text-sm text-white flex items-center gap-2 uppercase tracking-wider">
            <Layers className="w-4 h-4 text-[#2DD4A7]" />
            {isZh ? "CME Multi Expiration 盤前地圖" : "CME Multi Expiration Premarket Map"}
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
            {isZh ? "每個到期日獨立計算 Call Wall、Put Wall、Gamma Flip、Gamma Pivot 與 Expiry Structure Impact%。Comparable GEX 只是顯示校準，不是任何第三方私有公式。" : "Each expiry is calculated independently. Comparable GEX is a display calibration, not a third-party proprietary formula."}
          </p>
        </div>
        <span className="text-[10px] font-mono text-slate-500">{all.length} {isZh ? "到期日群組" : "expiry groups"}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {panels.map((item) => <ExpiryCard key={`${item.label}-${item.expiryDate}`} item={item} lang={lang} />)}
      </div>
      {all.length > 0 && (
        <div className="mt-5 rounded-xl border border-white/5 overflow-hidden">
          <div className="bg-[#171E24] px-4 py-2 text-[11px] font-bold text-slate-300 flex items-center gap-2"><CalendarDays className="w-3.5 h-3.5 text-indigo-400" />{isZh ? "所有到期日 GEX 地圖" : "All Expirations GEX Map"}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="text-slate-500 bg-[#12161A]"><tr><th className="p-3">{isZh ? "到期日" : "Expiry"}</th><th className="p-3">DTE</th><th className="p-3 text-right">Call Wall</th><th className="p-3 text-right">Put Wall</th><th className="p-3 text-right">Flip</th><th className="p-3 text-right">Pivot</th><th className="p-3 text-right">{showCmp ? "Comparable Net" : "Net GEX"}</th><th className="p-3 text-right">Raw Net</th><th className="p-3 text-right">{isZh ? "影響 %" : "Impact %"}</th></tr></thead>
              <tbody className="divide-y divide-white/5">
                {all.map((e) => {
                  const displayNet = showCmp ? (e.comparableNetGex ?? Math.round(e.netGex / (divisor || 1))) : e.netGex;
                  return <tr key={e.expiryDate} className="hover:bg-white/[0.02]"><td className="p-3 text-slate-300">{e.expiryDate}</td><td className="p-3 text-slate-400">{e.dte}</td><td className="p-3 text-right text-[#EF4444] font-bold">{e.callWall ?? "—"}</td><td className="p-3 text-right text-[#22C55E] font-bold">{e.putWall ?? "—"}</td><td className="p-3 text-right text-[#F2A93B]">{e.gammaFlip ?? "—"}</td><td className="p-3 text-right text-indigo-300">{e.gammaPivot ?? "—"}</td><td className={`p-3 text-right font-bold ${displayNet >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>{fmt(displayNet)}</td><td className="p-3 text-right text-slate-400">{fmt(e.rawNetGex ?? e.netGex)}</td><td className="p-3 text-right text-slate-300">{e.expiryStructureImpactPct}%</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};

const ExpiryCard: React.FC<{ item: ExpiryGexSummary; lang: "zh" | "en" }> = ({ item, lang }) => {
  const isZh = lang === "zh";
  return (
    <div className="rounded-xl border border-white/5 bg-[#171E24]/60 p-4 font-mono text-xs">
      <div className="flex justify-between gap-3 mb-3"><div><div className="text-[10px] text-slate-500 uppercase">{item.label}</div><div className="text-white font-bold mt-1">{item.expiryDate}</div></div><span className="text-[10px] text-indigo-300 bg-indigo-500/10 px-2 py-1 rounded h-fit">{isZh ? "DTE" : "DTE"} {item.dte}</span></div>
      <div className="grid grid-cols-2 gap-2">
        <Mini label="Call Wall" value={item.callWall ?? "—"} cls="text-[#EF4444]" />
        <Mini label="Put Wall" value={item.putWall ?? "—"} cls="text-[#22C55E]" />
        <Mini label="Gamma Flip" value={item.gammaFlip ?? "—"} cls="text-[#F2A93B]" />
        <Mini label="Gamma Pivot" value={item.gammaPivot ?? "—"} cls="text-indigo-300" />
        <Mini label={item.comparableNetGex !== undefined ? "Comparable Net" : "Net GEX"} value={fmt(item.comparableNetGex ?? item.netGex)} cls={(item.comparableNetGex ?? item.netGex) >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"} />
        {item.rawNetGex !== undefined && <Mini label="Raw Net" value={fmt(item.rawNetGex)} cls="text-slate-300" />}
        <Mini label={isZh ? "Impact" : "Impact"} value={`${item.expiryStructureImpactPct}%`} cls="text-slate-200" />
      </div>
    </div>
  );
};
function Mini({ label, value, cls }: { label: string; value: string | number; cls: string }) { return <div className="rounded-lg bg-[#10151A]/80 border border-white/5 p-2"><div className="text-[9px] text-slate-500 uppercase">{label}</div><div className={`font-bold ${cls}`}>{value}</div></div>; }
