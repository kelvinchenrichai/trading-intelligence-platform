/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AuthButton — Header 上的登入 / 使用者選單
 *  - 未登入:顯示「使用 Google 登入」按鈕 (redirect 流程)
 *  - 已登入:顯示 email + 角色徽章 + 登出
 *  - 未設定 Supabase:顯示提示,不崩潰
 */

import React, { useState } from "react";
import { LogIn, LogOut, ShieldCheck, User as UserIcon, ChevronDown } from "lucide-react";
import { useAuth, UserRole } from "../auth";

interface AuthButtonProps {
  lang?: "zh" | "en";
  /** 由上層傳入共用的 auth 狀態,避免多個 hook 實例 */
  auth: ReturnType<typeof useAuth>;
}

const roleLabel = (role: UserRole, isZh: boolean) => {
  if (role === "admin") return isZh ? "最高權限" : "Admin";
  if (role === "member") return isZh ? "會員" : "Member";
  return isZh ? "訪客" : "Guest";
};

const roleColor = (role: UserRole) => {
  if (role === "admin") return "text-[#F2A93B] bg-[#F2A93B]/10 border-[#F2A93B]/20";
  if (role === "member") return "text-[#2DD4A7] bg-[#2DD4A7]/10 border-[#2DD4A7]/20";
  return "text-slate-400 bg-slate-500/10 border-slate-500/20";
};

export const AuthButton: React.FC<AuthButtonProps> = ({ lang = "zh", auth }) => {
  const isZh = lang === "zh";
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, role, loading, signInWithGoogle, signOut } = auth;

  if (!auth.configured) {
    return (
      <span className="text-[10px] font-mono text-slate-500 border border-white/5 px-2.5 py-1.5 rounded-lg">
        {isZh ? "登入尚未設定" : "Auth not configured"}
      </span>
    );
  }

  if (loading) {
    return (
      <span className="text-[10px] font-mono text-slate-500 px-2.5 py-1.5">
        {isZh ? "載入中…" : "Loading…"}
      </span>
    );
  }

  if (!user) {
    return (
      <button
        onClick={signInWithGoogle}
        className="flex items-center gap-2 bg-white hover:bg-slate-100 text-slate-800 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer"
      >
        <LogIn className="w-3.5 h-3.5" />
        <span>{isZh ? "使用 Google 登入" : "Sign in with Google"}</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen((o) => !o)}
        className="flex items-center gap-2 bg-[#1C242B] hover:bg-slate-800 border border-white/5 px-3 py-2 rounded-lg text-xs transition-all cursor-pointer"
      >
        {role === "admin" ? (
          <ShieldCheck className="w-3.5 h-3.5 text-[#F2A93B]" />
        ) : (
          <UserIcon className="w-3.5 h-3.5 text-slate-400" />
        )}
        <span className="text-slate-200 font-semibold max-w-[120px] truncate hidden sm:inline">
          {user.email}
        </span>
        <ChevronDown className="w-3 h-3 text-slate-500" />
      </button>

      {menuOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-[#12161A] border border-white/10 rounded-lg shadow-2xl p-3 z-50 space-y-2.5">
          <div className="pb-2 border-b border-white/5">
            <p className="text-[10px] text-slate-500 uppercase font-mono mb-1">{isZh ? "登入帳號" : "Signed in as"}</p>
            <p className="text-xs text-slate-200 font-semibold truncate">{user.email}</p>
            <span className={`inline-block mt-1.5 px-2 py-0.5 text-[9px] rounded-full border font-bold uppercase ${roleColor(role)}`}>
              {roleLabel(role, isZh)}
            </span>
          </div>
          <button
            onClick={() => {
              setMenuOpen(false);
              signOut();
            }}
            className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-md text-xs text-slate-300 hover:bg-[#1C242B] hover:text-white transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{isZh ? "登出" : "Sign out"}</span>
          </button>
        </div>
      )}
    </div>
  );
};
