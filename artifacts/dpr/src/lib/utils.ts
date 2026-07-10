import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Times are stored/edited as raw 24h "HH:MM" strings, but displayed
// consistently as 12h with AM/PM across Capture and Clarify/Clarified views
// so a value entered as "5:30pm" doesn't appear to "change" to "17:30"
// after clarifying.
export function formatTimeDisplay(raw: string | null | undefined): string {
  if (!raw) return "";
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  if (isNaN(hours)) return raw;
  const period = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes} ${period}`;
}
