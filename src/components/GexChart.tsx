/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * GexChart — 水平專業版 (MenthorQ 風格)
 *
 * 設計對齊付費版 GEX 報告的專業慣例:
 *  - Strike 在 Y 軸 (縱向,符合交易者看價格的直覺)
 *  - GEX 在 X 軸 (橫向長條,綠色正 GEX 向右、紅色負 GEX 向左)
 *  - 疊加黃色 "GEX Profile" 累積曲線
 *  - Call Resistance (紅虛線)、Put Support (綠虛線)、Gamma Flip / HVL (黃虛線) 水平線
 *
 * 保留原本的 props 介面 (gexData / spotPrice / flipLevel / lang),
 * 額外接受可選的 callWall / putWall 讓 App 傳入引擎算好的精確牆位;
 * 若未傳入則從 gexData 推導,確保向後相容、App 不改也能運作。
 */

import React from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from "recharts";
import { GexStrikeData } from "../types";

interface GexChartProps {
  gexData: GexStrikeData[];
  spotPrice: number;
  flipLevel: number;
  lang?: "zh" | "en";
  /** 可選:引擎算好的精確牆位與現貨,傳入則優先使用 */
  callWall?: number;
  putWall?: number;
}

const POS = "#22C55E"; // 正 GEX 綠
const NEG = "#EF4444"; // 負 GEX 紅
const PROFILE = "#EAB308"; // GEX Profile 黃線
const FLIP = "#F2A93B"; // Gamma Flip / HVL 橙黃
const SPOT = "#818CF8"; // 現貨

export const GexChart: React.FC<GexChartProps> = ({
  gexData,
  spotPrice,
  flipLevel,
  lang = "zh",
  callWall,
  putWall,
}) => {
  const isZh = lang === "zh";

  const fmt = (val: number) => {
    const a = Math.abs(val);
    const s = val >= 0 ? "+" : "-";
    if (a >= 1e9) return `${s}${(a / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${s}${(a / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${s}${(a / 1e3).toFixed(0)}k`;
    return `${s}${a.toFixed(0)}`;
  };

  // 依 strike 由小到大排序 (Y 軸由下到上 = 價格由低到高)
  const sorted = [...gexData].sort((a, b) => a.strike - b.strike);

  // 計算 GEX Profile 累積曲線 (由低 strike 往高 strike 累加 net_gex)
  let cumulative = 0;
  const withProfile = sorted.map((d) => {
    cumulative += d.net_gex;
    return { ...d, profile: cumulative };
  });

  // 決定 Call Wall / Put Wall:優先用傳入值,否則從資料推導
  const resolvedCallWall =
    callWall ??
    sorted.reduce((prev, curr) => (curr.net_gex > prev.net_gex ? curr : prev), sorted[0])?.strike;
  const resolvedPutWall =
    putWall ??
    sorted.reduce((prev, curr) => (curr.net_gex < prev.net_gex ? curr : prev), sorted[0])?.strike;

  // 找最接近各水平線的 strike (Recharts 類別軸需對齊到實際 strike 值)
  const nearestStrike = (target: number) =>
    sorted.reduce(
      (prev, curr) =>
        Math.abs(curr.strike - target) < Math.abs(prev.strike - target) ? curr : prev,
      sorted[0]
    )?.strike;

  const flipStrike = nearestStrike(flipLevel);
  const spotStrike = nearestStrike(spotPrice);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d: GexStrikeData & { profile?: number } = payload[0].payload;
      const isPos = d.net_gex >= 0;
      return (
        <div className="bg-[#12161A]/95 border border-white/10 rounded-lg p-3.5 shadow-2xl font-mono text-xs space-y-1 backdrop-blur-md">
          <div className="text-slate-400 border-b border-white/5 pb-1.5 mb-1.5 flex justify-between items-center gap-6">
            <span>{isZh ? "行權價 (STRIKE)" : "STRIKE"}</span>
            <span className="text-white font-bold text-sm">{d.strike}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-slate-400">{isZh ? "買權 GEX:" : "Call GEX:"}</span>
            <span className="font-semibold" style={{ color: POS }}>{fmt(d.call_gex)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-slate-400">{isZh ? "賣權 GEX:" : "Put GEX:"}</span>
            <span className="font-semibold" style={{ color: NEG }}>{fmt(d.put_gex)}</span>
          </div>
          <div className="flex justify-between gap-6 border-t border-white/5 pt-1.5 mt-1">
            <span className="text-white font-semibold">{isZh ? "淨 GEX:" : "Net GEX:"}</span>
            <span className="font-extrabold" style={{ color: isPos ? POS : NEG }}>{fmt(d.net_gex)}</span>
          </div>
          {typeof d.profile === "number" && (
            <div className="flex justify-between gap-6 text-[10px]" style={{ color: PROFILE }}>
              <span>{isZh ? "累積 Profile:" : "Cumulative:"}</span>
              <span>{fmt(d.profile)}</span>
            </div>
          )}
          <div className="flex justify-between gap-6 text-[10px] text-slate-500 pt-0.5">
            <span>{isZh ? "未平倉 (OI):" : "OI:"}</span>
            <span>{d.oi.toLocaleString()}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  const axisFmt = (v: number) => {
    const a = Math.abs(v);
    if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
    return `${v}`;
  };

  // 圖高度依 strike 檔數動態調整 (每檔約 16px,最少 360)
  const chartHeight = Math.max(360, sorted.length * 16);

  return (
    <div id="gex-chart-container" className="glass-card p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="font-display font-bold text-sm text-white uppercase tracking-wider">
            {isZh ? "📊 GEX 敞口分佈 (Gamma Exposure Profile)" : "📊 GEX Profile (Gamma Exposure per Strike)"}
          </h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-3xl">
            {isZh
              ? "縱軸為行權價、橫軸為 GEX。綠色向右為正 Gamma (莊家 Long，抑制波動);紅色向左為負 Gamma (莊家 Short，助漲助跌)。黃線為累積 GEX Profile。"
              : "Y-axis = strike, X-axis = GEX. Green (right) = positive gamma; red (left) = negative gamma. Yellow line = cumulative GEX profile."}
          </p>
        </div>
        <div className="flex flex-col gap-1.5 text-[10px] font-mono">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ background: POS }} />
            <span className="text-slate-300">{isZh ? "正 GEX (Call/Long)" : "Positive GEX"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ background: NEG }} />
            <span className="text-slate-300">{isZh ? "負 GEX (Put/Short)" : "Negative GEX"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5" style={{ background: PROFILE }} />
            <span className="text-slate-300">GEX Profile</span>
          </div>
        </div>
      </div>

      {/* Horizontal chart */}
      <div className="w-full font-mono text-[10px] select-none" style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            layout="vertical"
            data={withProfile}
            margin={{ top: 10, right: 60, left: 10, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1D252C" horizontal={false} />

            {/* X 軸 = GEX 值 (橫向) */}
            <XAxis
              type="number"
              stroke="#64748B"
              tickLine={false}
              axisLine={false}
              tickFormatter={axisFmt}
              domain={["dataMin", "dataMax"]}
            />

            {/* Y 軸 = strike (縱向) */}
            <YAxis
              type="category"
              dataKey="strike"
              stroke="#64748B"
              tickLine={false}
              axisLine={false}
              width={54}
              interval={Math.max(0, Math.floor(sorted.length / 20))}
              reversed={false}
            />

            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.02)" }} />

            {/* 零軸 */}
            <ReferenceLine x={0} stroke="#2C3843" strokeWidth={1} />

            {/* Call Resistance 水平線 (紅) */}
            {resolvedCallWall !== undefined && (
              <ReferenceLine
                y={resolvedCallWall}
                stroke={NEG}
                strokeWidth={1.5}
                strokeDasharray="6 4"
                label={{
                  value: `${isZh ? "壓力" : "Call Resistance"}: ${resolvedCallWall}`,
                  position: "right",
                  fill: NEG,
                  fontSize: 9,
                  fontWeight: "bold",
                }}
              />
            )}

            {/* Put Support 水平線 (綠) */}
            {resolvedPutWall !== undefined && (
              <ReferenceLine
                y={resolvedPutWall}
                stroke={POS}
                strokeWidth={1.5}
                strokeDasharray="6 4"
                label={{
                  value: `${isZh ? "支撐" : "Put Support"}: ${resolvedPutWall}`,
                  position: "right",
                  fill: POS,
                  fontSize: 9,
                  fontWeight: "bold",
                }}
              />
            )}

            {/* Gamma Flip / HVL 水平線 (黃) */}
            {flipStrike !== undefined && (
              <ReferenceLine
                y={flipStrike}
                stroke={FLIP}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                label={{
                  value: `Flip/HVL: ${flipLevel}`,
                  position: "left",
                  fill: FLIP,
                  fontSize: 9,
                  fontWeight: "bold",
                }}
              />
            )}

            {/* 現貨水平線 (紫,實線) */}
            {spotStrike !== undefined && (
              <ReferenceLine
                y={spotStrike}
                stroke={SPOT}
                strokeWidth={1.5}
                label={{
                  value: `Spot: ${spotPrice}`,
                  position: "left",
                  fill: SPOT,
                  fontSize: 9,
                  fontWeight: "bold",
                }}
              />
            )}

            {/* 橫向 GEX 長條 */}
            <Bar dataKey="net_gex" barSize={11}>
              {withProfile.map((entry, idx) => (
                <Cell key={`c-${idx}`} fill={entry.net_gex >= 0 ? POS : NEG} />
              ))}
            </Bar>

            {/* 累積 GEX Profile 曲線 */}
            <Line
              type="monotone"
              dataKey="profile"
              stroke={PROFILE}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Metric callouts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-white/5 font-mono text-xs">
        <div className="bg-[#171E24]/60 p-3 rounded border border-white/5 text-center">
          <span className="text-[9px] text-slate-500 uppercase block mb-1">{isZh ? "壓力 (Call Wall)" : "Call Wall"}</span>
          <span className="text-sm font-bold" style={{ color: NEG }}>{resolvedCallWall ?? "N/A"}</span>
        </div>
        <div className="bg-[#171E24]/60 p-3 rounded border border-white/5 text-center">
          <span className="text-[9px] text-slate-500 uppercase block mb-1">{isZh ? "支撐 (Put Wall)" : "Put Wall"}</span>
          <span className="text-sm font-bold" style={{ color: POS }}>{resolvedPutWall ?? "N/A"}</span>
        </div>
        <div className="bg-[#171E24]/60 p-3 rounded border border-white/5 text-center">
          <span className="text-[9px] text-slate-500 uppercase block mb-1">{isZh ? "累計淨 GEX" : "Total Net GEX"}</span>
          <span className="text-sm font-bold" style={{ color: cumulative >= 0 ? POS : NEG }}>{fmt(cumulative)}</span>
        </div>
        <div className="bg-[#171E24]/60 p-3 rounded border border-white/5 text-center">
          <span className="text-[9px] text-slate-500 uppercase block mb-1">{isZh ? "覆蓋檔位" : "Strikes"}</span>
          <span className="text-sm font-bold text-slate-200">{sorted.length}</span>
        </div>
      </div>
    </div>
  );
};
