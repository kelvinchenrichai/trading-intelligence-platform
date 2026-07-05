/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CmeDownloadLinks — CME 官方 Daily Bulletin 下載捷徑
 *
 * 提供可點擊直接跳轉 CME 官網下載 PG40 (Nasdaq 100 & E-mini Nasdaq 100 Options) 的連結,
 * 讓使用者每天能快速取得最新 EOD PDF 再回來上傳。
 *
 * 連結說明:
 *  - PG40 直連 PDF:CME 每日更新的「當前」Section 40 檔案。
 *  - Daily Bulletin 首頁:當直連暫時失效或想找其他 Section 時的入口。
 * 注意:CME 網站發布會延遲到美中時間午夜後才對外免費提供當日資料。
 */

import React from "react";
import { Download, ExternalLink, FileText } from "lucide-react";

const PG40_PDF =
  "https://www.cmegroup.com/daily_bulletin/current/Section40_Nasdaq_100_And_E_Mini_Nasdaq_100_Options.pdf";
const DAILY_BULLETIN =
  "https://www.cmegroup.com/market-data/daily-bulletin.html";

interface CmeDownloadLinksProps {
  lang?: "zh" | "en";
}

export const CmeDownloadLinks: React.FC<CmeDownloadLinksProps> = ({ lang = "zh" }) => {
  const isZh = lang === "zh";
  return (
    <div className="glass-card p-6 border-l-4 border-amber-500/60">
      <div className="flex items-center gap-3 mb-3">
        <FileText className="w-5 h-5 text-amber-400" />
        <div>
          <h3 className="font-display font-bold text-sm text-white">
            {isZh ? "步驟 1:從 CME 官網下載 PG40 每日公告" : "Step 1: Download PG40 from CME"}
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
            {isZh
              ? "點下方按鈕跳轉 CME 官網下載最新的 Nasdaq 100 期權每日結算 PDF (PG40),再回到下方「步驟 2」上傳。"
              : "Download the latest Nasdaq 100 options settlement PDF (PG40) from CME, then upload it in Step 2 below."}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mt-4">
        <a
          href={PG40_PDF}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-black px-4 py-2.5 rounded-lg font-bold text-xs transition-all cursor-pointer flex-1"
        >
          <Download className="w-4 h-4" />
          <span>{isZh ? "下載 PG40 PDF (直連)" : "Download PG40 PDF (direct)"}</span>
        </a>
        <a
          href={DAILY_BULLETIN}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 bg-[#1C242B] hover:bg-slate-800 border border-white/10 text-slate-300 hover:text-white px-4 py-2.5 rounded-lg font-semibold text-xs transition-all cursor-pointer flex-1"
        >
          <ExternalLink className="w-4 h-4" />
          <span>{isZh ? "CME 每日公告首頁 (備援)" : "CME Daily Bulletin (fallback)"}</span>
        </a>
      </div>

      <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">
        {isZh
          ? "提醒:CME 免費公告會延遲至美中時間午夜後才更新當日資料;若直連下載到的是前一日檔案屬正常現象。"
          : "Note: CME's free bulletin is delayed until after midnight CT. Getting the prior day's file via the direct link is expected."}
      </p>
    </div>
  );
};
