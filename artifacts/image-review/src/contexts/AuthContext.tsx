import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  email?: string | null;
  title?: string | null;
  accessLevel: "admin" | "reviewer" | "viewer";
  active: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAdmin: boolean;
  isReviewer: boolean;
  login: (identifier: string, password: string) => Promise<"admin" | "worker">;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function refresh() {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: "include" });
      if (res.ok) {
        setUser(await res.json());
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false));
  }, []);

  async function login(identifier: string, password: string): Promise<"admin" | "worker"> {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/auth/unified-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ identifier, password }),
      });
    } catch (networkErr: unknown) {
      throw new Error(`Network error: ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let msg = `HTTP ${res.status}`;
      try { msg = JSON.parse(text).error ?? msg; } catch { msg = text.slice(0, 120) || msg; }
      throw new Error(msg);
    }
    const data = await res.json() as { type: "admin" | "worker"; user?: AuthUser };
    if (data.type === "admin" && data.user) {
      setUser(data.user);
    }
    return data.type;
  }

  async function logout() {
    await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", credentials: "include" });
    setUser(null);
  }

  const isAdmin = user?.accessLevel === "admin";
  const isReviewer = user?.accessLevel === "admin" || user?.accessLevel === "reviewer";

  return (
    <AuthContext.Provider value={{ user, isLoading, isAdmin, isReviewer, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
