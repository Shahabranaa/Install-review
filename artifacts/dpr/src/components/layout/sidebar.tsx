import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCaptureNav } from "@/contexts/CaptureNavContext";

import {
  format, subDays, parseISO, startOfMonth, endOfMonth,
  addMonths, subMonths, isSameDay, isToday, getDay,
} from "date-fns";
import {
  LogOut, ClipboardList,
  PanelLeftClose, PanelLeftOpen, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface DateSummaryItem {
  date: string;
  noTime: number;
  partial: number;
  complete: number;
  captured?: number;
}

interface DateSummaryResponse {
  totalTeams: number;
  items: DateSummaryItem[];
}

// Day-of-week header labels starting Monday
const DOW_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { logout, user } = useAuth();
  const { activeDate, setActiveDate } = useCaptureNav();

  // Calendar month state — default to today's month
  const [calMonth, setCalMonth] = useState<Date>(() => startOfMonth(new Date()));

  // When activeDate changes, navigate calendar to that month
  useEffect(() => {
    if (activeDate) {
      try {
        setCalMonth(startOfMonth(parseISO(activeDate)));
      } catch {/* ignore */}
    }
  }, [activeDate]);

  const { data: dateSummaryRaw } = useQuery<DateSummaryResponse>({
    queryKey: ["/api/dpr/timesheet-entries/date-summary"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/dpr/timesheet-entries/date-summary", { signal });
      if (!res.ok) throw new Error("Failed to fetch date summary");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const totalTeams = dateSummaryRaw?.totalTeams ?? 0;

  const dateStatsMap = useMemo(() => {
    const map = new Map<string, { noTime: number; partial: number; complete: number; captured: number }>();
    for (const item of dateSummaryRaw?.items ?? []) {
      map.set(item.date, {
        noTime: item.noTime,
        partial: item.partial,
        complete: item.complete,
        captured: item.captured ?? 0,
      });
    }
    return map;
  }, [dateSummaryRaw]);

  // Build calendar grid — always 6 rows × 7 cols starting Monday
  const calendarGrid = useMemo(() => {
    const first = startOfMonth(calMonth);
    const last  = endOfMonth(calMonth);

    // getDay: 0=Sun … 6=Sat → convert to Mon-first: 0=Mon … 6=Sun
    const startPad = (getDay(first) + 6) % 7;

    const days: Array<{ date: Date; inMonth: boolean }> = [];

    // Padding from previous month
    for (let i = startPad - 1; i >= 0; i--) {
      days.push({ date: subDays(first, i + 1), inMonth: false });
    }
    // Current month
    for (let d = new Date(first); d <= last; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      days.push({ date: new Date(d), inMonth: true });
    }
    // Pad to 42 cells (6 rows)
    let next = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
    while (days.length < 42) {
      days.push({ date: new Date(next), inMonth: false });
      next = new Date(next.getFullYear(), next.getMonth(), next.getDate() + 1);
    }
    return days;
  }, [calMonth]);

  const activeParsed = useMemo(() => {
    if (!activeDate) return null;
    try { return parseISO(activeDate); } catch { return null; }
  }, [activeDate]);

  const handleDayClick = (date: Date, inMonth: boolean) => {
    if (!inMonth) {
      setCalMonth(startOfMonth(date));
    }
    const key = format(date, "yyyy-MM-dd");
    setActiveDate(activeDate === key ? null : key);
  };

  // Per-day status derived from dateStatsMap
  const getDayStatus = (dateKey: string) => {
    if (totalTeams === 0) return "neutral";
    const s = dateStatsMap.get(dateKey);
    if (!s) return "neutral";
    if (s.complete === totalTeams) return "complete";
    if (s.partial > 0 || s.noTime < totalTeams) return "partial";
    return "missing";
  };

  return (
    <div
      className={cn(
        "border-r border-border bg-sidebar flex flex-col h-[100dvh] flex-shrink-0 transition-[width] duration-200 ease-in-out overflow-hidden",
        collapsed ? "w-12" : "w-64"
      )}
    >
      {/* ── Header ── */}
      <div className={cn(
        "flex items-center border-b border-border text-sidebar-foreground shrink-0",
        collapsed ? "justify-center p-2 h-[57px]" : "justify-between px-4 py-4"
      )}>
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded bg-primary/20 border border-primary/30 flex items-center justify-center text-primary shrink-0">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold tracking-tight leading-none">DPR</h2>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Timesheets</p>
            </div>
          </div>
        )}
        <button
          onClick={onToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors p-1 rounded hover:bg-sidebar-accent/50"
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {/* ── Recent dates (expanded only) ── */}
      {!collapsed && (
        <div className="px-3 pt-2.5 pb-2 border-b border-border shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/35 mb-1 px-0.5">Recent</p>
          <div className="space-y-0.5">
            {Array.from({ length: 7 }, (_, i) => {
              const d = format(subDays(new Date(), i), "yyyy-MM-dd");
              const stats = dateStatsMap.get(d) ?? { noTime: totalTeams, partial: 0, complete: 0, captured: 0 };
              const capturedOnDate = stats.captured ?? 0;
              const isActive = activeDate === d;
              const label = format(parseISO(d), "EEE dd/MM");
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setActiveDate(isActive ? null : d)}
                  className={cn(
                    "w-full flex items-center justify-between rounded px-2 py-0.5 text-xs transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  <span>{label}</span>
                  <span className="tabular-nums text-[10px] font-medium flex items-center gap-0.5">
                    {totalTeams > 0 && (
                      <>
                        <span className="text-red-500 dark:text-red-400">{stats.noTime}</span>
                        <span className="text-sidebar-foreground/30">/</span>
                        <span className="text-amber-500 dark:text-amber-400">{stats.partial}</span>
                        <span className="text-sidebar-foreground/30">/</span>
                        <span className="text-emerald-600 dark:text-emerald-400">{stats.complete}</span>
                      </>
                    )}
                    {capturedOnDate > 0 && (
                      <>
                        {totalTeams > 0 && <span className="text-sidebar-foreground/30 mx-0.5">·</span>}
                        <span className="text-orange-500 dark:text-orange-400" title={`${capturedOnDate} entries awaiting clarification`}>
                          {capturedOnDate}↑
                        </span>
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Calendar (expanded only) ── */}
      {!collapsed && (
        <div className="px-3 pt-3 pb-2 border-b border-border shrink-0">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-2 px-0.5">
            <button
              onClick={() => setCalMonth(subMonths(calMonth, 1))}
              className="p-1 rounded hover:bg-sidebar-accent/60 text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setCalMonth(startOfMonth(new Date()))}
              className="text-xs font-semibold text-sidebar-foreground tracking-tight hover:text-primary transition-colors"
              title="Jump to today"
            >
              {format(calMonth, "MMMM yyyy")}
            </button>
            <button
              onClick={() => setCalMonth(addMonths(calMonth, 1))}
              className="p-1 rounded hover:bg-sidebar-accent/60 text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-0.5">
            {DOW_LABELS.map((d) => (
              <div key={d} className="text-center text-[10px] font-medium text-sidebar-foreground/35 py-0.5">
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {calendarGrid.map(({ date, inMonth }, idx) => {
              const key = format(date, "yyyy-MM-dd");
              const isSelected = activeParsed ? isSameDay(date, activeParsed) : false;
              const today = isToday(date);
              const status = inMonth ? getDayStatus(key) : "neutral";
              const stats = dateStatsMap.get(key);
              const hasCaptured = (stats?.captured ?? 0) > 0;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleDayClick(date, inMonth)}
                  className={cn(
                    "relative flex flex-col items-center justify-center rounded-md text-[11px] font-medium transition-all h-8 select-none",
                    // Selected state
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : [
                          // Status backgrounds (only for in-month days)
                          inMonth && status === "complete"  && "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20",
                          inMonth && status === "partial"   && "bg-amber-500/12 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20",
                          inMonth && status === "missing"   && "bg-rose-500/10 text-rose-700 dark:text-rose-400 hover:bg-rose-500/18",
                          inMonth && status === "neutral"   && "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
                          !inMonth && "text-sidebar-foreground/20 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground/40",
                        ].filter(Boolean).join(" "),
                    // Today ring
                    today && !isSelected && "ring-1 ring-primary/50 ring-inset"
                  )}
                >
                  <span className={cn("leading-none", today && !isSelected && "font-bold")}>
                    {format(date, "d")}
                  </span>

                  {/* Captured-entries dot */}
                  {hasCaptured && inMonth && !isSelected && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-orange-400" />
                  )}
                  {/* Status dot when selected (replace background with dot) */}
                  {isSelected && hasCaptured && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary-foreground/60" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          {totalTeams > 0 && (
            <div className="flex items-center gap-3 mt-2 px-0.5 justify-center">
              <span className="flex items-center gap-1 text-[10px] text-sidebar-foreground/40">
                <span className="w-2 h-2 rounded-sm bg-rose-500/30 inline-block" />Missing
              </span>
              <span className="flex items-center gap-1 text-[10px] text-sidebar-foreground/40">
                <span className="w-2 h-2 rounded-sm bg-amber-500/30 inline-block" />Partial
              </span>
              <span className="flex items-center gap-1 text-[10px] text-sidebar-foreground/40">
                <span className="w-2 h-2 rounded-sm bg-emerald-500/30 inline-block" />Done
              </span>
              <span className="flex items-center gap-1 text-[10px] text-sidebar-foreground/40">
                <span className="w-1 h-1 rounded-full bg-orange-400 inline-block" />Locked
              </span>
            </div>
          )}

          {/* Selected date label */}
          {activeDate && (
            <div className="mt-2 flex items-center justify-between px-0.5">
              <span className="text-[11px] text-sidebar-foreground/50">
                {(() => { try { return format(parseISO(activeDate), "EEEE d MMMM"); } catch { return activeDate; } })()}
              </span>
              <button
                type="button"
                onClick={() => setActiveDate(null)}
                className="text-[10px] text-sidebar-foreground/35 hover:text-sidebar-foreground/70 transition-colors"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {/* spacer pushes footer to bottom */}
      <div className="flex-1" />

      {/* ── Footer ── */}
      <div className={cn("border-t border-border shrink-0", collapsed ? "p-2 flex flex-col items-center gap-2" : "p-4")}>
        {!collapsed && (
          <div
            className="flex items-center gap-3 px-3 py-2 mb-2 rounded-md"
          >
            <div className="w-8 h-8 rounded-full bg-sidebar-accent border border-border flex items-center justify-center text-sidebar-foreground text-xs font-bold uppercase shrink-0">
              {user?.displayName?.[0] || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.displayName}</p>
              <p className="text-xs text-sidebar-foreground/50 truncate">{user?.email ?? ""}</p>
            </div>
          </div>
        )}
        {collapsed ? (
          <>
            <div
              title={user?.displayName || ""}
              className="w-8 h-8 rounded-full bg-sidebar-accent border border-border flex items-center justify-center text-sidebar-foreground text-xs font-bold uppercase"
            >
              {user?.displayName?.[0] || "U"}
            </div>
            <button
              onClick={() => logout()}
              title="Sign Out"
              className="text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors p-1 rounded hover:bg-sidebar-accent/50"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </>
        ) : (
          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        )}
      </div>
    </div>
  );
}
