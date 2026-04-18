import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearch } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Flag, Search, CheckCheck, AlertTriangle, CheckCircle2, Clock,
  RefreshCw, Filter, List as ListIcon, LayoutGrid, Plus, Loader2, GripVertical,
} from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "") + "/";

type IssueStatus = "open" | "in_progress" | "resolved";

interface Issue {
  id: number;
  photoId: string | null;
  imageId: number | null;
  type: string;
  severity: string;
  description: string;
  raisedBy: string | null;
  resolved: boolean;
  status: IssueStatus;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tower: string | null;
  string: string | null;
  cable: string | null;
}

const STATUS_COLUMNS: { id: IssueStatus; label: string; icon: React.ReactNode; accent: string }[] = [
  { id: "open",        label: "Open",        icon: <Clock className="w-4 h-4" />,           accent: "border-amber-300/60 bg-amber-50/30" },
  { id: "in_progress", label: "In Progress", icon: <RefreshCw className="w-4 h-4" />,       accent: "border-blue-300/60  bg-blue-50/30"  },
  { id: "resolved",    label: "Resolved",    icon: <CheckCheck className="w-4 h-4" />,      accent: "border-green-300/60 bg-green-50/30" },
];

const SEVERITIES = ["critical", "high", "medium", "low"] as const;
const TYPES = ["compliance", "quality", "safety", "documentation", "other"] as const;
const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function severityBadge(severity: string) {
  switch (severity) {
    case "critical": return "bg-red-100 text-red-700 border-red-200";
    case "high":     return "bg-orange-100 text-orange-700 border-orange-200";
    case "medium":   return "bg-amber-100 text-amber-700 border-amber-200";
    default:         return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

function deriveStatus(i: { status?: IssueStatus | string | null; resolved: boolean }): IssueStatus {
  const s = (i.status ?? "").toLowerCase();
  if (s === "open" || s === "in_progress" || s === "resolved") return s as IssueStatus;
  return i.resolved ? "resolved" : "open";
}

export default function PunchList() {
  const { user } = useAuth();
  const search = useSearch();
  const urlParams = useMemo(() => new URLSearchParams(search), [search]);

  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "board">(
    () => (typeof window !== "undefined" && localStorage.getItem("punchlist:view") === "board") ? "board" : "list"
  );
  const [filterResolved, setFilterResolved] = useState<"all" | "open" | "resolved">("open");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterTower, setFilterTower] = useState<string>(() => urlParams.get("tower") ?? "all");
  const [filterString, setFilterString] = useState<string>(() => urlParams.get("string") ?? "all");

  // Re-sync filters when URL changes (e.g., navigating from map popup)
  useEffect(() => {
    const t = urlParams.get("tower");
    const s = urlParams.get("string");
    if (t) setFilterTower(t);
    if (s) setFilterString(s);
  }, [urlParams]);
  const [sortBy, setSortBy] = useState<"severity" | "date">("severity");
  const [searchQuery, setSearchQuery] = useState("");
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [newTaskColumn, setNewTaskColumn] = useState<IssueStatus | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<IssueStatus | null>(null);

  useEffect(() => {
    localStorage.setItem("punchlist:view", view);
  }, [view]);

  const [loadError, setLoadError] = useState<string | null>(null);
  const reloadIssues = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    fetch(`${BASE_URL}api/issues`)
      .then(async r => {
        if (!r.ok) throw new Error(`Failed to load issues (${r.status})`);
        return (await r.json()) as Issue[];
      })
      .then(rows => setIssues(rows.map(r => ({ ...r, status: deriveStatus(r) }))))
      .catch(e => { setIssues([]); setLoadError(String(e?.message ?? e)); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reloadIssues(); }, [reloadIssues, refreshKey]);

  const notifyChanged = () => window.dispatchEvent(new CustomEvent("issues:changed"));

  const updateStatus = useCallback(async (id: number, next: IssueStatus) => {
    // Optimistic
    setIssues(prev => prev.map(i => i.id === id ? { ...i, status: next, resolved: next === "resolved" } : i));
    try {
      const r = await fetch(`${BASE_URL}api/issues/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: next,
          ...(next === "resolved" ? { resolvedBy: user?.displayName ?? null } : {}),
        }),
      });
      if (r.ok) {
        const updated = await r.json() as Partial<Issue>;
        setIssues(prev => prev.map(i => i.id === id ? { ...i, ...updated, status: deriveStatus({ ...i, ...updated }) } : i));
        notifyChanged();
      } else {
        reloadIssues();
      }
    } catch {
      reloadIssues();
    }
  }, [user, reloadIssues]);

  const handleResolve = useCallback(async (id: number) => {
    setResolvingId(id);
    try {
      await updateStatus(id, "resolved");
    } finally { setResolvingId(null); }
  }, [updateStatus]);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm("Delete this issue? This cannot be undone.")) return;
    try {
      const r = await fetch(`${BASE_URL}api/issues/${id}`, { method: "DELETE" });
      if (!r.ok) {
        alert(`Failed to delete issue (status ${r.status}).`);
        return;
      }
      setIssues(prev => prev.filter(i => i.id !== id));
      notifyChanged();
    } catch (e) {
      alert(`Failed to delete issue: ${e}`);
    }
  }, []);

  const towers = useMemo(() => Array.from(new Set(issues.map(i => i.tower).filter(Boolean) as string[])).sort(), [issues]);
  const stringsForFilter = useMemo(() => Array.from(
    new Set(
      issues
        .filter(i => filterTower === "all" || i.tower === filterTower)
        .map(i => i.string)
        .filter(Boolean) as string[]
    )
  ).sort(), [issues, filterTower]);

  const matchesFilters = useCallback((i: Issue) => {
    if (filterSeverity !== "all" && i.severity !== filterSeverity) return false;
    if (filterTower !== "all" && i.tower !== filterTower) return false;
    if (filterString !== "all" && i.string !== filterString) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const hit =
        i.description.toLowerCase().includes(q) ||
        i.type.toLowerCase().includes(q) ||
        (i.photoId ?? "").toLowerCase().includes(q) ||
        (i.raisedBy ?? "").toLowerCase().includes(q) ||
        (i.tower ?? "").toLowerCase().includes(q) ||
        (i.string ?? "").toLowerCase().includes(q) ||
        (i.cable ?? "").toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  }, [filterSeverity, filterTower, filterString, searchQuery]);

  const filteredAll = useMemo(() => issues.filter(matchesFilters), [issues, matchesFilters]);

  const filteredList = useMemo(() => filteredAll
    .filter(i => {
      if (filterResolved === "open") return i.status !== "resolved";
      if (filterResolved === "resolved") return i.status === "resolved";
      return true;
    })
    .sort((a, b) => {
      const aResolved = a.status === "resolved" ? 1 : 0;
      const bResolved = b.status === "resolved" ? 1 : 0;
      if (aResolved !== bResolved) return aResolved - bResolved;
      if (sortBy === "severity") {
        const sa = SEVERITY_ORDER[a.severity] ?? 9;
        const sb = SEVERITY_ORDER[b.severity] ?? 9;
        if (sa !== sb) return sa - sb;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }),
    [filteredAll, filterResolved, sortBy]);

  const columnIssues = useCallback((col: IssueStatus) => filteredAll
    .filter(i => i.status === col)
    .sort((a, b) => {
      const sa = SEVERITY_ORDER[a.severity] ?? 9;
      const sb = SEVERITY_ORDER[b.severity] ?? 9;
      if (sa !== sb) return sa - sb;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }),
    [filteredAll]);

  const openCount = issues.filter(i => i.status !== "resolved").length;
  const criticalCount = issues.filter(i => i.status !== "resolved" && i.severity === "critical").length;

  const onDragStart = (id: number) => (e: React.DragEvent) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(id));
  };
  const onDragEnd = () => { setDraggingId(null); setDragOverColumn(null); };
  const onColumnDragOver = (col: IssueStatus) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(col);
  };
  const onColumnDrop = (col: IssueStatus) => (e: React.DragEvent) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData("text/plain")) || draggingId;
    setDraggingId(null);
    setDragOverColumn(null);
    if (!id) return;
    const issue = issues.find(i => i.id === id);
    if (!issue || issue.status === col) return;
    void updateStatus(id, col);
  };

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
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setView("list")}
              className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 ${view === "list" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
            >
              <ListIcon className="w-3.5 h-3.5" /> List
            </button>
            <button
              onClick={() => setView("board")}
              className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 ${view === "board" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Board
            </button>
          </div>
          <Button size="sm" onClick={() => setNewTaskColumn("open")} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> New Task
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRefreshKey(k => k + 1)} disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary chips */}
      {!loading && (
        <div className="flex flex-wrap gap-2">
          {SEVERITIES.map(sev => {
            const count = issues.filter(i => i.status !== "resolved" && i.severity === sev).length;
            if (count === 0) return null;
            return (
              <span key={sev} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border cursor-pointer ${severityBadge(sev)} ${filterSeverity === sev ? "ring-2 ring-offset-1 ring-amber-500" : ""}`}
                onClick={() => setFilterSeverity(f => f === sev ? "all" : sev)}>
                <AlertTriangle className="w-3 h-3" />
                {sev}: {count}
              </span>
            );
          })}
          {issues.filter(i => i.status === "resolved").length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border bg-green-50 text-green-700 border-green-200">
              <CheckCircle2 className="w-3 h-3" />
              Resolved: {issues.filter(i => i.status === "resolved").length}
            </span>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {view === "list" && (
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
        )}

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

        {towers.length > 0 && (
          <select
            value={filterTower}
            onChange={e => { setFilterTower(e.target.value); setFilterString("all"); }}
            className="h-9 rounded-lg border border-border bg-background text-xs text-foreground px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Towers</option>
            {towers.map(t => (<option key={t} value={t}>{t}</option>))}
          </select>
        )}

        {stringsForFilter.length > 0 && (
          <select
            value={filterString}
            onChange={e => setFilterString(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background text-xs text-foreground px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Strings</option>
            {stringsForFilter.map(s => (<option key={s} value={s}>{s}</option>))}
          </select>
        )}

        {view === "list" && (
          <div className="flex rounded-lg border border-border overflow-hidden ml-auto">
            {(["severity", "date"] as const).map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  sortBy === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {s === "severity" ? "By Severity" : "By Date"}
              </button>
            ))}
          </div>
        )}

        <div className={`relative min-w-[200px] max-w-xs ${view === "board" ? "ml-auto" : ""}`}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search issues…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : view === "list" ? (
        filteredList.length === 0 ? (
          <EmptyState filterResolved={filterResolved} />
        ) : (
          <div className="space-y-2">
            {filteredList.map(issue => (
              <ListRow
                key={issue.id}
                issue={issue}
                resolvingId={resolvingId}
                onResolve={handleResolve}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${STATUS_COLUMNS.length}, minmax(280px, 1fr))` }}>
          {STATUS_COLUMNS.map(col => {
            const items = columnIssues(col.id);
            const isOver = dragOverColumn === col.id;
            return (
              <div
                key={col.id}
                onDragOver={onColumnDragOver(col.id)}
                onDragLeave={() => setDragOverColumn(d => d === col.id ? null : d)}
                onDrop={onColumnDrop(col.id)}
                className={`flex flex-col rounded-xl border ${col.accent} transition-colors ${
                  isOver ? "ring-2 ring-primary/60 border-primary/60" : ""
                }`}
              >
                <div className="px-4 py-3 flex items-center justify-between border-b border-border/50">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {col.icon}
                    {col.label}
                    <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
                  </div>
                  <button
                    onClick={() => setNewTaskColumn(col.id)}
                    className="rounded-md p-1 hover:bg-background/80 transition-colors"
                    title={`Add ${col.label.toLowerCase()} task`}
                  >
                    <Plus className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
                <div className="flex-1 p-3 space-y-2 min-h-[60vh]">
                  {items.length === 0 ? (
                    <div className="text-xs text-muted-foreground/60 text-center py-8 border border-dashed rounded-lg">
                      Drop tasks here
                    </div>
                  ) : (
                    items.map(issue => (
                      <BoardCard
                        key={issue.id}
                        issue={issue}
                        dragging={draggingId === issue.id}
                        onDragStart={onDragStart(issue.id)}
                        onDragEnd={onDragEnd}
                        onDelete={handleDelete}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <NewTaskDialog
        open={newTaskColumn !== null}
        defaultStatus={newTaskColumn ?? "open"}
        defaultRaisedBy={user?.displayName ?? ""}
        towers={towers}
        strings={stringsForFilter}
        onClose={() => setNewTaskColumn(null)}
        onCreated={(issue) => {
          setIssues(prev => [{ ...issue, status: deriveStatus(issue) }, ...prev]);
          setNewTaskColumn(null);
          notifyChanged();
        }}
      />
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function EmptyState({ filterResolved }: { filterResolved: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground/40 border border-dashed rounded-xl">
      <Flag className="w-12 h-12 mb-3" />
      <p className="font-semibold text-sm">No issues found</p>
      <p className="text-xs mt-1">
        {filterResolved === "open" ? "No open issues. Great!" : "Adjust filters or raise an issue from a photo."}
      </p>
    </div>
  );
}

function ListRow({
  issue, resolvingId, onResolve, onDelete,
}: {
  issue: Issue;
  resolvingId: number | null;
  onResolve: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const resolved = issue.status === "resolved";
  return (
    <div
      className={`rounded-lg border px-5 py-4 transition-colors ${
        resolved
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
            {issue.string && (
              <span className="text-[11px] text-muted-foreground/80 bg-muted/60 border border-border/40 px-2 py-0.5 rounded-full">
                {issue.string}
              </span>
            )}
            {issue.cable && (
              <span className="text-[11px] text-cyan-700 bg-cyan-100/80 border border-cyan-200 px-2 py-0.5 rounded-full">
                {issue.cable}
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
            {resolved && issue.resolvedAt && (
              <span className="ml-2 text-green-600">
                · Resolved {new Date(issue.resolvedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                {issue.resolvedBy && ` by ${issue.resolvedBy}`}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {resolved ? (
            <span className="text-xs text-green-600 font-medium flex items-center gap-1 px-2.5 py-1 rounded-full border border-green-200 bg-green-50">
              <CheckCheck className="w-3.5 h-3.5" />Resolved
            </span>
          ) : (
            <button
              onClick={() => onResolve(issue.id)}
              disabled={resolvingId === issue.id}
              className="text-xs text-green-700 font-medium border border-green-200 rounded-full px-3 py-1 hover:bg-green-50 transition-colors disabled:opacity-40"
            >
              {resolvingId === issue.id ? "…" : "Mark Resolved"}
            </button>
          )}
          <button
            onClick={() => onDelete(issue.id)}
            className="text-xs text-muted-foreground hover:text-red-500 transition-colors px-1"
            title="Delete issue"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

function BoardCard({
  issue, dragging, onDragStart, onDragEnd, onDelete,
}: {
  issue: Issue;
  dragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group rounded-lg border bg-background p-3 cursor-grab active:cursor-grabbing transition-all shadow-sm hover:shadow-md ${
        dragging ? "opacity-30" : ""
      } ${issue.severity === "critical" ? "border-red-300" : "border-border"}`}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="w-4 h-4 text-muted-foreground/40 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[10px] font-semibold uppercase rounded px-1.5 py-0.5 border ${severityBadge(issue.severity)}`}>
              {issue.severity}
            </span>
            <Badge variant="outline" className="text-[10px] capitalize px-1.5 py-0">{issue.type}</Badge>
          </div>
          <p className="text-sm text-foreground leading-snug line-clamp-3">{issue.description}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {issue.tower && (
              <span className="text-[10px] font-semibold text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded-full">
                {issue.tower}
              </span>
            )}
            {issue.string && (
              <span className="text-[10px] text-muted-foreground/80 bg-muted/60 px-1.5 py-0.5 rounded-full">
                {issue.string}
              </span>
            )}
            {issue.cable && (
              <span className="text-[10px] text-cyan-700 bg-cyan-100/80 px-1.5 py-0.5 rounded-full">
                {issue.cable}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground/60 pt-1">
            <span>
              {new Date(issue.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              {issue.raisedBy && ` · ${issue.raisedBy}`}
            </span>
            <button
              onClick={() => onDelete(issue.id)}
              className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity px-1"
              title="Delete"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewTaskDialog({
  open, defaultStatus, defaultRaisedBy, towers, strings, onClose, onCreated,
}: {
  open: boolean;
  defaultStatus: IssueStatus;
  defaultRaisedBy: string;
  towers: string[];
  strings: string[];
  onClose: () => void;
  onCreated: (issue: Issue) => void;
}) {
  const [type, setType] = useState<string>("compliance");
  const [severity, setSeverity] = useState<string>("medium");
  const [description, setDescription] = useState("");
  const [tower, setTower] = useState<string>("");
  const [stringName, setStringName] = useState<string>("");
  const [cable, setCable] = useState<string>("");
  const [raisedBy, setRaisedBy] = useState<string>(defaultRaisedBy);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setType("compliance");
      setSeverity("medium");
      setDescription("");
      setTower("");
      setStringName("");
      setCable("");
      setRaisedBy(defaultRaisedBy);
      setError(null);
    }
  }, [open, defaultRaisedBy]);

  const submit = async () => {
    if (!description.trim()) { setError("Description is required."); return; }
    setSubmitting(true);
    setError(null);
    try {
      // Backend requires either imageId or photoId. For manual tasks we still
      // provide a synthetic photoId for legacy bucket compatibility, but the
      // canonical scope lives in the explicit tower/string/cable columns.
      const photoId = tower
        ? `manual:tower:${tower}`
        : cable
        ? `manual:cable:${cable}`
        : `manual:${Date.now()}`;
      const r = await fetch(`${BASE_URL}api/issues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoId,
          type,
          severity,
          description: description.trim(),
          raisedBy: raisedBy || undefined,
          status: defaultStatus,
          tower: tower || undefined,
          string: stringName || undefined,
          cable: cable || undefined,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        setError(err.error ?? "Failed to create issue");
        return;
      }
      const created = await r.json() as Issue;
      onCreated(created);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
          <DialogDescription>
            Add a punch-list task. It will appear in the <span className="font-semibold capitalize">{defaultStatus.replace("_", " ")}</span> column.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs font-medium">
              <span className="text-muted-foreground">Type</span>
              <select
                value={type}
                onChange={e => setType(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background text-sm px-2.5 capitalize focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium">
              <span className="text-muted-foreground">Severity</span>
              <select
                value={severity}
                onChange={e => setSeverity(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background text-sm px-2.5 capitalize focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>

          <label className="space-y-1 text-xs font-medium block">
            <span className="text-muted-foreground">Description</span>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What needs to be done?"
              rows={3}
            />
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className="space-y-1 text-xs font-medium">
              <span className="text-muted-foreground">Tower</span>
              <input
                list="punch-towers"
                value={tower}
                onChange={e => setTower(e.target.value)}
                placeholder="optional"
                className="w-full h-9 rounded-lg border border-border bg-background text-sm px-2.5 focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <datalist id="punch-towers">
                {towers.map(t => <option key={t} value={t} />)}
              </datalist>
            </label>
            <label className="space-y-1 text-xs font-medium">
              <span className="text-muted-foreground">String</span>
              <input
                list="punch-strings"
                value={stringName}
                onChange={e => setStringName(e.target.value)}
                placeholder="optional"
                className="w-full h-9 rounded-lg border border-border bg-background text-sm px-2.5 focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <datalist id="punch-strings">
                {strings.map(s => <option key={s} value={s} />)}
              </datalist>
            </label>
            <label className="space-y-1 text-xs font-medium">
              <span className="text-muted-foreground">Cable</span>
              <input
                value={cable}
                onChange={e => setCable(e.target.value)}
                placeholder="optional"
                className="w-full h-9 rounded-lg border border-border bg-background text-sm px-2.5 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>

          <label className="space-y-1 text-xs font-medium block">
            <span className="text-muted-foreground">Raised by</span>
            <Input value={raisedBy} onChange={e => setRaisedBy(e.target.value)} placeholder="Your name" />
          </label>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={submitting} className="gap-1.5">
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
