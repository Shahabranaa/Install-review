import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import WorkersPage from "@/pages/workers";
import WorkerProfilePage from "@/pages/worker-profile";
import CertificationsPage from "@/pages/certifications";
import SitesPage from "@/pages/sites";
import SiteDetailPage from "@/pages/site-detail";
import SiteCompliancePage from "@/pages/site-compliance";
import RolesPage from "@/pages/roles";
import EmailsPage from "@/pages/emails";
import WorkerActivityPage from "@/pages/worker-activity";
import ClientsPage from "@/pages/clients";
import PPETypesPage from "@/pages/ppe-types";
import ScheduleRequestsPage from "@/pages/schedule-requests";
import ReviewQueuePage from "@/pages/review-queue";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function AuthGate({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, isLoading, isAdmin } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <LoginPage />;
  if (adminOnly && !isAdmin) return <Redirect to="/" />;

  return <AppLayout>{children}</AppLayout>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login">
        {() => {
          const { user } = useAuth();
          return user ? <Redirect to="/" /> : <LoginPage />;
        }}
      </Route>
      <Route path="/">
        {() => (
          <AuthGate>
            <DashboardPage />
          </AuthGate>
        )}
      </Route>
      <Route path="/workers">
        {() => (
          <AuthGate>
            <WorkersPage />
          </AuthGate>
        )}
      </Route>
      <Route path="/workers/:id">
        {() => (
          <AuthGate>
            <WorkerProfilePage />
          </AuthGate>
        )}
      </Route>
      <Route path="/certifications">
        {() => (
          <AuthGate adminOnly>
            <CertificationsPage />
          </AuthGate>
        )}
      </Route>
      <Route path="/sites">
        {() => (
          <AuthGate>
            <SitesPage />
          </AuthGate>
        )}
      </Route>
      <Route path="/sites/:id">
        {() => (
          <AuthGate>
            <SiteDetailPage />
          </AuthGate>
        )}
      </Route>
      <Route path="/site-compliance">
        {() => (
          <AuthGate>
            <SiteCompliancePage />
          </AuthGate>
        )}
      </Route>
      <Route path="/roles">
        {() => (
          <AuthGate adminOnly>
            <RolesPage />
          </AuthGate>
        )}
      </Route>
      <Route path="/emails">
        {() => (
          <AuthGate adminOnly>
            <EmailsPage />
          </AuthGate>
        )}
      </Route>
      <Route path="/worker-activity">
        {() => (
          <AuthGate adminOnly>
            <WorkerActivityPage />
          </AuthGate>
        )}
      </Route>
      <Route path="/clients">
        {() => (
          <AuthGate adminOnly>
            <ClientsPage />
          </AuthGate>
        )}
      </Route>
      <Route path="/ppe-types">
        {() => (
          <AuthGate adminOnly>
            <PPETypesPage />
          </AuthGate>
        )}
      </Route>
      <Route path="/schedule-requests">
        {() => (
          <AuthGate adminOnly>
            <ScheduleRequestsPage />
          </AuthGate>
        )}
      </Route>
      <Route path="/review-queue">
        {() => (
          <AuthGate adminOnly>
            <ReviewQueuePage />
          </AuthGate>
        )}
      </Route>
      <Route>
        {() => (
          <AuthGate>
            <NotFound />
          </AuthGate>
        )}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
