import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(days: number): string {
  if (days <= 0) return "0d";
  const y = Math.floor(days / 365);
  const m = Math.floor((days % 365) / 30);
  const w = Math.floor((days % 365 % 30) / 7);
  const d = days % 7;
  return [y && `${y}y`, m && `${m}m`, w && `${w}w`, d && `${d}d`].filter(Boolean).join(" ");
}
