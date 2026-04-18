import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Flag, Search, CheckCheck, AlertTriangle, CheckCircle2, Clock,
  RefreshCw, Filter,
} from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "") + "/";

interface Issue {
  id: number;
  photoId: string | null;
  imageId: number | null;
  type: string;
  severity: string;
  description: string;
  raisedBy: string | null;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tower: string | null;
}

function severityBadge(severity: string) {
  switch (severity) {
    case "critical": return "bg-red-100 text-red-700 border-red-200";
    case "high":     return "bg-orange-100 text-orange-700 border-orange-200";
    case "medium":   return "bg-amber-100 text-amber-700 border-amber-200";
    default:         return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export default function PunchList() {
  const { user } = useAuth();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterResolved, setFilterResolved] = useState<"all" | "open" | "resolved">("open");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterTower, setFilterTower] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetch(`${BASE_URL}api/issues`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: Issue[]) => setIssues(rows))
      .catch(() => setIssues([]))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const handleResolve = useCallback(async (id: number) => {
    setResolvingId(id);
    try {
      const r = await fetch(`${BASE_URL}api/issues/${id}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolvedBy: user?.displayName ?? null }),
      });
      if (r.ok) {
        setIssues(prev => prev.map(i => i.id === id ? { ...i, resolved: true, resolvedAt: new Date().toISOString() } : i));
      }
    } catch { /* ignore */ } finally {
      setResolvingId(null);
    }
  }, [user]);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm("Delete this issue? This cannot be undone.")) return;
    await fetch(`${BASE_URL}api/issues/${id}`, { method: "DELETE" });
    setIssues(prev => prev.filter(i => i.id !== id));
  }, []);

  const towers = Array.from(new Set(issues.map(i => i.tower).filter(Boolean) as string[])).sort();

  const filtered = issues
    .filter(i => {
      if (filterResolved === "open") return !i.resolved;
      if (filterResolved === "resolved") return i.resolved;
      return true;
    })
    .filter(i => filterSeverity === "all" || i.severity === filterSeverity)
    .filter(i => filterTower === "all" || i.tower === filterTower)
    .filter(i => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        i.description.toLowerCase().includes(q) ||
        i.type.toLowerCase().includes(q) ||
        (i.photoId ?? "").toLowerCase().includes(q) ||
        (i.raisedBy ?? "").toLowerCase().includes(q) ||
        (i.tower ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
      const sa = SEVERITY_ORDER[a.severity] ?? 9;
      const sb = SEVERITY_ORDER[b.severity] ?? 9;
      if (sa !== sb) return sa - sb;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const openCount = issues.filter(i => !i.resolved).length;
  const criticalCount = issues.filter(i => !i.resolved && i.severity === "critical").length;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Flag className="w-7 h-7 text-amber-500" />
            Punch List
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {loading ? "Loading…" : `${openCount} open issue${openCount !== 1 ? "s" : ""}${criticalCount > 0 ? ` · ${criticalCount} critical` : ""}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setRefreshKey(k => k + 1)} disabled={loading} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary chips */}
      {!loading && (
        <div className="flex flex-wrap gap-2">
          {["critical", "high", "medium", "low"].map(sev => {
            const count = issues.filter(i => !i.resolved && i.severity === sev).length;
            if (count === 0) return null;
            return (
              <span key={sev} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border cursor-pointer ${severityBadge(sev)} ${filterSeverity === sev ? "ring-2 ring-offset-1 ring-amber-500" : ""}`}
                onClick={() => setFilterSeverity(f => f === sev ? "all" : sev)}>
                <AlertTriangle className="w-3 h-3" />
                {sev}: {count}
              </span>
            );
          })}
          {issues.filter(i => i.resolved).length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border bg-green-50 text-green-700 border-green-200">
              <CheckCircle2 className="w-3 h-3" />
              Resolved: {issues.filter(i => i.resolved).length}
            </span>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Status toggle */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["open", "all", "resolved"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterResolved(f)}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                filterResolved === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {f === "open" ? (
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Open</span>
              ) : f === "resolved" ? (
                <span className="flex items-center gap-1"><CheckCheck className="w-3 h-3" /> Resolved</span>
              ) : "All"}
            </button>
          ))}
        </div>

        {/* Severity filter */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          {["all", "critical", "high", "medium", "low"].map(s => (
            <button
              key={s}
              onClick={() => setFilterSeverity(s)}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                filterSeverity === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {s === "all" ? <span className="flex items-center gap-1"><Filter className="w-3 h-3" />All</span> : s}
            </button>
          ))}
        </div>

        {/* Tower filter */}
        {towers.length > 0 && (
          <select
            value={filterTower}
            onChange={e => setFilterTower(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background text-xs text-foreground px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Towers</option>
            {towers.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search issues…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground/40 border border-dashed rounded-xl">
          <Flag className="w-12 h-12 mb-3" />
          <p className="font-semibold text-sm">No issues found</p>
          <p className="text-xs mt-1">
            {filterResolved === "open" ? "No open issues. Great!" : "Adjust filters or raise an issue from a photo."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(issue => (
            <div
              key={issue.id}
              className={`rounded-lg border px-5 py-4 transition-colors ${
                issue.resolved
                  ? "border-border/40 bg-muted/20 opacity-70"
                  : issue.severity === "critical"
                  ? "border-red-300 bg-red-500/5"
                  : "border-amber-500/30 bg-amber-500/5"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-semibold uppercase rounded-full px-2 py-0.5 border ${severityBadge(issue.severity)}`}>
                      {issue.severity}
                    </span>
                    <Badge variant="outline" className="text-xs capitalize">{issue.type}</Badge>
                    {issue.tower && (
                      <span className="text-[11px] font-semibold text-primary/70 bg-primary/10 px-2 py-0.5 rounded-full">
                        {issue.tower}
                      </span>
                    )}
                    {issue.photoId && (
                      <span className="text-[11px] font-mono text-muted-foreground/60 bg-muted px-1.5 rounded">{issue.photoId}</span>
                    )}
                  </div>
                  <p className="text-sm text-foreground leading-snug">{issue.description}</p>
                  <p className="text-xs text-muted-foreground/60">
                    Raised {new Date(issue.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    {issue.raisedBy && ` by ${issue.raisedBy}`}
                    {issue.resolved && issue.resolvedAt && (
                      <span className="ml-2 text-green-600">
                        · Resolved {new Date(issue.resolvedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        {issue.resolvedBy && ` by ${issue.resolvedBy}`}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {issue.resolved ? (
                    <span className="text-xs text-green-600 font-medium flex items-center gap-1 px-2.5 py-1 rounded-full border border-green-200 bg-green-50">
                      <CheckCheck className="w-3.5 h-3.5" />Resolved
                    </span>
                  ) : (
                    <button
                      onClick={() => handleResolve(issue.id)}
                      disabled={resolvingId === issue.id}
                      className="text-xs text-green-700 font-medium border border-green-200 rounded-full px-3 py-1 hover:bg-green-50 transition-colors disabled:opacity-40"
                    >
                      {resolvingId === issue.id ? "…" : "Mark Resolved"}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(issue.id)}
                    className="text-xs text-muted-foreground hover:text-red-500 transition-colors px-1"
                    title="Delete issue"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
