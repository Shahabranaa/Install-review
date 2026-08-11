import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2, Search, X, FilePlus, FilePen, FileX, Lock, CheckSquare, Tag, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ActivityLog {
  id: number;
  actorId: number | null;
  actorName: string;
  action: string;
  page: string;
  detail: string;
  entryId: number | null;
  entryDate: string | null;
  teamId: number | null;
  createdAt: string;
}

function DetailWithLink({ log, navigate }: { log: ActivityLog; navigate: (to: string) => void }) {
  if (!log.entryId || !log.entryDate) return <>{log.detail}</>;
  const parts = log.detail.split(/(entry #\d+)/);
  return (
    <>
      {parts.map((part, i) =>
        /^entry #\d+$/.test(part) ? (
          <button
            key={i}
            className="text-primary underline-offset-2 underline hover:no-underline font-medium"
            onClick={() => navigate(`/?date=${log.entryDate}&highlight=${log.entryId}`)}
          >
            {part}
          </button>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

async function fetchLogs(): Promise<ActivityLog[]> {
  const res = await fetch(`${API_BASE}/api/dpr/activity-logs?limit=300`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load logs");
  return res.json();
}

const ACTION_META: Record<string, { label: string; icon: React.ElementType; colour: string }> = {
  entry_created:   { label: "Created",   icon: FilePlus,    colour: "text-green-600 bg-green-500/10" },
  entry_updated:   { label: "Updated",   icon: FilePen,     colour: "text-blue-600 bg-blue-500/10" },
  entry_deleted:   { label: "Deleted",   icon: FileX,       colour: "text-red-600 bg-red-500/10" },
  entries_locked:  { label: "Locked",    icon: Lock,        colour: "text-amber-600 bg-amber-500/10" },
  entry_clarified: { label: "Clarified", icon: CheckSquare, colour: "text-purple-600 bg-purple-500/10" },
  entry_jdr_set:   { label: "JDR set",   icon: Tag,         colour: "text-indigo-600 bg-indigo-500/10" },
};

const PAGE_LABEL: Record<string, string> = {
  capture: "Capture",
  clarify: "Clarify",
  jdr_mapping: "DPR Mapping",
};

function ActionChip({ action }: { action: string }) {
  const meta = ACTION_META[action] ?? { label: action, icon: FilePen, colour: "text-muted-foreground bg-muted" };
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none", meta.colour)}>
      <Icon className="w-2.5 h-2.5" />
      {meta.label}
    </span>
  );
}

export default function LogsPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [pageFilter, setPageFilter] = useState<string>("all");

  const { data: logs = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["dpr-activity-logs"],
    queryFn: fetchLogs,
    staleTime: 0,
  });

  const filtered = logs.filter((l) => {
    if (pageFilter !== "all" && l.page !== pageFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        l.actorName.toLowerCase().includes(q) ||
        l.detail.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Group by date
  const grouped: { date: string; items: ActivityLog[] }[] = [];
  for (const log of filtered) {
    const d = log.createdAt.substring(0, 10);
    const last = grouped[grouped.length - 1];
    if (last?.date === d) last.items.push(log);
    else grouped.push({ date: d, items: [log] });
  }

  function formatDateHeading(iso: string) {
    const today = new Date().toISOString().substring(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().substring(0, 10);
    if (iso === today) return "Today";
    if (iso === yesterday) return "Yesterday";
    return format(new Date(iso), "d MMM yyyy");
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Toolbar ── */}
      <div className="shrink-0 border-b border-border px-6 py-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Activity Log</h1>
            <p className="text-sm text-muted-foreground">All changes made on Capture and Clarify</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </Button>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by user, action or detail…"
              className="pl-8 h-8 text-sm"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Page filter pills */}
          <div className="flex gap-1.5">
            {["all", "capture", "clarify"].map((p) => (
              <button
                key={p}
                onClick={() => setPageFilter(p)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                  pageFilter === p
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {p === "all" ? "All pages" : PAGE_LABEL[p] ?? p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Log list ── */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-20">
            {search || pageFilter !== "all" ? "No matching log entries." : "No activity recorded yet."}
          </p>
        ) : (
          grouped.map(({ date, items }) => (
            <div key={date}>
              {/* Date heading */}
              <div className="sticky top-0 z-10 px-6 py-2 bg-muted/70 backdrop-blur-sm border-b border-border/30">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {formatDateHeading(date)}
                </span>
              </div>

              {items.map((log) => (
                <div
                  key={log.id}
                  className="flex gap-4 px-6 py-3.5 border-b border-border/30 hover:bg-muted/20 transition-colors"
                >
                  {/* Actor avatar */}
                  <div className="w-8 h-8 rounded-full bg-sidebar-accent border border-border flex items-center justify-center text-xs font-bold uppercase shrink-0 mt-0.5">
                    {log.actorName?.[0] ?? "?"}
                  </div>

                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{log.actorName}</span>
                      <ActionChip action={log.action} />
                      <span className="text-[11px] text-muted-foreground/60">
                        {PAGE_LABEL[log.page] ?? log.page}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground"><DetailWithLink log={log} navigate={navigate} /></p>
                  </div>

                  {/* Timestamp */}
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted-foreground">{format(new Date(log.createdAt), "HH:mm")}</p>
                    <p className="text-[10px] text-muted-foreground/50">
                      {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* ── Footer count ── */}
      {filtered.length > 0 && (
        <div className="shrink-0 px-6 py-2 border-t border-border/40 text-xs text-muted-foreground">
          {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
          {logs.length > filtered.length ? ` of ${logs.length}` : ""}
        </div>
      )}
    </div>
  );
}
