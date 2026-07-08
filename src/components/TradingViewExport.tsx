import React, { useState } from "react";
import { Check, Clipboard, RadioTower } from "lucide-react";
import { DailyReport } from "../types";

export const TradingViewExport: React.FC<{ report: DailyReport | null; lang?: "zh" | "en" }> = ({ report, lang = "zh" }) => {
  const isZh = lang === "zh";
  if (!report?.tradingview_payloads) {
    return <div className="glass-card p-8 text-center text-slate-400 text-sm">{isZh ? "目前沒有可輸出的 TradingView payload。請先產生 Daily Report。" : "No TradingView payload is available yet."}</div>;
  }
  const p = report.tradingview_payloads;
  return (
    <section className="space-y-6">
      <div className="glass-card p-5 border-l-4 border-[#2DD4A7]/70">
        <h2 className="font-display font-bold text-base text-white flex items-center gap-2"><RadioTower className="w-5 h-5 text-[#2DD4A7]" />TradingView Export</h2>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed max-w-3xl">{isZh ? "TradingView 只負責即時價格觸發、5m close、VWAP / BOS / Wall Flip 與 webhook 回傳；不在 Pine 內重新計算 CME options gamma。" : "TradingView handles realtime price confirmation, 5m close, VWAP / BOS / Wall Flip and webhook callbacks; CME gamma is not recalculated inside Pine."}</p>
      </div>
      <PayloadBlock title="Format 1 · Simple CSV" body={p.simpleCsv} lang={lang} />
      <PayloadBlock title="Format 2 · Key=Value" body={p.keyValue} lang={lang} />
      <PayloadBlock title="Format 3 · Compact Engine Payload" body={p.compact} lang={lang} />
      <div className="glass-card p-5 text-xs text-slate-300 leading-relaxed">
        <div className="font-bold text-white mb-2">{isZh ? "Webhook 端點" : "Webhook endpoint"}</div>
        <code className="block bg-[#0F1419] border border-white/5 rounded p-3 text-[#2DD4A7]">POST /api/tradingview/webhook</code>
        <p className="mt-3 text-slate-400">{isZh ? "Alert JSON 必須包含 secret、event、levelType、level、price、modelDate、underlying、dataMode。後端會驗證 TV_WEBHOOK_SECRET 後寫入 Supabase tradingview_events。" : "Alert JSON must include secret, event, levelType, level, price, modelDate, underlying and dataMode. The backend validates TV_WEBHOOK_SECRET before writing to Supabase tradingview_events."}</p>
        <pre className="mt-3 overflow-x-auto bg-[#0F1419] border border-white/5 rounded p-3 text-[11px] text-slate-300">{JSON.stringify({ secret: "TV_WEBHOOK_SECRET", source: "tradingview", symbol: "{{ticker}}", interval: "{{interval}}", event: "CALL_WALL_BREAKOUT_2X5M", side: "up", levelType: "CALL_WALL", level: report.gamma.call_walls[0]?.strike, price: "{{close}}", time: "{{timenow}}", modelDate: report.source_status?.dashboardDate || report.as_of.slice(0,10), underlying: report.source_status?.cmeUnderlying || report.proxy, dataMode: report.data_mode || "CME_PG40" }, null, 2)}</pre>
      </div>
    </section>
  );
};

function PayloadBlock({ title, body, lang }: { title: string; body: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  const isZh = lang === "zh";
  const copy = async () => {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return <div className="glass-card p-5"><div className="flex items-center justify-between gap-3 mb-3"><h3 className="font-display font-bold text-sm text-white">{title}</h3><button onClick={copy} className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-[#2DD4A7] text-black text-xs font-bold hover:brightness-110">{copied ? <Check className="w-3.5 h-3.5" /> : <Clipboard className="w-3.5 h-3.5" />}{copied ? (isZh ? "已複製" : "Copied") : (isZh ? "複製" : "Copy")}</button></div><pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-white/5 bg-[#0F1419] p-3 text-[11px] text-slate-300 font-mono">{body}</pre></div>;
}
