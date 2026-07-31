import type { ReactNode } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout";
import { Redirect } from "wouter";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import CapturePage from "@/pages/capture";
import ClarifyPage from "@/pages/clarify";
import JdrMappingPage from "@/pages/jdr-mapping";
import TeamSetupPage from "@/pages/team-setup";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered fresh for 30 s — navigating between pages shows
      // cached data instantly rather than triggering a new network request.
      staleTime: 30_000,
      // Keep unused query data in cache for 5 minutes so coming back to a
      // page never starts from a blank slate.
      gcTime: 5 * 60_000,
      // Don't refetch just because the user switched browser tabs.
      refetchOnWindowFocus: false,
      // Do retry on failure, but only once (default is 3).
      retry: 1,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/">
        <AppLayout>
          <CapturePage />
        </AppLayout>
      </Route>
      <Route path="/clarify">
        <AppLayout>
          <ClarifyPage />
        </AppLayout>
      </Route>
      <Route path="/team-setup">
        <AppLayout>
          <AdminOnly>
            <TeamSetupPage />
          </AdminOnly>
        </AppLayout>
      </Route>
      <Route path="/jdr-mapping">
        <AppLayout>
          <AdminOnly>
            <JdrMappingPage />
          </AdminOnly>
        </AppLayout>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) {
    return <Redirect to="/" />;
  }
  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
