import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity, Search, ChevronLeft, ChevronRight,
  LogIn, LogOut, Award, Pencil, Trash2, Key, Mail, MailOpen, Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FeedEntry {
  id: number;
  source: "portal" | "email";
  workerId: number;
  workerName: string;
  eventType: string;
  detail: string | null;
  ipAddress: string | null;
  createdAt: string;
}

interface FeedPage {
  data: FeedEntry[];
  total: number;
  page: number;
  pageSize: number;
}

interface Worker {
  id: number;
  name: string;
}

const SOURCE_OPTIONS = [
  { value: "portal", label: "Portal" },
  { value: "email", label: "Email" },
] as const;

const EVENT_TYPE_OPTIONS = [
  { value: "login",            label: "Login",            group: "portal" },
  { value: "logout",           label: "Logout",           group: "portal" },
  { value: "cert_added",       label: "Cert Added",       group: "portal" },
  { value: "cert_edited",      label: "Cert Edited",      group: "portal" },
  { value: "cert_deleted",     label: "Cert Deleted",     group: "portal" },
  { value: "credentials_set",  label: "Credentials Set",  group: "portal" },
  { value: "email_sent",       label: "Email Sent",       group: "email"  },
  { value: "email_opened",     label: "Email Opened",     group: "email"  },
] as const;

type EventCfg = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
};

const EVENT_CONFIG: Record<string, EventCfg> = {
  login:           { label: "Login",           icon: LogIn,     className: "bg-blue-50 text-blue-700 border-blue-200" },
  logout:          { label: "Logout",          icon: LogOut,    className: "bg-slate-50 text-slate-700 border-slate-200" },
  cert_added:      { label: "Cert Added",      icon: Award,     className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cert_edited:     { label: "Cert Edited",     icon: Pencil,    className: "bg-amber-50 text-amber-700 border-amber-200" },
  cert_deleted:    { label: "Cert Deleted",    icon: Trash2,    className: "bg-red-50 text-red-700 border-red-200" },
  credentials_set: { label: "Credentials Set", icon: Key,       className: "bg-purple-50 text-purple-700 border-purple-200" },
  email_sent:      { label: "Email Sent",      icon: Mail,      className: "bg-sky-50 text-sky-700 border-sky-200" },
  email_opened:    { label: "Email Opened",    icon: MailOpen,  className: "bg-teal-50 text-teal-700 border-teal-200" },
};

function EventBadge({ eventType }: { eventType: string }) {
  const cfg = EVENT_CONFIG[eventType] ?? { label: eventType, icon: Activity, className: "bg-muted text-muted-foreground" };
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border", cfg.className)}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function SourceBadge({ source }: { source: "portal" | "email" }) {
  if (source === "email") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded border bg-sky-50 text-sky-600 border-sky-200">
        <Mail className="h-3 w-3" />
        Email
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded border bg-muted text-muted-foreground">
      <Monitor className="h-3 w-3" />
      Portal
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
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const workersQ = useQuery<Worker[]>({
    queryKey: ["workers-list-for-activity-filter"],
    queryFn: () =>
      apiFetch("/api/workforce/workers?status=all&pageSize=500").then(
        (r: { data?: Worker[] }) => r.data ?? r,
      ),
    staleTime: 60_000,
  });

  const q = useQuery<FeedPage>({
    queryKey: ["activity-feed", search, workerIdFilter, sourceFilter, eventTypeFilter, page],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) params.set("search", search.trim());
      if (workerIdFilter !== "all") params.set("workerId", workerIdFilter);
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (eventTypeFilter !== "all") params.set("eventType", eventTypeFilter);
      return apiFetch(`/api/workforce/activity-feed?${params.toString()}`);
    },
    placeholderData: (prev) => prev,
  });

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Access restricted to administrators.
      </div>
    );
  }

  const entries = q.data?.data ?? [];
  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const workers = workersQ.data ?? [];

  const hasFilters =
    search || workerIdFilter !== "all" || sourceFilter !== "all" || eventTypeFilter !== "all";

  function resetPage() {
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setWorkerIdFilter("all");
    setSourceFilter("all");
    setEventTypeFilter("all");
    setPage(1);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Worker Activity</h1>
        {q.data && (
          <span className="text-sm text-muted-foreground ml-1">({total} records)</span>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative w-52">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search worker name…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
          />
        </div>

        <Select value={workerIdFilter} onValueChange={(v) => { setWorkerIdFilter(v); resetPage(); }}>
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

        <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); resetPage(); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {SOURCE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={eventTypeFilter} onValueChange={(v) => { setEventTypeFilter(v); resetPage(); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All events" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {EVENT_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
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
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Source</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Event</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Detail</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">IP Address</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {q.isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-4 w-full max-w-[120px]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-muted-foreground">
                  No activity records found.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={`${entry.source}-${entry.id}-${entry.createdAt}`} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{entry.workerName}</td>
                  <td className="px-4 py-3">
                    <SourceBadge source={entry.source} />
                  </td>
                  <td className="px-4 py-3">
                    <EventBadge eventType={entry.eventType} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[220px] truncate" title={entry.detail ?? ""}>
                    {entry.detail ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                    {entry.ipAddress ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {formatTs(entry.createdAt)}
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
