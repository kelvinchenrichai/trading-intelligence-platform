/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 前端 Supabase 認證 (Google 登入) — runtime 設定版
 *
 * 不再依賴 build 階段的 VITE_ 變數 (那需要 Docker build args,在 Render 上容易
 * 漏設導致前端拿不到金鑰、出現 401 "No API key found")。改為瀏覽器啟動時向後端
 * /api/config 動態取得 Supabase 網址與 publishable key。這些值都是可公開的前端
 * 設定,不含後端 secret。
 */

import { createClient, Session, SupabaseClient, User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

export type UserRole = "admin" | "member" | "guest";

interface RuntimeConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  adminEmails: string[];
}

let cachedClient: SupabaseClient | null = null;
let cachedConfig: RuntimeConfig | null = null;
let configPromise: Promise<RuntimeConfig | null> | null = null;

async function loadConfig(): Promise<RuntimeConfig | null> {
  if (cachedConfig) return cachedConfig;
  if (configPromise) return configPromise;

  configPromise = (async () => {
    try {
      const res = await fetch("/api/config");
      if (!res.ok) return null;
      const data = await res.json();
      const url = (data.supabaseUrl || "").trim();
      const key = (data.supabaseAnonKey || "").trim();
      const admins = String(data.adminEmails || "")
        .split(",")
        .map((e: string) => e.trim().toLowerCase())
        .filter(Boolean);
      if (!admins.includes("kelvinchen20000108@gmail.com")) {
        admins.push("kelvinchen20000108@gmail.com");
      }
      if (!url || !key) {
        cachedConfig = { supabaseUrl: "", supabaseAnonKey: "", adminEmails: admins };
        return cachedConfig;
      }
      cachedConfig = { supabaseUrl: url, supabaseAnonKey: key, adminEmails: admins };
      cachedClient = createClient(url, key);
      return cachedConfig;
    } catch {
      return null;
    }
  })();

  return configPromise;
}

function roleForEmail(email: string | undefined | null, admins: string[]): UserRole {
  if (!email) return "guest";
  return admins.includes(email.toLowerCase()) ? "admin" : "member";
}

export interface AuthState {
  user: User | null;
  session: Session | null;
  role: UserRole;
  loading: boolean;
  configured: boolean;
}

export function useAuth(): AuthState & {
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
} {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [configured, setConfigured] = useState<boolean>(false);
  const [admins, setAdmins] = useState<string[]>(["kelvinchen20000108@gmail.com"]);

  useEffect(() => {
    let active = true;
    (async () => {
      const cfg = await loadConfig();
      if (!active) return;
      if (cfg) setAdmins(cfg.adminEmails);
      if (cachedClient) {
        setConfigured(true);
        const { data } = await cachedClient.auth.getSession();
        if (!active) return;
        setSession(data.session);
        cachedClient.auth.onAuthStateChange((_e, s) => {
          setSession(s);
        });
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const signInWithGoogle = async () => {
    if (!cachedClient) return;
    await cachedClient.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  };

  const signOut = async () => {
    if (!cachedClient) return;
    await cachedClient.auth.signOut();
    setSession(null);
  };

  const user = session?.user ?? null;
  const role = roleForEmail(user?.email, admins);

  return { user, session, role, loading, configured, signInWithGoogle, signOut };
}
