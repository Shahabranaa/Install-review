import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  RefreshCw, CheckCircle2, Clock, ChevronDown, ChevronRight,
  BarChart3, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "") + "/";

interface LocationPair {
  location: string;
  stringName: string | null;
}

interface SummaryRow {
  location: string;
  stringName: string | null;
  total: number;
  completed: number;
  pct: number;
}

interface TaskRow {
  id: number;
  progressSheetId: string;
  taskId: string;
  taskName: string;
  taskType: string | null;
  sequence: number | null;
  location: string;
  stringName: string | null;
  completed: boolean;
  startDate: string | null;
  finishDate: string | null;
  durationPlanned: string | null;
  latestProgressPct: number;
  latestCompletedAt: string | null;
  durationActual: string | null;
  workActivity: string | null;
}

interface Campaign {
  id: number;
  campaignId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  completedToolingSet: string | null;
  vlfTestSet: string | null;
}

function ProgressBar({ pct, completed }: { pct: number; completed: boolean }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            completed ? "bg-emerald-500" : pct > 0 ? "bg-blue-500" : "bg-muted-foreground/20",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">
        {pct}%
      </span>
    </div>
  );
}

function TaskTable({ tasks }: { tasks: TaskRow[] }) {
  const sorted = [...tasks].sort((a, b) => {
    if (a.taskType !== b.taskType) return (a.taskType ?? "").localeCompare(b.taskType ?? "");
    return (a.sequence ?? 999) - (b.sequence ?? 999);
  });

  const completed = tasks.filter((t) => t.completed).length;
  const pct = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <ProgressBar pct={pct} completed={pct === 100} />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {completed} / {tasks.length} tasks
        </span>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground w-8">#</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Task</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground hidden sm:table-cell">Type</th>
              <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground hidden md:table-cell">Planned (h)</th>
              <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground hidden md:table-cell">Actual (h)</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground w-40">Progress</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground hidden lg:table-cell">Completed</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((task) => (
              <tr
                key={task.id}
                className={cn(
                  "transition-colors",
                  task.completed ? "bg-emerald-50/50 dark:bg-emerald-950/10" : "hover:bg-muted/30",
                )}
              >
                <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                  {task.sequence ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {task.completed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                    ) : task.latestProgressPct > 0 ? (
                      <Activity className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
                    )}
                    <span className={cn("font-medium", task.completed && "text-muted-foreground")}>
                      {task.taskName}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 hidden sm:table-cell">
                  <Badge variant="outline" className="text-[10px] py-0 h-4">
                    {task.taskType ?? "—"}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground hidden md:table-cell">
                  {task.durationPlanned ?? "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-xs hidden md:table-cell">
                  {task.durationActual ? (
                    <span className={cn(
                      parseFloat(task.durationActual) > parseFloat(task.durationPlanned ?? "0")
                        ? "text-amber-600"
                        : "text-emerald-600",
                    )}>
                      {parseFloat(task.durationActual).toFixed(1)}
                    </span>
                  ) : "—"}
                </td>
                <td className="px-3 py-2 w-40">
                  <ProgressBar pct={task.latestProgressPct} completed={task.completed} />
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground hidden lg:table-cell">
                  {task.latestCompletedAt
                    ? new Date(task.latestCompletedAt).toLocaleDateString("en-GB")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LocationAccordion({
  loc,
  summary,
}: {
  loc: LocationPair;
  summary: SummaryRow | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<TaskRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadTasks() {
    if (tasks !== null || loading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ location: loc.location });
      if (loc.stringName) params.set("string", loc.stringName);
      const r = await fetch(`${BASE_URL}api/progress/location-progress?${params}`);
      const j = await r.json();
      setTasks(j);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    if (!open) loadTasks();
    setOpen((o) => !o);
  }

  const pct = summary?.pct ?? 0;
  const completed = summary?.completed ?? 0;
  const total = summary?.total ?? 0;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-medium text-sm">{loc.location}</span>
            {loc.stringName && (
              <span className="text-xs text-muted-foreground">String {loc.stringName}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {summary ? (
            <>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {completed}/{total}
              </span>
              <div className="w-24 hidden sm:block">
                <ProgressBar pct={pct} completed={pct === 100} />
              </div>
              <Badge
                variant={pct === 100 ? "default" : pct > 0 ? "secondary" : "outline"}
                className={cn(
                  "text-[10px] min-w-[40px] justify-center",
                  pct === 100 && "bg-emerald-500",
                )}
              >
                {pct}%
              </Badge>
            </>
          ) : (
            <Badge variant="outline" className="text-[10px]">No data</Badge>
          )}
        </div>
      </button>

      {open && (
        <div className="border-t px-4 py-4 bg-muted/10">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : !tasks || tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No tasks found for this location.</p>
          ) : (
            <TaskTable tasks={tasks} />
          )}
        </div>
      )}
    </div>
  );
}

export default function ProgressPage(): JSX.Element {
  const { user } = useAuth();
  const { toast } = useToast();
  const [locations, setLocations] = useState<LocationPair[] | null>(null);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    const [locsR, sumR, camR] = await Promise.all([
      fetch(`${BASE_URL}api/progress/locations`),
      fetch(`${BASE_URL}api/progress/summary`),
      fetch(`${BASE_URL}api/progress/campaigns`),
    ]);
    const [locsJ, sumJ, camJ] = await Promise.all([locsR.json(), sumR.json(), camR.json()]);
    setLocations(locsJ);
    setSummary(sumJ);
    setCampaigns(camJ);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runSync() {
    setSyncing(true);
    try {
      const r = await fetch(`${BASE_URL}api/progress/sync`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Sync failed");
      toast({ title: "Sync complete", description: `Tasks: ${j.result.tasks.upserted} · Progress: ${j.result.progress.upserted} · Updates: ${j.result.taskProgress.upserted}` });
      await load();
    } catch (err) {
      toast({ title: "Sync failed", description: String(err), variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }

  const sumMap = new Map(
    summary.map((s) => [`${s.location}|${s.stringName ?? ""}`, s]),
  );

  const filteredLocations = (locations ?? []).filter((l) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return l.location.toLowerCase().includes(q) || (l.stringName ?? "").toLowerCase().includes(q);
  });

  const totalTasks = summary.reduce((a, b) => a + b.total, 0);
  const totalCompleted = summary.reduce((a, b) => a + b.completed, 0);
  const overallPct = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Installation Progress
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live task completion tracker synced from the project spreadsheet.
          </p>
        </div>
        {user?.accessLevel === "admin" && (
          <Button
            size="sm"
            variant="outline"
            onClick={runSync}
            disabled={syncing}
            className="flex-shrink-0"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", syncing && "animate-spin")} />
            {syncing ? "Syncing…" : "Sync Sheet"}
          </Button>
        )}
      </div>

      {/* Campaigns */}
      {campaigns.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => (
            <div key={c.campaignId} className="border rounded-lg p-3 space-y-1">
              <div className="font-medium text-sm">{c.name}</div>
              {(c.startDate || c.endDate) && (
                <div className="text-xs text-muted-foreground">
                  {c.startDate && `From ${c.startDate}`}
                  {c.startDate && c.endDate && " → "}
                  {c.endDate}
                </div>
              )}
              {c.completedToolingSet && (
                <div className="text-xs text-muted-foreground">
                  Tooling: {c.completedToolingSet}
                </div>
              )}
              {c.vlfTestSet && (
                <div className="text-xs text-muted-foreground">
                  VLF: {c.vlfTestSet}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Overall progress card */}
      {locations !== null && locations.length > 0 && (
        <div className="border rounded-lg p-4 bg-card space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">Overall Completion</span>
            <span className="text-sm text-muted-foreground">
              {totalCompleted.toLocaleString()} / {totalTasks.toLocaleString()} tasks
            </span>
          </div>
          <ProgressBar pct={overallPct} completed={overallPct === 100} />
          <div className="flex gap-4 text-xs text-muted-foreground pt-1">
            <span>{summary.filter((s) => s.pct === 100).length} locations complete</span>
            <span>{summary.filter((s) => s.pct > 0 && s.pct < 100).length} in progress</span>
            <span>{summary.filter((s) => s.pct === 0).length} not started</span>
          </div>
        </div>
      )}

      {/* Filter */}
      {locations !== null && locations.length > 0 && (
        <div>
          <input
            type="text"
            placeholder="Filter by location or string…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full max-w-sm px-3 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      )}

      {/* Location list */}
      {locations === null ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : locations.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium mb-1">No progress data yet</p>
          <p className="text-sm">
            {user?.accessLevel === "admin"
              ? 'Click "Sync Sheet" above to pull data from the spreadsheet.'
              : "No data has been synced yet. Contact an admin to run the sync."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredLocations.map((loc) => (
            <LocationAccordion
              key={`${loc.location}|${loc.stringName ?? ""}`}
              loc={loc}
              summary={sumMap.get(`${loc.location}|${loc.stringName ?? ""}`)}
            />
          ))}
          {filteredLocations.length === 0 && filter && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No locations match "{filter}".
            </p>
          )}
        </div>
      )}
    </div>
  );
}
