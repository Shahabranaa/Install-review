import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import { useCaptureNav } from "@/contexts/CaptureNavContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CalendarDays, Copy, Trash2, Plus, X, Upload, Settings2, ChevronDown } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Team { id: number; name: string }
interface TeamDateException { id: number; teamId: number; date: string; status: string }

interface DprWorker {
  id: number; firstName: string; lastName: string;
  role: string | null; company: string | null; active: boolean; teamIds: number[];
}

interface RosterSlot {
  slotId: number; role: string; displayOrder: number;
  assignmentId: number | null; worker: DprWorker | null;
}
interface RosterTeam { teamId: number; teamName: string; slots: RosterSlot[] }
interface RosterDay { date: string; teams: RosterTeam[]; unassigned: DprWorker[] }
type TeamTriple = [RosterTeam, RosterTeam | undefined, RosterTeam | undefined];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (!res.ok && res.status !== 204) throw new Error(`Request failed: ${res.status}`);
  if (res.status === 204) return null;
  return res.json();
}

function jsonBody(body: unknown): RequestInit {
  return { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

/** Up to 3-char uppercase abbreviation from a role string */
function roleAbbr(role: string): string {
  const words = role.trim().split(/\s+/);
  if (words.length === 1) return role.substring(0, 3).toUpperCase();
  return words.map((w) => w[0]).join("").substring(0, 4).toUpperCase();
}

/** Deterministic colour token for a role abbreviation */
const ROLE_COLORS: Record<string, string> = {
  HV:  "bg-blue-50   text-blue-700   border-blue-200   dark:bg-blue-950/40  dark:text-blue-300  dark:border-blue-800",
  HVJ: "bg-blue-50   text-blue-700   border-blue-200   dark:bg-blue-950/40  dark:text-blue-300  dark:border-blue-800",
  FO:  "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
  FOJ: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
  CT:  "bg-amber-50  text-amber-700  border-amber-200  dark:bg-amber-950/40  dark:text-amber-300  dark:border-amber-800",
  CAB: "bg-amber-50  text-amber-700  border-amber-200  dark:bg-amber-950/40  dark:text-amber-300  dark:border-amber-800",
  OIM: "bg-rose-50   text-rose-700   border-rose-200   dark:bg-rose-950/40   dark:text-rose-300   dark:border-rose-800",
  DOI: "bg-cyan-50   text-cyan-700   border-cyan-200   dark:bg-cyan-950/40   dark:text-cyan-300   dark:border-cyan-800",
  SUP: "bg-pink-50   text-pink-700   border-pink-200   dark:bg-pink-950/40   dark:text-pink-300   dark:border-pink-800",
  DC:  "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
  HSE: "bg-teal-50   text-teal-700   border-teal-200   dark:bg-teal-950/40   dark:text-teal-300   dark:border-teal-800",
  ASS: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800",
  MEL: "bg-lime-50   text-lime-700   border-lime-200   dark:bg-lime-950/40   dark:text-lime-300   dark:border-lime-800",
  SCA: "bg-sky-50    text-sky-700    border-sky-200    dark:bg-sky-950/40    dark:text-sky-300    dark:border-sky-800",
  SCF: "bg-sky-50    text-sky-700    border-sky-200    dark:bg-sky-950/40    dark:text-sky-300    dark:border-sky-800",
  WF:  "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
};
const FALLBACK_COLORS = [
  "bg-slate-50   text-slate-700   border-slate-200   dark:bg-slate-950/40  dark:text-slate-300  dark:border-slate-700",
  "bg-zinc-50    text-zinc-700    border-zinc-200    dark:bg-zinc-950/40   dark:text-zinc-300   dark:border-zinc-700",
  "bg-stone-50   text-stone-700   border-stone-200   dark:bg-stone-950/40  dark:text-stone-300  dark:border-stone-700",
];
const _dynamicRoleMap = new Map<string, string>();
function roleColor(abbr: string): string {
  if (ROLE_COLORS[abbr]) return ROLE_COLORS[abbr];
  if (!_dynamicRoleMap.has(abbr)) {
    _dynamicRoleMap.set(abbr, FALLBACK_COLORS[_dynamicRoleMap.size % FALLBACK_COLORS.length]);
  }
  return _dynamicRoleMap.get(abbr)!;
}

// ─── CSV parser ────────────────────────────────────────────────────────────────

function parsePastedWorkers(raw: string) {
  return raw.trim().split(/\r?\n/).filter(Boolean).flatMap((line) => {
    const sep = line.includes("\t") ? "\t" : ",";
    const cols = line.split(sep).map((c) => c.trim());
    const first = cols[0].toLowerCase();
    if (["#", "no", "num", "firstname", "first name"].includes(first)) return [];
    if (sep === "\t" && cols.length >= 5) {
      const firstName = cols[3] ?? "", lastName = cols[4] ?? "";
      if (!firstName && !lastName) return [];
      return [{ firstName, lastName, role: cols[2] || null, company: cols[1] || null }];
    }
    if (cols.length >= 2) return [{ firstName: cols[0] || "", lastName: cols[1] || "", role: cols[2] || null, company: cols[3] || null }];
    return [];
  }).filter((w) => w.firstName || w.lastName);
}

// ─── Manage Workers dialog ─────────────────────────────────────────────────────

function ManageWorkersDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const key = ["/api/dpr/workers"];
  const { data: workers = [] } = useQuery<DprWorker[]>({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch("/api/dpr/workers", { signal }),
    enabled: open,
  });
  const [tab, setTab] = useState<"list" | "import" | "add">("list");
  const [firstName, setFirstName] = useState(""); const [lastName, setLastName] = useState("");
  const [role, setRole] = useState(""); const [company, setCompany] = useState("");
  const [importText, setImportText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (importText ? parsePastedWorkers(importText) : []), [importText]);

  const addMutation = useMutation({
    mutationFn: (body: object) => apiFetch("/api/dpr/workers", { method: "POST", ...jsonBody(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); setFirstName(""); setLastName(""); setRole(""); setCompany(""); setTab("list"); },
  });
  const importMutation = useMutation({
    mutationFn: (body: object[]) => apiFetch("/api/dpr/workers/import", { method: "POST", ...jsonBody(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); setImportText(""); setTab("list"); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/dpr/workers/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border flex-none">
          <DialogTitle className="text-base">Manage Workers</DialogTitle>
        </DialogHeader>
        <div className="px-5 pt-3 pb-0 flex gap-1.5 flex-none">
          {([["list", `All (${workers.length})`], ["import", "Import"], ["add", "Add one"]] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                tab === t
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-3">
          {tab === "list" && (
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr>
                  {["Name", "Role", "Company", ""].map((h, i) => (
                    <th key={i} className={cn("px-3 py-2 text-left text-xs font-semibold text-muted-foreground bg-muted/40 border-b border-border", i === 0 && "rounded-tl-md", i === 3 && "rounded-tr-md w-8")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workers.map((w, i) => (
                  <tr key={w.id} className={cn("group", i % 2 === 0 ? "bg-background" : "bg-muted/20")}>
                    <td className="px-3 py-2 font-medium text-sm">{w.firstName} {w.lastName}</td>
                    <td className="px-3 py-2 text-sm text-muted-foreground">{w.role ?? "—"}</td>
                    <td className="px-3 py-2 text-sm text-muted-foreground">{w.company ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive" onClick={() => deleteMutation.mutate(w.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "import" && (
            <div className="space-y-3 max-w-lg">
              <p className="text-xs text-muted-foreground">Tab-separated format: <code className="bg-muted px-1 py-0.5 rounded text-[11px]"># · Company · Role · First · Last</code></p>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="h-8 text-xs gap-1.5">
                <Upload className="w-3.5 h-3.5" /> Choose file
              </Button>
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = (ev) => setImportText((ev.target?.result as string) ?? ""); r.readAsText(f); }}} />
              <textarea className="w-full h-36 text-xs font-mono border rounded-md p-2.5 resize-none bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder={"1\tJDR\tHV Jointer\tMartin\tCosker"} value={importText} onChange={(e) => setImportText(e.target.value)} />
              {preview.length > 0 && <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">✓ {preview.length} workers ready to import</p>}
              <Button size="sm" onClick={() => importMutation.mutate(preview)} disabled={preview.length === 0} className="h-8 text-xs">
                Import {preview.length > 0 ? `${preview.length} workers` : ""}
              </Button>
            </div>
          )}

          {tab === "add" && (
            <div className="space-y-3 max-w-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">First Name</Label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-8 text-sm mt-1" /></div>
                <div><Label className="text-xs">Last Name</Label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-8 text-sm mt-1" /></div>
              </div>
              <div><Label className="text-xs">Role</Label><Input value={role} onChange={(e) => setRole(e.target.value)} className="h-8 text-sm mt-1" /></div>
              <div><Label className="text-xs">Company</Label><Input value={company} onChange={(e) => setCompany(e.target.value)} className="h-8 text-sm mt-1" /></div>
              <Button size="sm" className="h-8 text-xs" onClick={() => addMutation.mutate({ firstName: firstName.trim(), lastName: lastName.trim(), role: role.trim() || null, company: company.trim() || null })} disabled={!firstName.trim() && !lastName.trim()}>
                Add worker
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Slot typeahead ───────────────────────────────────────────────────────────

function SlotTypeahead({
  allWorkers,
  onSelect,
  onCancel,
}: {
  allWorkers: DprWorker[];
  onSelect: (workerId: number) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return allWorkers.slice(0, 8);
    return allWorkers
      .filter((w) => `${w.firstName} ${w.lastName}`.toLowerCase().includes(q) || (w.role ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, allWorkers]);

  // Focus input on mount
  useRef<boolean>(false); // placeholder to ensure useEffect is ordered
  const didMount = useRef(false);
  if (!didMount.current) { didMount.current = true; }

  return (
    <div className="relative flex-1" onClick={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
          if (e.key === "Enter" && matches.length === 1) { onSelect(matches[0].id); }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => { setFocused(false); onCancel(); }, 120)}
        placeholder="Type a name…"
        className="w-full bg-transparent text-xs outline-none text-foreground placeholder:text-muted-foreground/50 py-0.5"
      />
      {focused && matches.length > 0 && (
        <div className="absolute top-full left-0 z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[160px] max-h-48 overflow-y-auto">
          {matches.map((w) => {
            const abbr = roleAbbr(w.role ?? "?");
            return (
              <button
                key={w.id}
                onMouseDown={(e) => { e.preventDefault(); onSelect(w.id); }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted transition-colors"
              >
                <span className={cn("flex-shrink-0 text-[9px] font-bold px-1 py-0.5 rounded border w-7 text-center", roleColor(abbr))}>
                  {abbr}
                </span>
                <span className="text-xs text-foreground truncate">{w.firstName} {w.lastName}</span>
                {w.company && <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">{w.company}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Add Role popover ─────────────────────────────────────────────────────────

function AddRoleButton({ teamId, onAdded }: { teamId: number; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("");
  const mutation = useMutation({
    mutationFn: (r: string) => apiFetch(`/api/dpr/team-role-slots/${teamId}`, { method: "POST", ...jsonBody({ role: r }) }),
    onSuccess: () => { onAdded(); setRole(""); setOpen(false); },
  });

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setRole(""); }}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded hover:bg-muted/50 w-full">
          <Plus className="w-3 h-3" /> Add role
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-3" align="start">
        <p className="text-xs font-medium mb-2">New role</p>
        <Input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="e.g. HV Jointer"
          className="h-7 text-xs mb-2"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter" && role.trim()) mutation.mutate(role.trim()); }}
        />
        <Button size="sm" className="w-full h-7 text-xs" onClick={() => mutation.mutate(role.trim())} disabled={!role.trim() || mutation.isPending}>
          Add
        </Button>
      </PopoverContent>
    </Popover>
  );
}

// ─── Single team panel ────────────────────────────────────────────────────────

function TeamPanel({
  team, date, selectedWorkerId, allWorkers, onAssign, onUnassign, onSlotAdded, onSlotDeleted, isBottom,
}: {
  team: RosterTeam;
  date: string;
  selectedWorkerId: number | null;
  allWorkers: DprWorker[];
  onAssign: (slotId: number, workerId: number) => void;
  onUnassign: (assignmentId: number) => void;
  onSlotAdded: () => void;
  onSlotDeleted: () => void;
  isBottom?: boolean;
}) {
  const [editingSlotId, setEditingSlotId] = useState<number | null>(null);

  const deleteSlotMutation = useMutation({
    mutationFn: (slotId: number) => apiFetch(`/api/dpr/team-role-slots/${team.teamId}/${slotId}`, { method: "DELETE" }),
    onSuccess: onSlotDeleted,
  });

  const filledCount = team.slots.filter((s) => s.worker).length;

  return (
    <div className={cn("flex flex-col", !isBottom && "border-b border-border")}>
      {/* Team header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
        <span className="text-xs font-semibold text-foreground tracking-tight">{team.teamName}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {filledCount}/{team.slots.length}
        </span>
      </div>

      {/* Slots */}
      {team.slots.length === 0 && (
        <div className="px-3 py-2 text-[11px] text-muted-foreground/50 italic">No roles yet</div>
      )}
      {team.slots.map((slot) => {
        const abbr = roleAbbr(slot.role);
        const isEmpty = !slot.worker;
        const isEditing = editingSlotId === slot.slotId;
        const canQuickAssign = isEmpty && selectedWorkerId !== null;

        return (
          <div
            key={slot.slotId}
            className={cn(
              "flex items-center gap-2 px-2 py-[5px] border-b border-border/40 group transition-colors",
              canQuickAssign && !isEditing && "cursor-pointer hover:bg-primary/5",
              isEditing && "bg-muted/30 ring-1 ring-inset ring-primary/30",
              !isEmpty && !canQuickAssign && !isEditing && "hover:bg-muted/40",
              isEmpty && !canQuickAssign && !isEditing && "cursor-text hover:bg-muted/20",
            )}
            onClick={() => {
              if (canQuickAssign) {
                setEditingSlotId(null);
                onAssign(slot.slotId, selectedWorkerId!);
                return;
              }
              if (isEditing) return;
              if (isEmpty) setEditingSlotId(slot.slotId);
            }}
          >
            {/* Role badge */}
            <span className={cn(
              "flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border w-9 text-center tracking-wide",
              roleColor(abbr)
            )}>
              {abbr}
            </span>

            {/* Name or typeahead */}
            {isEditing ? (
              <SlotTypeahead
                allWorkers={allWorkers}
                onSelect={(workerId) => { onAssign(slot.slotId, workerId); setEditingSlotId(null); }}
                onCancel={() => setEditingSlotId(null)}
              />
            ) : slot.worker ? (
              <span className="flex-1 text-xs font-medium text-foreground truncate leading-tight">
                {slot.worker.firstName} {slot.worker.lastName}
              </span>
            ) : (
              <span className={cn(
                "flex-1 text-[11px] truncate",
                canQuickAssign ? "text-primary font-medium" : "text-muted-foreground/40 italic"
              )}>
                {canQuickAssign ? "← place here" : "Type a name…"}
              </span>
            )}

            {/* Hover actions */}
            {!isEditing && (
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity">
                {slot.worker && slot.assignmentId && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onUnassign(slot.assignmentId!); }}
                    title="Remove assignment"
                    className="p-0.5 rounded hover:bg-muted/80"
                  >
                    <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSlotMutation.mutate(slot.slotId); }}
                  title="Delete role slot"
                  className="p-0.5 rounded hover:bg-muted/80"
                >
                  <Trash2 className="w-2.5 h-2.5 text-muted-foreground/40 hover:text-destructive" />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Add role */}
      <div className="px-1 py-1">
        <AddRoleButton teamId={team.teamId} onAdded={onSlotAdded} />
      </div>
    </div>
  );
}

// ─── Paired column (2 teams stacked) ─────────────────────────────────────────

function TeamGroupColumn({
  teamA, teamB, teamC, date, selectedWorkerId, allWorkers, onAssign, onUnassign, onRefresh,
}: {
  teamA: RosterTeam;
  teamB: RosterTeam | undefined;
  teamC: RosterTeam | undefined;
  date: string;
  selectedWorkerId: number | null;
  allWorkers: DprWorker[];
  onAssign: (slotId: number, workerId: number) => void;
  onUnassign: (assignmentId: number) => void;
  onRefresh: () => void;
}) {
  const shared = { date, selectedWorkerId, allWorkers, onAssign, onUnassign, onSlotAdded: onRefresh, onSlotDeleted: onRefresh };
  return (
    <div className="flex-shrink-0 w-56 border-r border-border flex flex-col overflow-y-auto">
      <TeamPanel team={teamA} {...shared} isBottom={!teamB && !teamC} />
      {teamB && <TeamPanel team={teamB} {...shared} isBottom={!teamC} />}
      {teamC && <TeamPanel team={teamC} {...shared} isBottom />}
    </div>
  );
}

// ─── Available Personnel panel ────────────────────────────────────────────────

function AvailablePanel({
  workers, selectedId, onSelect,
}: {
  workers: DprWorker[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return !q ? workers : workers.filter((w) =>
      `${w.firstName} ${w.lastName}`.toLowerCase().includes(q) ||
      (w.role ?? "").toLowerCase().includes(q)
    );
  }, [workers, search]);

  // Group by company
  const grouped = useMemo(() => {
    const map = new Map<string, DprWorker[]>();
    for (const w of filtered) {
      const key = w.company ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(w);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div className="flex flex-col h-full border-r border-border bg-muted/10 w-48 flex-shrink-0">
      {/* Header */}
      <div className="px-3 pt-3 pb-2.5 border-b border-border flex-none">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Available</span>
          <span className="text-xs font-semibold text-foreground tabular-nums">{workers.length}</span>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="h-7 text-xs"
        />
      </div>

      {/* Worker list */}
      <div className="flex-1 overflow-y-auto py-1">
        {selectedId !== null && (
          <div className="px-3 pb-1.5">
            <button
              onClick={() => onSelect(null)}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear selection
            </button>
          </div>
        )}

        {filtered.length === 0 && (
          <p className="text-[11px] text-muted-foreground px-3 py-4 text-center">
            {search ? "No matches" : "All workers assigned"}
          </p>
        )}

        {grouped.map(([company, companyWorkers]) => (
          <div key={company}>
            <div className="px-3 py-1 mt-1">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">{company}</span>
            </div>
            {companyWorkers.map((w) => {
              const abbr = roleAbbr(w.role ?? "?");
              const isSelected = selectedId === w.id;
              return (
                <button
                  key={w.id}
                  onClick={() => onSelect(isSelected ? null : w.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 text-left transition-all",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted/70"
                  )}
                >
                  <span className={cn(
                    "flex-shrink-0 text-[9px] font-bold px-1 py-0.5 rounded border w-7 text-center tracking-wide",
                    isSelected
                      ? "bg-white/20 text-white border-white/30"
                      : roleColor(abbr)
                  )}>
                    {abbr}
                  </span>
                  <span className="text-[11px] font-medium truncate leading-tight">
                    {w.firstName} {w.lastName}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Roster stats bar ─────────────────────────────────────────────────────────

function RosterStats({ roster }: { roster: RosterDay }) {
  const totalSlots = roster.teams.reduce((n, t) => n + t.slots.length, 0);
  const filled = roster.teams.reduce((n, t) => n + t.slots.filter((s) => s.worker).length, 0);
  const pct = totalSlots > 0 ? Math.round((filled / totalSlots) * 100) : 0;

  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <span>
        <span className="font-semibold text-foreground tabular-nums">{filled}</span>
        /{totalSlots} slots filled
      </span>
      <span>
        <span className="font-semibold text-foreground tabular-nums">{roster.unassigned.length}</span>
        {" "}unassigned
      </span>
      <div className="flex items-center gap-1.5">
        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-emerald-500" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="tabular-nums">{pct}%</span>
      </div>
    </div>
  );
}

// ─── Roster board ─────────────────────────────────────────────────────────────

function RosterBoard({ date }: { date: string }) {
  const qc = useQueryClient();
  const rosterKey = useMemo(() => ["/api/dpr/roster", date], [date]);
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  const { data: roster, isLoading } = useQuery<RosterDay>({
    queryKey: rosterKey,
    queryFn: ({ signal }) => apiFetch(`/api/dpr/roster?date=${date}`, { signal }),
  });

  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: rosterKey }), [qc, rosterKey]);

  const assignMutation = useMutation({
    mutationFn: ({ slotId, workerId }: { slotId: number; workerId: number }) =>
      apiFetch("/api/dpr/daily-assignments", { method: "PUT", ...jsonBody({ date, slotId, workerId }) }),
    onMutate: ({ slotId, workerId }) => {
      const prev = qc.getQueryData<RosterDay>(rosterKey);
      if (!prev) return { prev };
      // Find the worker object from any source in the current roster
      let worker: DprWorker | null = null;
      for (const w of prev.unassigned) { if (w.id === workerId) { worker = w; break; } }
      if (!worker) {
        for (const team of prev.teams) {
          for (const slot of team.slots) {
            if (slot.worker?.id === workerId) { worker = slot.worker; break; }
          }
          if (worker) break;
        }
      }
      if (!worker) return { prev };
      const w = worker;
      qc.setQueryData<RosterDay>(rosterKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          unassigned: old.unassigned.filter((u) => u.id !== w.id),
          teams: old.teams.map((team) => ({
            ...team,
            slots: team.slots.map((slot) =>
              slot.slotId === slotId
                ? { ...slot, worker: w, assignmentId: -1 }
                : slot
            ),
          })),
        };
      });
      setSelectedWorkerId(null);
      return { prev };
    },
    onSuccess: () => invalidate(),
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(rosterKey, ctx.prev);
      setSelectedWorkerId(null);
    },
  });

  const unassignMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/dpr/daily-assignments/${id}`, { method: "DELETE" }),
    onMutate: (assignmentId) => {
      const prev = qc.getQueryData<RosterDay>(rosterKey);
      if (!prev) return { prev };
      let removedWorker: DprWorker | null = null;
      qc.setQueryData<RosterDay>(rosterKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          teams: old.teams.map((team) => ({
            ...team,
            slots: team.slots.map((slot) => {
              if (slot.assignmentId === assignmentId) {
                removedWorker = slot.worker;
                return { ...slot, worker: null, assignmentId: null };
              }
              return slot;
            }),
          })),
          unassigned: removedWorker
            ? [...old.unassigned, removedWorker]
            : old.unassigned,
        };
      });
      return { prev };
    },
    onSuccess: () => invalidate(),
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(rosterKey, ctx.prev);
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => apiFetch("/api/dpr/roster/clear", { method: "POST", ...jsonBody({ date }) }),
    onSuccess: invalidate,
  });

  const copyMutation = useMutation({
    mutationFn: () => {
      const prev = format(subDays(parseISO(date), 1), "yyyy-MM-dd");
      return apiFetch("/api/dpr/roster/copy", { method: "POST", ...jsonBody({ fromDate: prev, toDate: date }) });
    },
    onSuccess: invalidate,
  });

  // Group teams in threes: [A, B, C], [D, E, F], ...
  const groups = useMemo(() => {
    const teams = roster?.teams ?? [];
    const result: TeamTriple[] = [];
    for (let i = 0; i < teams.length; i += 3) result.push([teams[i], teams[i + 1], teams[i + 2]]);
    return result;
  }, [roster?.teams]);

  // All workers (unassigned + those filling slots) — used for the typeahead
  const allWorkers = useMemo(() => {
    const map = new Map<number, DprWorker>();
    for (const w of roster?.unassigned ?? []) map.set(w.id, w);
    for (const team of roster?.teams ?? []) {
      for (const slot of team.slots) {
        if (slot.worker) map.set(slot.worker.id, slot.worker);
      }
    }
    return [...map.values()].sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
    );
  }, [roster]);

  const prevLabel = (() => {
    try { return format(subDays(parseISO(date), 1), "EEE d MMM"); } catch { return "prev day"; }
  })();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm font-medium text-muted-foreground mb-1">Loading roster…</div>
          <div className="text-xs text-muted-foreground/60">{date}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-border flex items-center gap-3 flex-none bg-background">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-muted-foreground">
              {(() => { try { return format(parseISO(date), "EEEE, d MMMM yyyy"); } catch { return date; } })()}
            </span>
          </div>
          {roster && <RosterStats roster={roster} />}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button
            variant="ghost" size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1.5"
            onClick={() => setManageOpen(true)}
          >
            <Settings2 className="w-3 h-3" /> Workers
          </Button>

          <div className="w-px h-4 bg-border" />

          <Button
            variant="ghost" size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1.5"
            onClick={() => copyMutation.mutate()}
            disabled={copyMutation.isPending}
            title={`Copy assignments from ${prevLabel}`}
          >
            <Copy className="w-3 h-3" /> From {prevLabel}
          </Button>
          <Button
            variant="ghost" size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-destructive gap-1.5"
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending}
          >
            <Trash2 className="w-3 h-3" /> Clear all
          </Button>
        </div>
      </div>

      {/* Board */}
      <div className="flex flex-1 overflow-hidden">
        <AvailablePanel
          workers={roster?.unassigned ?? []}
          selectedId={selectedWorkerId}
          onSelect={setSelectedWorkerId}
        />

        {/* Paired columns */}
        <div className="flex flex-1 overflow-x-auto overflow-y-hidden bg-background">
          {groups.map(([teamA, teamB, teamC], i) => (
            <TeamGroupColumn
              key={i}
              teamA={teamA}
              teamB={teamB}
              teamC={teamC}
              date={date}
              selectedWorkerId={selectedWorkerId}
              allWorkers={allWorkers}
              onAssign={(slotId, workerId) => assignMutation.mutate({ slotId, workerId })}
              onUnassign={(id) => unassignMutation.mutate(id)}
              onRefresh={invalidate}
            />
          ))}
          {groups.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              No teams configured.
            </div>
          )}
        </div>
      </div>

      <ManageWorkersDialog open={manageOpen} onClose={() => setManageOpen(false)} />
    </div>
  );
}

// ─── Schedule tab ─────────────────────────────────────────────────────────────

function ScheduleTab({ date, teams }: { date: string; teams: Team[] }) {
  const [calOpen, setCalOpen] = useState(false);
  const { setActiveDate } = useCaptureNav();
  const [pendingTeamIds, setPendingTeamIds] = useState<Set<number>>(new Set());
  const qc = useQueryClient();
  const exceptionsKey = ["/api/dpr/team-date-exceptions", date];

  const { data: exceptions = [] } = useQuery<TeamDateException[]>({
    queryKey: exceptionsKey,
    queryFn: ({ signal }) => apiFetch(`/api/dpr/team-date-exceptions?date=${date}`, { signal }),
  });

  const exceptionsSet = useMemo(() => new Set(exceptions.map((e) => e.teamId)), [exceptions]);
  const exceptionById = useMemo(() => {
    const m = new Map<number, number>();
    for (const e of exceptions) m.set(e.teamId, e.id);
    return m;
  }, [exceptions]);

  const markPending = (id: number) => setPendingTeamIds((s) => new Set([...s, id]));
  const clearPending = (id: number) => setPendingTeamIds((s) => { const n = new Set(s); n.delete(id); return n; });

  function json(body: unknown): RequestInit { return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }; }

  const createException = useMutation({
    mutationFn: ({ teamId }: { teamId: number }) => apiFetch("/api/dpr/team-date-exceptions", json({ teamId, date })) as Promise<TeamDateException>,
    onMutate: ({ teamId }) => {
      markPending(teamId);
      const prev = qc.getQueryData<TeamDateException[]>(exceptionsKey);
      qc.setQueryData<TeamDateException[]>(exceptionsKey, (old = []) => [...old, { id: -teamId, teamId, date, status: "not_working" }]);
      return { prev, teamId };
    },
    onSuccess: (data, { teamId }) => {
      qc.setQueryData<TeamDateException[]>(exceptionsKey, (old = []) => old.map((e) => (e.id === -teamId ? data : e)));
      clearPending(teamId);
      qc.invalidateQueries({ queryKey: ["/api/dpr/timesheet-entries/date-summary"] });
    },
    onError: (_err, { teamId }, ctx) => { if (ctx?.prev) qc.setQueryData(exceptionsKey, ctx.prev); clearPending(teamId); },
  });

  const deleteException = useMutation({
    mutationFn: ({ id }: { id: number; teamId: number }) => apiFetch(`/api/dpr/team-date-exceptions/${id}`, { method: "DELETE" }),
    onMutate: ({ id, teamId }) => {
      markPending(teamId);
      const prev = qc.getQueryData<TeamDateException[]>(exceptionsKey);
      qc.setQueryData<TeamDateException[]>(exceptionsKey, (old = []) => old.filter((e) => e.id !== id));
      return { prev, teamId };
    },
    onSuccess: (_data, { teamId }) => { clearPending(teamId); qc.invalidateQueries({ queryKey: ["/api/dpr/timesheet-entries/date-summary"] }); },
    onError: (_err, { teamId }, ctx) => { if (ctx?.prev) qc.setQueryData(exceptionsKey, ctx.prev); clearPending(teamId); },
  });

  const toggle = (teamId: number) => {
    if (pendingTeamIds.has(teamId)) return;
    const exId = exceptionById.get(teamId);
    if (exId !== undefined) deleteException.mutate({ id: exId, teamId });
    else createException.mutate({ teamId });
  };

  const workingCount = teams.length - exceptionsSet.size;

  return (
    <div className="p-6 max-w-lg">
      <p className="text-sm text-muted-foreground mb-6">
        Toggle off any teams not working on this date — they'll be excluded from coverage counts in the sidebar.
      </p>

      <div className="mb-6">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Date</label>
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2 h-9">
              <CalendarDays className="w-4 h-4" />
              {format(parseISO(date), "EEE, dd MMM yyyy")}
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-1" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={parseISO(date)} onSelect={(d) => { if (d) { setActiveDate(format(d, "yyyy-MM-dd")); setCalOpen(false); } }} initialFocus />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex gap-4 mb-4">
        <div className="text-xs">
          <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-sm">{workingCount}</span>
          <span className="text-muted-foreground ml-1">working</span>
        </div>
        {exceptionsSet.size > 0 && (
          <div className="text-xs">
            <span className="font-semibold text-red-500 text-sm">{exceptionsSet.size}</span>
            <span className="text-muted-foreground ml-1">not working</span>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        {teams.map((team) => {
          const isOff = exceptionsSet.has(team.id);
          const isPending = pendingTeamIds.has(team.id);
          return (
            <div key={team.id} className="flex items-center justify-between rounded-lg px-4 py-3 bg-card border border-border">
              <span className={cn("text-sm", isOff ? "text-muted-foreground line-through" : "font-medium")}>{team.name}</span>
              <div className="flex items-center gap-3">
                <span className={cn("text-xs font-medium", isOff ? "text-red-500 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
                  {isOff ? "Not working" : "Working"}
                </span>
                <Switch checked={!isOff} onCheckedChange={() => toggle(team.id)} disabled={isPending} />
              </div>
            </div>
          );
        })}
        {teams.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Loading teams…</p>}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeamSetupPage() {
  const { activeDate } = useCaptureNav();
  const date = activeDate ?? format(new Date(), "yyyy-MM-dd");

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/dpr/teams"],
    queryFn: ({ signal }) => apiFetch("/api/dpr/teams", { signal }),
  });

  return (
    <div className="flex flex-col h-full">
      <Tabs defaultValue="roster" className="flex flex-col h-full">
        <div className="border-b border-border px-6 pt-4 flex-none">
          <h1 className="text-xl font-bold mb-3">Team Setup</h1>
          <TabsList className="h-8">
            <TabsTrigger value="roster" className="text-xs px-4">Workers</TabsTrigger>
            <TabsTrigger value="schedule" className="text-xs px-4">Schedule</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="roster" className="flex-1 overflow-hidden m-0 data-[state=inactive]:hidden">
          <RosterBoard date={date} />
        </TabsContent>

        <TabsContent value="schedule" className="flex-1 overflow-auto m-0 data-[state=inactive]:hidden">
          <ScheduleTab date={date} teams={teams} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
