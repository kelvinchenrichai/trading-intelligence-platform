/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  ChevronDown, 
  ChevronUp, 
  History, 
  TrendingUp, 
  RefreshCw,
  Calendar
} from "lucide-react";
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend
} from "recharts";
import { translations } from "../utils/translations";

interface HistoryItem {
  date: string;
  close: number;
  flip_level: number;
  status: "positive" | "negative";
  quadrant: "range_bound" | "range_at_edge" | "trending" | "chop_whipsaw";
  label: string;
  call_wall_1: number;
  put_wall_1: number;
  confidence: "high" | "medium" | "low";
}

interface HistoryReviewProps {
  instrument: string;
  activeDate: string;
  onSelectDate: (date: string) => void;
  lang?: "zh" | "en";
}

export const HistoryReview: React.FC<HistoryReviewProps> = ({ 
  instrument, 
  activeDate, 
  onSelectDate,
  lang = "zh"
}) => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(false); // Collapsed by default
  const [activeTab, setActiveTab] = useState<"chart" | "table">("chart");
  const [selectedRange, setSelectedRange] = useState<string>("20d");

  const t = translations[lang];

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/history?instrument=${instrument}`);
      if (!res.ok) {
        throw new Error(`Failed to load history for ${instrument}`);
      }
      const data = await res.json();
      // Sort history descending by date (newest first) in state
      setHistory(data.reverse());
    } catch (err: any) {
      setError(err.message || "Could not retrieve historical logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [instrument, activeDate]);

  const getBadgeColor = (quad: string) => {
    switch (quad) {
      case "range_bound":
        return "text-[#2DD4A7] bg-[#2DD4A7]/10 border-emerald-500/20";
      case "range_at_edge":
        return "text-[#F2A93B] bg-[#F2A93B]/10 border-[#F2A93B]/20";
      case "chop_whipsaw":
        return "text-[#F2A93B] bg-[#F2A93B]/10 border-[#F2A93B]/20";
      case "trending":
      default:
        return "text-[#F2545B] bg-[#F2545B]/10 border-[#F2545B]/20";
    }
  };

  const getFilteredHistoryForChart = () => {
    // Chart needs chronological order (oldest to newest)
    const chronoHistory = [...history].reverse();
    
    let count = 20;
    if (selectedRange === "5d") count = 5;
    else if (selectedRange === "10d") count = 10;
    else if (selectedRange === "20d") count = 20;
    else if (selectedRange === "all") count = chronoHistory.length;

    return chronoHistory.slice(-count);
  };

  // Custom dot rendering for Recharts to color-code each point by regime quadrant
  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (!cx || !cy) return null;
    
    let color = "#2DD4A7"; // range_bound
    if (payload.quadrant === "range_at_edge") color = "#F2A93B";
    else if (payload.quadrant === "trending") color = "#F2545B";
    else if (payload.quadrant === "chop_whipsaw") color = "#C084FC";

    return (
      <circle 
        cx={cx} 
        cy={cy} 
        r={5} 
        fill={color} 
        stroke="#0B0E0D" 
        strokeWidth={1.5} 
        className="cursor-pointer transition-all hover:r-7"
      />
    );
  };

  // Custom tooltip for historical overlay chart
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const regimeColors = {
        range_bound: "text-[#2DD4A7] bg-[#2DD4A7]/10 border-emerald-500/20",
        range_at_edge: "text-[#F2A93B] bg-[#F2A93B]/10 border-[#F2A93B]/20",
        chop_whipsaw: "text-[#F2A93B] bg-[#F2A93B]/10 border-[#F2A93B]/20",
        trending: "text-[#F2545B] bg-[#F2545B]/10 border-[#F2545B]/20",
      };

      const isZh = lang === "zh";

      return (
        <div className="bg-[#12161A]/95 border border-white/10 rounded-lg p-3.5 shadow-2xl font-mono text-xs space-y-1.5 backdrop-blur-md">
          <p className="text-white font-bold border-b border-white/5 pb-1 mb-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            {label}
          </p>
          <p className="flex justify-between gap-6">
            <span className="text-slate-400">{isZh ? "指數收盤價 (Last):" : "Close Price (Last):"}</span>
            <span className="text-white font-extrabold">{data.close}</span>
          </p>
          <p className="flex justify-between gap-6">
            <span className="text-slate-400">{isZh ? "Gamma Flip 零軸:" : "Gamma Flip Pivot:"}</span>
            <span className="text-[#F2A93B] font-bold">{data.flip_level}</span>
          </p>
          <p className="flex justify-between gap-6">
            <span className="text-slate-400">{isZh ? "主要買權牆 (Call Wall):" : "Major Call Wall:"}</span>
            <span className="text-[#2DD4A7]">{data.call_wall_1}</span>
          </p>
          <p className="flex justify-between gap-6">
            <span className="text-slate-400">{isZh ? "主要賣權牆 (Put Wall):" : "Major Put Wall:"}</span>
            <span className="text-[#F2545B]">{data.put_wall_1}</span>
          </p>
          <div className="pt-2 border-t border-white/5 mt-1">
            <span className="text-[10px] text-slate-500 block uppercase mb-0.5">{isZh ? "市場結構狀態 (Regime)" : "Market Structure Regime"}</span>
            <span className={`inline-block px-2 py-0.5 text-[9px] rounded-full border font-sans font-bold uppercase ${regimeColors[data.quadrant] || ""}`}>
              {isZh ? translations.zh[data.quadrant] : translations.en[data.quadrant]}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  const chartData = getFilteredHistoryForChart();

  return (
    <div id="historical-review-section" className="glass-card overflow-hidden transition-all duration-300">
      
      {/* Clickable Header to Toggle Expansion */}
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-[#161D22]/60 transition-colors focus:outline-none cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <History className="w-5 h-5 text-indigo-400" />
          <div>
            <h3 className="font-display font-bold text-sm text-white">
              {t.historicalTitle}
            </h3>
            <p className="text-[11px] text-slate-400 font-sans mt-0.5">
              {t.historicalDesc}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-400 bg-[#1C242B]/60 px-2 py-1 rounded border border-white/5">
            {history.length} {t.tradingDays}
          </span>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="p-5 border-t border-white/5 bg-[#0B0E0D]/20">
          
          {loading ? (
            <div className="h-40 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
              <span className="text-xs font-mono text-slate-400">Loading historical snapshots...</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-500/5 text-red-400 border border-red-500/15 rounded text-xs text-center font-mono">
              {error}
            </div>
          ) : (
            <div className="space-y-4">
              
              {/* Tab Navigation Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-4 bg-[#12161A]/60 p-3 rounded-lg border border-white/5">
                <div className="flex rounded-md overflow-hidden border border-white/5 text-xs font-sans">
                  <button
                    onClick={() => setActiveTab("chart")}
                    className={`px-3 py-1.5 transition-colors cursor-pointer flex items-center gap-1.5 ${
                      activeTab === "chart" ? "bg-indigo-500 text-white font-bold" : "bg-[#12161A] text-slate-400 hover:text-white"
                    }`}
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>{t.chartTab}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab("table")}
                    className={`px-3 py-1.5 transition-colors cursor-pointer flex items-center gap-1.5 ${
                      activeTab === "table" ? "bg-indigo-500 text-white font-bold" : "bg-[#12161A] text-slate-400 hover:text-white"
                    }`}
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>{t.tableTab}</span>
                  </button>
                </div>

                {/* Range select for Chart */}
                {activeTab === "chart" && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400 font-sans">{t.dateRange}</span>
                    <div className="flex rounded-md overflow-hidden border border-white/5 font-mono text-[10px]">
                      {["5d", "10d", "20d", "all"].map((range) => (
                        <button
                          key={range}
                          onClick={() => setSelectedRange(range)}
                          className={`px-2.5 py-1 transition-colors cursor-pointer ${
                            selectedRange === range ? "bg-[#2DD4A7] text-black font-bold" : "bg-[#12161A] text-slate-400 hover:text-white"
                          }`}
                        >
                          {range === "5d" ? t.range5d : range === "10d" ? t.range10d : range === "20d" ? t.range20d : t.rangeAll}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* TAB 1: Chart Overlay */}
              {activeTab === "chart" ? (
                <div className="bg-[#12161A]/40 border border-white/5 rounded-xl p-5 space-y-4">
                  <div>
                    <h4 className="font-display font-bold text-xs text-white uppercase tracking-wider flex items-center gap-1.5">
                      {t.historicalChartTitle}
                    </h4>
                    <p className="text-[10px] text-slate-400 font-sans mt-0.5 leading-relaxed">
                      {t.historicalChartDesc}
                    </p>
                  </div>

                  <div className="h-[340px] w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#818CF8" stopOpacity={0.15}/>
                            <stop offset="95%" stopColor="#818CF8" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                        <XAxis 
                          dataKey="date" 
                          stroke="#4B5563" 
                          fontSize={9} 
                          fontFamily="JetBrains Mono"
                          tickLine={false} 
                        />
                        <YAxis 
                          stroke="#4B5563" 
                          fontSize={9} 
                          fontFamily="JetBrains Mono"
                          tickLine={false}
                          domain={['auto', 'auto']}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend 
                          verticalAlign="top" 
                          height={36} 
                          iconSize={8}
                          style={{ fontFamily: "Inter", fontSize: "11px" }}
                        />
                        
                        {/* Major Support Put Wall 1 */}
                        <Line 
                          name={lang === "zh" ? "買權牆 (阻力 Call Wall)" : "Call Wall"} 
                          type="monotone" 
                          dataKey="call_wall_1" 
                          stroke="#2DD4A7" 
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          dot={false}
                          activeDot={false}
                        />

                        {/* Major Resistance Call Wall 1 */}
                        <Line 
                          name={lang === "zh" ? "賣權牆 (支撐 Put Wall)" : "Put Wall"} 
                          type="monotone" 
                          dataKey="put_wall_1" 
                          stroke="#F2545B" 
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          dot={false}
                          activeDot={false}
                        />

                        {/* Zero-GEX Gamma Flip Level */}
                        <Line 
                          name={lang === "zh" ? "Gamma Flip 分水嶺" : "Gamma Flip Pivot"} 
                          type="monotone" 
                          dataKey="flip_level" 
                          stroke="#F2A93B" 
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 6 }}
                        />

                        {/* Spot/Last Close Price */}
                        <Line 
                          name={lang === "zh" ? `指數收盤價 (${instrument})` : `Index Close (${instrument})`} 
                          type="monotone" 
                          dataKey="close" 
                          stroke="#818CF8" 
                          strokeWidth={2.5}
                          fill="url(#colorClose)"
                          dot={<CustomDot />}
                          activeDot={{ r: 7 }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Legend explanatory helper */}
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] font-sans border-t border-white/5 pt-3.5 mt-1 text-slate-400">
                    <span className="font-bold text-slate-300 font-display">{t.regimeOverlay}:</span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#2DD4A7]" />
                      <span>{t.range_bound}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#F2A93B]" />
                      <span>{t.range_at_edge}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#F2545B]" />
                      <span>{t.trending}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#C084FC]" />
                      <span>{t.chop_whipsaw}</span>
                    </span>
                  </div>
                </div>
              ) : (
                
                /* TAB 2: Table Ledger */
                <div className="overflow-x-auto rounded-lg border border-white/5">
                  <table className="w-full text-left font-mono text-xs select-none">
                    
                    {/* Table Head */}
                    <thead className="bg-[#161C22]/80 text-slate-400 border-b border-white/5">
                      <tr>
                        <th className="p-3">{lang === "zh" ? "日期" : "Date"}</th>
                        <th className="p-3 text-right">{lang === "zh" ? "收盤價格" : "Close Price"}</th>
                        <th className="p-3 text-right">{lang === "zh" ? "Gamma Flip 軸" : "Gamma Flip"}</th>
                        <th className="p-3 text-right text-[#F2545B]">{lang === "zh" ? "主力賣權牆" : "Put Wall"}</th>
                        <th className="p-3 text-right text-[#2DD4A7]">{lang === "zh" ? "主力買權牆" : "Call Wall"}</th>
                        <th className="p-3 text-center">{lang === "zh" ? "Gamma 狀態" : "Gamma State"}</th>
                        <th className="p-3 text-center">{lang === "zh" ? "市場結構模型" : "Regime"}</th>
                        <th className="p-3 text-center">{lang === "zh" ? "置信度" : "Confidence"}</th>
                        <th className="p-3 text-center">{lang === "zh" ? "操作" : "Action"}</th>
                      </tr>
                    </thead>

                    {/* Table Body */}
                    <tbody className="divide-y divide-white/5 bg-[#12161A]/40">
                      {history.map((item, idx) => {
                        const isCurrent = item.date === activeDate;
                        
                        return (
                          <tr 
                            key={idx} 
                            className={`hover:bg-[#161C22]/50 transition-all ${isCurrent ? "bg-indigo-500/[0.04]" : ""}`}
                          >
                            {/* DATE */}
                            <td className="p-3 font-semibold">
                              <span className="flex items-center gap-1.5">
                                {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />}
                                <span className={isCurrent ? "text-indigo-300" : "text-slate-300"}>{item.date}</span>
                              </span>
                            </td>

                            {/* CLOSE PRICE */}
                            <td className="p-3 text-right font-bold text-slate-100">{item.close}</td>

                            {/* GAMMA FLIP */}
                            <td className="p-3 text-right text-amber-400 font-semibold">{item.flip_level}</td>

                            {/* PUT WALL 1 */}
                            <td className="p-3 text-right text-red-400/80">{item.put_wall_1}</td>

                            {/* CALL WALL 1 */}
                            <td className="p-3 text-right text-emerald-400/80">{item.call_wall_1}</td>

                            {/* GEX STATE */}
                            <td className="p-3 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                item.status === "positive" ? "text-[#2DD4A7] bg-[#2DD4A7]/10" : "text-[#F2545B] bg-[#F2545B]/10"
                              }`}>
                                {item.status.toUpperCase()}
                              </span>
                            </td>

                            {/* REGIME */}
                            <td className="p-3 text-center">
                              <span className={`inline-block px-2 py-0.5 text-[9px] rounded-full border ${getBadgeColor(item.quadrant)}`}>
                                {lang === "zh" ? item.label : translations.en[item.quadrant]}
                              </span>
                            </td>

                            {/* DATA CONFIDENCE */}
                            <td className="p-3 text-center">
                              <span className={`text-[9px] uppercase font-bold font-sans ${
                                item.confidence === "high" ? "text-emerald-400" :
                                item.confidence === "medium" ? "text-amber-400" :
                                "text-red-400"
                              }`}>
                                ● {item.confidence === "high" ? t.confidenceHigh.split(" ")[0] : item.confidence === "medium" ? t.confidenceMedium.split(" ")[0] : t.confidenceLow.split(" ")[0]}
                              </span>
                            </td>

                            {/* LOAD BUTTON */}
                            <td className="p-3 text-center">
                              {isCurrent ? (
                                <span className="text-[10px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded uppercase font-sans">
                                  {t.activeView}
                                </span>
                              ) : (
                                <button
                                  onClick={() => onSelectDate(item.date)}
                                  className="px-2 py-0.5 bg-[#171E24] hover:bg-indigo-500 hover:text-white border border-[#2C3843] text-slate-300 text-[10px] rounded transition-all cursor-pointer font-sans uppercase"
                                >
                                  {t.loadReport}
                                </button>
                              )}
                            </td>

                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

            </div>
          )}
        </div>
      )}
    </div>
  );
};
