import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import CertificationsPage from "@/pages/certifications";
import SchedulePage from "@/pages/schedule";
import ProfilePage from "@/pages/profile";
import PassportOcrTestPage from "@/pages/passport-ocr-test";
import { Button } from "@/components/ui/button";
import { HardHat, LogOut, LayoutDashboard, Award, CalendarDays, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

type Tab = "home" | "certifications" | "schedule" | "profile";

const NAV_ITEMS: { tab: Tab; label: string; icon: React.ElementType }[] = [
  { tab: "home",           label: "Home",     icon: LayoutDashboard },
  { tab: "certifications", label: "Certs",    icon: Award           },
  { tab: "schedule",       label: "Schedule", icon: CalendarDays    },
  { tab: "profile",        label: "Profile",  icon: UserCircle      },
];

function AppShell() {
  const { worker, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("home");

  if (!worker) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Slim header — logo + name + sign-out only, no tabs */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <HardHat className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-none">Worker Portal</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-none truncate">{worker.name}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground h-8 px-2 flex-shrink-0"
            onClick={() => void logout()}
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-xs">Sign out</span>
          </Button>
        </div>
      </header>

      {/* Main content — bottom-padded to clear the fixed bottom nav + iOS home bar */}
      <main className="flex-1" style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom, 0px))" }}>
        {tab === "home" ? (
          <DashboardPage onNavigate={setTab} />
        ) : tab === "certifications" ? (
          <CertificationsPage />
        ) : tab === "schedule" ? (
          <SchedulePage />
        ) : (
          <ProfilePage />
        )}
      </main>

      {/* Fixed bottom navigation bar */}
      <nav
        className="fixed bottom-0 inset-x-0 bg-card border-t z-10"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="max-w-3xl mx-auto grid grid-cols-4 h-16">
          {NAV_ITEMS.map(({ tab: t, label, icon: Icon }) => {
            const active = tab === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 transition-colors focus-visible:outline-none",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground active:text-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5 transition-transform", active && "scale-110")} />
                <span className="text-[10px] font-medium leading-none">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

const isOcrTestMode = typeof window !== "undefined" && (() => {
  const { pathname, search, hash } = window.location;
  return (
    pathname.endsWith("/passport-ocr-test") ||
    pathname.endsWith("/passport-ocr-test/") ||
    search.includes("ocr-test") ||
    hash === "#ocr-test"
  );
})();

function AppContent() {
  const { worker, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!worker) return <LoginPage />;
  if (isOcrTestMode) return <PassportOcrTestPage />;
  return <AppShell />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
