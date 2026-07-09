import React, { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, RefreshCw, Route, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";
import { DailyReport, SessionMonitorState } from "../types";
import { translateEvent, translateRegime, translateText } from "../utils/displayText";

function fmtLevel(level: number | null | undefined): string {
  return typeof level === "number" && Number.isFinite(level) ? Math.round(level).toString() : "—";
}

function path(levels?: number[]): string {
  return levels?.length ? levels.map((x) => Math.round(x)).join(" → ") : "—";
}

function deriveScenario(report: DailyReport, state: SessionMonitorState | null | undefined, lang: "zh" | "en") {
  const isZh = lang === "zh";
  const s = state;
  const bias = report.playbook?.premarketBias;
  const regime = s?.currentSessionRegime || "No Edge";
  const trigger = bias?.triggerLevels;
  const bullPath = path(bias?.bullishPath);
  const bearPath = path(bias?.bearishPath);
  const bearProb = bias?.probabilities.bearish ?? null;
  const bullProb = bias?.probabilities.bullish ?? null;
  const rangeProb = bias?.probabilities.range ?? null;

  const premarketLabel = bias
    ? `${translateRegime(bias.label, lang)} · Bull ${bullProb}% / Bear ${bearProb}% / Range ${rangeProb}%`
    : isZh ? "尚無盤前 Bias" : "No premarket bias";

  if (regime === "Expansion Up") {
    return {
      tone: "bull",
      icon: <TrendingUp className="w-4 h-4" />,
      title: isZh ? "多頭劇本已觸發" : "Bullish scenario triggered",
      premarketLabel,
      execution: isZh
        ? `價格已觸發上行確認。若盤前原本偏空，代表偏空劇本失效；Negative GEX 會放大已確認的上漲方向。`
        : "Upside confirmation is active. If the premarket read was bearish, that bearish scenario is invalidated; negative GEX can amplify the confirmed upside move.",
      activePath: isZh ? `多頭路徑：${bullPath}` : `Bull path: ${bullPath}`,
      invalidation: isZh
        ? `失效：跌回 ${fmtLevel(trigger?.noEdgeLow)}～${fmtLevel(trigger?.noEdgeHigh)} Flip zone，或 BOS_UP / VWAP reclaim 失敗。`
        : `Invalidation: back into the ${fmtLevel(trigger?.noEdgeLow)}–${fmtLevel(trigger?.noEdgeHigh)} flip zone, or failed BOS_UP / VWAP reclaim.`,
    };
  }

  if (regime === "Expansion Down") {
    return {
      tone: "bear",
      icon: <TrendingDown className="w-4 h-4" />,
      title: isZh ? "空頭劇本已觸發" : "Bearish scenario triggered",
      premarketLabel,
      execution: isZh
        ? `價格已觸發下行確認。這才是把盤前偏空轉成可執行空頭劇本的條件，不是只因 Bear% 高就直接追空。`
        : "Downside confirmation is active. This is the condition that converts premarket bearish structure into an executable bearish scenario.",
      activePath: isZh ? `空頭路徑：${bearPath}` : `Bear path: ${bearPath}`,
      invalidation: isZh
        ? `失效：重新站回 ${fmtLevel(trigger?.noEdgeHigh)} 上方，或 BOS_DOWN / VWAP rejection 失敗。`
        : `Invalidation: reclaim above ${fmtLevel(trigger?.noEdgeHigh)}, or failed BOS_DOWN / VWAP rejection.`,
    };
  }

  if (regime === "Consolidation / Pin") {
    return {
      tone: "pin",
      icon: <Route className="w-4 h-4" />,
      title: isZh ? "Pin / 震盪劇本" : "Pin / chop scenario",
      premarketLabel,
      execution: isZh
        ? `盤中 flow 目前偏向磁吸或牆位附近震盪。不要把盤前 Bear/Bull 當成追單理由，只能在牆位極端位置短打。`
        : "Intraday flow is behaving like pinning / chop. Do not chase the premarket bias; only scalp at extreme walls.",
      activePath: isZh ? `可觀察區：Flip ${fmtLevel(report.gamma.flip_level)}，Call Wall ${fmtLevel(report.gamma.call_walls[0]?.strike)}，Put Wall ${fmtLevel(report.gamma.put_walls[0]?.strike)}` : `Watch: Flip ${fmtLevel(report.gamma.flip_level)}, Call Wall ${fmtLevel(report.gamma.call_walls[0]?.strike)}, Put Wall ${fmtLevel(report.gamma.put_walls[0]?.strike)}`,
      invalidation: isZh
        ? `失效：2×5m 明確離開 Flip zone 並出現 BOS / VWAP 確認。`
        : "Invalidation: 2×5m leaves the flip zone with BOS / VWAP confirmation.",
    };
  }

  const insideZone = trigger
    ? report.price.last >= trigger.noEdgeLow && report.price.last <= trigger.noEdgeHigh
    : Math.abs(report.price.last - report.gamma.flip_level) <= Math.max(40, report.price.last * 0.0025);

  return {
    tone: insideZone ? "wait" : "neutral",
    icon: <ShieldAlert className="w-4 h-4" />,
    title: insideZone ? (isZh ? "Flip 區等待確認" : "Waiting in flip zone") : (isZh ? "尚未觸發劇本" : "Scenario not triggered yet"),
    premarketLabel,
    execution: isZh
      ? `盤前 Bias 只是結構機率；目前尚未有足夠盤中事件確認方向。等待 2×5m close + VWAP / BOS，再切換到多頭或空頭劇本。`
      : "The premarket bias is structural probability only. Wait for 2×5m close plus VWAP / BOS before switching to bull or bear scenario.",
    activePath: isZh
      ? `多頭觸發上方：${fmtLevel(trigger?.bullishBreak)}；空頭觸發下方：${fmtLevel(trigger?.bearishBreak)}。`
      : `Bull trigger above ${fmtLevel(trigger?.bullishBreak)}; bear trigger below ${fmtLevel(trigger?.bearishBreak)}.`,
    invalidation: isZh
      ? `No Edge 區：${fmtLevel(trigger?.noEdgeLow)}～${fmtLevel(trigger?.noEdgeHigh)}，在這裡反覆穿越不給方向。`
      : `No-edge zone: ${fmtLevel(trigger?.noEdgeLow)}–${fmtLevel(trigger?.noEdgeHigh)}. Repeated crosses here give no directional edge.`,
  };
}

export const SessionMonitor: React.FC<{ report: DailyReport; lang?: "zh" | "en" }> = ({ report, lang = "zh" }) => {
  const isZh = lang === "zh";
  const [state, setState] = useState<SessionMonitorState | null>(report.session_monitor || null);
  const [error, setError] = useState<string | null>(null);
  const modelDate = report.source_status?.cmeTargetSessionDate || report.source_status?.dashboardDate || report.as_of.slice(0, 10);
  const underlying = report.source_status?.cmeUnderlying || report.proxy;

  const load = async () => {
    try {
      const res = await fetch(`/api/tradingview/session?modelDate=${encodeURIComponent(modelDate)}&underlying=${encodeURIComponent(underlying)}`);
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || (isZh ? "Session 狀態尚不可用" : "Session unavailable"));
      setState(payload);
      setError(payload?.warning ? translateText(payload.warning, lang) : null);
    } catch (e: any) {
      setError(translateText(e?.message || (isZh ? "Session 狀態尚不可用" : "Session unavailable"), lang));
      setState(report.session_monitor || null);
    }
  };

  useEffect(() => { load(); }, [modelDate, underlying]);
  const s = state || report.session_monitor;
  const scenario = useMemo(() => deriveScenario(report, s, lang), [report, s, lang]);
  if (!s) return null;

  const checks = [
    [isZh ? "觸及 Gamma Flip" : "Gamma Flip touched", s.gammaFlipTouched],
    [isZh ? "重新站回 Gamma Flip" : "Gamma Flip reclaimed", s.gammaFlipReclaimed],
    [isZh ? "Gamma Flip 拒絕" : "Gamma Flip rejected", Boolean(s.gammaFlipRejected)],
    [isZh ? "BOS 向上" : "BOS up", Boolean(s.bosUp)],
    [isZh ? "BOS 向下" : "BOS down", Boolean(s.bosDown)],
    [isZh ? "VWAP / AVWAP 站回" : "VWAP / AVWAP reclaim", Boolean(s.avwapReclaim)],
    [isZh ? "VWAP / AVWAP 拒絕" : "VWAP / AVWAP reject", Boolean(s.avwapReject)],
    [isZh ? "觸及 Call Wall" : "Call Wall touched", s.callWallTouched],
    [isZh ? "Call Wall 2×5m 突破" : "Call Wall breakout 2×5m", s.callWallBreakoutConfirmed],
    [isZh ? "觸及 Put Wall" : "Put Wall touched", s.putWallTouched],
    [isZh ? "Put Wall 2×5m 跌破" : "Put Wall breakdown 2×5m", s.putWallBreakdownConfirmed],
    [isZh ? "牆位翻轉" : "Wall flipped", Boolean(s.wallFlipped)],
  ] as const;

  const toneClass: Record<string, string> = {
    bull: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
    bear: "border-red-400/30 bg-red-500/10 text-red-100",
    pin: "border-sky-400/30 bg-sky-500/10 text-sky-100",
    wait: "border-amber-400/30 bg-amber-500/10 text-amber-100",
    neutral: "border-white/10 bg-white/5 text-slate-100",
  };

  return (
    <section className="glass-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="font-display font-bold text-sm text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#2DD4A7]" />
            {isZh ? "Scenario Switcher / 盤中劇本切換器" : "Scenario Switcher / Intraday Confirmation"}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {isZh ? "盤前 Bias 是機率地圖；TradingView webhook 事件會把它切換成多頭、空頭、Pin 或等待狀態。" : "Premarket bias is a probability map; TradingView webhook events switch it into bull, bear, pin, or wait states."}
          </p>
        </div>
        <button onClick={load} className="p-2 rounded border border-white/5 bg-[#12161A] text-slate-400 hover:text-white" title={isZh ? "重新讀取" : "Reload"}><RefreshCw className="w-4 h-4" /></button>
      </div>

      {error && <div className="mb-4 text-[11px] text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded p-3 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</div>}

      <div className={`mb-4 rounded-xl border p-4 ${toneClass[scenario.tone] || toneClass.neutral}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-display font-bold text-white">{scenario.icon}{scenario.title}</div>
            <p className="text-[11px] mt-1 text-slate-300">{scenario.premarketLabel}</p>
          </div>
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-mono text-slate-200">{translateRegime(s.currentSessionRegime, lang)}</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 mt-3 text-[11px] leading-relaxed">
          <div className="rounded-lg bg-black/20 border border-white/5 p-2">{scenario.execution}</div>
          <div className="rounded-lg bg-black/20 border border-white/5 p-2">{scenario.activePath}</div>
          <div className="rounded-lg bg-black/20 border border-white/5 p-2">{scenario.invalidation}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
        <Tile label={isZh ? "目前盤中狀態" : "Current session regime"} value={translateRegime(s.currentSessionRegime, lang)} strong />
        <Tile label={isZh ? "最後事件" : "Last event"} value={translateEvent(s.lastEvent, lang)} />
        <Tile label={isZh ? "更新時間" : "Updated at"} value={s.updatedAt || "—"} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4 text-[11px] font-mono">
        {checks.map(([label, on]) => <div key={label} className={`rounded border px-3 py-2 ${on ? "bg-[#2DD4A7]/10 border-[#2DD4A7]/20 text-[#2DD4A7]" : "bg-[#171E24]/60 border-white/5 text-slate-500"}`}>{label}</div>)}
      </div>
      <p className="mt-4 text-xs text-slate-400 leading-relaxed">{translateText(s.explanation, lang)}</p>
    </section>
  );
};
function Tile({ label, value, strong=false }: { label: string; value: string; strong?: boolean }) { return <div className="rounded-lg bg-[#171E24]/60 border border-white/5 p-3"><span className="block text-[9px] uppercase text-slate-500 mb-1">{label}</span><span className={`${strong ? "text-[#2DD4A7] text-base" : "text-slate-200"} font-bold break-words`}>{value}</span></div>; }
