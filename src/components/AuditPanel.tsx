/** Reconciliation ledger built from the actual providers used in a snapshot. */
import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Database, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { DailyReport, DataReconciliation } from "../types";
import { translateText } from "../utils/displayText";

interface AuditPanelProps {
  proxy: string;
  date: string;
  lang?: "zh" | "en";
  report?: DailyReport | null;
}

const sourceLabel = (source: string) => {
  const labels: Record<string, string> = {
    marketdata: "MarketData.app",
    yahoo: "Yahoo Finance",
    fred: "FRED",
  };
  return labels[source] || source;
};

export const AuditPanel: React.FC<AuditPanelProps> = ({ proxy, date, lang = "zh", report }) => {
  const [records, setRecords] = useState<DataReconciliation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "conflict" | "consensus">("all");
  const [searchStrike, setSearchStrike] = useState("");
  const isZh = lang === "zh";

  const load = async () => {
    if (!proxy || !date) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/reconciliation?proxy=${encodeURIComponent(proxy)}&date=${encodeURIComponent(date)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load reconciliation records");
      setRecords(payload);
    } catch (err: any) {
      setError(err?.message || "Unable to load reconciliation records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [proxy, date]);

  const sources = useMemo(() => {
    const sourceSet = new Set<string>();
    records.forEach((record) => Object.keys(record.source_values_json || {}).forEach((source) => sourceSet.add(source)));
    return [...sourceSet].sort((a, b) => a.localeCompare(b));
  }, [records]);

  const filtered = records.filter((record) => {
    const filterMatch = filter === "all" || record.status === filter;
    return filterMatch && (!searchStrike || String(record.strike).includes(searchStrike));
  });
  const conflicts = records.filter((record) => record.status === "conflict").length;
  const consensusRate = records.length ? Math.round(((records.length - conflicts) / records.length) * 100) : 0;
  const cmeAudit = report?.data_mode === "CME_PG40" ? report.cme_audit : null;

  if (cmeAudit) {
    return (
      <div id="cme-official-import-audit-panel" className="glass-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6 border-b border-white/5 pb-5">
          <div>
            <h3 className="font-display font-bold text-base text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-[#2DD4A7]" />
              {isZh ? "CME 官方資料匯入狀態" : "CME Official Import Status"}
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              {isZh
                ? "單一官方來源：CME PG40。目前無第二 NQ futures options 來源可做逐合約 OI 比對；NDX proxy 僅用於水位共振，不參與 OI 共識率。"
                : "Single official source: CME PG40. There is no second NQ futures options source for contract-level OI reconciliation; NDX proxy is confluence only."}
            </p>
          </div>
          <span className="text-[10px] font-mono text-[#2DD4A7] bg-[#2DD4A7]/10 border border-[#2DD4A7]/20 rounded-full px-3 py-1">{isZh ? "CME 官方 EOD" : "CME Official EOD"}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
          <Metric label={isZh ? "CME 交易日" : "CME trade date"} value={cmeAudit.tradeDate} note={isZh ? "已匹配 Dashboard 日期" : "Dashboard date matched"} tone="good" />
          <Metric label={isZh ? "標的合約" : "Underlying contract"} value={cmeAudit.underlyingContract} note="CME futures options" tone="neutral" />
          <Metric label={isZh ? "期貨結算價" : "Futures settlement"} value={String(cmeAudit.futuresSettlement)} note="Black-76 forward" tone="neutral" />
          <Metric label={isZh ? "解析合約數" : "Parsed contracts"} value={cmeAudit.parsedContractsCount.toLocaleString()} note="PG40 rows" tone="neutral" />
          <Metric label={isZh ? "到期日群組" : "Expiry groups"} value={String(cmeAudit.expiryGroupsCount)} note="Multi-expiration" tone="neutral" />
          <Metric label={isZh ? "Call 總 OI" : "Total Call OI"} value={cmeAudit.totalCallOi.toLocaleString()} note={isZh ? "官方 OI" : "Official OI"} tone="neutral" />
          <Metric label={isZh ? "Put 總 OI" : "Total Put OI"} value={cmeAudit.totalPutOi.toLocaleString()} note={isZh ? "官方 OI" : "Official OI"} tone="neutral" />
          <Metric label={isZh ? "總成交量" : "Total Volume"} value={cmeAudit.totalVolume.toLocaleString()} note="CME volume" tone="neutral" />
        </div>
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs font-mono">
          <div className="rounded-lg border border-white/5 bg-[#171E24]/60 p-3"><span className="block text-[9px] uppercase text-slate-500 mb-1">{isZh ? "PDF 雜湊" : "PDF hash"}</span><span className="text-slate-300 break-all">{cmeAudit.pdfHash || "—"}</span></div>
          <div className="rounded-lg border border-white/5 bg-[#171E24]/60 p-3"><span className="block text-[9px] uppercase text-slate-500 mb-1">{isZh ? "匯入時間 / 解析器" : "Import timestamp / Parser"}</span><span className="text-slate-300 break-all">{cmeAudit.importTimestamp || "—"} · {cmeAudit.parserVersion || "—"}</span></div>
        </div>
        {cmeAudit.warnings?.length > 0 && <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-[11px] text-amber-100 space-y-1">{cmeAudit.warnings.map((w, i) => <div key={i}>• {translateText(w, lang)}</div>)}</div>}
      </div>
    );
  }

  return (
    <div id="reconciliation-audit-panel" className="glass-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6 border-b border-white/5 pb-5">
        <div>
          <h3 className="font-display font-bold text-base text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-[#2DD4A7]" />
            {isZh ? "資料來源核對帳本" : "Data Reconciliation Ledger"}
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            {isZh
              ? "此快照只顯示實際成功取得的資料來源與 OI 核對結果。OI 差異超過 10% 會標示為衝突；此模型為公開 OI 的 GEX proxy，並非 Dealer 實際持倉。"
              : "This snapshot shows only providers that actually returned data. OI differences above 10% are flagged. This is an OI-based GEX proxy, not a direct view of dealer inventory."}
          </p>
        </div>
        <div className="bg-[#171E24]/60 p-3 rounded-lg border border-white/5 text-[10px] font-mono space-y-1 min-w-[190px]">
          <span className="text-slate-400 font-bold block uppercase mb-1">{isZh ? "本快照可用來源" : "Sources in this snapshot"}</span>
          {sources.length ? sources.map((source) => (
            <div key={source} className="flex items-center gap-1.5 text-[#2DD4A7]">
              <span className="font-bold">•</span> {sourceLabel(source)}
            </div>
          )) : <div className="text-slate-500">{isZh ? "尚無可用資料" : "No source data"}</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 text-xs font-mono">
        <Metric label={isZh ? "數據共識率" : "Consensus health"} value={`${consensusRate}%`} note={isZh ? "OI 容差：10%" : "OI tolerance: 10%"} tone={consensusRate >= 90 ? "good" : "warn"} />
        <Metric label={isZh ? "已核對合約" : "Contracts audited"} value={String(records.length)} note={isZh ? "僅限這次快照" : "Current snapshot only"} tone="neutral" />
        <Metric label={isZh ? "OI 差異" : "OI conflicts"} value={String(conflicts)} note={isZh ? "由主來源優先解析" : "Resolved using source priority"} tone={conflicts ? "warn" : "good"} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 bg-[#171E24]/60 p-3 rounded-lg border border-white/5 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-300">{isZh ? "篩選：" : "Filter:"}</span>
          <div className="flex rounded-md overflow-hidden border border-white/5 font-sans">
            {(["all", "conflict", "consensus"] as const).map((item) => (
              <button key={item} onClick={() => setFilter(item)} className={`px-3 py-1.5 transition-colors cursor-pointer ${filter === item ? "bg-indigo-500 text-white font-bold" : "bg-[#12161A] text-slate-400 hover:text-white"}`}>
                {item === "all" ? (isZh ? "全部" : "All") : item === "conflict" ? (isZh ? `衝突 (${conflicts})` : `Conflicts (${conflicts})`) : (isZh ? "共識" : "Consensus")}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={searchStrike} onChange={(event) => setSearchStrike(event.target.value)} placeholder={isZh ? "搜尋履約價" : "Search strike"} className="bg-[#12161A] border border-white/5 text-xs rounded-md pl-9 pr-3 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono" />
          </div>
          <button onClick={load} className="p-1.5 rounded border border-white/5 bg-[#12161A] text-slate-400 hover:text-white" title={isZh ? "重新讀取" : "Reload"}><RefreshCw className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {loading ? <Loading text={isZh ? "讀取快照核對紀錄..." : "Loading snapshot reconciliation..."} /> : error ? <Failure text={error} lang={isZh ? "zh" : "en"} /> : !filtered.length ? (
        <div className="h-48 border border-dashed border-[#232D36] rounded-lg flex flex-col items-center justify-center text-center"><ShieldCheck className="w-8 h-8 text-slate-500 mb-2" /><span className="text-xs text-slate-400">{isZh ? "此篩選條件沒有紀錄。" : "No records match this filter."}</span></div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#232D36]">
          <table className="w-full text-left font-mono text-xs select-none">
            <thead className="bg-[#161C22] text-slate-400 border-b border-[#232D36]"><tr>
              <th className="p-3">{isZh ? "到期日" : "Expiry"}</th><th className="p-3 text-center">{isZh ? "履約價" : "Strike"}</th><th className="p-3 text-center">{isZh ? "類型" : "Type"}</th>
              {sources.map((source) => <th key={source} className="p-3">{sourceLabel(source)} OI</th>)}
              <th className="p-3 text-center">{isZh ? "狀態" : "Status"}</th><th className="p-3 text-right">{isZh ? "解析 OI" : "Resolved OI"}</th><th className="p-3 text-right">{isZh ? "採信來源" : "Resolved source"}</th>
            </tr></thead>
            <tbody className="divide-y divide-[#1D252C] bg-[#12161A]/40">
              {filtered.slice(0, 100).map((record, index) => {
                const conflict = record.status === "conflict";
                return <tr key={`${record.expiry}-${record.strike}-${record.option_type}-${index}`} className={`hover:bg-[#161C22]/50 ${conflict ? "bg-amber-500/[0.02]" : ""}`}>
                  <td className="p-3 text-slate-400">{record.expiry}</td><td className="p-3 text-center font-bold text-slate-200">{record.strike}</td>
                  <td className="p-3 text-center"><span className={`inline-block px-1.5 py-0.5 text-[9px] rounded font-bold uppercase ${record.option_type === "call" ? "text-[#2DD4A7] bg-[#2DD4A7]/5" : "text-[#F2545B] bg-[#F2545B]/5"}`}>{record.option_type}</span></td>
                  {sources.map((source) => <td key={source} className="p-3 text-slate-300">{record.source_values_json[source]?.oi?.toLocaleString() ?? "—"}</td>)}
                  <td className="p-3 text-center"><span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded font-bold uppercase font-sans ${conflict ? "text-amber-500 bg-amber-500/10" : "text-emerald-400 bg-emerald-400/10"}`}>{conflict ? <AlertTriangle className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}{conflict ? (isZh ? "衝突" : "Conflict") : (isZh ? "共識" : "Consensus")}</span></td>
                  <td className="p-3 text-right font-bold text-white">{record.resolved_value.oi.toLocaleString()}</td><td className="p-3 text-right"><span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase text-amber-400 bg-amber-400/5">{sourceLabel(record.resolved_source)}</span></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      )}
      {filtered.length > 100 && <div className="text-center text-slate-500 text-[10px] mt-3">{isZh ? "顯示前 100 筆；請用履約價或狀態篩選。" : "Showing first 100 records; use filters to narrow results."}</div>}
    </div>
  );
};

function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone: "good" | "warn" | "neutral" }) {
  const color = tone === "good" ? "text-[#2DD4A7]" : tone === "warn" ? "text-[#F2A93B]" : "text-white";
  return <div className="bg-[#171E24]/60 border border-white/5 rounded-lg p-4"><span className="text-[10px] text-slate-500 uppercase block">{label}</span><div className="flex items-baseline gap-2 mt-1"><span className={`text-2xl font-bold ${color}`}>{value}</span></div><p className="text-[9px] text-slate-500 mt-1 font-sans">{note}</p></div>;
}
function Loading({ text }: { text: string }) { return <div className="h-64 flex flex-col items-center justify-center gap-3"><RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" /><span className="text-xs font-mono text-slate-400">{text}</span></div>; }
function Failure({ text, lang }: { text: string; lang: "zh" | "en" }) { return <div className="h-64 bg-[#1B1213] border border-red-500/20 rounded-lg flex flex-col items-center justify-center p-6 text-center"><AlertTriangle className="w-8 h-8 text-[#F2545B] mb-2" /><span className="text-sm font-bold text-white mb-1">{lang === "zh" ? "資料讀取失敗" : "Data loading failed"}</span><span className="text-xs text-red-300 font-mono max-w-full break-words">{text}</span></div>; }
