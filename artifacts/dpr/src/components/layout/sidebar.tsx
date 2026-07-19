import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "wouter";
import { LogOut, ClipboardList, CheckSquare, Settings2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useGetDprTimesheetSummary, getGetDprTimesheetSummaryQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { logout, user, isAdmin } = useAuth();
  const [location] = useLocation();

  const { data: summary } = useGetDprTimesheetSummary({
    query: {
      queryKey: getGetDprTimesheetSummaryQueryKey(),
      refetchInterval: 30000,
    }
  });

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
          // Dot indicator when collapsed
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
        {navItem("/", <ClipboardList className="w-4 h-4" />, "Capture",
          summary?.capturedCount ? (
            <span className="ml-auto bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full font-bold">
              {summary.capturedCount}
            </span>
          ) : null
        )}
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
