import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [worker, setWorker] = useState<WorkerUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function refresh() {
    try {
      const res = await fetch(`${API_BASE}/api/worker-portal/me`, { credentials: "include" });
      if (res.ok) {
        setWorker(await res.json());
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

  async function login(identifier: string, password: string) {
    const res = await fetch(`${API_BASE}/api/worker-portal/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ identifier, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Login failed" }));
      throw new Error(err.error ?? "Login failed");
    }
    setWorker(await res.json());
  }

  async function logout() {
    await fetch(`${API_BASE}/api/worker-portal/logout`, { method: "POST", credentials: "include" });
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
