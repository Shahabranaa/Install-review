import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { useCaptureNav } from "@/contexts/CaptureNavContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarDays, Upload, UserPlus, Trash2 } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Team {
  id: number;
  name: string;
}

interface TeamDateException {
  id: number;
  teamId: number;
  date: string;
  status: string;
}

interface DprWorker {
  id: number;
  firstName: string;
  lastName: string;
  role: string | null;
  company: string | null;
  active: boolean;
  teamIds: number[];
}

// ─── API helper ───────────────────────────────────────────────────────────────

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (!res.ok && res.status !== 204) throw new Error(`Request failed: ${res.status}`);
  if (res.status === 204) return null;
  return res.json();
}

// ─── CSV parser ───────────────────────────────────────────────────────────────
// Accepts the tab-separated format:  #  Company  Role/Function  First Name  Last Name
// Also accepts a simpler CSV:        firstName,lastName,role,company
function parsePastedWorkers(raw: string): Array<{ firstName: string; lastName: string; role: string | null; company: string | null }> {
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  const results: Array<{ firstName: string; lastName: string; role: string | null; company: string | null }> = [];

  for (const line of lines) {
    // Detect separator
    const sep = line.includes("\t") ? "\t" : ",";
    const cols = line.split(sep).map((c) => c.trim());

    // Skip header rows
    const first = cols[0].toLowerCase();
    if (first === "#" || first === "no" || first === "num" || first === "firstname" || first === "first name") continue;

    if (sep === "\t" && cols.length >= 5) {
      // Tab format: # | Company | Role | First Name | Last Name
      const firstName = cols[3] ?? "";
      const lastName = cols[4] ?? "";
      if (!firstName && !lastName) continue;
      results.push({
        firstName: firstName || "",
        lastName: lastName || "",
        role: cols[2] || null,
        company: cols[1] || null,
      });
    } else if (cols.length >= 2) {
      // Simple CSV: firstName, lastName [, role [, company]]
      results.push({
        firstName: cols[0] || "",
        lastName: cols[1] || "",
        role: cols[2] || null,
        company: cols[3] || null,
      });
    }
  }

  return results.filter((w) => w.firstName || w.lastName);
}

// ─── Add Worker dialog ────────────────────────────────────────────────────────

function AddWorkerDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (w: { firstName: string; lastName: string; role: string | null; company: string | null }) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");

  const reset = () => { setFirstName(""); setLastName(""); setRole(""); setCompany(""); };

  const handleAdd = () => {
    if (!firstName.trim() && !lastName.trim()) return;
    onAdd({ firstName: firstName.trim(), lastName: lastName.trim(), role: role.trim() || null, company: company.trim() || null });
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Worker</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="aw-fn">First Name</Label>
              <Input id="aw-fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="David" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="aw-ln">Last Name</Label>
              <Input id="aw-ln" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Gorski" onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="aw-role">Role / Function</Label>
            <Input id="aw-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="HV Jointer" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="aw-co">Company</Label>
            <Input id="aw-co" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="JDR" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={handleAdd} disabled={!firstName.trim() && !lastName.trim()}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Import dialog ────────────────────────────────────────────────────────────

function ImportDialog({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (workers: Array<{ firstName: string; lastName: string; role: string | null; company: string | null }>) => void;
}) {
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const preview = useMemo(() => (text ? parsePastedWorkers(text) : []), [text]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setText((ev.target?.result as string) ?? "");
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (preview.length === 0) return;
    onImport(preview);
    setText("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setText(""); onClose(); } }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import Workers</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Paste tab-separated data or upload a CSV/TSV file. Expected columns:{" "}
            <span className="font-mono text-xs">#  Company  Role  First Name  Last Name</span>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="w-3.5 h-3.5 mr-1.5" /> Choose file
            </Button>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleFile} />
          </div>
          <textarea
            className="w-full h-40 text-xs font-mono border rounded-md p-2 resize-none bg-muted/30 focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder={"Paste data here…\n\n1\tJDR\tOIM\tDavid\tGorski\n2\tJDR\tSupervisor\tStuie\tGill"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {preview.length > 0 && (
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              {preview.length} worker{preview.length !== 1 ? "s" : ""} ready to import
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setText(""); onClose(); }}>Cancel</Button>
          <Button onClick={handleImport} disabled={preview.length === 0}>
            Import {preview.length > 0 ? `${preview.length} workers` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Worker row ───────────────────────────────────────────────────────────────

function WorkerRow({
  worker,
  teams,
  onTeamToggle,
  onDelete,
}: {
  worker: DprWorker;
  teams: Team[];
  onTeamToggle: (workerId: number, teamId: number, checked: boolean) => void;
  onDelete: (workerId: number) => void;
}) {
  return (
    <tr className="border-b border-border hover:bg-muted/30 transition-colors">
      <td className="px-3 py-2.5 text-sm font-medium whitespace-nowrap">
        {worker.firstName} {worker.lastName}
      </td>
      <td className="px-3 py-2.5 text-sm text-muted-foreground whitespace-nowrap">{worker.role ?? "—"}</td>
      <td className="px-3 py-2.5 text-sm text-muted-foreground whitespace-nowrap">{worker.company ?? "—"}</td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {teams.map((team) => {
            const assigned = worker.teamIds.includes(team.id);
            return (
              <label key={team.id} className="flex items-center gap-1.5 cursor-pointer select-none">
                <Checkbox
                  checked={assigned}
                  onCheckedChange={(checked) => onTeamToggle(worker.id, team.id, !!checked)}
                  className="h-3.5 w-3.5"
                />
                <span className="text-xs text-muted-foreground">{team.name}</span>
              </label>
            );
          })}
        </div>
      </td>
      <td className="px-3 py-2.5 text-right">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(worker.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );
}

// ─── Workers tab content ──────────────────────────────────────────────────────

function WorkersTab({ teams }: { teams: Team[] }) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const workersKey = ["/api/dpr/workers"];

  const { data: workers = [], isLoading } = useQuery<DprWorker[]>({
    queryKey: workersKey,
    queryFn: ({ signal }) => apiFetch("/api/dpr/workers", { signal }),
  });

  const createMutation = useMutation({
    mutationFn: (body: { firstName: string; lastName: string; role: string | null; company: string | null }) =>
      apiFetch("/api/dpr/workers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workersKey }),
  });

  const importMutation = useMutation({
    mutationFn: (body: Array<{ firstName: string; lastName: string; role: string | null; company: string | null }>) =>
      apiFetch("/api/dpr/workers/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workersKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/dpr/workers/${id}`, { method: "DELETE" }),
    onMutate: (id) => {
      const prev = queryClient.getQueryData<DprWorker[]>(workersKey);
      queryClient.setQueryData<DprWorker[]>(workersKey, (old = []) => old.filter((w) => w.id !== id));
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(workersKey, ctx.prev);
    },
  });

  const teamsMutation = useMutation({
    mutationFn: ({ workerId, teamIds }: { workerId: number; teamIds: number[] }) =>
      apiFetch(`/api/dpr/workers/${workerId}/teams`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamIds }),
      }) as Promise<DprWorker>,
    onMutate: ({ workerId, teamIds }) => {
      const prev = queryClient.getQueryData<DprWorker[]>(workersKey);
      queryClient.setQueryData<DprWorker[]>(workersKey, (old = []) =>
        old.map((w) => (w.id === workerId ? { ...w, teamIds } : w))
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(workersKey, ctx.prev);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<DprWorker[]>(workersKey, (old = []) =>
        old.map((w) => (w.id === updated.id ? updated : w))
      );
    },
  });

  const handleTeamToggle = (workerId: number, teamId: number, checked: boolean) => {
    const worker = workers.find((w) => w.id === workerId);
    if (!worker) return;
    const teamIds = checked
      ? [...worker.teamIds, teamId]
      : worker.teamIds.filter((id) => id !== teamId);
    teamsMutation.mutate({ workerId, teamIds });
  };

  // Group by company for display
  const grouped = useMemo(() => {
    const map = new Map<string, DprWorker[]>();
    for (const w of workers) {
      const key = w.company ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(w);
    }
    // Sort groups alphabetically
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [workers]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold">Workers</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {workers.length} worker{workers.length !== 1 ? "s" : ""} · assign each to one or more teams
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="w-3.5 h-3.5 mr-1.5" /> Import
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Add worker
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
      ) : workers.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No workers yet.</p>
          <p className="text-xs mt-1">Use Import to upload a list or Add worker to create one.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Name</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Role</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Company</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Teams</th>
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {grouped.map(([company, companyWorkers]) => (
                <>
                  {grouped.length > 1 && (
                    <tr key={`group-${company}`}>
                      <td colSpan={5} className="px-3 pt-3 pb-1">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {company}
                        </span>
                      </td>
                    </tr>
                  )}
                  {companyWorkers.map((worker) => (
                    <WorkerRow
                      key={worker.id}
                      worker={worker}
                      teams={teams}
                      onTeamToggle={handleTeamToggle}
                      onDelete={(id) => deleteMutation.mutate(id)}
                    />
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddWorkerDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={(w) => createMutation.mutate(w)}
      />
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={(workers) => importMutation.mutate(workers)}
      />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TeamSetupPage() {
  const { activeDate, setActiveDate } = useCaptureNav();
  const date = activeDate ?? format(new Date(), "yyyy-MM-dd");
  const [calOpen, setCalOpen] = useState(false);
  const [pendingTeamIds, setPendingTeamIds] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/dpr/teams"],
    queryFn: ({ signal }) => apiFetch("/api/dpr/teams", { signal }),
  });

  const exceptionsKey = ["/api/dpr/team-date-exceptions", date];

  const { data: exceptions = [] } = useQuery<TeamDateException[]>({
    queryKey: exceptionsKey,
    queryFn: ({ signal }) => apiFetch(`/api/dpr/team-date-exceptions?date=${date}`, { signal }),
  });

  const exceptionsSet = useMemo(() => new Set(exceptions.map((e) => e.teamId)), [exceptions]);
  const exceptionById = useMemo(() => {
    const map = new Map<number, number>();
    for (const e of exceptions) map.set(e.teamId, e.id);
    return map;
  }, [exceptions]);

  const markPending = (teamId: number) => setPendingTeamIds((s) => new Set([...s, teamId]));
  const clearPending = (teamId: number) => setPendingTeamIds((s) => { const n = new Set(s); n.delete(teamId); return n; });

  const createException = useMutation({
    mutationFn: ({ teamId }: { teamId: number }) =>
      apiFetch("/api/dpr/team-date-exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, date }),
      }) as Promise<TeamDateException>,
    onMutate: ({ teamId }) => {
      markPending(teamId);
      const prev = queryClient.getQueryData<TeamDateException[]>(exceptionsKey);
      queryClient.setQueryData<TeamDateException[]>(exceptionsKey, (old = []) => [
        ...old,
        { id: -teamId, teamId, date, status: "not_working" },
      ]);
      return { prev, teamId };
    },
    onSuccess: (data, { teamId }) => {
      queryClient.setQueryData<TeamDateException[]>(exceptionsKey, (old = []) =>
        old.map((e) => (e.id === -teamId ? data : e))
      );
      clearPending(teamId);
      queryClient.invalidateQueries({ queryKey: ["/api/dpr/timesheet-entries/date-summary"] });
    },
    onError: (_err, { teamId }, ctx) => {
      if (ctx?.prev !== undefined) queryClient.setQueryData(exceptionsKey, ctx.prev);
      clearPending(teamId);
    },
  });

  const deleteException = useMutation({
    mutationFn: ({ id }: { id: number; teamId: number }) =>
      apiFetch(`/api/dpr/team-date-exceptions/${id}`, { method: "DELETE" }),
    onMutate: ({ id, teamId }) => {
      markPending(teamId);
      const prev = queryClient.getQueryData<TeamDateException[]>(exceptionsKey);
      queryClient.setQueryData<TeamDateException[]>(exceptionsKey, (old = []) => old.filter((e) => e.id !== id));
      return { prev, teamId };
    },
    onSuccess: (_data, { teamId }) => {
      clearPending(teamId);
      queryClient.invalidateQueries({ queryKey: ["/api/dpr/timesheet-entries/date-summary"] });
    },
    onError: (_err, { teamId }, ctx) => {
      if (ctx?.prev !== undefined) queryClient.setQueryData(exceptionsKey, ctx.prev);
      clearPending(teamId);
    },
  });

  const toggle = (teamId: number) => {
    if (pendingTeamIds.has(teamId)) return;
    const exId = exceptionById.get(teamId);
    if (exId !== undefined) {
      deleteException.mutate({ id: exId, teamId });
    } else {
      createException.mutate({ teamId });
    }
  };

  const workingCount = teams.length - exceptionsSet.size;

  return (
    <div className="flex flex-col h-full">
      <Tabs defaultValue="schedule" className="flex flex-col h-full">
        <div className="border-b border-border px-6 pt-4 flex-none">
          <h1 className="text-xl font-bold mb-3">Team Setup</h1>
          <TabsList className="h-9">
            <TabsTrigger value="schedule" className="text-sm">Schedule</TabsTrigger>
            <TabsTrigger value="workers" className="text-sm">Workers</TabsTrigger>
          </TabsList>
        </div>

        {/* ── Schedule tab ── */}
        <TabsContent value="schedule" className="flex-1 overflow-auto m-0">
          <div className="p-6 max-w-lg">
            <p className="text-sm text-muted-foreground mb-6">
              Toggle off any teams not working on this date — they'll be excluded from the coverage counts in the sidebar.
            </p>

            <div className="mb-6">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                Date
              </label>
              <Popover open={calOpen} onOpenChange={setCalOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <CalendarDays className="w-4 h-4" />
                    {format(parseISO(date), "EEE, dd MMM yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={parseISO(date)}
                    onSelect={(d) => {
                      if (d) { setActiveDate(format(d, "yyyy-MM-dd")); setCalOpen(false); }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex gap-4 mb-4 text-sm">
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">{workingCount} working</span>
              {exceptionsSet.size > 0 && (
                <span className="text-red-500 dark:text-red-400 font-medium">{exceptionsSet.size} not working</span>
              )}
            </div>

            <div className="space-y-1.5">
              {teams.map((team) => {
                const isOff = exceptionsSet.has(team.id);
                const isPending = pendingTeamIds.has(team.id);
                return (
                  <div
                    key={team.id}
                    className="flex items-center justify-between rounded-lg px-4 py-3 bg-card border border-border"
                  >
                    <span className={isOff ? "text-muted-foreground line-through text-sm" : "text-sm font-medium"}>
                      {team.name}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium ${isOff ? "text-red-500 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {isOff ? "Not working" : "Working"}
                      </span>
                      <Switch
                        checked={!isOff}
                        onCheckedChange={() => toggle(team.id)}
                        disabled={isPending}
                      />
                    </div>
                  </div>
                );
              })}
              {teams.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">Loading teams…</p>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Workers tab ── */}
        <TabsContent value="workers" className="flex-1 overflow-auto m-0">
          <WorkersTab teams={teams} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
