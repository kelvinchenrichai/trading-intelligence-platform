/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  TrendingUp, 
  Activity, 
  Database, 
  RefreshCw, 
  Sparkles, 
  Columns, 
  Maximize2,
  Lock,
  ExternalLink,
  ShieldCheck,
  Globe,
  LayoutDashboard,
  Target,
  FileText,
  Info,
  Download,
  Menu,
  X
} from "lucide-react";
import { ApplicationStatus, Instrument, DailyReport } from "./types";
import { ReportCard } from "./components/ReportCard";
import { GexChart } from "./components/GexChart";
import { AuditPanel } from "./components/AuditPanel";
import { HistoryReview } from "./components/HistoryReview";
import { BacktestValidation } from "./components/BacktestValidation";
import { CmeBulletinImport } from "./components/CmeBulletinImport";
import { SidebarNav, BottomNav } from "./components/PageNav";
import { CmeDownloadLinks } from "./components/CmeDownloadLinks";
import { AuthButton } from "./components/AuthButton";
import { LoginPage } from "./components/LoginPage";
import { useAuth } from "./auth";
import { translations } from "./utils/translations";

export default function App() {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [activeInst, setActiveInst] = useState<string>("NQ");
  const [viewMode, setViewMode] = useState<"single" | "parallel">("single");
  const [activeDate, setActiveDate] = useState<string>("");
  const [report, setReport] = useState<DailyReport | null>(null);
  const [parallelReport, setParallelReport] = useState<DailyReport | null>(null); // For ES in parallel mode
  const [loading, setLoading] = useState<boolean>(true);
  const [scraping, setScraping] = useState<boolean>(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState<boolean>(false);
  const [scrapingSuccessMessage, setScrapingSuccessMessage] = useState<string | null>(null);
  const [dataMessage, setDataMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [appStatus, setAppStatus] = useState<ApplicationStatus | null>(null);
  
  // App-wide language configuration defaulting to traditional Chinese ("zh")
  const [lang, setLang] = useState<"zh" | "en">("zh");

  // 認證狀態 (Google 登入)。role: admin(最高權限) / member / guest
  const auth = useAuth();
  const isAdmin = auth.role === "admin";

  // Sidebar / bottom-nav active page. 四個分頁:dashboard/backtest/cme/about
  const [activePage, setActivePage] = useState<"dashboard" | "backtest" | "cme" | "about">("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState<boolean>(false);

  const t = translations[lang];

  // Fetch instruments and the honest runtime status on mount.
  const loadStatus = async () => {
    try {
      const response = await fetch("/api/health");
      const payload: ApplicationStatus = await response.json();
      setAppStatus(payload);
    } catch (error) {
      console.error("Failed to load application status", error);
    }
  };

  useEffect(() => {
    const loadInstruments = async () => {
      try {
        const res = await fetch("/api/instruments");
        const data = await res.json();
        setInstruments(data);
      } catch (e) {
        console.error("Failed to load instruments", e);
      }
    };
    loadInstruments();
    loadStatus();
  }, []);

  // Fetch the latest verified report. Empty data is rendered as an explicit status, never as a fake dashboard.
  const fetchReport = async (instrumentCode: string, dateStr: string = "") => {
    setLoading(true);
    try {
      const url = `/api/daily-report?instrument=${encodeURIComponent(instrumentCode)}${dateStr ? `&date=${encodeURIComponent(dateStr)}` : ""}`;
      const res = await fetch(url);
      const payload = await res.json();
      if (!res.ok) {
        setReport(null);
        if (payload.status) setAppStatus(payload.status);
        setDataMessage({ type: "error", text: payload.error || (lang === "zh" ? "目前沒有可驗證的資料快照。" : "No verified data snapshot is available.") });
        return;
      }
      const data = payload as DailyReport;
      setReport(data);
      setDataMessage(null);
      if (!dateStr) setActiveDate(data.as_of.split("T")[0]);
    } catch (error) {
      console.error("Failed to load report", error);
      setReport(null);
      setDataMessage({ type: "error", text: lang === "zh" ? "無法讀取報告。請檢查 API 與部署日誌。" : "Unable to read the report. Check the API and deployment logs." });
    } finally {
      setLoading(false);
    }
  };

  // Fetch second report for Parallel View (NQ is activeInst, ES is parallel report)
  const fetchParallelReport = async (dateStr: string) => {
    try {
      const url = `/api/daily-report?instrument=ES&date=${dateStr}`;
      const res = await fetch(url);
      if (res.ok) {
        const data: DailyReport = await res.json();
        setParallelReport(data);
      }
    } catch (e) {
      console.error("Failed to load parallel report", e);
    }
  };

  useEffect(() => {
    if (activeInst) {
      fetchReport(activeInst, activeDate);
    }
  }, [activeInst, activeDate]);

  useEffect(() => {
    if (viewMode === "parallel" && activeDate) {
      fetchParallelReport(activeDate);
    }
  }, [viewMode, activeDate]);

  // Manual refresh is intentionally protected in production. Railway Cron is the normal refresh path.
  const triggerScrape = async () => {
    setScraping(true);
    setScrapingSuccessMessage(null);
    setDataMessage(null);
    try {
      const res = await fetch("/api/trigger-scrape", { method: "POST" });
      const result = await res.json();
      if (!res.ok || !result.success) {
        const detail = result.warnings?.join(" ") || result.error || (lang === "zh" ? "刷新失敗。" : "Refresh failed.");
        setDataMessage({ type: "error", text: detail });
        await loadStatus();
        return;
      }
      const warningText = result.warnings?.length ? ` ${result.warnings.join(" ")}` : "";
      const zhMsg = `已完成 EOD 資料快照：${result.date}。${result.persisted ? "已保存至資料庫。" : "警告：目前未保存至資料庫。"}${warningText}`;
      const enMsg = `EOD snapshot completed: ${result.date}. ${result.persisted ? "Saved to database." : "Warning: not persisted."}${warningText}`;
      setScrapingSuccessMessage(lang === "zh" ? zhMsg : enMsg);
      setDataMessage({ type: "success", text: lang === "zh" ? "資料快照更新完成。" : "Snapshot updated." });
      setActiveDate(result.date);
      await loadStatus();
      if (activeInst) fetchReport(activeInst, result.date);
    } catch (error) {
      console.error("Refresh execution error", error);
      setDataMessage({ type: "error", text: lang === "zh" ? "刷新請求失敗。請檢查 API 與部署日誌。" : "Refresh request failed. Check the API and deployment logs." });
    } finally {
      setScraping(false);
      window.setTimeout(() => setScrapingSuccessMessage(null), 7000);
    }
  };

  // Status dot helper
  const getConfidenceBadgeColor = (conf: string) => {
    switch (conf) {
      case "high":
        return "bg-[#2DD4A7]";
      case "medium":
        return "bg-[#F2A93B]";
      case "low":
      default:
        return "bg-[#F2545B]";
    }
  };

  // 會員制:未登入時整頁顯示登入頁,登入後才進入主系統。
  // auth 載入中先顯示簡單載入畫面,避免閃爍。
  if (auth.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0E12] text-slate-400 font-mono text-sm">
        {lang === "zh" ? "載入中…" : "Loading…"}
      </div>
    );
  }
  if (!auth.user) {
    return <LoginPage lang={lang} auth={auth} />;
  }

  return (
    <div className="min-h-screen bg-[#0B0E0D] text-slate-100 font-sans flex flex-col justify-between">
      
      {/* 1. Header & Navigation */}
      <header className="border-b border-white/5 bg-[#12161A]/90 sticky top-0 z-50 backdrop-blur-md px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          
          {/* Logo & Platform Info */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-[#2DD4A7] to-[#1E5F74] flex items-center justify-center font-display font-extrabold text-[#0B0E0D] shadow-lg shadow-emerald-500/10 select-none">
              TIP
            </div>
            <div>
              <h1 className="font-display font-bold text-lg leading-tight tracking-tight text-white flex items-center gap-2">
                Trading Intelligence Platform (TIP)
                <span className="text-[10px] font-mono text-[#2DD4A7] bg-[#2DD4A7]/10 border border-[#2DD4A7]/20 px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">
                  NQ & ES V1
                </span>
              </h1>
              <p className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5 mt-0.5">
                <Database className="w-3 h-3 text-emerald-400" /> 
                {lang === "zh" ? "EOD／延遲研究快照狀態：" : "Delayed / EOD research snapshot: "}
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${appStatus?.service === "ok" ? "bg-[#2DD4A7]" : appStatus?.service === "unconfigured" ? "bg-slate-500" : "bg-[#F2A93B]"}`} />
                {appStatus?.latestSnapshotDate ? `${appStatus.latestSnapshotDate} · ${appStatus.persistence === "durable" ? "PERSISTED" : "MEMORY ONLY"}` : (lang === "zh" ? "尚無快照" : "NO SNAPSHOT")}
              </p>
            </div>
          </div>

          {/* Trigger Scraping & Language Selector & PRO Upgrade */}
          <div className="flex items-center gap-3">
            
            {/* Language Selector Pill */}
            <div className="flex items-center bg-[#171E24] border border-white/5 p-0.5 rounded-lg font-mono text-[10px] mr-1.5 shadow-inner">
              <div className="p-1 text-slate-500 flex items-center justify-center mr-0.5">
                <Globe className="w-3.5 h-3.5" />
              </div>
              <button 
                onClick={() => setLang("zh")}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer font-bold ${
                  lang === "zh" 
                    ? "bg-[#2DD4A7] text-black" 
                    : "text-slate-400 hover:text-white"
                }`}
              >
                繁中
              </button>
              <button 
                onClick={() => setLang("en")}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer font-bold ${
                  lang === "en" 
                    ? "bg-[#2DD4A7] text-black" 
                    : "text-slate-400 hover:text-white"
                }`}
              >
                EN
              </button>
            </div>

            {/* Manual snapshot action; protected by default in production. */}
            {/* Manual snapshot: 限最高權限,避免訪客消耗 API 額度 */}
            {isAdmin && (
            <button
              onClick={triggerScrape}
              disabled={scraping}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-[#2DD4A7] text-black hover:brightness-110 active:scale-95 disabled:opacity-50 px-4 py-2 rounded-lg font-sans font-bold text-xs transition-all shadow-md shadow-emerald-500/10 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scraping ? "animate-spin" : ""}`} />
              <span>{scraping ? (lang === "zh" ? "更新快照中..." : "Refreshing...") : (lang === "zh" ? "更新 EOD 快照" : "Refresh EOD Snapshot")}</span>
            </button>
            )}

            {/* Google 登入 / 使用者選單 */}
            <AuthButton lang={lang} auth={auth} />

            {/* Simulated Premium unlock */}
            <button 
              onClick={() => setShowSubscriptionModal(true)}
              className="flex items-center gap-1.5 bg-[#1C242B] hover:bg-slate-800 border border-white/5 text-indigo-300 hover:text-white px-3.5 py-2 rounded-lg text-xs font-semibold font-sans cursor-pointer transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>{t.joinPro}</span>
            </button>
          </div>

        </div>
      </header>

      {/* 2. Main Desk Layout */}
      <main className="max-w-7xl mx-auto w-full px-6 py-6 flex-grow flex gap-6 pb-24 lg:pb-6">

        {/* Desktop left sidebar */}
        <SidebarNav active={activePage} onChange={setActivePage} lang={lang} />

        {/* Page content column */}
        <div className="flex-grow min-w-0 space-y-6">
        
        {/* Scraper Notification Banner */}
        <AnimatePresence>
          {scrapingSuccessMessage && (
            <motion.div 
              initial={{ opacity: 0, y: -15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-[#1D3227] border border-emerald-500/30 text-emerald-200 px-4 py-3 rounded-lg text-xs font-mono flex items-center gap-2.5 shadow-xl"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>{scrapingSuccessMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {dataMessage && (
          <div className={`border px-4 py-3 rounded-lg text-xs font-mono ${dataMessage.type === "error" ? "bg-[#1B1213] border-red-500/30 text-red-200" : "bg-[#1D3227] border-emerald-500/30 text-emerald-200"}`}>
            {dataMessage.text}
          </div>
        )}

        {appStatus && (appStatus.persistence !== "durable" || appStatus.warnings.length > 0) && (
          <div className="bg-amber-500/10 border border-amber-500/25 text-amber-100 px-4 py-3 rounded-lg text-xs leading-relaxed">
            <strong>{lang === "zh" ? "資料狀態：" : "Data status: "}</strong>
            {appStatus.persistence === "memory_only" ? (lang === "zh" ? "尚未連接 Supabase；任何快照在伺服器重啟後都會消失。" : "Supabase is not connected; snapshots will be lost after a restart.") : appStatus.warnings.slice(0, 2).join(" ")}
          </div>
        )}

        {/* ===== DASHBOARD PAGE ===== */}
        {activePage === "dashboard" && (
        <>
        {/* 2.1 Tab Bar and Layout Controllers */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
          
          {/* Instrument TABS */}
          <div className="flex items-center gap-2 bg-[#12161A] border border-white/5 p-1 rounded-lg">
            {instruments.map((inst) => {
              if (inst.code === "GC") {
                // Disabled option (GC COMEX Gold placeholder)
                return (
                  <div
                    key={inst.code}
                    className="px-4 py-1.5 text-slate-500 text-xs font-semibold cursor-not-allowed flex items-center gap-1.5 select-none relative group"
                    title={lang === "zh" ? "COMEX黃金期權鏈公共源加載中，敬請期待 V2！" : "COMEX Gold option chains lack direct public feeds. Coming soon!"}
                  >
                    <span>{inst.code}</span>
                    <span className="text-[8px] bg-slate-800 px-1 rounded text-slate-500 font-bold uppercase tracking-wider font-mono">Soon</span>
                    
                    {/* Hover tooltip explanation */}
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block bg-[#1B2127] border border-[#2C3843] text-slate-300 text-[10px] p-2 rounded shadow-2xl w-48 font-normal z-50">
                      {lang === "zh" 
                        ? "COMEX黃金 (GC) 期權解析管道已預留，預計在 V2 版本中與直連期貨券商 API 一同發佈。" 
                        : "COMEX Gold (GC) options pipeline is pre-configured but disabled. Launching in V2 with direct futures broker APIs."}
                    </div>
                  </div>
                );
              }

              const isActive = activeInst === inst.code && viewMode === "single";
              return (
                <button
                  key={inst.code}
                  onClick={() => {
                    setViewMode("single");
                    setActiveInst(inst.code);
                  }}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? "bg-[#2DD4A7] text-black shadow-md shadow-emerald-400/5"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {inst.code} <span className="text-[10px] opacity-75 font-normal">({inst.proxy})</span>
                </button>
              );
            })}
          </div>

          {/* View Mode Controllers */}
          <div className="flex items-center gap-2 bg-[#12161A] border border-white/5 p-1 rounded-lg">
            <button
              onClick={() => {
                setViewMode("single");
                setActiveInst("NQ");
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === "single"
                  ? "bg-indigo-500 text-white font-bold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>{lang === "zh" ? "單一標的聚焦" : "Single Focus"}</span>
            </button>
            <button
              onClick={() => {
                setViewMode("parallel");
                setActiveInst("NQ"); // Parallel mode locks NQ on left, ES on right
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === "parallel"
                  ? "bg-indigo-500 text-white font-bold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>{lang === "zh" ? "雙指標對比 (NQ vs ES)" : "Parallel Comparison (NQ vs ES)"}</span>
            </button>
          </div>

        </div>

        {/* 2.2 Global Status Strip */}
        {report && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 glass-card p-4 font-mono text-xs shadow-md">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              <div>
                <span className="text-[9px] text-slate-500 uppercase block">{lang === "zh" ? "分析日期" : "Report Date"}</span>
                <span className="text-slate-200 font-bold">{activeDate}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2 border-l border-white/5 pl-4">
              <div className={`w-2.5 h-2.5 rounded-full ${getConfidenceBadgeColor(report.data_confidence)}`} />
              <div>
                <span className="text-[9px] text-slate-500 uppercase block">{t.ledgerRating}</span>
                <span className="text-slate-200 font-bold uppercase">
                  {report.data_confidence === "high" ? t.confidenceHigh.split(" ")[0] : report.data_confidence === "medium" ? t.confidenceMedium.split(" ")[0] : t.confidenceLow.split(" ")[0]}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 border-l border-white/5 pl-4">
              <TrendingUp className="w-4 h-4 text-indigo-400" />
              <div>
                <span className="text-[9px] text-slate-500 uppercase block">{t.dxyIndex}</span>
                <span className="text-slate-200 font-bold">{report.macro.DXY}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 border-l border-white/5 pl-4">
              <Activity className="w-4 h-4 text-[#F2545B]" />
              <div>
                <span className="text-[9px] text-slate-500 uppercase block">{t.us10yYield}</span>
                <span className="text-slate-200 font-bold">{report.macro.US10Y}%</span>
              </div>
            </div>
          </div>
        )}

        {/* 2.3 Dashboard Workspace Container */}
        {loading ? (
          <div className="h-96 flex flex-col items-center justify-center gap-4">
            <RefreshCw className="w-10 h-10 text-indigo-400 animate-spin" />
            <span className="text-sm font-mono text-slate-400">{lang === "zh" ? "讀取已驗證的市場快照..." : "Loading verified market snapshots..."}</span>
          </div>
        ) : !report ? (
          <div className="h-80 border border-dashed border-[#2C3843] rounded-xl flex flex-col items-center justify-center gap-3 p-8 text-center">
            <Database className="w-10 h-10 text-slate-500" />
            <h2 className="font-display font-bold text-white">{lang === "zh" ? "尚無可用的資料快照" : "No verified snapshot available"}</h2>
            <p className="max-w-lg text-sm text-slate-400 leading-relaxed">{lang === "zh" ? "請先完成 Supabase、MarketData.app 與 FRED 設定，再從 Railway Cron 執行每日刷新。私人測試期間也可暫時開啟 ALLOW_PUBLIC_MANUAL_REFRESH。" : "Configure Supabase, MarketData.app and FRED, then run the Railway Cron refresh. For short private testing you may temporarily enable ALLOW_PUBLIC_MANUAL_REFRESH."}</p>
          </div>
        ) : viewMode === "single" ? (
          
          /* Single View Focus Workspace */
          <div className="space-y-6">
            {report && (
              <>
                {/* Core Report Cards */}
                <ReportCard report={report} lang={lang} />

                {/* GEX Divergent chart */}
                <GexChart 
                  gexData={report.gamma.gex_strikes} 
                  spotPrice={report.price.last} 
                  flipLevel={report.gamma.flip_level} 
                  lang={lang}
                />

                {/* Audit Reconciliation Ledger */}
                <AuditPanel proxy={report.proxy} date={activeDate} lang={lang} />
              </>
            )}
          </div>

        ) : (
          
          /* Parallel Side-by-Side NQ vs ES Workspace */
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* LEFT Column: NQ (NDX) */}
              <div className="space-y-6">
                <div className="flex items-center gap-2 bg-[#1B2127]/60 border border-white/5 p-3 rounded-lg font-display text-[#2DD4A7] font-bold text-xs uppercase tracking-wider">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#2DD4A7]" />
                  <h4>NASDAQ 100 Futures (NQ &rarr; NDX Index)</h4>
                </div>
                {report && (
                  <>
                    <ReportCard report={report} lang={lang} />
                    <GexChart 
                      gexData={report.gamma.gex_strikes} 
                      spotPrice={report.price.last} 
                      flipLevel={report.gamma.flip_level} 
                      lang={lang}
                    />
                  </>
                )}
              </div>

              {/* RIGHT Column: ES (SPX) */}
              <div className="space-y-6">
                <div className="flex items-center gap-2 bg-[#1B2127]/60 border border-white/5 p-3 rounded-lg font-display text-indigo-400 font-bold text-xs uppercase tracking-wider">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                  <h4>S&P 500 Futures (ES &rarr; SPX Index)</h4>
                </div>
                {parallelReport ? (
                  <>
                    <ReportCard report={parallelReport} lang={lang} />
                    <GexChart 
                      gexData={parallelReport.gamma.gex_strikes} 
                      spotPrice={parallelReport.price.last} 
                      flipLevel={parallelReport.gamma.flip_level} 
                      lang={lang}
                    />
                  </>
                ) : (
                  <div className="h-64 border border-dashed border-white/5 rounded-xl flex items-center justify-center text-slate-500 font-mono text-xs">
                    Could not resolve parallel options chains for ES.
                  </div>
                )}
              </div>

            </div>

            {/* In Parallel Mode, both refer to the same audit */}
            {report && (
              <>
                <AuditPanel proxy={report.proxy} date={activeDate} lang={lang} />
              </>
            )}
          </div>
        )}
        </>
        )}
        {/* ===== END DASHBOARD PAGE ===== */}

        {/* ===== BACKTEST PAGE ===== */}
        {activePage === "backtest" && (
          <div className="space-y-6">
            <div className="glass-card p-5 border-l-4 border-indigo-500/60">
              <h2 className="font-display font-bold text-base text-white flex items-center gap-2">
                <Target className="w-5 h-5 text-indigo-400" />
                {lang === "zh" ? "回測與歷史紀錄分析" : "Backtest & Historical Analysis"}
              </h2>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                {lang === "zh"
                  ? "檢視連續交易日的關鍵水位變化,並驗證系統預測 vs 隔日實際走勢。"
                  : "Review key levels across trading days and validate predictions vs next-day actuals."}
              </p>
            </div>
            <HistoryReview
              instrument={viewMode === "parallel" ? "NQ" : activeInst}
              activeDate={activeDate}
              onSelectDate={(d) => setActiveDate(d)}
              lang={lang}
            />
            <BacktestValidation
              instrument={viewMode === "parallel" ? "NQ" : activeInst}
              lang={lang}
              tier="owner"
            />
          </div>
        )}

        {/* ===== CME PAGE (最高權限 only) ===== */}
        {activePage === "cme" && (
          isAdmin ? (
            <div className="space-y-6">
              <CmeDownloadLinks lang={lang} />
              <CmeBulletinImport onImported={loadStatus} />
            </div>
          ) : (
            <div className="glass-card p-10 flex flex-col items-center justify-center text-center gap-4">
              <Lock className="w-10 h-10 text-[#F2A93B]/70" />
              <h3 className="font-display font-bold text-base text-white">
                {lang === "zh" ? "CME 官方數據 — 限最高權限" : "CME Official Data — Admin Only"}
              </h3>
              <p className="text-sm text-slate-400 max-w-md leading-relaxed">
                {lang === "zh"
                  ? "此頁為 CME 官方 EOD 數據匯入區,僅限管理員存取。若你是管理員,請使用右上角的 Google 登入。"
                  : "This CME official EOD import area is restricted to admins. If you are the admin, please sign in with Google (top right)."}
              </p>
              {!auth.user && (
                <button
                  onClick={auth.signInWithGoogle}
                  className="flex items-center gap-2 bg-white hover:bg-slate-100 text-slate-800 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
                >
                  <span>{lang === "zh" ? "使用 Google 登入" : "Sign in with Google"}</span>
                </button>
              )}
            </div>
          )
        )}

        {/* ===== ABOUT PAGE ===== */}
        {activePage === "about" && (
        <>
        {/* 2.4 Data Integrity & Quality Verification Guide */}
        <div className="glass-card p-6 bg-[#12161A]/40 border-l-4 border-[#2DD4A7] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-radial from-emerald-500/5 to-transparent rounded-full pointer-events-none" />
          
          <h4 className="font-display font-bold text-sm text-white uppercase tracking-wider mb-2 flex items-center gap-2 select-none">
            <ShieldCheck className="w-4 h-4 text-[#2DD4A7]" />
            {t.verificationTitle}
          </h4>
          <p className="text-xs text-slate-400 font-sans leading-relaxed mb-5">
            {t.verificationDesc}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
            {/* Q1 */}
            <div className="bg-[#171E24]/60 p-4 rounded-lg border border-white/5 hover:bg-[#1C242B]/60 transition-colors">
              <h5 className="font-display font-bold text-slate-200 mb-2 font-sans text-[13px] tracking-tight">
                {t.q1}
              </h5>
              <p className="text-slate-400 leading-relaxed font-sans text-[11px]">
                {t.a1}
              </p>
            </div>
            
            {/* Q2 */}
            <div className="bg-[#171E24]/60 p-4 rounded-lg border border-white/5 hover:bg-[#1C242B]/60 transition-colors">
              <h5 className="font-display font-bold text-slate-200 mb-2 font-sans text-[13px] tracking-tight">
                {t.q2}
              </h5>
              <p className="text-slate-400 leading-relaxed font-sans text-[11px]">
                {t.a2}
              </p>
            </div>

            {/* Q3 */}
            <div className="bg-[#171E24]/60 p-4 rounded-lg border border-white/5 hover:bg-[#1C242B]/60 transition-colors">
              <h5 className="font-display font-bold text-slate-200 mb-2 font-sans text-[13px] tracking-tight">
                {t.q3}
              </h5>
              <p className="text-slate-400 leading-relaxed font-sans text-[11px]">
                {t.a3}
              </p>
            </div>
          </div>
        </div>

        {/* 3. Monetization Strip (Google Adsense slots & Premium Subscription hooks) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-6 border-t border-white/5">
          
          {/* Ad Slot Left */}
          <div className="col-span-1/1 md:col-span-8 bg-[#12161A]/40 border border-dashed border-white/5 rounded-xl p-4 flex flex-col justify-between overflow-hidden relative group">
            <div className="absolute top-2 right-3 text-[8px] font-mono text-slate-600 tracking-wider font-semibold uppercase">
              {lang === "zh" ? "贊助商內容 / Google Ads" : "Sponsored Content / Google Ads"}
            </div>
            
            <div className="flex flex-wrap items-center gap-4 py-4">
              <div className="w-16 h-16 rounded bg-[#2C3843]/40 flex items-center justify-center font-bold text-slate-400 font-display">
                M4
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-[#2DD4A7] tracking-wider font-mono">{lang === "zh" ? "主力經紀商獨家贊助" : "Pro Brokerage Sponsorship"}</span>
                <h5 className="font-display font-semibold text-sm text-white mt-0.5">{lang === "zh" ? "零佣金交易納指 / 標普指數期貨期權 (NQ/ES)" : "Zero-Commission Nasdaq Futures Trading (NQ/MNQ)"}</h5>
                <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
                  {lang === "zh" 
                    ? "解鎖高規格實時 K 線圖表、深度 L2 訂單簿、毫秒級對沖成交。開戶即送 Dealer GEX 指標套件。由 MT4 Prime 贊助提供。" 
                    : "Unlock high-performance charting, deep liquidity order book displays, and sub-millisecond execution speeds for index options traders. Sponsored by MT4 Prime."}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] border-t border-white/5 pt-3 mt-1 font-mono text-slate-500">
              <span>{lang === "zh" ? "針對高級量化交易員的自適應動態廣告展示" : "Optimized dynamic ad targeting based on Trader profile"}</span>
              <a href="#pro-broker" className="text-slate-400 hover:text-[#2DD4A7] flex items-center gap-1">
                {lang === "zh" ? "瞭解詳情" : "Learn More"} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Subscription Hook Right */}
          <div className="col-span-1/1 md:col-span-4 bg-gradient-to-br from-[#1C1625] to-[#12161A] border border-indigo-500/20 rounded-xl p-5 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
            <div>
              <span className="text-[9px] uppercase font-bold font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 inline-block mb-3">
                {lang === "zh" ? "專業版功能預覽" : "Subscription Preview"}
              </span>
              <h4 className="font-display font-bold text-sm text-white flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-indigo-400" /> 
                {lang === "zh" ? "未啟用的未來進階功能" : "Future premium features (not active)"}
              </h4>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                {lang === "zh"
                  ? "解鎖盤中 此研究版不含盤中即時資料、暗池資料、付款或通知功能；這些功能需要另外的資料授權、後端與產品合規設計。"
                  : "This research build does not include intraday real-time data, dark-pool feeds, payments, or alerts. Those features require separate data licensing and production work."}
              </p>
            </div>

            <div className="pt-4 border-t border-white/5 mt-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-mono block">{lang === "zh" ? "高級訂閱會籍" : "Premium Tier"}</span>
                <span className="font-display font-extrabold text-white text-base">$79<span className="text-xs font-normal text-slate-400">/mo</span></span>
              </div>
              <button 
                onClick={() => setShowSubscriptionModal(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white hover:shadow-lg hover:shadow-indigo-500/15 px-4 py-2 rounded-lg font-bold text-xs transition-all cursor-pointer"
              >
                {lang === "zh" ? "升級賬戶" : "Upgrade Plan"}
              </button>
            </div>
          </div>

        </div>
        </>
        )}
        {/* ===== END ABOUT PAGE ===== */}

        </div>
        {/* end page content column */}

        {/* Mobile bottom navigation */}
        <BottomNav active={activePage} onChange={setActivePage} lang={lang} />

      </main>

      {/* 4. Sleek Footer with Legal Disclaimers */}
      <footer className="border-t border-white/5 bg-[#0E1215] px-6 py-8 text-slate-500 text-xs">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 font-mono text-[10px]">
            <span>&copy; 2026 TRADING INTELLIGENCE PLATFORM (TIP). All rights reserved.</span>
            <div className="flex gap-4">
              <a href="#terms" className="hover:text-slate-300">Terms of Service</a>
              <span>&bull;</span>
              <a href="#privacy" className="hover:text-slate-300">Privacy Policy</a>
              <span>&bull;</span>
              <a href="#adsense" className="hover:text-slate-300">Ad Preferences</a>
            </div>
          </div>
          
          <p className="leading-relaxed font-sans text-[11px] text-slate-600">
            <strong>{lang === "zh" ? "風險提示及法律免責聲明：" : "Risk Disclaimer:"}</strong> 
            {lang === "zh"
              ? "期貨和期權交易涉及巨大的損失風險，並不適合每位投資者。TIP 提供的所有 Gamma 水位、做市商對沖牆和走勢預測均是基於公開交易所期權合約數據和 B-S 模型程式化計算生成的，不構成任何專業投資決策建議。所有點位僅供量化結構參考。TIP 在任何情況下均不對用戶因參考此終端造成的任何交易虧損承擔責任。"
              : "Futures and options trading involves substantial risk of loss and is not suitable for every investor. The analysis, Gamma levels, walls, and forecasts provided by TIP are generated programmatically via options models and do not constitute professional financial advice. All levels are for structural reference only. Under no circumstances shall TIP be liable for any trading losses incurred."}
          </p>
        </div>
      </footer>

      {/* 5. Interstitial Subscription Upgrade Modal */}
      <AnimatePresence>
        {showSubscriptionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card max-w-md w-full p-6 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full pointer-events-none blur-xl" />
              
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-display font-extrabold text-base text-white">{lang === "zh" ? "研究版功能狀態" : "Research build status"}</h4>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{lang === "zh" ? "Delayed/EOD OI-based structure model" : "Delayed/EOD OI-based structure model"}</p>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                {lang === "zh" 
                  ? "您當前正在瀏覽 V1 每日盤前結構快照（支持 NQ 與 ES 股指期貨）。目前不提供付款、即時資料或盤中推播。這些功能只在取得適當資料授權與完成後端設計後才會開放：" 
                  : "You are currently looking at the V1 Daily Pre-Market Snapshot (NQ & ES coverage). Payments, real-time feeds, and intraday alerts are not available in this build. They will require licensed data and additional backend work:"}
              </p>

              {/* Premium Perks */}
              <div className="space-y-2.5 mb-6 text-xs text-slate-300">
                <div className="flex items-center gap-2.5 bg-[#171E24]/60 p-2.5 rounded border border-white/5">
                  <span className="text-[#2DD4A7] font-bold">&bull;</span>
                  <span>{lang === "zh" ? "<strong>15分鐘盤中動態刷新：</strong> 及時捕捉做市商防線的位移。" : "<strong>15-Minute Dynamic GEX Updates:</strong> Capture intra-day shift in walls."}</span>
                </div>
                <div className="flex items-center gap-2.5 bg-[#171E24]/60 p-2.5 rounded border border-white/5">
                  <span className="text-[#2DD4A7] font-bold">&bull;</span>
                  <span>{lang === "zh" ? "<strong>暗池與大宗機構掃單：</strong> 監控看不見的機構防對沖大盤。" : "<strong>Dark Pool & Large Block Orders:</strong> Track hidden institutional size."}</span>
                </div>
                <div className="flex items-center gap-2.5 bg-[#171E24]/60 p-2.5 rounded border border-white/5">
                  <span className="text-[#2DD4A7] font-bold">&bull;</span>
                  <span>{lang === "zh" ? "<strong>COMEX 黃金 (GC) 與原油 (CL)：</strong> 完整解鎖多商品期權分析桌面。" : "<strong>COMEX Gold (GC) & Crude (CL):</strong> Fully unlocked multi-asset desk."}</span>
                </div>
                <div className="flex items-center gap-2.5 bg-[#171E24]/60 p-2.5 rounded border border-white/5">
                  <span className="text-[#2DD4A7] font-bold">&bull;</span>
                  <span>{lang === "zh" ? "<strong>臨界點即時預警：</strong> 支持短信、Discord 連接，在 Flip 破位時主動推播。" : "<strong>Alert Integrations:</strong> Real-time SMS & Discord alerts on Flip levels."}</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowSubscriptionModal(false)}
                  className="flex-1 py-2.5 rounded-lg border border-white/5 bg-[#171E24]/60 text-slate-300 hover:text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  {lang === "zh" ? "維持免費版" : "Keep Free Tier"}
                </button>
                <button
                  onClick={() => setShowSubscriptionModal(false)}
                  className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-md shadow-indigo-500/25 cursor-pointer"
                >
                  {lang === "zh" ? "了解目前版本" : "Close"}
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
