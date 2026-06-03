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

function AppShell() {
  const { worker, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("home");

  if (!worker) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <HardHat className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <p className="font-semibold text-sm leading-none">Worker Portal</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{worker.name}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => void logout()}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>

        {/* Tab nav */}
        <div className="max-w-3xl mx-auto px-4 flex gap-1">
          <button
            type="button"
            onClick={() => setTab("home")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors",
              tab === "home"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            Home
          </button>
          <button
            type="button"
            onClick={() => setTab("certifications")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors",
              tab === "certifications"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Award className="h-3.5 w-3.5" />
            Certifications
          </button>
          <button
            type="button"
            onClick={() => setTab("schedule")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors",
              tab === "schedule"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Schedule
          </button>
          <button
            type="button"
            onClick={() => setTab("profile")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors",
              tab === "profile"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <UserCircle className="h-3.5 w-3.5" />
            Profile
          </button>
        </div>
      </header>

      <main>
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
    </div>
  );
}

const isOcrTestMode = typeof window !== "undefined" &&
  (window.location.search.includes("ocr-test") || window.location.hash === "#ocr-test");

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
