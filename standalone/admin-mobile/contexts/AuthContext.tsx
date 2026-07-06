import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import {
  storeSessionCookie,
  getCookieHeaders,
  clearSessionCookie,
} from "@/lib/api";
import { getBaseUrl } from "@/lib/config";

export interface AdminUser {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  title: string | null;
  accessLevel: string;
  active: boolean;
}

interface AuthContextValue {
  admin: AdminUser | null;
  isLoading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function refresh() {
    try {
      const cookieHeaders = await getCookieHeaders();
      const res = await fetch(`${getBaseUrl()}/api/auth/me`, {
        headers: cookieHeaders,
        credentials: Platform.OS === "web" ? "include" : "omit",
      });
      if (res.ok) {
        const data = (await res.json()) as AdminUser;
        setAdmin(data);
      } else {
        setAdmin(null);
      }
    } catch {
      setAdmin(null);
    }
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false));
  }, []);

  async function login(identifier: string, password: string): Promise<void> {
    const res = await fetch(`${getBaseUrl()}/api/auth/unified-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: Platform.OS === "web" ? "include" : "omit",
      body: JSON.stringify({ identifier, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Login failed" }));
      throw new Error((err as { error?: string }).error ?? "Login failed");
    }

    await storeSessionCookie(res.headers);

    const data = (await res.json()) as {
      type: "admin" | "worker";
      user?: AdminUser;
    };

    if (data.type !== "admin") {
      await clearSessionCookie();
      throw new Error(
        "This app is for admins only. Workers should use the worker mobile app."
      );
    }

    if (data.user) {
      setAdmin(data.user);
    } else {
      await refresh();
    }
  }

  async function logout() {
    try {
      const cookieHeaders = await getCookieHeaders();
      await fetch(`${getBaseUrl()}/api/auth/logout`, {
        method: "POST",
        headers: cookieHeaders,
        credentials: Platform.OS === "web" ? "include" : "omit",
      });
    } catch {}
    await clearSessionCookie();
    setAdmin(null);
  }

  return (
    <AuthContext.Provider value={{ admin, isLoading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
