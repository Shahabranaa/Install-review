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
import { registerForPushNotificationsAsync } from "@/lib/push-notifications";

export interface WorkerUser {
  id: number;
  name: string;
  email: string | null;
  company: string | null;
  portalUsername: string | null;
}

interface AuthContextValue {
  worker: WorkerUser | null;
  isLoading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getBaseUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [worker, setWorker] = useState<WorkerUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function refresh() {
    try {
      const cookieHeaders = await getCookieHeaders();
      const res = await fetch(`${getBaseUrl()}/api/worker-portal/me`, {
        headers: cookieHeaders,
        credentials: Platform.OS === "web" ? "include" : "omit",
      });
      if (res.ok) {
        const data = (await res.json()) as WorkerUser;
        setWorker(data);
        void registerForPushNotificationsAsync();
      } else {
        setWorker(null);
      }
    } catch {
      setWorker(null);
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
      worker?: WorkerUser;
    };

    if (data.type !== "worker") {
      await clearSessionCookie();
      throw new Error("Admin accounts must use the web portal");
    }

    if (data.worker) {
      setWorker(data.worker);
      void registerForPushNotificationsAsync();
    } else {
      await refresh();
    }
  }

  async function logout() {
    try {
      const cookieHeaders = await getCookieHeaders();
      await fetch(`${getBaseUrl()}/api/worker-portal/logout`, {
        method: "POST",
        headers: cookieHeaders,
        credentials: Platform.OS === "web" ? "include" : "omit",
      });
    } catch {}
    await clearSessionCookie();
    setWorker(null);
  }

  return (
    <AuthContext.Provider value={{ worker, isLoading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
