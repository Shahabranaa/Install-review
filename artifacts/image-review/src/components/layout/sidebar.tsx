import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, CheckSquare, FolderGit2,
  FileText, Settings, Building2, LogOut, ShieldCheck,
  ClipboardCheck, Eye, Network, Wind, Camera,
  ChevronDown, ChevronRight, CheckCircle2, XCircle, Clock,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

const ACCESS_ICONS = {
  admin: { icon: ShieldCheck, color: "text-red-500", label: "Admin" },
  reviewer: { icon: ClipboardCheck, color: "text-blue-500", label: "Reviewer" },
  viewer: { icon: Eye, color: "text-slate-400", label: "Viewer" },
};

const IMAGE_CHILDREN = [
  { name: "All",      href: "/drive-photos",                    icon: Camera },
  { name: "Approved", href: "/drive-photos?approval=Approved",  icon: CheckCircle2 },
  { name: "Rejected", href: "/drive-photos?approval=Rejected",  icon: XCircle },
  { name: "Pending",  href: "/drive-photos?approval=Pending",   icon: Clock },
];

const navigation = [
  { name: "Dashboard", href: "/",          icon: LayoutDashboard },
  { name: "Projects",  href: "/projects",  icon: FolderGit2 },
  { name: "Strings",   href: "/strings",   icon: Network },
  { name: "Towers",    href: "/towers",    icon: Wind },
  { name: "Phases",    href: "/phases",    icon: CheckSquare },
  { name: "Documents", href: "/documents", icon: FileText },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [imagesOpen, setImagesOpen] = useState(location.startsWith("/drive-photos"));

  const accessInfo = user
    ? (ACCESS_ICONS[user.accessLevel as keyof typeof ACCESS_ICONS] ?? ACCESS_ICONS.viewer)
    : null;
  const AccessIcon = accessInfo?.icon;

  const imagesActive = location.startsWith("/drive-photos");

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
          {/* Regular nav items */}
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

          {/* Images with submenu — inserted after Phases */}
          <div>
            <button
              onClick={() => setImagesOpen((o) => !o)}
              className={cn(
                "w-full flex items-center px-2 py-2 text-sm font-medium rounded-md cursor-pointer transition-colors",
                imagesActive
                  ? "bg-sidebar-primary/10 text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <Camera
                className={cn(
                  "mr-3 h-5 w-5 flex-shrink-0",
                  imagesActive ? "text-sidebar-primary" : "text-sidebar-foreground/50"
                )}
                aria-hidden="true"
              />
              <span className="flex-1 text-left">Images</span>
              {imagesOpen
                ? <ChevronDown className="h-4 w-4 opacity-60" />
                : <ChevronRight className="h-4 w-4 opacity-60" />}
            </button>

            {imagesOpen && (
              <div className="mt-1 ml-4 space-y-0.5 border-l border-sidebar-border pl-3">
                {IMAGE_CHILDREN.map((child) => {
                  const fullHref = child.href;
                  const isChildActive =
                    location + (typeof window !== "undefined" ? window.location.search : "") === fullHref ||
                    (child.href === "/drive-photos" && location === "/drive-photos" && !window.location.search);
                  return (
                    <Link key={child.name} href={fullHref}>
                      <div
                        className={cn(
                          "flex items-center px-2 py-1.5 text-sm rounded-md cursor-pointer transition-colors",
                          isChildActive
                            ? "text-sidebar-primary font-medium"
                            : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                        )}
                      >
                        <child.icon
                          className={cn(
                            "mr-2 h-3.5 w-3.5 flex-shrink-0",
                            isChildActive ? "text-sidebar-primary" : "text-sidebar-foreground/40"
                          )}
                        />
                        {child.name}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </nav>
      </div>

      {/* Settings — pinned above user footer */}
      <div className="px-2 pb-2 pt-1 border-t border-sidebar-border flex-shrink-0">
        <Link href="/settings">
          <div
            className={cn(
              "flex items-center px-2 py-2 text-sm font-medium rounded-md cursor-pointer transition-colors",
              location === "/settings"
                ? "bg-sidebar-primary/10 text-sidebar-primary"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            )}
          >
            <Settings
              className={cn(
                "mr-3 h-5 w-5 flex-shrink-0",
                location === "/settings" ? "text-sidebar-primary" : "text-sidebar-foreground/50"
              )}
            />
            Settings
          </div>
        </Link>
      </div>

      {/* User info + logout */}
      {user && (
        <div className="border-t border-sidebar-border p-3 flex-shrink-0">
          <div className="flex items-center gap-2.5 mb-2 px-1">
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
