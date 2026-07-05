/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ReferenceLine, 
  Cell 
} from "recharts";
import { GexStrikeData } from "../types";

interface GexChartProps {
  gexData: GexStrikeData[];
  spotPrice: number;
  flipLevel: number;
  lang?: "zh" | "en";
}

export const GexChart: React.FC<GexChartProps> = ({ 
  gexData, 
  spotPrice, 
  flipLevel,
  lang = "zh"
}) => {
  
  const isZh = lang === "zh";

  // Helper to format GEX values elegantly to millions/billions
  const formatTooltipGex = (val: number) => {
    const absVal = Math.abs(val);
    const sign = val >= 0 ? "+" : "-";
    if (absVal >= 1e9) {
      return `${sign}${(absVal / 1e9).toFixed(2)}B`;
    }
    if (absVal >= 1e6) {
      return `${sign}${(absVal / 1e6).toFixed(1)}M`;
    }
    return `${sign}${absVal.toLocaleString()}`;
  };

  // Format numbers to compact values, e.g., 1.5M, -300k
  const formatYAxis = (value: number) => {
    if (value === 0) return "0";
    const absValue = Math.abs(value);
    
    if (absValue >= 1e9) {
      return `${(value / 1e9).toFixed(1)}B`;
    }
    if (absValue >= 1e6) {
      return `${(value / 1e6).toFixed(1)}M`;
    }
    if (absValue >= 1e3) {
      return `${(value / 1e3).toFixed(0)}k`;
    }
    return `${value}`;
  };

  // Find critical wall strikes from dataset for rendering ReferenceLines
  const callWallStrike = gexData.reduce((prev, curr) => (curr.net_gex > prev.net_gex ? curr : prev), gexData[0])?.strike;
  const putWallStrike = gexData.reduce((prev, curr) => (curr.net_gex < prev.net_gex ? curr : prev), gexData[0])?.strike;
  
  // Find closest strike to flipLevel in the categories list for Recharts axis alignment
  const closestFlipStrike = gexData.reduce((prev, curr) => {
    if (!prev) return curr;
    return Math.abs(curr.strike - flipLevel) < Math.abs(prev.strike - flipLevel) ? curr : prev;
  }, gexData[0])?.strike;

  // Custom Tooltip renderer for professional presentation
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data: GexStrikeData = payload[0].payload;
      const isPositive = data.net_gex >= 0;

      return (
        <div className="bg-[#12161A]/95 border border-white/10 rounded-lg p-3.5 shadow-2xl font-mono text-xs space-y-1 backdrop-blur-md">
          <div className="text-slate-400 border-b border-white/5 pb-1.5 mb-1.5 flex justify-between items-center gap-6">
            <span>{isZh ? "行權價水位 (STRIKE)" : "STRIKE LEVEL"}</span>
            <span className="text-white font-bold text-sm">{data.strike}</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between gap-6">
              <span className="text-slate-400">{isZh ? "買權 Gamma 曝險:" : "Call Gamma Exposure:"}</span>
              <span className="text-[#2DD4A7] font-semibold">{formatTooltipGex(data.call_gex)}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-slate-400">{isZh ? "賣權 Gamma 曝險:" : "Put Gamma Exposure:"}</span>
              <span className="text-[#F2545B] font-semibold">{formatTooltipGex(data.put_gex)}</span>
            </div>
            <div className="flex justify-between gap-6 border-t border-white/5 pt-1.5 mt-1">
              <span className="text-white font-semibold">{isZh ? "淨 GEX 曝險:" : "Net GEX:"}</span>
              <span className={`font-extrabold ${isPositive ? "text-[#2DD4A7]" : "text-[#F2545B]"}`}>
                {formatTooltipGex(data.net_gex)}
              </span>
            </div>
            <div className="flex justify-between gap-6 text-[10px] text-slate-500 pt-0.5">
              <span>{isZh ? "未平倉量 (OI):" : "Open Interest (OI):"}</span>
              <span>{data.oi.toLocaleString()} {isZh ? "口" : "contracts"}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div id="gex-chart-container" className="glass-card p-6">
      
      {/* Header info */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="font-display font-bold text-sm text-white uppercase tracking-wider">
            {isZh ? "📈 做市商 GEX 敞口分佈圖 (Gamma Exposure per Strike)" : "📈 GEX Profile (Gamma Exposure per Strike)"}
          </h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-3xl">
            {isZh 
              ? "反映市場各行權價的做市商 Gamma 淨持倉敞口。柱狀向上延伸表示買權 (Call) 佔優，莊家持有 Long Gamma (抑止波動)；向下延伸表示賣權 (Put) 佔優，莊家持有 Short Gamma (助漲助跌)。" 
              : "Divergent exposure distribution. Call-heavy strikes extend upwards (Positive); Put-heavy strikes extend downwards (Negative)."}
          </p>
        </div>
        
        {/* Colors Legend */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-[#2DD4A7]" />
            <span className="text-slate-300">{isZh ? "買權 GEX (莊家 Long)" : "Call GEX (Dealer Long)"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-[#F2545B]" />
            <span className="text-slate-300">{isZh ? "賣權 GEX (莊家 Short)" : "Put GEX (Dealer Short)"}</span>
          </div>
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div className="h-[340px] w-full font-mono text-[10px] select-none">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={gexData}
            margin={{ top: 15, right: 10, left: -5, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1D252C" vertical={false} />
            
            <XAxis 
              dataKey="strike" 
              stroke="#64748B" 
              tickLine={false} 
              axisLine={false}
              dy={8}
            />
            
            <YAxis 
              stroke="#64748B" 
              tickLine={false} 
              axisLine={false}
              tickFormatter={formatYAxis}
              dx={-8}
            />
            
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.02)" }} />
            
            {/* Horizontal 0 line */}
            <ReferenceLine y={0} stroke="#2C3843" strokeWidth={1} />
            
             {/* Gamma Flip level vertical line (aligned to closest strike for perfect Recharts render) */}
             {closestFlipStrike !== undefined && (
               <ReferenceLine 
                 x={closestFlipStrike} 
                 stroke="#F2A93B" 
                 strokeWidth={1.5} 
                 strokeDasharray="4 4" 
                 label={{ 
                   value: `FLIP: ${flipLevel}`, 
                   position: "bottom", 
                   fill: "#F2A93B", 
                   fontFamily: "JetBrains Mono", 
                   fontSize: 9,
                   fontWeight: "bold"
                 }} 
               />
             )}

             {/* Major Call Wall vertical line */}
             {callWallStrike !== undefined && (
               <ReferenceLine 
                 x={callWallStrike} 
                 stroke="#2DD4A7" 
                 strokeWidth={1.5} 
                 strokeDasharray="5 5" 
                 label={{ 
                   value: `CALL WALL: ${callWallStrike}`, 
                   position: "top", 
                   fill: "#2DD4A7", 
                   fontFamily: "JetBrains Mono", 
                   fontSize: 9,
                   fontWeight: "bold"
                 }} 
               />
             )}

             {/* Major Put Wall vertical line */}
             {putWallStrike !== undefined && (
               <ReferenceLine 
                 x={putWallStrike} 
                 stroke="#F2545B" 
                 strokeWidth={1.5} 
                 strokeDasharray="5 5" 
                 label={{ 
                   value: `PUT WALL: ${putWallStrike}`, 
                   position: "top", 
                   fill: "#F2545B", 
                   fontFamily: "JetBrains Mono", 
                   fontSize: 9,
                   fontWeight: "bold"
                 }} 
               />
             )}

            {/* Rendered bars */}
            <Bar dataKey="net_gex" fill="#2DD4A7">
              {gexData.map((entry, idx) => {
                const color = entry.net_gex >= 0 ? "#2DD4A7" : "#F2545B";
                return (
                  <Cell 
                    key={`cell-${idx}`} 
                    fill={color} 
                    className="cursor-pointer transition-all duration-300"
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Metric Callouts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-white/5 font-mono text-xs">
        <div className="bg-[#171E24]/60 p-3 rounded border border-white/5 text-center">
          <span className="text-[9px] text-slate-500 uppercase block mb-1">{isZh ? "最大正 Gamma 水位" : "Max Positive Strike"}</span>
          <span className="text-sm font-bold text-[#2DD4A7]">
            {Math.max(...gexData.map((d) => d.net_gex)) > 0
              ? gexData.reduce((prev, current) => (prev.net_gex > current.net_gex ? prev : current)).strike
              : "N/A"}
          </span>
        </div>
        <div className="bg-[#171E24]/60 p-3 rounded border border-white/5 text-center">
          <span className="text-[9px] text-slate-500 uppercase block mb-1">{isZh ? "最大負 Gamma 水位" : "Max Negative Strike"}</span>
          <span className="text-sm font-bold text-[#F2545B]">
            {Math.min(...gexData.map((d) => d.net_gex)) < 0
              ? gexData.reduce((prev, current) => (prev.net_gex < current.net_gex ? prev : current)).strike
              : "N/A"}
          </span>
        </div>
        <div className="bg-[#171E24]/60 p-3 rounded border border-white/5 text-center">
          <span className="text-[9px] text-slate-500 uppercase block mb-1">{isZh ? "全市場累計淨 GEX" : "Total Cumulative GEX"}</span>
          <span className={`text-sm font-bold ${gexData.reduce((acc, d) => acc + d.net_gex, 0) >= 0 ? "text-[#2DD4A7]" : "text-[#F2545B]"}`}>
            {formatTooltipGex(gexData.reduce((acc, d) => acc + d.net_gex, 0))}
          </span>
        </div>
        <div className="bg-[#171E24]/60 p-3 rounded border border-white/5 text-center">
          <span className="text-[9px] text-slate-500 uppercase block mb-1">{isZh ? "覆蓋行權價區間" : "Sampled Strikes"}</span>
          <span className="text-sm font-bold text-slate-200">{gexData.length} {isZh ? "檔位" : "levels"}</span>
        </div>
      </div>
    </div>
  );
};
