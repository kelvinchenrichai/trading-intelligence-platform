import React from "react";
import { AlertTriangle, Database, Radio, ShieldCheck } from "lucide-react";
import { DailyReport } from "../types";
import { translateText } from "../utils/displayText";

export const DataSourceStatus: React.FC<{ report: DailyReport; lang?: "zh" | "en" }> = ({ report, lang = "zh" }) => {
  const isZh = lang === "zh";
  const status = report.source_status;
  if (!status) return null;
  const isCme = status.dataMode === "CME_PG40";
  const tone = isCme ? "text-[#2DD4A7] border-[#2DD4A7]/25 bg-[#2DD4A7]/10" : "text-[#F2A93B] border-[#F2A93B]/25 bg-[#F2A93B]/10";
  const gex = report.gex_display;
  const fmt = (n?: number) => {
    if (typeof n !== "number") return "—";
    const abs = Math.abs(n);
    const sign = n >= 0 ? "+" : "-";
    if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}K`;
    return `${sign}${abs.toFixed(0)}`;
  };
  return (
    <section className="glass-card p-5 border border-white/5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-display font-bold text-sm text-white flex items-center gap-2">
            <Database className="w-4 h-4 text-[#2DD4A7]" />
            {isZh ? "資料來源狀態" : "Data Source Status"}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {isZh ? "Layer 1 官方盤前地圖、Layer 2 Proxy 共振、Layer 3 盤中確認分層顯示。" : "Layer 1 official baseline, Layer 2 proxy confluence, and Layer 3 session confirmation are shown separately."}
          </p>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold border ${tone}`}>
          {isCme ? <ShieldCheck className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          {translateText(status.currentModel, lang)}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 text-xs font-mono">
        <Tile label={isZh ? "Dashboard 日期" : "Dashboard Date"} value={status.dashboardDate || "—"} />
        <Tile label={isZh ? "主要資料來源" : "Primary Source"} value={translateText(status.primarySource, lang)} />
        <Tile label={isZh ? "資料模式" : "Data Mode"} value={translateText(status.dataMode, lang)} />
        <Tile label={isZh ? "CME 交易日" : "CME Trade Date"} value={status.cmeTradeDate || "—"} tone={isCme ? "good" : "muted"} />
        <Tile label={isZh ? "標的合約" : "Underlying"} value={status.cmeUnderlying || status.proxy?.instrument || "—"} />
        <Tile label={isZh ? "期貨結算價" : "Futures Settlement"} value={status.cmeFuturesSettlement ? String(status.cmeFuturesSettlement) : "—"} />
        <Tile label={isZh ? "解析合約數" : "Contracts Parsed"} value={status.cmeContractsParsed?.toLocaleString() || "—"} />
        <Tile label={isZh ? "到期日群組" : "Expiry Groups"} value={status.cmeExpiryGroups?.toString() || "—"} />
        <Tile label={isZh ? "匯入時間" : "Import Timestamp"} value={status.cmeImportTimestamp || "—"} />
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
        {gex && (
          <div className="rounded-lg border border-[#2DD4A7]/10 bg-[#171E24]/60 p-3 lg:col-span-2">
            <div className="font-bold text-slate-300 mb-2">{isZh ? "GEX 顯示校準" : "GEX Display Calibration"}</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono">
              <Tile label={isZh ? "Raw Net" : "Raw Net"} value={fmt(gex.rawNetGex)} />
              <Tile label={isZh ? "Point Net ÷20" : "Point Net ÷20"} value={fmt(gex.pointNetGex)} />
              <Tile label={isZh ? "Comparable Net" : "Comparable Net"} value={fmt(gex.comparableNetGex)} tone="good" />
              <Tile label={isZh ? "Comparable Total" : "Comparable Total"} value={fmt(gex.comparableGrossGex)} tone="good" />
            </div>
            <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
              {isZh
                ? `Comparable 使用透明顯示校準：Net ÷${gex.comparableNetDivisor || gex.comparableDivisor}、Total/Gross ÷${gex.comparableGrossDivisor || gex.comparableDivisor}；只用於第三方尺度對照，不是 MenthorQ 私有公式。`
                : `Comparable uses transparent display calibration: Net ÷${gex.comparableNetDivisor || gex.comparableDivisor}, Total/Gross ÷${gex.comparableGrossDivisor || gex.comparableDivisor}; it is not a proprietary MenthorQ formula.`}
            </p>
          </div>
        )}
        <div className="rounded-lg border border-white/5 bg-[#171E24]/60 p-3">
          <div className="flex items-center gap-2 text-slate-300 font-bold mb-1"><Radio className="w-3.5 h-3.5 text-indigo-400" />{isZh ? "盤中資料流" : "Session Flow"}</div>
          <p className="text-slate-400 leading-relaxed">{translateText(status.sessionFlow?.note || "Unavailable", lang)}</p>
        </div>
        <div className="rounded-lg border border-white/5 bg-[#171E24]/60 p-3">
          <div className="font-bold text-slate-300 mb-1">{isZh ? "備援 / 警示" : "Fallback / Warnings"}</div>
          <p className="text-slate-400 leading-relaxed">{status.fallbackUsed ? translateText(status.fallbackReason, lang) : (isZh ? "未使用 fallback；目前為 CME 官方 EOD 盤前地圖。" : "No fallback used; current model is CME official EOD map.")}</p>
          {status.sourceWarnings?.length > 0 && <ul className="mt-2 space-y-1 text-[11px] text-amber-200 list-disc list-inside">{status.sourceWarnings.slice(0, 4).map((w, i) => <li key={i}>{translateText(w, lang)}</li>)}</ul>}
        </div>
      </div>
    </section>
  );
};

function Tile({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "muted" }) {
  return <div className="rounded-lg border border-white/5 bg-[#171E24]/60 p-3"><span className="block text-[9px] uppercase text-slate-500 mb-1">{label}</span><span className={`${tone === "good" ? "text-[#2DD4A7]" : tone === "muted" ? "text-slate-500" : "text-slate-200"} font-bold break-words`}>{value}</span></div>;
}
