import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Times are stored/edited as raw 24h "HH:MM" strings, but displayed
// consistently as 12h with AM/PM across Capture and Clarify/Clarified views
// so a value entered as "5:30pm" doesn't appear to "change" to "17:30"
// after clarifying.
// ── Duration helpers (shared with Capture and Clarify) ─────────────────────

export function parseMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function hoursForEntry(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): number {
  if (!startTime || !endTime) return 0;
  const start = parseMinutes(startTime);
  let end = parseMinutes(endTime);
  if (end <= start) end += 24 * 60; // overnight shift
  return (end - start) / 60;
}

export function formatDuration(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): string {
  const hours = hoursForEntry(startTime, endTime);
  if (hours === 0) return "—";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ── Time display ────────────────────────────────────────────────────────────

export function formatTimeDisplay(raw: string | null | undefined): string {
  if (!raw) return "";
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}
