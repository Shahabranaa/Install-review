import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Activity, Search, ChevronLeft, ChevronRight, LogIn, Award, Pencil, Trash2, Key } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActivityLog {
  id: number;
  workerId: number;
  workerName: string;
  action: string;
  detail: string | null;
  ipAddress: string | null;
  createdAt: string;
}

interface ActivityPage {
  data: ActivityLog[];
  total: number;
  page: number;
  pageSize: number;
}

interface Worker {
  id: number;
  name: string;
}

const ACTION_OPTIONS = [
  { value: "login", label: "Login" },
  { value: "logout", label: "Logout" },
  { value: "cert_added", label: "Cert Added" },
  { value: "cert_edited", label: "Cert Edited" },
  { value: "cert_deleted", label: "Cert Deleted" },
  { value: "credentials_set", label: "Credentials Set" },
] as const;

const ACTION_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
  login: { label: "Login", icon: LogIn, className: "bg-blue-50 text-blue-700 border-blue-200" },
  logout: { label: "Logout", icon: LogIn, className: "bg-slate-50 text-slate-700 border-slate-200" },
  cert_added: { label: "Cert Added", icon: Award, className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cert_edited: { label: "Cert Edited", icon: Pencil, className: "bg-amber-50 text-amber-700 border-amber-200" },
  cert_deleted: { label: "Cert Deleted", icon: Trash2, className: "bg-red-50 text-red-700 border-red-200" },
  credentials_set: { label: "Credentials Set", icon: Key, className: "bg-purple-50 text-purple-700 border-purple-200" },
};

function ActionBadge({ action }: { action: string }) {
  const cfg = ACTION_CONFIG[action] ?? { label: action, icon: Activity, className: "bg-muted text-muted-foreground" };
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border", cfg.className)}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function formatTs(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function WorkerActivityPage() {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [workerIdFilter, setWorkerIdFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const workersQ = useQuery<Worker[]>({
    queryKey: ["workers-list-minimal"],
    queryFn: () => apiFetch("/api/workforce/workers?pageSize=500").then((r: { data?: Worker[] }) => r.data ?? r),
    staleTime: 60_000,
  });

  const q = useQuery<ActivityPage>({
    queryKey: ["worker-activity", search, workerIdFilter, actionFilter, page],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) params.set("search", search.trim());
      if (workerIdFilter !== "all") params.set("workerId", workerIdFilter);
      if (actionFilter !== "all") params.set("action", actionFilter);
      return apiFetch(`/api/workforce/worker-activity?${params.toString()}`);
    },
    placeholderData: (prev) => prev,
  });

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-muted-foreground">Access restricted to administrators.</div>
    );
  }

  const logs = q.data?.data ?? [];
  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const workers = workersQ.data ?? [];

  function resetPage() { setPage(1); }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Worker Portal Activity</h1>
        {q.data && (
          <span className="text-sm text-muted-foreground ml-1">({total} records)</span>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search worker name…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
          />
        </div>

        <Select
          value={workerIdFilter}
          onValueChange={(v) => { setWorkerIdFilter(v); resetPage(); }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All workers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All workers</SelectItem>
            {workers.map((w) => (
              <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={actionFilter}
          onValueChange={(v) => { setActionFilter(v); resetPage(); }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {ACTION_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(search || workerIdFilter !== "all" || actionFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearch(""); setWorkerIdFilter("all"); setActionFilter("all"); resetPage(); }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Worker</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Action</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Detail</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">IP Address</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {q.isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-4 w-full max-w-[120px]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-muted-foreground">
                  No activity records found.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{log.workerName}</td>
                  <td className="px-4 py-3">
                    <ActionBadge action={log.action} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">
                    {log.detail ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                    {log.ipAddress ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {formatTs(log.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages} · {total} records
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
