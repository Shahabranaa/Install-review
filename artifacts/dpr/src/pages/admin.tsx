import { useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, ClipboardList, FileClock, Network, Settings2, ShieldCheck, UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserManagementSheet } from "@/components/layout/UserManagementDialog";

const ADMIN_TOOLS = [
  {
    href: "/admin/team-setup",
    title: "Team Setup",
    description: "Set daily attendance, arrange workers, manage teams, and plan upcoming activity.",
    icon: Settings2,
  },
  {
    href: "/admin/dpr-mapping",
    title: "DPR Mapping",
    description: "Maintain activity codes, locations, roles, workers, and WhatsApp sheet settings.",
    icon: Network,
  },
  {
    href: "/admin/logs",
    title: "Activity Log",
    description: "Review changes made across Capture and Clarify.",
    icon: FileClock,
  },
] as const;

export default function AdminPage() {
  const [userManagementOpen, setUserManagementOpen] = useState(false);

  return (
    <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-muted/10">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between mb-8">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary mb-3">
              <ShieldCheck className="w-4 h-4" />
              Administrators only
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">DPR Administration</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-2">
              Configure the people, teams, mappings, and records that support daily timesheet capture.
            </p>
          </div>
          <Button asChild variant="outline" className="gap-2 shrink-0">
            <Link href="/">
              <ArrowLeft className="w-4 h-4" />
              Back to Capture
            </Link>
          </Button>
        </div>

        <section aria-labelledby="admin-tools-heading">
          <h2 id="admin-tools-heading" className="text-sm font-semibold mb-3">Administration tools</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ADMIN_TOOLS.map(({ href, title, description, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="group rounded-xl border border-border bg-background p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold group-hover:text-primary transition-colors">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground mt-1.5">{description}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-xl border border-border bg-background p-5 sm:p-6 shadow-sm" aria-labelledby="user-management-heading">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <div className="w-10 h-10 shrink-0 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                <UsersRound className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 id="user-management-heading" className="font-semibold">User Management</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Invite reviewers, update user details, reset passwords, and manage access.
                </p>
              </div>
            </div>
            <Button className="gap-2 shrink-0" onClick={() => setUserManagementOpen(true)}>
              <UsersRound className="w-4 h-4" />
              Manage users
            </Button>
          </div>
        </section>

        <div className="mt-8 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <ClipboardList className="w-3.5 h-3.5" />
          Capture, Clarify, and Lautec CSV exports remain available in the main DPR workspace.
        </div>
      </div>

      <UserManagementSheet open={userManagementOpen} onClose={() => setUserManagementOpen(false)} />
    </div>
  );
}