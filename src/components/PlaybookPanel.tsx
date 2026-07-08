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
