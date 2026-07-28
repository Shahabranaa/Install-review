import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCaptureNav } from "@/contexts/CaptureNavContext";
import { Link, useLocation } from "wouter";
import { format, subDays, parseISO } from "date-fns";
import { LogOut, ClipboardList, CheckSquare, Settings2, PanelLeftClose, PanelLeftOpen, CalendarDays } from "lucide-react";
import { useGetDprTimesheetSummary, getGetDprTimesheetSummaryQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface DateSummaryItem {
  date: string;
  entryCount: number;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { logout, user, isAdmin } = useAuth();
  const [location] = useLocation();
  const { activeDate, setActiveDate } = useCaptureNav();
  const [calOpen, setCalOpen] = useState(false);

  const { data: summary } = useGetDprTimesheetSummary({
    query: {
      queryKey: getGetDprTimesheetSummaryQueryKey(),
      refetchInterval: 30000,
    }
  });

  const { data: dateSummaryRaw } = useQuery<DateSummaryItem[]>({
    queryKey: ["/api/dpr/timesheet-entries/date-summary"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/dpr/timesheet-entries/date-summary", { signal });
      if (!res.ok) throw new Error("Failed to fetch date summary");
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Fixed 10-day window: today → 9 days ago
  const windowDates = useMemo(
    () => Array.from({ length: 10 }, (_, i) => format(subDays(new Date(), i), "yyyy-MM-dd")),
    []
  );

  const dateCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of dateSummaryRaw ?? []) {
      map.set(item.date, item.entryCount);
    }
    return map;
  }, [dateSummaryRaw]);

  // How many dates in the window have zero entries → "to-do" badge
  const emptyDateCount = windowDates.filter((d) => (dateCountMap.get(d) ?? 0) === 0).length;

  // "Other date" = active date is outside the 10-day window
  const isOtherDate = activeDate !== null && !windowDates.includes(activeDate);

  const navItem = (href: string, icon: React.ReactNode, label: string, badge?: React.ReactNode) => {
    const active = location === href;
    return (
      <Link
        href={href}
        title={collapsed ? label : undefined}
        className={cn(
          "flex items-center rounded-md text-sm font-medium transition-colors",
          collapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        )}
      >
        <span className="shrink-0">{icon}</span>
        {!collapsed && (
          <>
            <span className="flex-1">{label}</span>
            {badge}
          </>
        )}
        {collapsed && badge && (
          <span className="absolute right-1.5 top-1.5 w-1.5 h-1.5 rounded-full bg-primary" />
        )}
      </Link>
    );
  };

  return (
    <div
      className={cn(
        "border-r border-border bg-sidebar flex flex-col h-[100dvh] flex-shrink-0 transition-[width] duration-200 ease-in-out overflow-hidden",
        collapsed ? "w-12" : "w-64"
      )}
    >
      {/* Header */}
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
          {collapsed
            ? <PanelLeftOpen className="w-4 h-4" />
            : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className={cn("flex-1 p-2 space-y-1 overflow-y-auto overflow-x-hidden", collapsed && "relative")}>
        {/* Capture — with date sub-list */}
        <div>
          <Link
            href="/"
            title={collapsed ? "Capture" : undefined}
            className={cn(
              "flex items-center rounded-md text-sm font-medium transition-colors",
              collapsed ? "justify-center px-0 py-2 relative" : "gap-3 px-3 py-2",
              location === "/"
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}
          >
            <span className="shrink-0"><ClipboardList className="w-4 h-4" /></span>
            {!collapsed && (
              <>
                <span className="flex-1">Capture</span>
                {emptyDateCount > 0 && (
                  <span className="ml-auto bg-amber-500/20 text-amber-600 border border-amber-500/40 text-xs px-1.5 py-0.5 rounded-full font-bold dark:text-amber-400">
                    {emptyDateCount}
                  </span>
                )}
              </>
            )}
            {collapsed && emptyDateCount > 0 && (
              <span className="absolute right-1.5 top-1.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
            )}
          </Link>

          {/* Date to-do list — only when sidebar is expanded */}
          {!collapsed && (
            <div className="mt-0.5 ml-3 border-l border-border pl-2 space-y-0.5 pb-1">
              {windowDates.map((d) => {
                const count = dateCountMap.get(d) ?? 0;
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
                    {count > 0 ? (
                      <span className="tabular-nums text-[10px] text-muted-foreground/70 font-medium">
                        {count}
                      </span>
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full border border-amber-500/50 shrink-0" />
                    )}
                  </button>
                );
              })}

              {/* Other date — calendar picker */}
              <Popover open={calOpen} onOpenChange={setCalOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "w-full flex items-center gap-1.5 rounded px-2 py-0.5 text-xs transition-colors",
                      isOtherDate
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground/40 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    )}
                  >
                    <CalendarDays className="w-3 h-3 shrink-0" />
                    <span>
                      {isOtherDate && activeDate
                        ? (() => {
                            try { return format(parseISO(activeDate), "EEE dd/MM"); }
                            catch { return activeDate; }
                          })()
                        : "Other date…"}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start" side="right" sideOffset={8}>
                  <Calendar
                    mode="single"
                    selected={isOtherDate && activeDate ? parseISO(activeDate) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        setActiveDate(format(date, "yyyy-MM-dd"));
                        setCalOpen(false);
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>

        {navItem("/clarify", <CheckSquare className="w-4 h-4" />, "Clarify",
          summary?.clarifiedCount ? (
            <span className="ml-auto bg-muted text-muted-foreground border border-border text-xs px-1.5 py-0.5 rounded-full font-bold">
              {summary.clarifiedCount}
            </span>
          ) : null
        )}
        {isAdmin && navItem("/jdr-mapping", <Settings2 className="w-4 h-4" />, "JDR Mapping")}
      </nav>

      {/* Footer */}
      <div className={cn("border-t border-border shrink-0", collapsed ? "p-2 flex flex-col items-center gap-2" : "p-4")}>
        {!collapsed && (
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-sidebar-accent border border-border flex items-center justify-center text-sidebar-foreground text-xs font-bold uppercase shrink-0">
              {user?.displayName?.[0] || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.displayName}</p>
              <p className="text-xs text-sidebar-foreground/50 truncate">{user?.email}</p>
            </div>
          </div>
        )}
        {collapsed ? (
          <>
            <div
              title={user?.displayName || ""}
              className="w-8 h-8 rounded-full bg-sidebar-accent border border-border flex items-center justify-center text-sidebar-foreground text-xs font-bold uppercase cursor-default"
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
