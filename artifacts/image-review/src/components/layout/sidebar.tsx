import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, CheckSquare, FolderGit2,
  FileText, Settings, Building2, LogOut, ShieldCheck,
  ClipboardCheck, Eye, Network, Wind, Camera,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Projects", href: "/projects", icon: FolderGit2 },
  { name: "Strings", href: "/strings", icon: Network },
  { name: "Towers", href: "/towers", icon: Wind },
  { name: "Phases", href: "/phases", icon: CheckSquare },
  { name: "Images", href: "/drive-photos", icon: Camera },
  { name: "Documents", href: "/documents", icon: FileText },
  { name: "Settings", href: "/settings", icon: Settings },
];

const ACCESS_ICONS = {
  admin: { icon: ShieldCheck, color: "text-red-500", label: "Admin" },
  reviewer: { icon: ClipboardCheck, color: "text-blue-500", label: "Reviewer" },
  viewer: { icon: Eye, color: "text-slate-400", label: "Viewer" },
};

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const accessInfo = user ? (ACCESS_ICONS[user.accessLevel as keyof typeof ACCESS_ICONS] ?? ACCESS_ICONS.viewer) : null;
  const AccessIcon = accessInfo?.icon;

  return (
    <div className="flex h-full w-64 flex-col bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex h-14 items-center px-4 border-b border-sidebar-border flex-shrink-0">
        <Building2 className="h-6 w-6 text-sidebar-primary mr-2 flex-shrink-0" />
        <span className="font-bold text-sidebar-foreground">InstallReview</span>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-2">
          {navigation.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.name} href={item.href}>
                <div
                  className={cn(
                    "flex items-center px-2 py-2 text-sm font-medium rounded-md cursor-pointer transition-colors",
                    isActive
                      ? "bg-sidebar-primary/10 text-sidebar-primary"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <item.icon
                    className={cn(
                      "mr-3 h-5 w-5 flex-shrink-0",
                      isActive ? "text-sidebar-primary" : "text-sidebar-foreground/50"
                    )}
                    aria-hidden="true"
                  />
                  {item.name}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* User info + logout */}
      {user && (
        <div className="border-t border-sidebar-border p-3 flex-shrink-0">
          <div className="flex items-center gap-2.5 mb-2 px-1">
            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold flex-shrink-0">
              {user.displayName.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{user.displayName}</p>
              {user.title ? (
                <p className="text-xs text-sidebar-foreground/50 truncate">{user.title}</p>
              ) : (
                <p className="text-xs text-sidebar-foreground/50 truncate">@{user.username}</p>
              )}
            </div>
            {accessInfo && AccessIcon && (
              <AccessIcon className={`w-4 h-4 flex-shrink-0 ${accessInfo.color}`} title={accessInfo.label} />
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent h-8 px-2"
            onClick={logout}
          >
            <LogOut className="w-3.5 h-3.5 mr-2" />
            Sign Out
          </Button>
        </div>
      )}
    </div>
  );
}
