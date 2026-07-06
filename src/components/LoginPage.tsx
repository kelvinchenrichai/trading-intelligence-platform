/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * LoginPage — 會員制登入頁
 *
 * 未登入時整頁顯示,登入後由 App 切換到主系統。
 * 使用 Google OAuth (redirect 流程,LINE 內建瀏覽器相容)。
 */

import React from "react";
import { LogIn, TrendingUp, ShieldCheck, BarChart3, Lock } from "lucide-react";
import { useAuth } from "../auth";

interface LoginPageProps {
  lang?: "zh" | "en";
  auth: ReturnType<typeof useAuth>;
}

export const LoginPage: React.FC<LoginPageProps> = ({ lang = "zh", auth }) => {
  const isZh = lang === "zh";
  const { signInWithGoogle, configured, loading } = auth;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0E12] px-6 relative overflow-hidden">
      {/* 背景光暈 */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-[#2DD4A7]/5 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-indigo-500/5 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="glass-card p-8 sm:p-10 text-center">
          {/* Logo / 品牌 */}
          <div className="flex items-center justify-center gap-2.5 mb-2">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-400 to-[#2DD4A7] flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <TrendingUp className="w-6 h-6 text-black" />
            </div>
          </div>
          <h1 className="font-display font-extrabold text-xl text-white mt-3">
            Trading Intelligence
          </h1>
          <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
            {isZh
              ? "GEX / Gamma 敞口分析終端 — 請登入以繼續"
              : "GEX / Gamma exposure terminal — sign in to continue"}
          </p>

          {/* 特色列 */}
          <div className="flex justify-center gap-5 my-7 text-[10px] font-mono text-slate-500">
            <div className="flex flex-col items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-[#2DD4A7]" />
              <span>{isZh ? "GEX 分析" : "GEX"}</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#2DD4A7]" />
              <span>{isZh ? "多源核對" : "Verified"}</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <Lock className="w-4 h-4 text-[#2DD4A7]" />
              <span>{isZh ? "會員專屬" : "Members"}</span>
            </div>
          </div>

          {/* 登入按鈕 */}
          {loading ? (
            <div className="py-3 text-xs font-mono text-slate-500">
              {isZh ? "載入中…" : "Loading…"}
            </div>
          ) : configured ? (
            <button
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-2.5 bg-white hover:bg-slate-100 text-slate-800 px-4 py-3 rounded-xl font-bold text-sm transition-all cursor-pointer shadow-lg"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span>{isZh ? "使用 Google 登入" : "Sign in with Google"}</span>
            </button>
          ) : (
            <div className="py-3 px-4 bg-amber-500/5 border border-amber-500/20 rounded-lg text-xs text-amber-400/90 leading-relaxed">
              {isZh
                ? "登入服務尚未設定完成 (Supabase 設定未就緒)。請稍後再試或聯繫管理員。"
                : "Login is not configured yet. Please try again later."}
            </div>
          )}

          <p className="text-[10px] text-slate-600 mt-6 leading-relaxed">
            {isZh
              ? "登入即表示你同意本平台僅供研究參考,所有數據非投資建議。"
              : "By signing in you acknowledge this platform is for research only and not investment advice."}
          </p>
        </div>
      </div>
    </div>
  );
};
