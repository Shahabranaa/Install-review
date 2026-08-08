import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import { useCaptureNav } from "@/contexts/CaptureNavContext";
import SignOnPage from "./sign-on";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Copy, Trash2, Plus, X, Upload, Settings2, ChevronDown, Loader2, UsersRound, Link2, Link2Off, GripVertical } from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Team {
  id: number;
  name: string;
  description: string | null;
  shiftStartTime: string | null;
  shiftEndTime: string | null;
  backTeamId: number | null;
}
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

import { ROLE_COLORS, PREDEFINED_ROLES, roleColor, roleAbbr } from "@/lib/roles";

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
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      apiFetch(`/api/dpr/workers/${id}`, { method: "PATCH", ...jsonBody({ active }) }),
    onMutate: ({ id, active }) => {
      const prev = qc.getQueryData<DprWorker[]>(key);
      qc.setQueryData<DprWorker[]>(key, (old = []) => old.map((w) => w.id === id ? { ...w, active } : w));
      return { prev };
    },
    onError: (_err, _vars, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/dpr/roster"] }),
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
                  {["Name", "Role", "Company", "Active", ""].map((h, i) => (
                    <th key={i} className={cn("px-3 py-2 text-left text-xs font-semibold text-muted-foreground bg-muted/40 border-b border-border", i === 0 && "rounded-tl-md", i === 4 && "rounded-tr-md w-8", i === 3 && "w-16")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workers.map((w, i) => (
                  <tr key={w.id} className={cn("group", i % 2 === 0 ? "bg-background" : "bg-muted/20", !w.active && "opacity-50")}>
                    <td className="px-3 py-2 font-medium text-sm">{w.firstName} {w.lastName}</td>
                    <td className="px-3 py-2 text-sm text-muted-foreground">{w.roles.length ? w.roles.join(", ") : "—"}</td>
                    <td className="px-3 py-2 text-sm text-muted-foreground">{w.company ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Switch
                        checked={w.active}
                        onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: w.id, active: checked })}
                        className="scale-75 origin-left"
                      />
                    </td>
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
  slotRole,
  onSelect,
  onCancel,
}: {
  allWorkers: DprWorker[];
  slotRole: string;
  onSelect: (workerId: number) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const slotAbbr = roleAbbr(slotRole);
  const roleFilteredWorkers = useMemo(
    () => allWorkers.filter((w) => w.roles.some((r) => roleAbbr(r) === slotAbbr) || (w.roles.length === 0 && slotAbbr === "?")),
    [allWorkers, slotAbbr],
  );

  const matches = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return roleFilteredWorkers.slice(0, 8);
    return roleFilteredWorkers
      .filter((w) => `${w.firstName} ${w.lastName}`.toLowerCase().includes(q) || w.roles.some((r) => r.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [query, roleFilteredWorkers]);

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
            const abbr = w.roles.length ? roleAbbr(w.roles[0]) : "?";
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

// ─── Shared role picker content ───────────────────────────────────────────────

function RolePickerContent({
  title,
  submitLabel,
  isPending,
  onSelect,
}: {
  title: string;
  submitLabel: string;
  isPending: boolean;
  onSelect: (role: string) => void;
}) {
  const [custom, setCustom] = useState("");

  return (
    <div className="w-56">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{title}</p>

      {/* Predefined role grid */}
      <div className="grid grid-cols-4 gap-1 mb-3">
        {PREDEFINED_ROLES.map((abbr) => (
          <button
            key={abbr}
            disabled={isPending}
            onClick={() => { setCustom(""); onSelect(abbr); }}
            className={cn(
              "text-[10px] font-bold px-1 py-1.5 rounded border text-center transition-colors hover:opacity-80 active:scale-95",
              roleColor(abbr),
            )}
          >
            {abbr}
          </button>
        ))}
      </div>

      {/* Custom role text entry */}
      <p className="text-[10px] text-muted-foreground mb-1">Custom role</p>
      <div className="flex gap-1">
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="e.g. HP Jointer"
          className="h-7 text-xs flex-1"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && custom.trim()) {
              onSelect(custom.trim());
              setCustom("");
            }
          }}
        />
        <Button
          size="sm"
          className="h-7 text-xs px-2"
          disabled={!custom.trim() || isPending}
          onClick={() => { onSelect(custom.trim()); setCustom(""); }}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

// ─── Add Role popover ─────────────────────────────────────────────────────────

function AddRoleButton({ teamId, onAdded }: { teamId: number; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: (r: string) => apiFetch(`/api/dpr/team-role-slots/${teamId}`, { method: "POST", ...jsonBody({ role: r }) }),
    onSuccess: () => { onAdded(); setOpen(false); },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded hover:bg-muted/50 w-full">
          <Plus className="w-3 h-3" /> Add role
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-3" align="start">
        <RolePickerContent
          title="Pick a role"
          submitLabel="Add"
          isPending={mutation.isPending}
          onSelect={(r) => mutation.mutate(r)}
        />
      </PopoverContent>
    </Popover>
  );
}

// ─── Sortable slot row ────────────────────────────────────────────────────────

function SortableSlotRow({
  slot,
  teamId,
  selectedWorkerId,
  allWorkers,
  editingSlotId,
  roleEditSlotId,
  isReordering,
  onRowClick,
  onAssign,
  onUnassign,
  onDelete,
  onRoleChange,
  setEditingSlotId,
  setRoleEditSlotId,
}: {
  slot: RosterSlot;
  teamId: number;
  selectedWorkerId: number | null;
  allWorkers: DprWorker[];
  editingSlotId: number | null;
  roleEditSlotId: number | null;
  isReordering: boolean;
  onRowClick: () => void;
  onAssign: (workerId: number) => void;
  onUnassign: () => void;
  onDelete: () => void;
  onRoleChange: (role: string) => void;
  setEditingSlotId: (id: number | null) => void;
  setRoleEditSlotId: (id: number | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slot.slotId, disabled: isReordering });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const abbr = roleAbbr(slot.role);
  const isEmpty = !slot.worker;
  const isEditing = editingSlotId === slot.slotId;
  const isRoleEditing = roleEditSlotId === slot.slotId;
  const canQuickAssign = isEmpty && selectedWorkerId !== null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-1 px-1 py-[5px] border-b border-border/40 group transition-colors",
        isDragging && "opacity-50 z-50 bg-background shadow-md",
        canQuickAssign && !isEditing && !isRoleEditing && "cursor-pointer hover:bg-primary/5",
        isEditing && "bg-muted/30 ring-1 ring-inset ring-primary/30",
        !isEmpty && !canQuickAssign && !isEditing && !isRoleEditing && "hover:bg-muted/40",
        isEmpty && !canQuickAssign && !isEditing && !isRoleEditing && "cursor-text hover:bg-muted/20",
      )}
      onClick={() => {
        if (isRoleEditing) return;
        onRowClick();
      }}
    >
      {/* Drag handle — disabled while a reorder is in flight to prevent ordering races */}
      <span
        {...attributes}
        {...(isReordering ? {} : listeners)}
        className={cn(
          "flex-shrink-0 p-0.5 touch-none",
          isReordering
            ? "cursor-not-allowed text-muted-foreground/15"
            : "cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground/60"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-3 h-3" />
      </span>

      {/* Role badge — clickable to edit role */}
      <Popover open={isRoleEditing} onOpenChange={(o) => { setRoleEditSlotId(o ? slot.slotId : null); }}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border w-9 text-center tracking-wide hover:opacity-70 transition-opacity",
              roleColor(abbr),
            )}
            onClick={(e) => {
              e.stopPropagation();
              setRoleEditSlotId(isRoleEditing ? null : slot.slotId);
            }}
            title="Change role"
          >
            {abbr}
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-3" align="start" onClick={(e) => e.stopPropagation()}>
          <RolePickerContent
            title="Change role"
            submitLabel="Set"
            isPending={false}
            onSelect={(r) => { onRoleChange(r); setRoleEditSlotId(null); }}
          />
        </PopoverContent>
      </Popover>

      {/* Name or typeahead */}
      {isEditing ? (
        <SlotTypeahead
          allWorkers={allWorkers}
          slotRole={slot.role}
          onSelect={(workerId) => { onAssign(workerId); setEditingSlotId(null); }}
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
          {canQuickAssign ? "← place here" : "Tap to assign…"}
        </span>
      )}

      {/* Hover actions */}
      {!isEditing && !isRoleEditing && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity">
          {slot.worker && slot.assignmentId && (
            <button
              onClick={(e) => { e.stopPropagation(); onUnassign(); }}
              title="Remove assignment"
              className="p-0.5 rounded hover:bg-muted/80"
            >
              <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete role slot"
            className="p-0.5 rounded hover:bg-muted/80"
          >
            <Trash2 className="w-2.5 h-2.5 text-muted-foreground/40 hover:text-destructive" />
          </button>
        </div>
      )}
    </div>
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
  const [roleEditSlotId, setRoleEditSlotId] = useState<number | null>(null);

  // Local slot state for optimistic updates (delete, reorder, role edit)
  const [localSlots, setLocalSlots] = useState<RosterSlot[]>(() => team.slots);

  // Sync when server data changes (e.g. after refresh)
  const prevSlotsRef = useRef(team.slots);
  useEffect(() => {
    if (prevSlotsRef.current !== team.slots) {
      prevSlotsRef.current = team.slots;
      setLocalSlots(team.slots);
    }
  }, [team.slots]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Atomic batch reorder — single DB transaction, dragging disabled while pending
  const reorderMutation = useMutation({
    mutationFn: (order: { slotId: number; displayOrder: number }[]) =>
      apiFetch(`/api/dpr/team-role-slots/${team.teamId}/reorder`, { method: "PATCH", ...jsonBody({ order }) }),
    onError: () => {
      // Revert to server state if the batch fails
      setLocalSlots(team.slots);
    },
  });

  const patchRoleMutation = useMutation({
    mutationFn: ({ slotId, role }: { slotId: number; role: string }) =>
      apiFetch(`/api/dpr/team-role-slots/${team.teamId}/${slotId}`, { method: "PATCH", ...jsonBody({ role }) }),
    onError: () => {
      setLocalSlots(team.slots);
    },
  });

  const deleteSlotMutation = useMutation({
    mutationFn: (slotId: number) => apiFetch(`/api/dpr/team-role-slots/${team.teamId}/${slotId}`, { method: "DELETE" }),
    onMutate: (slotId) => {
      // Optimistic: remove immediately
      setLocalSlots((prev) => prev.filter((s) => s.slotId !== slotId));
    },
    onError: () => {
      // Revert on error
      setLocalSlots(team.slots);
    },
    onSuccess: () => {
      onSlotDeleted();
    },
  });

  const isReordering = reorderMutation.isPending;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setLocalSlots((prev) => {
      const oldIndex = prev.findIndex((s) => s.slotId === active.id);
      const newIndex = prev.findIndex((s) => s.slotId === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      const reordered = arrayMove(prev, oldIndex, newIndex);
      const newOrder = reordered.map((slot, idx) => ({ slotId: slot.slotId, displayOrder: idx }));
      // Single atomic PATCH — no race between multiple parallel requests
      reorderMutation.mutate(newOrder);
      return reordered.map((slot, idx) => ({ ...slot, displayOrder: idx }));
    });
  }

  function handleRoleChange(slotId: number, newRole: string) {
    setLocalSlots((prev) => prev.map((s) => s.slotId === slotId ? { ...s, role: newRole } : s));
    patchRoleMutation.mutate({ slotId, role: newRole });
  }

  const filledCount = localSlots.filter((s) => s.worker).length;

  return (
    <div className={cn("flex flex-col", !isBottom && "border-b border-border")}>
      {/* Team header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
        <span className="text-xs font-semibold text-foreground tracking-tight">{team.teamName}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {filledCount}/{localSlots.length}
        </span>
      </div>

      {/* Slots */}
      {localSlots.length === 0 && (
        <div className="px-3 py-2 text-[11px] text-muted-foreground/50 italic">No roles yet</div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={localSlots.map((s) => s.slotId)} strategy={verticalListSortingStrategy}>
          {localSlots.map((slot) => {
            const isEmpty = !slot.worker;
            const isEditing = editingSlotId === slot.slotId;
            const canQuickAssign = isEmpty && selectedWorkerId !== null;

            return (
              <SortableSlotRow
                key={slot.slotId}
                slot={slot}
                teamId={team.teamId}
                selectedWorkerId={selectedWorkerId}
                allWorkers={allWorkers}
                editingSlotId={editingSlotId}
                roleEditSlotId={roleEditSlotId}
                isReordering={isReordering}
                onRowClick={() => {
                  if (canQuickAssign) {
                    setEditingSlotId(null);
                    onAssign(slot.slotId, selectedWorkerId!);
                    return;
                  }
                  if (isEditing) return;
                  if (isEmpty) setEditingSlotId(slot.slotId);
                }}
                onAssign={(workerId) => { onAssign(slot.slotId, workerId); }}
                onUnassign={() => { if (slot.assignmentId) onUnassign(slot.assignmentId); }}
                onDelete={() => deleteSlotMutation.mutate(slot.slotId)}
                onRoleChange={(newRole) => handleRoleChange(slot.slotId, newRole)}
                setEditingSlotId={setEditingSlotId}
                setRoleEditSlotId={setRoleEditSlotId}
              />
            );
          })}
        </SortableContext>
      </DndContext>

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
      w.roles.some((r) => r.toLowerCase().includes(q))
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
              const abbr = w.roles.length ? roleAbbr(w.roles[0]) : "?";
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

function RosterBoard({ date, signOnSaved }: { date: string; signOnSaved: boolean }) {
  const qc = useQueryClient();
  const rosterKey = useMemo(() => ["/api/dpr/roster", date], [date]);
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [copyConfirmOpen, setCopyConfirmOpen] = useState(false);

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

  // Visible team selection for this date
  const visibleKey = useMemo(() => ["/api/dpr/roster-visible-teams", date], [date]);
  const { data: visibleData, isLoading: visibleLoading } = useQuery<{ teamIds: number[] }>({
    queryKey: visibleKey,
    queryFn: ({ signal }) => apiFetch(`/api/dpr/roster-visible-teams?date=${date}`, { signal }),
  });

  // Exceptions (for the team picker — which teams are off today)
  const exceptionsPickerKey = useMemo(() => ["/api/dpr/team-date-exceptions", date], [date]);
  const { data: exceptionsForPicker = [] } = useQuery<TeamDateException[]>({
    queryKey: exceptionsPickerKey,
    queryFn: ({ signal }) => apiFetch(`/api/dpr/team-date-exceptions?date=${date}`, { signal }),
  });
  const offTeamIds = useMemo(() => new Set(exceptionsForPicker.map((e) => e.teamId)), [exceptionsForPicker]);

  const [editTeamsOpen, setEditTeamsOpen] = useState(false);

  const saveVisibleMutation = useMutation({
    mutationFn: (teamIds: number[]) =>
      apiFetch("/api/dpr/roster-visible-teams", { method: "POST", ...jsonBody({ date, teamIds }) }),
    onMutate: (teamIds) => {
      qc.setQueryData<{ teamIds: number[] }>(visibleKey, { teamIds });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: visibleKey });
      setEditTeamsOpen(false);
    },
  });

  // True when loaded but no teams have been selected yet (new date)
  const needsPicker = !isLoading && !visibleLoading && (visibleData?.teamIds ?? []).length === 0;

  // Group teams in threes — only visible teams
  const groups = useMemo(() => {
    const visibleIds = new Set(visibleData?.teamIds ?? []);
    const teams = (roster?.teams ?? []).filter((t) => visibleIds.size === 0 || visibleIds.has(t.teamId));
    const result: TeamTriple[] = [];
    for (let i = 0; i < teams.length; i += 3) result.push([teams[i], teams[i + 1], teams[i + 2]]);
    return result;
  }, [roster?.teams, visibleData?.teamIds]);

  // Only unassigned workers for the slot typeahead — assigned workers must not be suggested again
  const allWorkers = useMemo(() =>
    [...(roster?.unassigned ?? [])].sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
    ),
  [roster?.unassigned]);

  const prevLabel = (() => {
    try { return format(subDays(parseISO(date), 1), "EEE d MMM"); } catch { return "prev day"; }
  })();

  if (isLoading || visibleLoading) {
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
          <Button
            variant="ghost" size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1.5"
            onClick={() => setEditTeamsOpen(true)}
          >
            <UsersRound className="w-3 h-3" /> Edit teams
          </Button>

          <div className="w-px h-4 bg-border" />

          <Button
            variant="ghost" size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1.5"
            onClick={() => setCopyConfirmOpen(true)}
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

      {/* Board or Team Picker */}
      {needsPicker ? (
        <TeamPickerScreen
          date={date}
          allTeams={roster?.teams ?? []}
          offTeamIds={offTeamIds}
          onConfirm={(ids) => saveVisibleMutation.mutate(ids)}
          saving={saveVisibleMutation.isPending}
          signOnSaved={signOnSaved}
        />
      ) : (
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
      )}

      <ManageWorkersDialog open={manageOpen} onClose={() => setManageOpen(false)} />

      {editTeamsOpen && (
        <TeamPickerDialog
          date={date}
          allTeams={roster?.teams ?? []}
          offTeamIds={offTeamIds}
          currentTeamIds={visibleData?.teamIds ?? []}
          onConfirm={(ids) => saveVisibleMutation.mutate(ids)}
          onClose={() => setEditTeamsOpen(false)}
          saving={saveVisibleMutation.isPending}
        />
      )}

      <Dialog open={copyConfirmOpen} onOpenChange={setCopyConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Replace today's assignments?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will copy all assignments from <span className="font-medium text-foreground">{prevLabel}</span> and overwrite any assignments already made for{" "}
            <span className="font-medium text-foreground">
              {(() => { try { return format(parseISO(date), "EEE, d MMM"); } catch { return date; } })()}
            </span>.
          </p>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setCopyConfirmOpen(false)}>Cancel</Button>
            <Button
              onClick={() => { setCopyConfirmOpen(false); copyMutation.mutate(); }}
              disabled={copyMutation.isPending}
            >
              Yes, replace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Helper: add 12 hours to an HH:MM string ─────────────────────────────────
function addTwelveHours(time: string): string {
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return "";
  const totalMins = h * 60 + m + 12 * 60;
  const newH = Math.floor(totalMins / 60) % 24;
  const newM = totalMins % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

// ─── Team configuration card ──────────────────────────────────────────────────

function TeamConfigCard({ team, allTeams }: { team: Team; allTeams: Team[] }) {
  const qc = useQueryClient();
  const teamsKey = ["/api/dpr/teams"];

  const [description, setDescription] = useState(team.description ?? "");
  const [shiftStart, setShiftStart] = useState(team.shiftStartTime ?? "");
  const [shiftEnd, setShiftEnd] = useState(team.shiftEndTime ?? "");

  // Keep local state in sync if parent data refreshes (e.g. after save)
  const prevTeamRef = useRef(team);
  if (prevTeamRef.current !== team) {
    prevTeamRef.current = team;
    setDescription(team.description ?? "");
    setShiftStart(team.shiftStartTime ?? "");
    setShiftEnd(team.shiftEndTime ?? "");
  }

  const patchMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/api/dpr/teams/${team.id}`, { method: "PATCH", ...jsonBody(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: teamsKey }),
  });

  function saveField(body: Record<string, unknown>) {
    patchMutation.mutate(body);
  }

  // Back-team: the linked team (could be team.backTeamId pointing to another, or another pointing to this)
  const linkedTeam = allTeams.find((t) => t.id === team.backTeamId) ?? null;
  // Also detect if another team points back to us (so we can show the badge even when this team is the "target")
  const reverseLinkedTeam = allTeams.find((t) => t.backTeamId === team.id) ?? null;
  const effectiveLinkedTeam = linkedTeam ?? reverseLinkedTeam;

  // Dropdown options: exclude self; exclude teams already linked to each other (unless already linked to this team)
  const backTeamOptions = allTeams.filter((t) => {
    if (t.id === team.id) return false;
    // Allow current selection
    if (t.id === team.backTeamId) return true;
    // Exclude teams that already have a back-team that isn't this team
    if (t.backTeamId !== null && t.backTeamId !== team.id) return false;
    // Exclude teams that are pointed to by another team (unless that team is us)
    const pointsToT = allTeams.find((x) => x.id !== team.id && x.backTeamId === t.id);
    if (pointsToT) return false;
    return true;
  });

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      {/* Team name header */}
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">{team.name}</span>
        {effectiveLinkedTeam && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
            <Link2 className="w-2.5 h-2.5" />
            Linked with {effectiveLinkedTeam.name}
          </span>
        )}
      </div>

      {/* Description */}
      <div>
        <Label className="text-xs mb-1 block text-muted-foreground">Description</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => saveField({ description: description.trim() || null })}
          placeholder="What is this team doing today?"
          className="text-sm resize-none h-16 min-h-0"
          rows={2}
        />
      </div>

      {/* Shift times */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs mb-1 block text-muted-foreground">Shift start</Label>
          <Input
            type="time"
            value={shiftStart}
            onChange={(e) => {
              setShiftStart(e.target.value);
              if (e.target.value) {
                const auto = addTwelveHours(e.target.value);
                setShiftEnd(auto);
              }
            }}
            onBlur={() => saveField({ shiftStartTime: shiftStart || null, shiftEndTime: shiftEnd || null })}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs mb-1 block text-muted-foreground">Shift end</Label>
          <Input
            type="time"
            value={shiftEnd}
            onChange={(e) => setShiftEnd(e.target.value)}
            onBlur={() => saveField({ shiftEndTime: shiftEnd || null })}
            className="h-8 text-sm"
          />
        </div>
      </div>

      {/* Back-team link */}
      <div>
        <Label className="text-xs mb-1 block text-muted-foreground">Linked back team</Label>
        {reverseLinkedTeam && !linkedTeam ? (
          // This team is the target — show read-only indicator
          <div className="flex items-center gap-2 h-8 px-3 rounded-md border border-border bg-muted/30 text-xs text-muted-foreground">
            <Link2 className="w-3 h-3 flex-shrink-0" />
            <span>Linked from <span className="font-medium text-foreground">{reverseLinkedTeam.name}</span></span>
          </div>
        ) : (
          <Select
            value={team.backTeamId ? String(team.backTeamId) : "none"}
            onValueChange={(val) => {
              const backTeamId = val === "none" ? null : Number(val);
              saveField({ backTeamId });
            }}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="No linked team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Link2Off className="w-3 h-3" /> No linked team
                </span>
              </SelectItem>
              {backTeamOptions.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                  {t.shiftStartTime && (
                    <span className="ml-1.5 text-muted-foreground text-xs">({t.shiftStartTime})</span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

// ─── Teams setup tab ──────────────────────────────────────────────────────────

function TeamsSetupTab({ teams, isLoading }: { teams: Team[]; isLoading: boolean }) {
  const qc = useQueryClient();
  const [newTeamName, setNewTeamName] = useState("");
  const addMutation = useMutation({
    mutationFn: (name: string) =>
      apiFetch("/api/dpr/teams", { method: "POST", ...jsonBody({ name }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/dpr/teams"] });
      setNewTeamName("");
    },
  });

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Configure each team's description, shift hours, and back-team pairing. Changes auto-save on blur.
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading teams…
        </div>
      )}

      {!isLoading && teams.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">No teams yet. Add one below.</p>
      )}

      <div className="space-y-3">
        {teams.map((team) => (
          <TeamConfigCard key={team.id} team={team} allTeams={teams} />
        ))}
      </div>

      {/* Add team */}
      <div className="flex items-center gap-2 pt-2">
        <Input
          value={newTeamName}
          onChange={(e) => setNewTeamName(e.target.value)}
          placeholder="New team name…"
          className="h-8 text-sm max-w-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter" && newTeamName.trim()) addMutation.mutate(newTeamName.trim());
          }}
        />
        <Button
          size="sm"
          className="h-8 text-xs gap-1"
          onClick={() => addMutation.mutate(newTeamName.trim())}
          disabled={!newTeamName.trim() || addMutation.isPending}
        >
          <Plus className="w-3.5 h-3.5" /> Add team
        </Button>
      </div>
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

// ─── Team Picker (full-screen, first-time) ────────────────────────────────────

function TeamPickerScreen({
  date, allTeams, offTeamIds, onConfirm, saving, signOnSaved,
}: {
  date: string;
  allTeams: RosterTeam[];
  offTeamIds: Set<number>;
  onConfirm: (teamIds: number[]) => void;
  saving: boolean;
  signOnSaved: boolean;
}) {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(allTeams.filter((t) => !offTeamIds.has(t.teamId)).map((t) => t.teamId)),
  );
  const toggle = (id: number) =>
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const dateLabel = (() => { try { return format(parseISO(date), "EEEE, d MMMM yyyy"); } catch { return date; } })();

  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-muted/20">
      <div className="bg-background border border-border rounded-xl shadow-sm w-full max-w-lg">
        <div className="px-6 py-5 border-b border-border">
          <h2 className="font-semibold text-base">Select teams for {dateLabel}</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Choose which teams are working today. Teams marked as off in the schedule are pre-deselected.
          </p>
        </div>
        <div className="p-4 grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
          {allTeams.map((team) => {
            const isOff = offTeamIds.has(team.teamId);
            const checked = selected.has(team.teamId);
            return (
              <button
                key={team.teamId}
                onClick={() => toggle(team.teamId)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-colors",
                  checked
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40",
                )}
              >
                <div className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors text-[10px] font-bold",
                  checked ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30",
                )}>
                  {checked && "✓"}
                </div>
                <span className="font-medium flex-1">{team.teamName}</span>
                {isOff && (
                  <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">off</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {selected.size} team{selected.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            {!signOnSaved && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                Complete Sign On first
              </span>
            )}
            <Button
              variant="outline" size="sm"
              onClick={() => setSelected(new Set(allTeams.map((t) => t.teamId)))}
            >
              Select all
            </Button>
            <Button
              onClick={() => onConfirm([...selected])}
              disabled={selected.size === 0 || saving || !signOnSaved}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Start setup
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Team Picker Dialog (edit existing selection) ─────────────────────────────

function TeamPickerDialog({
  date, allTeams, offTeamIds, currentTeamIds, onConfirm, onClose, saving,
}: {
  date: string;
  allTeams: RosterTeam[];
  offTeamIds: Set<number>;
  currentTeamIds: number[];
  onConfirm: (teamIds: number[]) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(currentTeamIds));
  const toggle = (id: number) =>
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const dateLabel = (() => { try { return format(parseISO(date), "EEE, d MMM yyyy"); } catch { return date; } })();

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Teams for {dateLabel}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto py-1">
          {allTeams.map((team) => {
            const isOff = offTeamIds.has(team.teamId);
            const checked = selected.has(team.teamId);
            return (
              <button
                key={team.teamId}
                onClick={() => toggle(team.teamId)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-colors",
                  checked
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40",
                )}
              >
                <div className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 text-[10px] font-bold transition-colors",
                  checked ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30",
                )}>
                  {checked && "✓"}
                </div>
                <span className="font-medium flex-1">{team.teamName}</span>
                {isOff && (
                  <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">off</span>
                )}
              </button>
            );
          })}
        </div>
        <DialogFooter className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground mr-auto">
            {selected.size} team{selected.size !== 1 ? "s" : ""} selected
          </span>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onConfirm([...selected])} disabled={selected.size === 0 || saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeamSetupPage() {
  const { activeDate } = useCaptureNav();
  const date = activeDate ?? format(new Date(), "yyyy-MM-dd");

  const { data: teams = [], isLoading: teamsLoading } = useQuery<Team[]>({
    queryKey: ["/api/dpr/teams"],
    queryFn: ({ signal }) => apiFetch("/api/dpr/teams", { signal }),
  });

  const { data: session } = useQuery<{ saved: boolean; savedAt: string | null }>({
    queryKey: ["/api/dpr/shift-attendance/session", date],
    queryFn: ({ signal }) => apiFetch(`/api/dpr/shift-attendance/session?date=${date}`, { signal }),
  });
  const signOnSaved = session?.saved ?? false;

  return (
    <div className="flex flex-col h-full">
      <Tabs defaultValue="sign-on" className="flex flex-col h-full">
        <div className="border-b border-border px-6 pt-4 flex-none">
          <h1 className="text-xl font-bold mb-3">Team Setup</h1>
          <TabsList className="h-8">
            <TabsTrigger value="sign-on" className="text-xs px-4">Sign On</TabsTrigger>
            <TabsTrigger value="roster" className="text-xs px-4">Workers</TabsTrigger>
            <TabsTrigger value="schedule" className="text-xs px-4">Schedule</TabsTrigger>
            <TabsTrigger value="teams" className="text-xs px-4">Teams</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="sign-on" className="flex-1 overflow-hidden m-0 data-[state=inactive]:hidden">
          <SignOnPage />
        </TabsContent>

        <TabsContent value="roster" className="flex-1 overflow-hidden m-0 data-[state=inactive]:hidden">
          <RosterBoard date={date} signOnSaved={signOnSaved} />
        </TabsContent>

        <TabsContent value="schedule" className="flex-1 overflow-auto m-0 data-[state=inactive]:hidden">
          <ScheduleTab date={date} teams={teams} />
        </TabsContent>

        <TabsContent value="teams" className="flex-1 overflow-auto m-0 data-[state=inactive]:hidden">
          <TeamsSetupTab teams={teams} isLoading={teamsLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
