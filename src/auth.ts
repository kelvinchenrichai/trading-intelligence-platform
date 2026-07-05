/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 前端 Supabase 認證 (Google 登入)
 *
 * 使用 Supabase 內建的 Google OAuth。前端只用「anon public key」
 * (可安全公開的金鑰),絕不使用後端的 service/secret key。
 *
 * 需要的環境變數 (在 .env,前端變數必須以 VITE_ 開頭才會被 Vite 打包):
 *   VITE_SUPABASE_URL       你的 Supabase 專案網址
 *   VITE_SUPABASE_ANON_KEY  Supabase 的 anon public key
 *   VITE_ADMIN_EMAILS       最高權限 email,逗號分隔 (預設含你的帳號)
 *
 * OAuth 用 redirect 流程 (非彈窗),因此 LINE 內建瀏覽器也能正常運作。
 */

import { createClient, Session, User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// 最高權限 email 清單:優先讀環境變數,並永遠包含擁有者帳號作為保底。
const ADMIN_EMAILS = (
  (import.meta.env.VITE_ADMIN_EMAILS as string | undefined) || ""
)
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
if (!ADMIN_EMAILS.includes("kelvinchen20000108@gmail.com")) {
  ADMIN_EMAILS.push("kelvinchen20000108@gmail.com");
}

// 若環境變數未設定,supabase 為 null;UI 會顯示「登入尚未設定」而不是崩潰。
export const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

export const isAuthConfigured = Boolean(supabase);

export type UserRole = "admin" | "member" | "guest";

export interface AuthState {
  user: User | null;
  session: Session | null;
  role: UserRole;
  loading: boolean;
}

function roleForEmail(email: string | undefined | null): UserRole {
  if (!email) return "guest";
  return ADMIN_EMAILS.includes(email.toLowerCase()) ? "admin" : "member";
}

/** React hook:管理登入狀態與角色 */
export function useAuth(): AuthState & {
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
} {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    // 取得目前 session
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    // 監聽登入/登出變化
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // 登入完成後導回目前網址 (redirect 流程,LINE 瀏覽器相容)
        redirectTo: window.location.origin,
      },
    });
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
  };

  const user = session?.user ?? null;
  const role = roleForEmail(user?.email);

  return { user, session, role, loading, signInWithGoogle, signOut };
}
