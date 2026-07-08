/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UpdateStatus — 更新時間紀錄
 *  - 顯示上次 EOD 快照的時間、距今多久
 *  - 判斷「今天(美東交易日)是否已更新過」
 *  - 提示 marketdata 免費層資料在美東 09:30 (台灣約 21:30) 後才放出前一交易日
 */

import React, { useEffect, useState } from "react";
import { Clock, CheckCircle2, AlertCircle } from "lucide-react";

interface UpdateStatusProps {
  lang?: "zh" | "en";
  /** 後端 /api/health 的 latestSnapshotTimestamp (ISO) */
  timestamp?: string | null;
  /** 快照代表的交易日 YYYY-MM-DD */
  snapshotDate?: string | null;
}

function timeAgo(iso: string, isZh: boolean): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return isZh ? "未知" : "unknown";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return isZh ? "剛剛" : "just now";
  if (mins < 60) return isZh ? `${mins} 分鐘前` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return isZh ? `${hrs} 小時前` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return isZh ? `${days} 天前` : `${days}d ago`;
}

export const UpdateStatus: React.FC<UpdateStatusProps> = ({ lang = "zh", timestamp, snapshotDate }) => {
  const isZh = lang === "zh";
  const [, forceTick] = useState(0);

  // 每分鐘重算一次「距今多久」
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, []);

  if (!timestamp) {
    return (
      <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>{isZh ? "尚無更新紀錄，請按「更新 EOD 快照」" : "No update yet — click Refresh"}</span>
      </div>
    );
  }

  // 判斷今天(美東)是否已更新:比對快照時間的美東日期是否為今天
  const snapET = new Date(timestamp).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const updatedToday = snapET === todayET;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-mono">
      <div className="flex items-center gap-1.5 text-slate-400">
        <Clock className="w-3.5 h-3.5" />
        <span>
          {isZh ? "上次更新:" : "Updated:"} <span className="text-slate-200">{timeAgo(timestamp, isZh)}</span>
        </span>
      </div>
      {snapshotDate && (
        <div className="text-slate-500">
          {isZh ? "數據交易日:" : "Data date:"} <span className="text-slate-300">{snapshotDate}</span>
        </div>
      )}
      {updatedToday ? (
        <div className="flex items-center gap-1.5 text-[#2DD4A7]">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{isZh ? "今日已更新" : "Updated today"}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-[#F2A93B]">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>{isZh ? "今日尚未更新" : "Not updated today"}</span>
        </div>
      )}
      <div className="text-[10px] text-slate-600">
        {isZh
          ? "(免費層前一交易日資料約台灣 21:30 後開放)"
          : "(prior-day data opens ~09:30 ET)"}
      </div>
    </div>
  );
};
