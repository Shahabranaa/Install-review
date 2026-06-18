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
    const res = await fetch(`${API_BASE}/api/auth/unified-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ identifier, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Login failed" }));
      throw new Error(err.error ?? "Login failed");
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

  return (
    <AuthContext.Provider value={{ user, isLoading, isAdmin: user?.accessLevel === "admin", login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
