import { Link, useLocation } from "wouter";
import { LayoutDashboard, Image as ImageIcon, CheckSquare, FolderGit2, FileText, Settings, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Projects", href: "/projects", icon: FolderGit2 },
  { name: "Phases", href: "/phases", icon: CheckSquare },
  { name: "Images", href: "/images", icon: ImageIcon },
  { name: "Documents", href: "/documents", icon: FileText },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <div className="flex h-full w-64 flex-col bg-sidebar border-r border-sidebar-border">
      <div className="flex h-14 items-center px-4 border-b border-sidebar-border">
        <Building2 className="h-6 w-6 text-sidebar-primary mr-2" />
        <span className="font-bold text-sidebar-foreground">InstallReview</span>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-2">
          {navigation.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
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
    </div>
  );
}
