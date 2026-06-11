import { useState } from "react";
import { type ReactNode } from "react";
import { Sidebar, NavContent } from "./sidebar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu, HardHat } from "lucide-react";

export function AppLayout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar — hidden below md */}
      <Sidebar />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar — only visible below md */}
        <header className="md:hidden border-b bg-card sticky top-0 z-10 h-14 flex items-center gap-3 px-4 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <HardHat className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <p className="font-semibold text-sm">Workforce</p>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Mobile nav sheet — slides in from left */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="p-0 w-72 bg-sidebar border-r"
          style={{ "--sidebar-background": "var(--sidebar)" } as React.CSSProperties}
        >
          <NavContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
