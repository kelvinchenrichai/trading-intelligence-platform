import React from "react";
import { AlertTriangle, ClipboardList } from "lucide-react";
import { DailyReport } from "../types";
import { translateConfidence, translateRegime, translateText } from "../utils/displayText";

export const PlaybookPanel: React.FC<{ report: DailyReport; lang?: "zh" | "en" }> = ({ report, lang = "zh" }) => {
  const p = report.playbook;
  const c = report.confluence;
  const isZh = lang === "zh";
  if (!p && !c) return null;
  return (
    <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {p && <div className="glass-card p-6">
        <h3 className="font-display font-bold text-sm text-white flex items-center gap-2 mb-4">
          <ClipboardList className="w-4 h-4 text-[#2DD4A7]" />
          {isZh ? "作戰地圖 / 警示" : "Playbook / Warnings"}
        </h3>
        {p.premarketBias && (
          <div className="mb-4 rounded-xl border border-indigo-400/20 bg-indigo-500/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <div>
                <div className="text-[9px] uppercase tracking-wider text-indigo-200/80 font-mono">{isZh ? "今日盤前預判" : "Premarket Directional Read"}</div>
                <div className="text-base font-display font-bold text-white mt-1">{translateRegime(p.premarketBias.label, lang)}</div>
              </div>
              <div className="flex gap-2 text-[10px] font-mono">
                <span className="px-2 py-1 rounded bg-[#22C55E]/10 text-[#22C55E]">Bull {p.premarketBias.probabilities.bullish}%</span>
                <span className="px-2 py-1 rounded bg-[#EF4444]/10 text-[#EF4444]">Bear {p.premarketBias.probabilities.bearish}%</span>
                <span className="px-2 py-1 rounded bg-slate-500/10 text-slate-300">Range {p.premarketBias.probabilities.range}%</span>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{translateText(p.premarketBias.summary, lang)}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3 text-[11px]">
              <div className="rounded-lg bg-[#0F151A]/70 border border-white/5 p-2 text-emerald-200">{translateText(p.premarketBias.bullishTrigger, lang)}</div>
              <div className="rounded-lg bg-[#0F151A]/70 border border-white/5 p-2 text-red-200">{translateText(p.premarketBias.bearishTrigger, lang)}</div>
            </div>
            <p className="text-[11px] text-amber-200 mt-2 leading-relaxed">{translateText(p.premarketBias.invalidation, lang)}</p>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <Row label={isZh ? "偏向" : "Bias"} value={translateRegime(p.bias, lang)} />
          <Row label={isZh ? "適合觀察" : "Favor"} value={translateText(p.favor, lang)} />
          <Row label={isZh ? "避免" : "Avoid"} value={translateText(p.avoid, lang)} />
          <Row label={isZh ? "觸發條件" : "Trigger"} value={translateText(p.trigger, lang)} />
          <Row label={isZh ? "失效條件" : "Invalidation"} value={translateText(p.invalidation, lang)} />
          <Row label={isZh ? "信心" : "Confidence"} value={translateConfidence(p.confidence, lang)} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {p.keyLevels.map((k) => <span key={k.label} className="px-2.5 py-1 rounded-full bg-[#171E24] border border-white/5 text-[11px] font-mono text-slate-300">{translateText(k.label, lang)}: <b className="text-white">{k.level ?? "—"}</b></span>)}
        </div>
        {p.warnings.length > 0 && <div className="mt-4 space-y-1">{p.warnings.slice(0,5).map((w, i) => <div key={i} className="text-[11px] text-amber-200 flex gap-2"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />{translateText(w, lang)}</div>)}</div>}
      </div>}
      {c && <div className="glass-card p-6">
        <h3 className="font-display font-bold text-sm text-white mb-4">{isZh ? "官方資料 vs Proxy 共振" : "Official vs Proxy Confluence"}</h3>
        <div className="grid grid-cols-2 gap-3 text-xs font-mono">
          <Row label={isZh ? "CME Call Wall" : "CME Call Wall"} value={c.cmeCallWall ?? "—"} />
          <Row label={isZh ? "Proxy Call Wall" : "Proxy Call Wall"} value={c.proxyCallWall ?? "—"} />
          <Row label={isZh ? "Call 差距" : "Call Diff"} value={c.callWallDiffPts ?? "—"} />
          <Row label={isZh ? "CME Put Wall" : "CME Put Wall"} value={c.cmePutWall ?? "—"} />
          <Row label={isZh ? "Proxy Put Wall" : "Proxy Put Wall"} value={c.proxyPutWall ?? "—"} />
          <Row label={isZh ? "Put 差距" : "Put Diff"} value={c.putWallDiffPts ?? "—"} />
          <Row label={isZh ? "CME Regime" : "CME Regime"} value={translateText(c.cmeRegime || "—", lang)} />
          <Row label={isZh ? "共振分數" : "Confluence Score"} value={translateText(c.score, lang)} />
        </div>
        <p className="mt-4 text-xs text-slate-400 leading-relaxed">{translateText(c.note, lang)}</p>
      </div>}
    </section>
  );
};
function Row({ label, value }: { label: string; value: string | number }) { return <div className="rounded-lg border border-white/5 bg-[#171E24]/60 p-3"><span className="block text-[9px] uppercase text-slate-500 mb-1">{label}</span><span className="font-bold text-slate-200 break-words">{value}</span></div>; }
