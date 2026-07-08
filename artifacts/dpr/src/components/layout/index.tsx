import { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Redirect } from "wouter";
import { Loader2 } from "lucide-react";

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return (
    <div className="flex min-h-[100dvh] w-full bg-background overflow-hidden text-foreground">
      <Sidebar />
      <main className="flex-1 flex flex-col h-[100dvh] overflow-hidden">
        {children}
      </main>
    </div>
  );
}
