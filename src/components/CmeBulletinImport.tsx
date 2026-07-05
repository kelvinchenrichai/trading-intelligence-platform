import React, { useEffect, useState } from "react";
import { FileUp, LoaderCircle, ShieldAlert, CheckCircle2, Database } from "lucide-react";
import { StoredCmeImport } from "../cme/types";

type Props = { onImported?: () => void };

export function CmeBulletinImport({ onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [imports, setImports] = useState<StoredCmeImport[]>([]);

  const loadImports = async () => {
    try {
      const response = await fetch("/api/cme/imports");
      if (response.ok) setImports(await response.json());
    } catch { /* Import history is supplementary. */ }
  };

  useEffect(() => { loadImports(); }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file || !token.trim()) {
      setMessage({ type: "error", text: "請選擇 CME Section 40 PDF，並輸入你的私用 Refresh Token。" });
      return;
    }
    const form = new FormData();
    form.append("bulletin", file);
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/cme/import", { method: "POST", headers: { "x-refresh-token": token.trim() }, body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "CME import failed.");
      setMessage({ type: "ok", text: `已解析並保存 ${result.contractCount.toLocaleString()} 筆 NQ options rows；資料日：${result.tradeDate}。` });
      setFile(null);
      await loadImports();
      onImported?.();
    } catch (error: any) {
      setMessage({ type: "error", text: error?.message || "上傳失敗。請確認檔案是 CME PG40 與 Token 正確。" });
    } finally {
      setLoading(false);
    }
  };

  return <section className="max-w-7xl mx-auto px-6 py-10 w-full">
    <div className="rounded-2xl border border-cyan-400/15 bg-[#10181c] p-6 shadow-xl">
      <div className="flex flex-wrap gap-4 items-start justify-between">
        <div>
          <p className="text-xs font-mono tracking-widest text-cyan-300 uppercase">CME official EOD import</p>
          <h2 className="text-2xl font-bold mt-2">NQ Futures Options · Daily Bulletin PG40</h2>
          <p className="text-sm text-slate-400 mt-2 max-w-3xl">每天由你自行從 CME 下載「Nasdaq 100 and E-mini Nasdaq 100 Options – PG40」PDF，再上傳。平台會解析 NQ futures options 的 OI、settlement、volume、CME delta、expiry group 並保存至 Supabase。</p>
        </div>
        <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-xs text-amber-100 max-w-md">
          <span className="font-semibold">研究版提醒：</span> weekly/daily expiry 目前標示為 estimated；在 contract-calendar 校正完成前，GEX 不能視為最終交易訊號。
        </div>
      </div>

      <form onSubmit={submit} className="mt-6 grid gap-4 md:grid-cols-[1fr_1fr_auto] items-end">
        <label className="block">
          <span className="text-xs text-slate-400">CME PG40 PDF</span>
          <input className="mt-1 block w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm" type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
        <label className="block">
          <span className="text-xs text-slate-400">Private Refresh Token（不保存於伺服器／GitHub）</span>
          <input className="mt-1 block w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="你的 REFRESH_API_TOKEN" autoComplete="off" />
        </label>
        <button disabled={loading} className="rounded-lg bg-cyan-300 text-slate-950 px-5 py-2.5 font-semibold text-sm disabled:opacity-60 flex gap-2 items-center justify-center">
          {loading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />} {loading ? "解析與保存中" : "上傳並匯入"}
        </button>
      </form>
      {message && <div className={`mt-4 rounded-lg px-4 py-3 text-sm ${message.type === "ok" ? "bg-emerald-400/10 text-emerald-200" : "bg-red-400/10 text-red-200"}`}>{message.type === "ok" ? <CheckCircle2 className="inline w-4 h-4 mr-2" /> : <ShieldAlert className="inline w-4 h-4 mr-2" />}{message.text}</div>}

      <div className="mt-8">
        <h3 className="font-semibold flex items-center gap-2"><Database className="w-4 h-4 text-cyan-300" />已匯入 CME 資料</h3>
        {!imports.length ? <p className="text-sm text-slate-500 mt-3">尚未匯入任何 CME PG40 PDF。</p> : <div className="mt-3 overflow-x-auto"><table className="min-w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="pb-2 pr-5">Trade date</th><th className="pb-2 pr-5">Underlying</th><th className="pb-2 pr-5">Settlement</th><th className="pb-2 pr-5">Rows</th><th className="pb-2">File</th></tr></thead><tbody>{imports.map((item) => <tr key={item.id} className="border-t border-white/5 text-slate-200"><td className="py-2 pr-5 font-mono">{item.tradeDate}</td><td className="py-2 pr-5 font-mono">{item.underlyingContract}</td><td className="py-2 pr-5">{item.futuresSettlement.toLocaleString()}</td><td className="py-2 pr-5">{item.contractCount.toLocaleString()}</td><td className="py-2 text-slate-400 truncate max-w-[22rem]">{item.fileName}</td></tr>)}</tbody></table></div>}
      </div>
    </div>
  </section>;
}
