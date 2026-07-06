import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getBaseUrl } from "@/lib/config";

const COOKIE_KEY = "admin_session_cookie";

export async function storeSessionCookie(headers: Headers): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const setCookie = headers.get("set-cookie");
    if (setCookie) {
      const cookieValue = setCookie.split(";")[0];
      await AsyncStorage.setItem(COOKIE_KEY, cookieValue);
    }
  } catch {}
}

export async function getCookieHeaders(): Promise<Record<string, string>> {
  if (Platform.OS === "web") return {};
  try {
    const cookie = await AsyncStorage.getItem(COOKIE_KEY);
    if (cookie) return { Cookie: cookie };
  } catch {}
  return {};
}

export async function clearSessionCookie(): Promise<void> {
  await AsyncStorage.removeItem(COOKIE_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const cookieHeaders = await getCookieHeaders();
  const headers: Record<string, string> = {
    ...cookieHeaders,
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...options,
    headers,
    credentials: Platform.OS === "web" ? "include" : "omit",
  });

  if (!res.ok) {
    const err = await res
      .json()
      .catch(() => ({ error: `${res.status} ${res.statusText}` }));
    throw new Error(
      (err as { error?: string }).error ?? `Request failed: ${res.status}`
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function apiFetch<T>(path: string): Promise<T> {
  return request<T>(path);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
