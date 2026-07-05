/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PageNav — 頁面導覽
 *  - 桌機 (lg 以上):左側直向 Sidebar
 *  - 手機 / LINE 內建瀏覽器:底部橫向分頁 (bottom tab bar),拇指好按、不遮內容
 *
 * 四個分頁:dashboard(儀表板) / backtest(回測分析) / cme(CME數據) / about(說明)
 */

import React from "react";
import { LayoutDashboard, Target, FileText, Info } from "lucide-react";

export type PageKey = "dashboard" | "backtest" | "cme" | "about";

interface PageNavProps {
  active: PageKey;
  onChange: (page: PageKey) => void;
  lang?: "zh" | "en";
}

const items: { key: PageKey; icon: React.ReactNode; zh: string; en: string }[] = [
  { key: "dashboard", icon: <LayoutDashboard className="w-5 h-5" />, zh: "儀表板", en: "Dashboard" },
  { key: "backtest", icon: <Target className="w-5 h-5" />, zh: "回測分析", en: "Backtest" },
  { key: "cme", icon: <FileText className="w-5 h-5" />, zh: "CME 數據", en: "CME Data" },
  { key: "about", icon: <Info className="w-5 h-5" />, zh: "說明", en: "About" },
];

/** 桌機左側 Sidebar */
export const SidebarNav: React.FC<PageNavProps> = ({ active, onChange, lang = "zh" }) => {
  const isZh = lang === "zh";
  return (
    <aside className="hidden lg:flex flex-col gap-1.5 w-52 shrink-0 sticky top-24 self-start">
      {items.map((it) => {
        const on = active === it.key;
        return (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all cursor-pointer text-left ${
              on
                ? "bg-[#2DD4A7] text-black shadow-md shadow-emerald-400/10"
                : "text-slate-400 hover:text-white hover:bg-[#171E24]"
            }`}
          >
            {it.icon}
            <span>{isZh ? it.zh : it.en}</span>
          </button>
        );
      })}
    </aside>
  );
};

/** 手機底部分頁列 (固定於底部) */
export const BottomNav: React.FC<PageNavProps> = ({ active, onChange, lang = "zh" }) => {
  const isZh = lang === "zh";
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#12161A]/95 backdrop-blur-md border-t border-white/10 flex justify-around px-2 py-1.5">
      {items.map((it) => {
        const on = active === it.key;
        return (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              on ? "text-[#2DD4A7]" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {it.icon}
            <span className="text-[9px] font-semibold">{isZh ? it.zh : it.en}</span>
          </button>
        );
      })}
    </nav>
  );
};
