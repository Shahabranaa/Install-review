import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "wouter";
import { LogOut, ClipboardList, CheckSquare } from "lucide-react";
import { useGetDprTimesheetSummary, getGetDprTimesheetSummaryQueryKey } from "@workspace/api-client-react";

export function Sidebar() {
  const { logout, user } = useAuth();
  const [location] = useLocation();

  const { data: summary } = useGetDprTimesheetSummary({
    query: {
      queryKey: getGetDprTimesheetSummaryQueryKey(),
      refetchInterval: 30000,
    }
  });

  return (
    <div className="w-64 border-r border-border bg-sidebar flex flex-col h-[100dvh] flex-shrink-0">
      <div className="p-4 flex items-center gap-2 border-b border-border text-sidebar-foreground">
        <div className="w-8 h-8 rounded bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
          <ClipboardList className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-bold tracking-tight leading-none">DPR</h2>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Timesheets</p>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <Link 
          href="/" 
          className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            location === "/" 
              ? "bg-sidebar-accent text-sidebar-accent-foreground" 
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          Capture
          {summary?.capturedCount ? (
            <span className="ml-auto bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full font-bold">
              {summary.capturedCount}
            </span>
          ) : null}
        </Link>
        <Link 
          href="/clarify" 
          className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            location === "/clarify" 
              ? "bg-sidebar-accent text-sidebar-accent-foreground" 
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          Clarify
          {summary?.clarifiedCount ? (
            <span className="ml-auto bg-muted text-muted-foreground border border-border text-xs px-1.5 py-0.5 rounded-full font-bold">
              {summary.clarifiedCount}
            </span>
          ) : null}
        </Link>
      </nav>

      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-sidebar-accent border border-border flex items-center justify-center text-sidebar-foreground text-xs font-bold uppercase">
            {user?.displayName?.[0] || "U"}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.displayName}</p>
            <p className="text-xs text-sidebar-foreground/50 truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={() => logout()}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
