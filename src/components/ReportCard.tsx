/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { motion } from "motion/react";
import { 
  TrendingUp, 
  Activity, 
  Compass, 
  Layers, 
  Info,
  Shield,
  Zap,
  CheckCircle2
} from "lucide-react";
import { DailyReport } from "../types";
import { translations } from "../utils/translations";

interface ReportCardProps {
  report: DailyReport;
  lang?: "zh" | "en";
}

export const ReportCard: React.FC<ReportCardProps> = ({ report, lang = "zh" }) => {
  const { gamma, price, regime, technicals, plan_notes } = report;

  const t = translations[lang];

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

  // Calculate the percentage position of current price in [Put Wall 1, Flip Level, Call Wall 1]
  const left = gamma.put_walls[0]?.strike || price.last * 0.98;
  const mid = gamma.flip_level;
  const right = gamma.call_walls[0]?.strike || price.last * 1.02;
  const lastPrice = price.last;

  let pct = 50; // default at flip
  if (lastPrice <= left) {
    pct = 0;
  } else if (lastPrice >= right) {
    pct = 100;
  } else if (lastPrice < mid) {
    // left half (0% to 50%)
    pct = ((lastPrice - left) / (mid - left)) * 50;
  } else {
    // right half (50% to 100%)
    pct = 50 + ((lastPrice - mid) / (right - mid)) * 50;
  }

  // Set colors based on quadrant
  const getRegimeColor = (quad: string) => {
    switch (quad) {
      case "range_bound":
        return { text: "text-[#2DD4A7]", bg: "bg-[#2DD4A7]/10", border: "border-[#2DD4A7]/20", accent: "#2DD4A7" };
      case "range_at_edge":
        return { text: "text-[#F2A93B]", bg: "bg-[#F2A93B]/10", border: "border-[#F2A93B]/20", accent: "#F2A93B" };
      case "chop_whipsaw":
        return { text: "text-[#F2A93B]", bg: "bg-[#F2A93B]/10", border: "border-[#F2A93B]/20", accent: "#F2A93B" };
      case "trending":
      default:
        return { text: "text-[#F2545B]", bg: "bg-[#F2545B]/10", border: "border-[#F2545B]/20", accent: "#F2545B" };
    }
  };

  const colors = getRegimeColor(regime.quadrant);

  // Compute GEX Ranks 1 to 4 (Top 4 highest absolute net GEX strikes)
  const gexRanks = [...gamma.gex_strikes]
    .sort((a, b) => Math.abs(b.net_gex) - Math.abs(a.net_gex))
    .slice(0, 4)
    .map((item, idx) => ({
      rank: idx + 1,
      strike: item.strike,
      net_gex: item.net_gex,
      call_gex: item.call_gex,
      put_gex: item.put_gex,
      type: item.net_gex >= 0 ? "call" : "put",
      oi: item.oi
    }));

  // Dynamic label translator
  const getTranslatedLabel = () => {
    if (lang === "zh") return regime.label;
    return t[regime.quadrant] || regime.label;
  };

  // Dynamic rationale translator helper
  const getTranslatedRationale = () => {
    if (lang === "zh") return regime.rationale;
    
    // Fallback translation mappings for English
    let text = regime.rationale;
    if (regime.quadrant === "range_bound") {
      text = `Price is inside the positive Gamma safe zone, away from outer boundaries. Dealer hedging (buying dips, selling rallies) will suppress intraday volatility. Market is highly likely to fluctuate between support ${left} and resistance ${right}.`;
    } else if (regime.quadrant === "range_at_edge") {
      text = `Market is in positive Gamma territory, but the spot price is approaching extreme boundaries near ${lastPrice > mid ? `Call Wall (${right})` : `Put Wall (${left})`}. Be alert for dealer defensive positioning; any breakouts will trigger rapid short-covering volatility.`;
    } else if (regime.quadrant === "chop_whipsaw") {
      text = `Spot price is hovering extremely close to the Zero-Gamma Flip pivot (${mid}). At this threshold, dealer positioning switches rapidly between suppressing and accelerating trends, triggering whipsaw consolidations and stop-run spikes. Watch from the sidelines.`;
    } else if (regime.quadrant === "trending") {
      text = `Deep negative Gamma expansion environment. Market makers are short Gamma, meaning they must hedge by selling down-breaks and buying up-breaks, reinforcing the prevailing trend. Breaking ${lastPrice < mid ? `Put Wall (${left})` : `Call Wall (${right})`} will trigger intense trend acceleration.`;
    }
    return text;
  };

  // Translate plan notes for English fallback
  const getTranslatedPlanNotes = () => {
    if (lang === "zh") return plan_notes;

    // Standard high-quality translations
    if (regime.quadrant === "range_bound") {
      return [
        `【Range Trading】Consider buying near Put Wall (${left}) with targets looking toward Flip Axis (${mid}) or Call Wall (${right}).`,
        `【Volatility Suppressed】Under positive Gamma, clean breakout trends are rare. Avoid FOMO breakout chasing.`,
        `【Max Pain Attraction】Spot is closing in on the Max Pain结算 level (${gamma.max_pain}), signaling expiry magnet convergence.`
      ];
    } else if (regime.quadrant === "range_at_edge") {
      return [
        `【Monitor Breakouts】Watch defense closely at the Call/Put Wall (${lastPrice > mid ? right : left}). A sustained 15-minute breakout forces dealers to rapidly cover positions, triggering a short squeeze.`,
        `【Fading Edge】If rejection candle forms at the wall, attempt low-risk fade trades, setting stops 0.3% outside the wall.`
      ];
    } else if (regime.quadrant === "trending") {
      return [
        `【Ride the Trend】Dealer Short Gamma auto-hedging acts as a powerful volatility accelerant. Trade in direction of breakout; do not catch falling knives.`,
        `【Key Pivots】As long as spot is below Flip level (${mid}), any rally toward Flip is a strong risk-defined shorting opportunity. Track Expected Move Low (${price.expected_move.low}) for target taking.`,
        `【Volatility Surge】VIX is elevated. Short Gamma accentuates swing sizes. Reduce position sizes and widen stops to avoid whipsaws.`
      ];
    } else {
      return [
        `// Whipsaw Risk // Spot is clinging to the Zero-Gamma Flip boundary (${mid}). Whipsaw sweeps are common; conserve capital.`,
        `// Wait for Escape // Wait for spot to clear the Flip level by at least 0.5% to establish a dominant Gamma environment before executing.`
      ];
    }
  };

  return (
    <div id="report-card" className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      
      {/* SECTION 1: Quadrant Header and State Card */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="col-span-1/1 lg:col-span-8 glass-card p-6 relative overflow-hidden flex flex-col justify-between"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-radial from-emerald-500/5 to-transparent rounded-full pointer-events-none" />
        
        <div>
          {/* Core Header info */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-white/5 pb-5">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${colors.bg} ${colors.text} border ${colors.border}`}>
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">{t.marketStructureState}</div>
                <h3 className="font-display text-xl font-bold text-white flex items-center gap-2">
                  {getTranslatedLabel()}
                  <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-sans font-medium uppercase ${colors.bg} ${colors.text}`}>
                    {regime.quadrant.replace("_", " ")}
                  </span>
                </h3>
              </div>
            </div>

            {/* Gamma Exposure status badge */}
            <div className="flex items-center gap-4 bg-[#1B2127] border border-white/5 rounded-lg px-4 py-2">
              <div className="text-right">
                <span className="text-[10px] uppercase font-mono text-[#8E9299] block">{t.gammaEnvironment}</span>
                <span className={`text-xs font-bold font-mono uppercase ${gamma.status === "positive" ? "text-[#2DD4A7] glow-pos" : "text-[#F2545B] glow-neg"}`}>
                  {gamma.status === "positive" ? t.positiveGamma : t.negativeGamma}
                </span>
              </div>
            </div>
          </div>

          {/* Rationale description */}
          <div className="mb-6">
            <p className="text-sm text-slate-300 leading-relaxed bg-[#191F25] border-l-2 border-[#2DD4A7] p-4 rounded-r-lg font-sans">
              {getTranslatedRationale()}
            </p>
          </div>
        </div>

        {/* 2.2 Dynamic Signal Element: Price Relative Location Gauge */}
        <div className="bg-[#171E24]/60 border border-white/5 rounded-xl p-5 mt-auto">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#2DD4A7]" />
              <span className="text-xs font-display font-medium text-slate-200">{t.priceRelativeGauge}</span>
            </div>
            <span className="text-[10px] font-mono text-[#8E9299]">{t.relativeGaugeDesc}</span>
          </div>

          {/* Progress gauge visual track */}
          <div className="relative pt-6 pb-2 px-1">
            <div className="h-2 w-full rounded-full bg-gradient-to-r from-[#F2545B] via-[#F2A93B] to-[#2DD4A7] relative shadow-inner">
              
              {/* Central Flip Level axis separator */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-4 w-[2px] bg-white z-10" />

            </div>

            {/* Labels beneath progress track */}
            <div className="flex justify-between items-start mt-4 font-mono text-[11px]">
              {/* Left boundary (Put Wall 1) */}
              <div className="text-left max-w-[110px]">
                <span className="text-slate-400 block text-[9px] uppercase">{t.majorPutWall.split(" - ")[0]}</span>
                <span className="text-[#F2545B] glow-neg font-bold block">{left}</span>
                <span className="text-slate-500 block text-[9px]">{lang === "zh" ? "極致空頭地板" : "Major Floor"}</span>
              </div>

              {/* Center Pivot (Gamma Flip) */}
              <div className="text-center">
                <span className="text-slate-400 block text-[9px] uppercase">{t.majorFlip.split(" - ")[0]}</span>
                <span className="text-[#F2A93B] glow-warn font-bold block bg-[#1E252D] px-2 py-0.5 rounded border border-white/5">{mid}</span>
                <span className="text-slate-500 block text-[9px]">{lang === "zh" ? "多空臨界零點" : "Zero Boundary"}</span>
              </div>

              {/* Right boundary (Call Wall 1) */}
              <div className="text-right max-w-[110px]">
                <span className="text-slate-400 block text-[9px] uppercase">{t.majorCallWall.split(" - ")[0]}</span>
                <span className="text-[#2DD4A7] glow-pos font-bold block">{right}</span>
                <span className="text-slate-500 block text-[9px]">{lang === "zh" ? "極致多頭天花板" : "Major Ceiling"}</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* SECTION 2: Price Metrics and Expected Move */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="col-span-1/1 lg:col-span-4 glass-card p-6 flex flex-col justify-between"
      >
        <div>
          <h4 className="font-display font-bold text-sm text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#2DD4A7]" /> {t.keyPriceParameters}
          </h4>

          {/* Expected Move Widget */}
          <div className="bg-[#171E24]/60 p-4 rounded-lg border border-white/5 mb-4">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-mono text-slate-400 uppercase block">{t.expectedMove}</span>
              <span className="text-[10px] font-mono text-[#2DD4A7] font-bold bg-[#2DD4A7]/5 px-1.5 py-0.5 rounded">
                ±{price.expected_move.points} pts
              </span>
            </div>

            <div className="flex justify-between items-center mt-2 font-mono">
              <div className="text-left">
                <span className="text-[9px] text-[#8E9299] uppercase block">{t.emDownside}</span>
                <span className="text-sm font-bold text-[#F2545B]">{price.expected_move.low}</span>
              </div>
              
              {/* Segmented bar representation of Expected Move */}
              <div className="flex-1 mx-3 h-1.5 rounded-full bg-slate-700 relative overflow-hidden flex">
                <div className="w-1/3 h-full bg-[#F2545B]/30" />
                <div className="w-1/3 h-full bg-[#2DD4A7]" />
                <div className="w-1/3 h-full bg-[#2DD4A7]/30" />
              </div>

              <div className="text-right">
                <span className="text-[9px] text-[#8E9299] uppercase block">{t.emUpside}</span>
                <span className="text-sm font-bold text-[#2DD4A7]">{price.expected_move.high}</span>
              </div>
            </div>
          </div>

          {/* Max Pain Magnet */}
          <div className="bg-[#171E24]/60 p-4 rounded-lg border border-white/5">
            <span className="text-[10px] font-mono text-slate-400 uppercase block">{t.maxPainLevel}</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="font-mono text-xl font-bold text-indigo-400">{gamma.max_pain}</span>
              <span className="text-[10px] font-sans text-slate-500 flex items-center gap-1">
                <Info className="w-3 h-3" /> {t.maxPainDesc}
              </span>
            </div>
          </div>
        </div>

        {/* Overnight High / Low parameters */}
        <div className="border-t border-white/5 pt-4 mt-4 grid grid-cols-2 gap-3 font-mono text-xs">
          <div className="bg-[#161D22]/60 p-2.5 rounded border border-white/5 text-center">
            <span className="text-[9px] text-slate-500 uppercase block">{t.overnightHigh}</span>
            <span className="text-slate-200 font-semibold">{technicals.overnight_high}</span>
          </div>
          <div className="bg-[#161D22]/60 p-2.5 rounded border border-white/5 text-center">
            <span className="text-[9px] text-slate-500 uppercase block">{t.overnightLow}</span>
            <span className="text-slate-200 font-semibold">{technicals.overnight_low}</span>
          </div>
        </div>
      </motion.div>

      {/* SECTION 3: Ladder of Levels & GEX Ranks */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="col-span-1/1 lg:col-span-5 glass-card p-6 flex flex-col justify-between"
      >
        <div>
          <h4 className="font-display font-bold text-sm text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#2DD4A7]" /> {t.structureLevelLadder}
          </h4>

          {/* Level ladder list */}
          <div className="space-y-2">
            {/* Call Wall 2 */}
            <div className="flex justify-between items-center bg-[#171E24]/40 hover:bg-[#171E24]/80 p-2 rounded border border-white/5 transition-all font-mono text-xs">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#2DD4A7]/40" />
                <span className="text-slate-400">{lang === "zh" ? "次要買權牆 (Call Wall Rank 2)" : "Call Wall (Rank 2)"}</span>
              </div>
              <span className="text-[#2DD4A7]/80 font-bold">{gamma.call_walls[1]?.strike}</span>
            </div>

            {/* Call Wall 1 */}
            <div className="flex justify-between items-center bg-[#1D2B24] hover:bg-[#203229] p-2.5 rounded border border-[#2DD4A7]/20 transition-all font-mono text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-sm bg-[#2DD4A7] animate-pulse" />
                <span className="text-emerald-300 font-semibold">{t.majorCallWall}</span>
              </div>
              <span className="text-[#2DD4A7] glow-pos font-extrabold">{gamma.call_walls[0]?.strike}</span>
            </div>

            {/* Gamma Flip */}
            <div className="flex justify-between items-center bg-[#2B231D] hover:bg-[#342921] p-2.5 rounded border border-[#F2A93B]/20 transition-all font-mono text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#F2A93B]" />
                <span className="text-amber-200 font-semibold">{t.majorFlip}</span>
              </div>
              <span className="text-[#F2A93B] glow-warn font-extrabold">{gamma.flip_level}</span>
            </div>

            {/* Put Wall 1 */}
            <div className="flex justify-between items-center bg-[#2C1F22] hover:bg-[#352327] p-2.5 rounded border border-[#F2545B]/20 transition-all font-mono text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-sm bg-[#F2545B] animate-pulse" />
                <span className="text-[#F2545B] font-semibold">{t.majorPutWall}</span>
              </div>
              <span className="text-[#F2545B] glow-neg font-extrabold">{gamma.put_walls[0]?.strike}</span>
            </div>

            {/* Put Wall 2 */}
            <div className="flex justify-between items-center bg-[#171E24]/40 hover:bg-[#171E24]/80 p-2 rounded border border-white/5 transition-all font-mono text-xs">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#F2545B]/40" />
                <span className="text-slate-400">{lang === "zh" ? "次要賣權牆 (Put Wall Rank 2)" : "Put Wall (Rank 2)"}</span>
              </div>
              <span className="text-[#F2545B]/80 font-bold">{gamma.put_walls[1]?.strike}</span>
            </div>
          </div>
        </div>

        {/* SECTION 3B: GEX Ranks 1-4 */}
        <div className="mt-6 pt-5 border-t border-white/5">
          <h5 className="font-display font-bold text-xs text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-[#F2A93B]" />
            {t.gexRanksTitle}
          </h5>
          <p className="text-[10px] text-slate-400 font-sans leading-relaxed mb-3">
            {t.gexRanksDesc}
          </p>
          
          <div className="grid grid-cols-2 gap-3 font-mono text-xs">
            {gexRanks.map((item) => (
              <div 
                key={item.rank} 
                className="bg-[#171E24]/60 p-3 rounded-lg border border-white/5 flex flex-col justify-between hover:bg-[#1B242D]/60 transition-colors"
              >
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[9px] text-slate-500 uppercase">GEX{item.rank}</span>
                  <span className={`px-1 rounded text-[8px] font-bold ${
                    item.type === "call" ? "text-[#2DD4A7] bg-[#2DD4A7]/10" : "text-[#F2545B] bg-[#F2545B]/10"
                  }`}>
                    {item.type === "call" ? (lang === "zh" ? "買權" : "CALL") : (lang === "zh" ? "賣權" : "PUT")}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-extrabold text-white">{item.strike}</span>
                  <span className={`text-[9px] font-bold ${item.type === "call" ? "text-[#2DD4A7]" : "text-[#F2545B]"}`}>
                    {formatTooltipGex(item.net_gex)}
                  </span>
                </div>
                
                {/* Micro tooltip explanation of hedging effect */}
                <div className="mt-2 pt-1.5 border-t border-white/5 text-[9px] text-slate-400 font-sans leading-normal">
                  <strong>{t.hedgingEffect}</strong>
                  {item.type === "call" ? t.longGammaMagnet : t.shortGammaAccelerant}
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* SECTION 4: Professional Trading Reference Notes */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="col-span-1/1 lg:col-span-7 glass-card p-6"
      >
        <h4 className="font-display font-bold text-sm text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Shield className="w-4 h-4 text-[#2DD4A7]" /> {t.actionGuidelines}
        </h4>

        {/* Actionable items list */}
        <div className="space-y-4">
          {getTranslatedPlanNotes().map((note, index) => (
            <div 
              key={index}
              className="flex items-start gap-3 bg-[#171E24]/60 hover:bg-[#1A232A]/60 p-4 rounded-lg border border-white/5 transition-colors animate-fade-in"
            >
              <div className="p-1 rounded bg-[#2DD4A7]/10 text-[#2DD4A7] mt-0.5 flex-shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <p className="text-sm text-slate-300 leading-relaxed font-sans">{note}</p>
            </div>
          ))}
        </div>
      </motion.div>

    </div>
  );
};
