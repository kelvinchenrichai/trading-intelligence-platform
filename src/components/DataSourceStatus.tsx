import React from "react";
import { AlertTriangle, Database, Radio, ShieldCheck } from "lucide-react";
import { DailyReport } from "../types";

export const DataSourceStatus: React.FC<{ report: DailyReport; lang?: "zh" | "en" }> = ({ report, lang = "zh" }) => {
  const isZh = lang === "zh";
  const status = report.source_status;
  if (!status) return null;
  const isCme = status.dataMode === "CME_PG40";
  const tone = isCme ? "text-[#2DD4A7] border-[#2DD4A7]/25 bg-[#2DD4A7]/10" : "text-[#F2A93B] border-[#F2A93B]/25 bg-[#F2A93B]/10";
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
          {status.currentModel}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 text-xs font-mono">
        <Tile label={isZh ? "Dashboard Date" : "Dashboard Date"} value={status.dashboardDate || "—"} />
        <Tile label={isZh ? "Primary Source" : "Primary Source"} value={status.primarySource} />
        <Tile label={isZh ? "Data Mode" : "Data Mode"} value={status.dataMode} />
        <Tile label={isZh ? "CME Trade Date" : "CME Trade Date"} value={status.cmeTradeDate || "—"} tone={isCme ? "good" : "muted"} />
        <Tile label={isZh ? "Underlying" : "Underlying"} value={status.cmeUnderlying || status.proxy?.instrument || "—"} />
        <Tile label={isZh ? "Futures Settlement" : "Futures Settlement"} value={status.cmeFuturesSettlement ? String(status.cmeFuturesSettlement) : "—"} />
        <Tile label={isZh ? "Contracts Parsed" : "Contracts Parsed"} value={status.cmeContractsParsed?.toLocaleString() || "—"} />
        <Tile label={isZh ? "Expiry Groups" : "Expiry Groups"} value={status.cmeExpiryGroups?.toString() || "—"} />
        <Tile label={isZh ? "Import Timestamp" : "Import Timestamp"} value={status.cmeImportTimestamp || "—"} />
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg border border-white/5 bg-[#171E24]/60 p-3">
          <div className="flex items-center gap-2 text-slate-300 font-bold mb-1"><Radio className="w-3.5 h-3.5 text-indigo-400" />Session Flow</div>
          <p className="text-slate-400 leading-relaxed">{status.sessionFlow?.note || "Unavailable"}</p>
        </div>
        <div className="rounded-lg border border-white/5 bg-[#171E24]/60 p-3">
          <div className="font-bold text-slate-300 mb-1">{isZh ? "Fallback / Warnings" : "Fallback / Warnings"}</div>
          <p className="text-slate-400 leading-relaxed">{status.fallbackUsed ? status.fallbackReason : (isZh ? "未使用 fallback；目前為 CME 官方 EOD 盤前地圖。" : "No fallback used; current model is CME official EOD map.")}</p>
          {status.sourceWarnings?.length > 0 && <ul className="mt-2 space-y-1 text-[11px] text-amber-200 list-disc list-inside">{status.sourceWarnings.slice(0, 4).map((w, i) => <li key={i}>{w}</li>)}</ul>}
        </div>
      </div>
    </section>
  );
};

function Tile({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "muted" }) {
  return <div className="rounded-lg border border-white/5 bg-[#171E24]/60 p-3"><span className="block text-[9px] uppercase text-slate-500 mb-1">{label}</span><span className={`${tone === "good" ? "text-[#2DD4A7]" : tone === "muted" ? "text-slate-500" : "text-slate-200"} font-bold break-words`}>{value}</span></div>;
}
