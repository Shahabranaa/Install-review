import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  Award,
  Building2,
  ShieldCheck,
  Briefcase,
  Mail,
  LogOut,
  HardHat,
  Activity,
  Handshake,
  HardDriveUpload,
  CalendarDays,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/workers", label: "Workers", icon: Users },
  { href: "/certifications", label: "Certifications", icon: Award, adminOnly: true },
  { href: "/sites", label: "Sites", icon: Building2 },
  { href: "/site-compliance", label: "Site Compliance", icon: ShieldCheck },
  { href: "/roles", label: "Roles", icon: Briefcase, adminOnly: true },
  { href: "/clients", label: "Clients", icon: Handshake, adminOnly: true },
  { href: "/ppe-types", label: "PPE Types", icon: HardDriveUpload, adminOnly: true },
  { href: "/review-queue", label: "Review Queue", icon: ClipboardCheck, adminOnly: true },
  { href: "/schedule-requests", label: "Schedule Requests", icon: CalendarDays, adminOnly: true },
  { href: "/emails", label: "Emails", icon: Mail, adminOnly: true },
  { href: "/worker-activity", label: "Worker Activity", icon: Activity, adminOnly: true },
];

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout, isAdmin } = useAuth();

  const visibleItems = navItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <aside className="w-60 flex-shrink-0 flex flex-col border-r bg-sidebar h-screen sticky top-0">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b">
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <HardHat className="h-4 w-4 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm leading-none">Workforce</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-none">Compliance Manager</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {visibleItems.map(({ href, label, icon: Icon }) => {
          const active = location === href;
          return (
            <Link key={href} href={href}>
              <a
                data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {label}
              </a>
            </Link>
          );
        })}
      </nav>

      <div className="border-t px-3 py-3 space-y-1">
        {user && (
          <div className="px-3 py-1.5">
            <p className="text-xs font-medium truncate">{user.displayName}</p>
            <p className="text-[11px] text-muted-foreground capitalize">{user.accessLevel}</p>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          onClick={() => void logout()}
          data-testid="button-logout"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
