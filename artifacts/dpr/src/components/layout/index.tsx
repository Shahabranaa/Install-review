import { ReactNode, useState } from "react";
import { Sidebar } from "./sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { CaptureNavProvider, useCaptureNav } from "@/contexts/CaptureNavContext";
import { Redirect, Link, useLocation } from "wouter";
import {
  Loader2, ClipboardList, CheckSquare, Users,
  ChevronLeft, ChevronRight, Lock, CheckCircle2,
} from "lucide-react";
import {
  useGetDprTimesheetSummary,
  getGetDprTimesheetSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, addDays, subDays } from "date-fns";
import { cn } from "@/lib/utils";

// ─── DprHeader ────────────────────────────────────────────────────────────────
function DprHeader() {
  const { activeDate, setActiveDate } = useCaptureNav();

  const { data: dateSummary } = useQuery<{
    totalTeams: number;
    items: Array<{ date: string; noTime: number; partial: number; complete: number; captured: number }>;
  }>({
    queryKey: ["/api/dpr/timesheet-entries/date-summary"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/dpr/timesheet-entries/date-summary", { signal });
      if (!res.ok) throw new Error("Failed to fetch date summary");
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const navigate = (dir: -1 | 1) => {
    const base = activeDate ?? format(new Date(), "yyyy-MM-dd");
    try {
      const d = parseISO(base);
      setActiveDate(format(dir === -1 ? subDays(d, 1) : addDays(d, 1), "yyyy-MM-dd"));
    } catch {/* */}
  };

  const dateLabel = activeDate
    ? (() => { try { return format(parseISO(activeDate), "EEE, MMM d"); } catch { return activeDate; } })()
    : "Select date";

  const dateStats = activeDate ? dateSummary?.items?.find(i => i.date === activeDate) : null;
  const totalTeams = dateSummary?.totalTeams ?? 0;
  const isComplete = totalTeams > 0 && !!dateStats && dateStats.noTime === 0 && dateStats.partial === 0;
  const capturedCount = dateStats?.captured ?? 0;

  return (
    <div className="border-b border-border bg-background shrink-0 flex items-center gap-2.5 px-3 py-2">
      <button
        onClick={() => navigate(-1)}
        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title="Previous day"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="font-semibold text-sm text-foreground">{dateLabel}</span>
      {isComplete && (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 text-xs font-medium">
          <CheckCircle2 className="w-3 h-3" />
          Complete
        </span>
      )}
      {capturedCount > 0 && (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground text-xs font-medium">
          <Lock className="w-3 h-3" />
          {capturedCount} locked
        </span>
      )}
      <button
        onClick={() => navigate(1)}
        className="p-1.5 ml-auto rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title="Next day"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── TopNav ───────────────────────────────────────────────────────────────────
function TopNav() {
  const [location] = useLocation();
  const { isAdmin } = useAuth();
  const { activeDate } = useCaptureNav();

  // Reuse the already-cached date-summary so the badge reflects the active
  // date's captured-but-not-locked count, not the global total.
  const { data: dateSummary } = useQuery<{
    totalTeams: number;
    items: Array<{ date: string; noTime: number; partial: number; complete: number; captured: number }>;
  }>({
    queryKey: ["/api/dpr/timesheet-entries/date-summary"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/dpr/timesheet-entries/date-summary", { signal });
      if (!res.ok) throw new Error("Failed to fetch date summary");
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const activeDateStats = activeDate
    ? dateSummary?.items?.find((i) => i.date === activeDate)
    : undefined;
  const clarifyBadge = activeDateStats?.captured ?? 0;

  const tabs = [
    {
      href: "/team-setup",
      label: "Team Setup",
      icon: <Users className="w-3.5 h-3.5" />,
      show: !!isAdmin,
      badge: 0,
      active: location === "/team-setup",
    },
    {
      href: "/",
      label: "Capture",
      icon: <ClipboardList className="w-3.5 h-3.5" />,
      show: true,
      badge: 0,
      active: location === "/",
    },
    {
      href: "/clarify",
      label: "Clarify",
      icon: <CheckSquare className="w-3.5 h-3.5" />,
      show: true,
      badge: clarifyBadge,
      active: location === "/clarify",
    },
  ];


  return (
    <nav className="border-b border-border bg-background shrink-0 px-2">
      <div className="flex items-stretch">
        {tabs
          .filter((t) => t.show)
          .map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab.active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {tab.icon}
              {tab.label}
              {tab.badge > 0 && (
                <span className="ml-0.5 bg-primary/10 text-primary border border-primary/20 text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none">
                  {tab.badge}
                </span>
              )}
            </Link>
          ))}
      </div>
    </nav>
  );
}

// ─── AppLayout ────────────────────────────────────────────────────────────────
export function AppLayout({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return (
    <CaptureNavProvider>
      <div className="flex min-h-[100dvh] w-full bg-background overflow-hidden text-foreground">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        <main className="flex-1 flex flex-col h-[100dvh] overflow-hidden min-w-0">
          <DprHeader />
          <TopNav />
          {children}
        </main>
      </div>
    </CaptureNavProvider>
  );
}
