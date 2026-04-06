import { ReactNode } from "react";
import { AppSidebar } from "./sidebar";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="min-h-full">
          {children}
        </div>
      </main>
    </div>
  );
}
