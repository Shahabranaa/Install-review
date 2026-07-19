import { useState, useMemo, useRef, useEffect } from "react";
import { format, parseISO } from "date-fns";
import {
  useListDprTimesheetEntries,
  useCreateDprTimesheetEntry,
  useUpdateDprTimesheetEntry,
  useDeleteDprTimesheetEntry,
  useListDprTeams,
  useListDprLocations,
  useListDprActivityTypes,
  useListDprActivityGroups,
  getListDprTimesheetEntriesQueryKey,
  getGetDprTimesheetSummaryQueryKey,
  DprTimesheetEntry,
  DprTeam,
  DprLocation,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Save, Trash2, X, ClipboardPaste, AlertTriangle, Lock, Info, CheckSquare, Square, Minus, CheckCheck, CalendarDays, Users, ChevronRight, ArrowLeftRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatTimeDisplay, hoursForEntry, formatDuration } from "@/lib/utils";
import { cn } from "@/lib/utils";

const DEFAULT_ACTIVITY_TYPE_NAME = "Effective Working Time";
const DEFAULT_GROUP_NAME = "Effective Working Time";
const ALLOWED_TYPE_NAMES = ["Effective Working Time", "Non-Working Time"];
const ALLOWED_GROUP_NAMES = ["Effective Working Time", "Extra Work", "Re-Work"];

// Display labels — DB name → label shown in the UI
const TYPE_LABELS: Record<string, string> = {
  "Effective Working Time": "Working Time",
  "Non-Working Time": "Non-Working Time",
};
const GROUP_LABELS: Record<string, string> = {
  "Effective Working Time": "Effective",
  "Extra Work": "Extra Work",
  "Re-Work": "Re-Work",
};

type BillingParty = "jdr" | "orsted" | null;

type RowDraft = {
  date: string;
  teamId: number | null;
  startTime: string;
  endTime: string;
  locationId: number | null;
  notes: string;
  activityTypeId: number | null;
  activityGroupId: number | null;
  billingParty: BillingParty;
};

function emptyDraft(defaultActivityTypeId: number | null, defaultGroupId: number | null): RowDraft {
  return {
    date: format(new Date(), "yyyy-MM-dd"),
    teamId: null,
    startTime: "00:00", // defaults to 12:00 AM so the AM/PM picker opens in AM
    endTime: "00:00",
    locationId: null,
    notes: "",
    activityTypeId: defaultActivityTypeId,
    activityGroupId: defaultGroupId,
    billingParty: null,
  };
}

// ─── Two-button Activity Group picker (client redesign) ─────────────────────
// Button 1 — toggles between Working Time / Non-Working Time
// Button 2 — cycles sub-group (Effective / Extra Work / Re-Work) when Working;
//             shows an inactive "—" placeholder when Non-Working

function ActivityGroupPicker({
  allowedTypes,
  allowedGroups,
  workingTypeId,
  typeValue,
  groupValue,
  onTypeChange,
  onGroupChange,
  onError,
}: {
  allowedTypes: { id: number; name: string }[];
  allowedGroups: { id: number; name: string }[];
  workingTypeId: number | null;
  typeValue: number | null;
  groupValue: number | null;
  onTypeChange: (id: number) => void;
  onGroupChange: (id: number) => void;
  onError?: (msg: string) => void;
}) {
  const isWorking = typeValue === workingTypeId;
  const activeType = allowedTypes.find((t) => t.id === typeValue);
  const activeGroup = allowedGroups.find((g) => g.id === groupValue);
  const kindLabel = activeType ? (TYPE_LABELS[activeType.name] ?? activeType.name) : "Working Time";
  const groupLabel = isWorking && activeGroup ? (GROUP_LABELS[activeGroup.name] ?? activeGroup.name) : null;
  const canToggleType = allowedTypes.length > 1;
  const canCycleGroup = isWorking && allowedGroups.length > 0;

  const handleTypeClick = () => {
    if (!canToggleType) {
      onError?.("Only one activity type is configured — cannot switch.");
      return;
    }
    const nonWorking = allowedTypes.find((t) => t.id !== workingTypeId);
    if (isWorking && nonWorking) {
      onTypeChange(nonWorking.id);
    } else if (workingTypeId) {
      onTypeChange(workingTypeId);
    }
  };

  const handleGroupClick = () => {
    if (!isWorking) return; // placeholder shown, nothing to do
    if (allowedGroups.length === 0) {
      onError?.("No sub-groups are configured for this activity type.");
      return;
    }
    const idx = allowedGroups.findIndex((g) => g.id === groupValue);
    const next = allowedGroups[(idx + 1) % allowedGroups.length];
    onGroupChange(next.id);
  };

  return (
    <div className="inline-flex items-stretch rounded-md border overflow-hidden shadow-sm text-xs font-semibold min-w-[190px]"
         style={{ borderColor: isWorking ? "rgb(22 163 74 / 0.4)" : "rgb(234 179 8 / 0.4)" }}>
      {/* Left — type toggle */}
      <button
        type="button"
        onClick={handleTypeClick}
        title={canToggleType ? "Toggle Working / Non-Working Time" : "Only one activity type is configured"}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 transition-all duration-150 border-r",
          isWorking
            ? "bg-green-500/10 text-green-400 border-r-green-600/30"
            : "bg-yellow-500/10 text-yellow-400 border-r-yellow-500/30",
          canToggleType ? (isWorking ? "hover:bg-green-500/20" : "hover:bg-yellow-500/20") : "opacity-60 cursor-not-allowed"
        )}
      >
        <span className={cn(
          "w-1.5 h-1.5 rounded-full shrink-0 ring-1",
          isWorking ? "bg-green-400 ring-green-400/40" : "bg-yellow-400 ring-yellow-400/40"
        )} />
        <span className="leading-none whitespace-nowrap">{kindLabel}</span>
        {canToggleType && <ArrowLeftRight className="w-2.5 h-2.5 opacity-30 shrink-0 ml-0.5" />}
      </button>

      {/* Right — sub-group cycler */}
      {isWorking ? (
        <button
          type="button"
          onClick={handleGroupClick}
          title={canCycleGroup ? "Cycle sub-group" : "No sub-groups configured"}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1.5 bg-green-500/5 text-green-300/70 transition-all duration-150",
            canCycleGroup ? "hover:bg-green-500/15 hover:text-green-300" : "opacity-50 cursor-not-allowed"
          )}
        >
          <span className="leading-none whitespace-nowrap">{groupLabel ?? "—"}</span>
          {canCycleGroup && <ChevronRight className="w-3 h-3 opacity-40 shrink-0" />}
        </button>
      ) : (
        <div className="flex items-center px-2.5 py-1.5 bg-muted/10 text-muted-foreground/25 select-none">
          <span className="leading-none">—</span>
        </div>
      )}
    </div>
  );
}

function findByName<T extends { id: number; name: string }>(
  list: T[],
  name: string
): T | undefined {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return undefined;
  return list.find((item) => item.name.trim().toLowerCase() === normalized);
}

// Fuzzy match: exact first, then substring in either direction
function findByNameFuzzy<T extends { id: number; name: string }>(
  list: T[],
  name: string
): T | undefined {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return undefined;
  const exact = list.find((item) => item.name.trim().toLowerCase() === normalized);
  if (exact) return exact;
  return list.find((item) => {
    const dbName = item.name.trim().toLowerCase();
    return dbName.includes(normalized) || normalized.includes(dbName);
  });
}

function normalizeTime(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (match) return `${match[1].padStart(2, "0")}:${match[2]}`;
  return trimmed;
}

/** Returns an error string, or null if the time is a valid 00:00–47:59 string. */
function validate48hTime(raw: string): string | null {
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "Use HH:MM (e.g. 06:00 or 25:30)";
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h > 47) return "Hours must be 0–47";
  if (m > 59) return "Minutes must be 0–59";
  return null;
}

function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // DD.MM.YY or DD.MM.YYYY (dot-separated, e.g. "14.06.26")
  const dotMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (dotMatch) {
    const day = dotMatch[1].padStart(2, "0");
    const month = dotMatch[2].padStart(2, "0");
    const year = dotMatch[3].length === 2 ? `20${dotMatch[3]}` : dotMatch[3];
    return `${year}-${month}-${day}`;
  }
  // DD/MM/YY or DD/MM/YYYY (slash-separated UK format, e.g. "14/06/2026")
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, "0");
    const month = slashMatch[2].padStart(2, "0");
    const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${year}-${month}-${day}`;
  }
  // Generic fallback (avoid for ambiguous formats — JS Date treats M/D/YYYY as US)
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) return format(parsed, "yyyy-MM-dd");
  return null; // unparseable — caller must handle
}

type PendingRow = {
  key: string;
  date: string | null;
  dateRaw: string;
  teamId: number | null;
  teamRaw: string;
  startTime: string;
  endTime: string;
  locationId: number | null;
  locationRaw: string;
  notes: string;
  activityTypeId: number | null;
  activityGroupId: number | null;
  billingParty: BillingParty;
};

function parsePastedText(
  text: string,
  teams: DprTeam[],
  locations: DprLocation[],
  defaultActivityTypeId: number | null,
  defaultGroupId: number | null
): PendingRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.map((line, idx) => {
    const cols = line.split("\t");
    const [rawDate = "", rawTeam = "", rawStart = "", rawEnd = "", rawLocation = "", rawNotes = ""] = cols;
    const team = findByName(teams, rawTeam);
    const location = findByNameFuzzy(locations, rawLocation);
    const parsedDate = normalizeDate(rawDate);
    return {
      key: `${Date.now()}-${idx}`,
      date: parsedDate,
      dateRaw: rawDate.trim(),
      teamId: team?.id ?? null,
      teamRaw: rawTeam.trim(),
      startTime: normalizeTime(rawStart),
      endTime: normalizeTime(rawEnd),
      locationId: location?.id ?? null,
      locationRaw: rawLocation.trim(),
      notes: rawNotes.trim(),
      activityTypeId: defaultActivityTypeId,
      activityGroupId: defaultGroupId,
      billingParty: null,
    };
  });
}

// ─── Status helpers ───────────────────────────────────────────────────────────
type TeamStatus = "none" | "partial" | "full";


function getTeamStatus(hours: number): TeamStatus {
  if (hours === 0) return "none";
  if (hours < 12) return "partial";
  return "full";
}
interface DateBreakdown { full: number; partial: number; none: number; total: number; worstStatus: TeamStatus; }
function getDateBreakdown(date: string, teams: DprTeam[], teamHoursMap: Map<string, Map<number, number>>): DateBreakdown {
  const dm = teamHoursMap.get(date) ?? new Map<number, number>();
  let full = 0, partial = 0, none = 0;
  for (const team of teams) {
    const s = getTeamStatus(dm.get(team.id) ?? 0);
    if (s === "full") full++;
    else if (s === "partial") partial++;
    else none++;
  }
  const worstStatus: TeamStatus = none > 0 ? "none" : partial > 0 ? "partial" : "full";
  return { full, partial, none, total: teams.length, worstStatus };
}

const STATUS_BORDER: Record<TeamStatus, string> = {
  full:    "border-green-500",
  partial: "border-amber-400",
  none:    "border-border",
};
const STATUS_TEXT: Record<TeamStatus, string> = {
  full:    "text-green-400",
  partial: "text-amber-400",
  none:    "text-red-400",
};
const STATUS_TINT: Record<TeamStatus, string> = {
  full:    "bg-green-500/10",
  partial: "bg-amber-400/10",
  none:    "bg-red-500/10",
};

// Segmented bar showing green / amber / red proportions
function StatusBar({ bd, isActive }: { bd: DateBreakdown; isActive: boolean }) {
  const pct = (n: number) => `${(n / Math.max(bd.total, 1)) * 100}%`;
  const base = isActive ? "opacity-60" : "";
  return (
    <div className="mt-1 w-full flex rounded-full overflow-hidden h-1 gap-px">
      {bd.full    > 0 && <div style={{ width: pct(bd.full)    }} className={cn("bg-green-500", base, bd.partial === 0 && bd.none === 0 ? "rounded-full" : "rounded-l-full")} />}
      {bd.partial > 0 && <div style={{ width: pct(bd.partial) }} className={cn("bg-amber-400", base, bd.full === 0 ? "rounded-l-full" : "", bd.none === 0 ? "rounded-r-full" : "")} />}
      {bd.none    > 0 && <div style={{ width: pct(bd.none)    }} className={cn("bg-red-500",   base, bd.full === 0 && bd.partial === 0 ? "rounded-full" : "rounded-r-full")} />}
    </div>
  );
}

// ─── Filter pills component ───────────────────────────────────────────────────
interface FilterPillsProps {
  distinctDates: string[];
  teams: DprTeam[];
  activeDate: string | null;
  activeTeamId: number | null;
  onDateClick: (d: string) => void;
  onTeamClick: (id: number) => void;
  teamHoursMap: Map<string, Map<number, number>>;
}

function FilterPills({ distinctDates, teams, activeDate, activeTeamId, onDateClick, onTeamClick, teamHoursMap }: FilterPillsProps) {
  const [visibleDateRows, setVisibleDateRows] = useState(1);
  useEffect(() => { setVisibleDateRows(1); }, [distinctDates]);

  const pageSize = Math.max(teams.length, 1);
  const visibleDates = distinctDates.slice(0, visibleDateRows * pageSize);
  const hasMoreDates = distinctDates.length > visibleDates.length;
  const dateRows: string[][] = [];
  for (let i = 0; i < visibleDates.length; i += pageSize) {
    dateRows.push(visibleDates.slice(i, i + pageSize));
  }

  // Team status for active date
  const activeDm = activeDate ? (teamHoursMap.get(activeDate) ?? new Map<number, number>()) : null;

  return (
    <div className="px-6 py-2 border-b border-border bg-background shrink-0 flex flex-col gap-1.5">
      {distinctDates.length > 0 && dateRows.map((row, rowIdx) => {
        const isLastRow = rowIdx === dateRows.length - 1;
        return (
          <div key={rowIdx} className="flex items-start gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0 w-8 mt-1.5" style={{ visibility: rowIdx === 0 ? "visible" : "hidden" }}>
              Date
            </span>
            {row.map((d) => {
              const label = (() => { try { return format(parseISO(d), "dd/MM/yy"); } catch { return d; } })();
              const isActive = activeDate === d;
              const bd = getDateBreakdown(d, teams, teamHoursMap);
              const ws = bd.worstStatus;
              return (
                <button
                  key={d}
                  type="button"
                  data-testid={`date-pill-${d}`}
                  onClick={() => onDateClick(d)}
                  className={cn(
                    "shrink-0 flex flex-col items-start rounded-lg px-2.5 py-1 text-xs font-medium transition-colors min-w-[64px]",
                    isActive
                      ? "border-2 border-primary bg-primary text-primary-foreground"
                      : cn("border bg-transparent hover:bg-muted/40", STATUS_BORDER[ws], "text-muted-foreground hover:text-foreground")
                  )}
                >
                  <div className="flex items-center justify-between w-full gap-1.5">
                    <span className="font-semibold">{label}</span>
                    <span className={cn("text-[10px] font-bold tabular-nums", isActive ? "text-primary-foreground/70" : STATUS_TEXT[ws])}>
                      {bd.full + bd.partial}/{bd.total}
                    </span>
                  </div>
                  <StatusBar bd={bd} isActive={isActive} />
                </button>
              );
            })}
            {isLastRow && hasMoreDates && (
              <button
                type="button"
                onClick={() => setVisibleDateRows((n) => n + 1)}
                className="text-xs text-primary hover:text-primary/80 transition-colors shrink-0 ml-1 underline underline-offset-2 mt-1.5"
              >
                show more
              </button>
            )}
          </div>
        );
      })}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground shrink-0 w-8">Team</span>
        {teams.map((team) => {
          const isActive = activeTeamId === team.id;
          const status: TeamStatus = activeDm ? getTeamStatus(activeDm.get(team.id) ?? 0) : null!;
          const hasStatus = activeDm !== null;
          return (
            <button
              key={team.id}
              type="button"
              data-testid={`team-pill-${team.id}`}
              onClick={() => onTeamClick(team.id)}
              className={cn(
                "shrink-0 rounded-full px-3 py-0.5 text-xs font-medium transition-colors",
                isActive
                  ? "border-2 border-primary bg-primary text-primary-foreground"
                  : hasStatus
                    ? cn("border-2 bg-transparent hover:bg-muted/40", STATUS_BORDER[status], "text-muted-foreground hover:text-foreground")
                    : "border bg-transparent text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
              )}
            >
              {team.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Column widths ────────────────────────────────────────────────────────────
// COL holds only non-width classes; widths are controlled by <colgroup> below.
const COL = {
  date: "",
  team: "",
  start: "",
  end: "",
  location: "",
  notes: "",   // gets all remaining space — widest column
  group: "pr-4",
  actions: "text-right",
};

export default function CapturePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: entries = [], isLoading: loadingEntries } = useListDprTimesheetEntries({ stage: "draft" });
  const { data: teams = [] } = useListDprTeams();
  const { data: locations = [] } = useListDprLocations();
  const { data: activityTypes = [] } = useListDprActivityTypes();
  const { data: activityGroups = [] } = useListDprActivityGroups({});

  const allowedTypes = useMemo(
    () => activityTypes.filter((t) => ALLOWED_TYPE_NAMES.includes(t.name)),
    [activityTypes]
  );
  const allowedGroups = useMemo(
    () => activityGroups.filter((g) => ALLOWED_GROUP_NAMES.includes(g.name)),
    [activityGroups]
  );

  const defaultActivityType = useMemo(
    () => findByName(allowedTypes, DEFAULT_ACTIVITY_TYPE_NAME),
    [allowedTypes]
  );
  const defaultActivityTypeId = defaultActivityType?.id ?? null;
  const workingTypeId = defaultActivityTypeId;

  const defaultGroup = useMemo(
    () => findByName(allowedGroups, DEFAULT_GROUP_NAME),
    [allowedGroups]
  );
  const defaultGroupId = defaultGroup?.id ?? null;

  const locationOptions: ComboboxOption[] = useMemo(
    () => locations.map((l) => ({ value: l.id.toString(), label: l.name })),
    [locations]
  );

  // Sorted flat entry list (date asc, then team name asc)
  const sortedEntries = useMemo(
    () =>
      [...entries.filter((e) => e.stage === "draft")].sort((a, b) => {
        const d = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (d !== 0) return d;
        return (a.team?.name ?? "").localeCompare(b.team?.name ?? "");
      }),
    [entries]
  );

  // ── Cache helpers ──
  const snapshotEntries = () =>
    queryClient.getQueriesData<DprTimesheetEntry[]>({ queryKey: getListDprTimesheetEntriesQueryKey() });

  const restoreEntries = (snap: ReturnType<typeof snapshotEntries>) =>
    snap.forEach(([key, data]) => queryClient.setQueryData(key, data));

  const patchEntry = (updated: DprTimesheetEntry) =>
    queryClient.setQueriesData<DprTimesheetEntry[]>(
      { queryKey: getListDprTimesheetEntriesQueryKey() },
      (old) => old?.map((e) => (e.id === updated.id ? updated : e))
    );

  // ── Mutations ──
  const createMutation = useCreateDprTimesheetEntry({
    mutation: {
      // No optimistic insert — avoids duplicate rows when a background refetch races
      // with cleanup. The "Add Row" form already shows a spinner via isPending.
      onSuccess: (newEntry) => {
        queryClient.setQueriesData<DprTimesheetEntry[]>(
          { queryKey: getListDprTimesheetEntriesQueryKey({ stage: "draft" }) },
          (old) => (old ? [...old.filter((e) => e.id !== newEntry.id), newEntry] : [newEntry])
        );
        queryClient.invalidateQueries({ queryKey: getGetDprTimesheetSummaryQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Failed to create", description: err.message, variant: "destructive" });
      },
    },
  });

  const updateMutation = useUpdateDprTimesheetEntry({
    mutation: {
      onMutate: async ({ id, data }) => {
        await queryClient.cancelQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
        const snapshot = snapshotEntries();
        queryClient.setQueriesData<DprTimesheetEntry[]>(
          { queryKey: getListDprTimesheetEntriesQueryKey() },
          (old) => old?.map((e) => (e.id === id ? { ...e, ...data } : e))
        );
        return { snapshot };
      },
      onSuccess: (updated) => {
        patchEntry(updated);
        toast({ title: "Entry updated" });
      },
      onError: (err, _, ctx) => {
        if (ctx?.snapshot) restoreEntries(ctx.snapshot);
        toast({ title: "Failed to update", description: err.message, variant: "destructive" });
      },
    },
  });

  const autosaveMutation = useUpdateDprTimesheetEntry({
    mutation: {
      onMutate: async ({ id, data }) => {
        await queryClient.cancelQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
        const snapshot = snapshotEntries();
        queryClient.setQueriesData<DprTimesheetEntry[]>(
          { queryKey: getListDprTimesheetEntriesQueryKey() },
          (old) => old?.map((e) => (e.id === id ? { ...e, ...data } : e))
        );
        return { snapshot };
      },
      onSuccess: (updated) => { patchEntry(updated); setFailedCell(null); },
      onError: (err, _, ctx) => {
        if (ctx?.snapshot) restoreEntries(ctx.snapshot);
        setFailedCell(lastSavedCellRef.current);
        toast({ title: "Autosave failed", description: err.message, variant: "destructive" });
      },
    },
  });

  const deleteMutation = useDeleteDprTimesheetEntry({
    mutation: {
      onMutate: async ({ id }) => {
        await queryClient.cancelQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
        const snapshot = snapshotEntries();
        queryClient.setQueriesData<DprTimesheetEntry[]>(
          { queryKey: getListDprTimesheetEntriesQueryKey() },
          (old) => old?.filter((e) => e.id !== id)
        );
        return { snapshot };
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDprTimesheetSummaryQueryKey() });
        toast({ title: "Entry deleted" });
      },
      onError: (_, __, ctx) => {
        if (ctx?.snapshot) restoreEntries(ctx.snapshot);
        toast({ title: "Failed to delete", variant: "destructive" });
      },
    },
  });

  const bulkDeleteMutation = useDeleteDprTimesheetEntry({ mutation: {} });
  const bulkUpdateMutation = useUpdateDprTimesheetEntry({ mutation: {} });

  const quickTypeMutation = useUpdateDprTimesheetEntry({
    mutation: {
      onMutate: async ({ id, data }) => {
        await queryClient.cancelQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
        const snapshot = snapshotEntries();
        queryClient.setQueriesData<DprTimesheetEntry[]>(
          { queryKey: getListDprTimesheetEntriesQueryKey() },
          (old) => old?.map((e) => (e.id === id ? { ...e, ...data } : e))
        );
        return { snapshot };
      },
      onSuccess: (updated) => { patchEntry(updated); },
      onError: (err, _, ctx) => {
        if (ctx?.snapshot) restoreEntries(ctx.snapshot);
        toast({ title: "Failed to set Activity Type", description: err.message, variant: "destructive" });
      },
    },
  });

  const approveMutation = useUpdateDprTimesheetEntry({
    mutation: {
      onMutate: async ({ id }) => {
        await queryClient.cancelQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
        const snapshot = snapshotEntries();
        queryClient.setQueriesData<DprTimesheetEntry[]>(
          { queryKey: getListDprTimesheetEntriesQueryKey() },
          (old) => old?.map((e) => (e.id === id ? { ...e, stage: "captured" as const } : e))
        );
        return { snapshot };
      },
      onSuccess: (updated) => {
        patchEntry(updated);
        queryClient.invalidateQueries({ queryKey: getGetDprTimesheetSummaryQueryKey() });
        toast({ title: "Row approved", description: "Sent to Clarify." });
      },
      onError: (err, _, ctx) => {
        if (ctx?.snapshot) restoreEntries(ctx.snapshot);
        toast({ title: "Failed to approve", description: err.message, variant: "destructive" });
      },
    },
  });

  const bulkApproveMutation = useUpdateDprTimesheetEntry({ mutation: {} });

  // ── UI state ──
  const [newRow, setNewRow] = useState<RowDraft | null>(null);
  const [newRowErrors, setNewRowErrors] = useState<Partial<Record<"teamId" | "startTime" | "endTime" | "locationId", string>>>({});
  // Per-cell inline editing — tracks which cell is active and its current typed value
  const [editingCell, setEditingCell] = useState<{ entryId: number; field: string } | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  // Tracks cells that failed to autosave (shows red ring until next successful edit)
  const [failedCell, setFailedCell] = useState<{ entryId: number; field: string } | null>(null);
  const lastSavedCellRef = useRef<{ entryId: number; field: string } | null>(null);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pendingRows, setPendingRows] = useState<PendingRow[] | null>(null);
  const [isSavingBulk, setIsSavingBulk] = useState(false);
  const pasteTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Date / team filter pills
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [activeTeamId, setActiveTeamId] = useState<number | null>(null);

  const distinctDates = useMemo(() => {
    const dates = Array.from(new Set(sortedEntries.map((e) => e.date)));
    return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  }, [sortedEntries]);

  // Auto-select first date + first team on initial data load
  const defaultsApplied = useRef(false);
  useEffect(() => {
    if (defaultsApplied.current) return;
    if (distinctDates.length === 0 || teams.length === 0) return;
    defaultsApplied.current = true;
    setActiveDate(distinctDates[0]);
    setActiveTeamId(teams[0].id);
  }, [distinctDates, teams]);

  // Clear selection whenever filters change so the bulk toolbar stays accurate
  useEffect(() => { setSelectedIds(new Set()); }, [activeDate, activeTeamId]);

  const handleDateClick = (d: string) => setActiveDate((prev) => prev === d ? null : d);
  const handleTeamClick = (id: number) => setActiveTeamId((prev) => prev === id ? null : id);

  const filteredEntries = useMemo(
    () =>
      sortedEntries.filter((e) => {
        if (activeDate && e.date !== activeDate) return false;
        if (activeTeamId !== null && e.teamId !== activeTeamId) return false;
        return true;
      }),
    [sortedEntries, activeDate, activeTeamId]
  );

  // Hours per team per date — drives filter pill status indicators
  const teamHoursMap = useMemo(() => {
    const map = new Map<string, Map<number, number>>();
    for (const e of sortedEntries) {
      if (!e.teamId) continue;
      const h = hoursForEntry(e.startTime, e.endTime);
      if (!map.has(e.date)) map.set(e.date, new Map());
      const dm = map.get(e.date)!;
      dm.set(e.teamId, (dm.get(e.teamId) ?? 0) + h);
    }
    return map;
  }, [sortedEntries]);

  // Bulk select
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBulkWorking, setIsBulkWorking] = useState(false);
  const [bulkLocationId, setBulkLocationId] = useState<string>("");
  const someSelected = filteredEntries.some((e) => selectedIds.has(e.id));

  const enterSelectMode = () => { setSelectMode(true); setSelectedIds(new Set()); setEditingCell(null); setEditingValue(""); };
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); setBulkLocationId(""); };

  const clearSelection = () => { setSelectedIds(new Set()); setBulkLocationId(""); };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkWorking(true);
    const ids = Array.from(selectedIds);
    queryClient.setQueriesData<DprTimesheetEntry[]>(
      { queryKey: getListDprTimesheetEntriesQueryKey() },
      (old) => old?.filter((e) => !ids.includes(e.id))
    );
    const results = await Promise.allSettled(ids.map((id) => bulkDeleteMutation.mutateAsync({ id })));
    const failed = results.length - results.filter((r) => r.status === "fulfilled").length;
    if (failed > 0) queryClient.invalidateQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDprTimesheetSummaryQueryKey() });
    setIsBulkWorking(false);
    exitSelectMode();
    const succeeded = ids.length - failed;
    if (succeeded > 0) toast({ title: `${succeeded} row${succeeded === 1 ? "" : "s"} deleted` });
    else toast({ title: "Delete failed", variant: "destructive" });
  };

  const handleBulkSetLocation = async () => {
    if (selectedIds.size === 0 || !bulkLocationId) return;
    setIsBulkWorking(true);
    const ids = Array.from(selectedIds);
    const locationId = parseInt(bulkLocationId);
    const locationObj = locations.find((l) => l.id === locationId);
    queryClient.setQueriesData<DprTimesheetEntry[]>(
      { queryKey: getListDprTimesheetEntriesQueryKey() },
      (old) => old?.map((e) =>
        ids.includes(e.id)
          ? { ...e, locationId, location: locationObj ? { id: locationObj.id, name: locationObj.name } : e.location }
          : e
      )
    );
    const results = await Promise.allSettled(ids.map((id) => bulkUpdateMutation.mutateAsync({ id, data: { locationId } })));
    results.forEach((r) => { if (r.status === "fulfilled") patchEntry(r.value); });
    const failed = results.length - results.filter((r) => r.status === "fulfilled").length;
    if (failed > 0) queryClient.invalidateQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
    setIsBulkWorking(false);
    clearSelection();
    const succeeded = ids.length - failed;
    if (succeeded > 0) toast({ title: `Location updated on ${succeeded} row${succeeded === 1 ? "" : "s"}` });
    else toast({ title: "Update failed", variant: "destructive" });
  };

  const handleBulkApproveSelected = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const incomplete = ids.filter((id) => {
      const e = entries.find((en) => en.id === id);
      return !e || !e.startTime || !e.endTime || !e.locationId || !e.activityTypeId;
    });
    if (incomplete.length > 0) {
      toast({
        title: `${incomplete.length} row${incomplete.length !== 1 ? "s" : ""} cannot be approved`,
        description: "Fill in Start, End, Location, and Activity Group before approving.",
        variant: "destructive",
      });
      return;
    }
    setIsBulkWorking(true);
    queryClient.setQueriesData<DprTimesheetEntry[]>(
      { queryKey: getListDprTimesheetEntriesQueryKey() },
      (old) => old?.map((e) => ids.includes(e.id) ? { ...e, stage: "captured" as const } : e)
    );
    const results = await Promise.allSettled(ids.map((id) => bulkApproveMutation.mutateAsync({ id, data: { stage: "captured" } })));
    const failed = results.length - results.filter((r) => r.status === "fulfilled").length;
    if (failed > 0) queryClient.invalidateQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDprTimesheetSummaryQueryKey() });
    setIsBulkWorking(false);
    exitSelectMode();
    const succeeded = ids.length - failed;
    if (succeeded > 0) toast({ title: `${succeeded} row${succeeded === 1 ? "" : "s"} approved`, description: "Sent to Clarify." });
    else toast({ title: "Approve failed", variant: "destructive" });
  };

  const handleApprove = (id: number) => {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    const missing: string[] = [];
    if (!entry.startTime) missing.push("Start time");
    if (!entry.endTime) missing.push("End time");
    if (!entry.locationId) missing.push("Location");
    if (!entry.activityTypeId) missing.push("Activity Group");
    if (missing.length > 0) {
      toast({
        title: "Row is incomplete — cannot approve",
        description: `Missing: ${missing.join(", ")}`,
        variant: "destructive",
      });
      return;
    }
    approveMutation.mutate({ id, data: { stage: "captured" } });
  };

  // ── Derived display flags ──
  const showDateCol = !activeDate;
  const showTeamCol = !activeTeamId;

  // Total hours for the current filtered view (drives context bar)
  const filteredTotalHours = useMemo(
    () => filteredEntries.reduce((acc, e) => acc + hoursForEntry(e.startTime, e.endTime), 0),
    [filteredEntries]
  );

  // ── Create / edit helpers ──
  const handleAddRow = () => {
    const draft = emptyDraft(defaultActivityTypeId, defaultGroupId);
    if (activeDate) draft.date = activeDate;
    if (activeTeamId) draft.teamId = activeTeamId;
    setNewRow(draft);
  };

  const handleCreate = () => {
    if (!newRow) return;
    const errors: Partial<Record<"teamId" | "startTime" | "endTime" | "locationId", string>> = {};
    if (!newRow.teamId) errors.teamId = "Team is required";
    if (!newRow.startTime) errors.startTime = "Start time is required";
    else { const e = validate48hTime(newRow.startTime); if (e) errors.startTime = e; }
    if (!newRow.endTime) errors.endTime = "End time is required";
    else { const e = validate48hTime(newRow.endTime); if (e) errors.endTime = e; }
    if (!newRow.locationId) errors.locationId = "Location is required";
    if (Object.keys(errors).length) { setNewRowErrors(errors); return; }
    setNewRowErrors({});
    createMutation.mutate(
      { data: { date: newRow.date, teamId: newRow.teamId || undefined, startTime: newRow.startTime || undefined, endTime: newRow.endTime || undefined, locationId: newRow.locationId || undefined, notes: newRow.notes || undefined, activityTypeId: newRow.activityTypeId || undefined, activityGroupId: newRow.activityGroupId || undefined, billingParty: newRow.billingParty || undefined } },
      { onSuccess: () => { toast({ title: "Entry created" }); setNewRow(null); setNewRowErrors({}); } }
    );
  };

  const buildUpdatePayload = (draft: Partial<DprTimesheetEntry>) => ({
    date: draft.date,
    teamId: draft.teamId || null,
    startTime: draft.startTime || null,
    endTime: draft.endTime || null,
    locationId: draft.locationId || null,
    notes: draft.notes || null,
    activityTypeId: draft.activityTypeId || null,
    activityGroupId: draft.activityGroupId ?? null,
    billingParty: draft.billingParty ?? null,
  });

  const handleQuickSetType = (entry: DprTimesheetEntry, activityTypeId: number) => {
    if (entry.id < 0) return; // temp ID — row not yet persisted, skip
    quickTypeMutation.mutate({ id: entry.id, data: buildUpdatePayload({ ...entry, activityTypeId }) });
  };

  const handleQuickSetGroup = (entry: DprTimesheetEntry, activityGroupId: number) => {
    if (entry.id < 0) return; // temp ID — row not yet persisted, skip
    quickTypeMutation.mutate({ id: entry.id, data: buildUpdatePayload({ ...entry, activityGroupId }) });
  };

  // ── Per-cell inline editing helpers ──────────────────────────────────────────
  const saveCell = (entryId: number, field: string, value: string) => {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    // Validate time fields before saving
    if ((field === "startTime" || field === "endTime") && value) {
      const err = validate48hTime(value);
      if (err) {
        toast({ title: `Invalid ${field === "startTime" ? "start" : "end"} time`, description: err, variant: "destructive" });
        setFailedCell({ entryId, field });
        return;
      }
    }
    const patch: Partial<DprTimesheetEntry> = {};
    if (field === "startTime") patch.startTime = value || undefined;
    else if (field === "endTime") patch.endTime = value || undefined;
    else if (field === "notes") patch.notes = value || undefined;
    else if (field === "date") patch.date = value || entry.date;
    else if (field === "teamId") patch.teamId = value ? parseInt(value) : null;
    lastSavedCellRef.current = { entryId, field };
    autosaveMutation.mutate({ id: entryId, data: buildUpdatePayload({ ...entry, ...patch }) });
  };

  const activateCell = (entryId: number, field: string, currentValue: string) => {
    if (selectMode) return;
    setFailedCell(null);
    // Flush any currently-active cell before switching
    if (editingCell && (editingCell.entryId !== entryId || editingCell.field !== field)) {
      saveCell(editingCell.entryId, editingCell.field, editingValue);
    }
    setEditingCell({ entryId, field });
    setEditingValue(currentValue ?? "");
  };

  const deactivateCell = (entryId: number, field: string) => {
    if (editingCell?.entryId === entryId && editingCell?.field === field) {
      saveCell(entryId, field, editingValue);
      setEditingCell(null);
      setEditingValue("");
    }
  };

  // ── Paste helpers ──
  const handlePasteChange = (text: string) => {
    setPasteText(text);
    if (!text.trim()) { setPendingRows(null); return; }
    setPendingRows(parsePastedText(text, teams, locations, defaultActivityTypeId, defaultGroupId));
  };

  const updatePendingRow = (key: string, patch: Partial<PendingRow>) =>
    setPendingRows((rows) => rows?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? null);

  const removePendingRow = (key: string) =>
    setPendingRows((rows) => rows?.filter((r) => r.key !== key) ?? null);

  const closePasteDialog = () => { setPasteOpen(false); setPasteText(""); setPendingRows(null); };

  const handleSaveBulk = async () => {
    if (!pendingRows || pendingRows.length === 0) return;
    setIsSavingBulk(true);
    const rowsToSave = pendingRows.filter((row): row is PendingRow & { date: string } => !!row.date);
    const skipped = pendingRows.length - rowsToSave.length;
    const results = await Promise.allSettled(
      rowsToSave.map((row) =>
        createMutation.mutateAsync({ data: { date: row.date, teamId: row.teamId || undefined, startTime: row.startTime || undefined, endTime: row.endTime || undefined, locationId: row.locationId || undefined, notes: row.notes || undefined, activityTypeId: row.activityTypeId || undefined, activityGroupId: row.activityGroupId || undefined, billingParty: row.billingParty || undefined } })
      )
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - succeeded + skipped;
    setIsSavingBulk(false);
    if (succeeded > 0) toast({ title: `${succeeded} row${succeeded === 1 ? "" : "s"} added`, description: failed > 0 ? `${failed} row(s) failed to save.` : undefined });
    else toast({ title: "No rows saved", variant: "destructive" });
    if (failed === 0) closePasteDialog();
  };

  // ── Shared table header ───────────────────────────────────────────────────
  const allSelected = filteredEntries.length > 0 && filteredEntries.every(e => selectedIds.has(e.id));

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredEntries.map(e => e.id)));
  };

  const toggleSelectRow = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const TableCols = () => (
    <TableRow>
      {selectMode && (
        <TableHead className="w-[36px]">
          <button type="button" onClick={toggleSelectAll} className="flex items-center justify-center text-muted-foreground hover:text-primary transition-colors">
            {allSelected
              ? <CheckCheck className="w-4 h-4 text-primary" />
              : someSelected
              ? <Minus className="w-4 h-4 text-primary" />
              : <Square className="w-4 h-4" />}
          </button>
        </TableHead>
      )}
      {showDateCol && <TableHead className={COL.date}>Date</TableHead>}
      {showTeamCol && <TableHead className={COL.team}>Team</TableHead>}
      <TableHead className={COL.start}>Start</TableHead>
      <TableHead className={COL.end}>End</TableHead>
      <TableHead className="text-emerald-600 dark:text-emerald-400">Duration</TableHead>
      <TableHead className={COL.location}>Location</TableHead>
      <TableHead className={COL.notes}>Notes</TableHead>
      <TableHead className={COL.group}>Activity Group</TableHead>
      <TableHead className={cn(COL.actions, "text-right")}>Actions</TableHead>
    </TableRow>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border flex flex-wrap items-center justify-between gap-y-2 gap-x-3 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight">Timesheet Capture</h1>
          <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
            Click any cell to edit it directly, like a spreadsheet.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => selectMode ? exitSelectMode() : enterSelectMode()}
            className={cn("gap-1.5", selectMode && "border-primary bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary")}
          >
            <CheckSquare className="w-4 h-4" />
            <span className="hidden xs:inline">{selectMode ? "Cancel Select" : "Select"}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPasteOpen(true)} className="gap-1.5">
            <ClipboardPaste className="w-4 h-4" />
            <span className="hidden xs:inline">Paste Rows</span>
          </Button>
        </div>
      </header>

      {/* Date & team filter pills */}
      <FilterPills
        distinctDates={distinctDates}
        teams={teams}
        activeDate={activeDate}
        activeTeamId={activeTeamId}
        onDateClick={handleDateClick}
        onTeamClick={handleTeamClick}
        teamHoursMap={teamHoursMap}
      />

      {/* Context bar — bulk action bar when selectMode, normal context bar otherwise */}
      {selectMode ? (
        <div className="px-4 sm:px-6 py-2 border-b border-primary/30 bg-primary/5 flex flex-wrap items-center gap-x-3 gap-y-2 shrink-0">
          <span className="text-xs font-semibold text-primary shrink-0">
            {selectedIds.size === 0
              ? "Select rows below"
              : `${selectedIds.size} row${selectedIds.size !== 1 ? "s" : ""} selected`}
          </span>
          <span className="text-border text-muted-foreground/40 hidden sm:inline">·</span>
          <button
            type="button"
            onClick={toggleSelectAll}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            {allSelected
              ? <CheckCheck className="w-3.5 h-3.5 text-primary" />
              : someSelected
              ? <Minus className="w-3.5 h-3.5 text-primary" />
              : <Square className="w-3.5 h-3.5" />}
            {allSelected ? "Deselect all" : "Select all"}
          </button>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              disabled={selectedIds.size === 0 || isBulkWorking}
              onClick={handleBulkDelete}
              className={cn("gap-1.5", selectedIds.size > 0 && "border-red-500/60 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-400")}
            >
              {isBulkWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Delete{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={selectedIds.size === 0 || isBulkWorking}
              onClick={handleBulkApproveSelected}
              className={cn("gap-1.5", selectedIds.size > 0 && "border-emerald-500/60 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-400")}
            >
              {isBulkWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
              Approve{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
            </Button>
          </div>
        </div>
      ) : (
        <div className="px-4 sm:px-6 py-2 border-b border-border bg-muted/20 flex flex-wrap items-center justify-between gap-y-1 gap-x-2 shrink-0">
          <div className="flex items-center gap-3">
            {activeDate || activeTeamId ? (
              <>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>Showing:</span>
                  {activeDate && (
                    <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/30 text-primary text-xs font-medium">
                      {(() => { try { return format(parseISO(activeDate), "dd/MM"); } catch { return activeDate; } })()}
                    </span>
                  )}
                  {activeDate && activeTeamId && <span className="text-muted-foreground/50">·</span>}
                  {activeTeamId && (
                    <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/30 text-primary text-xs font-medium">
                      {teams.find((t) => t.id === activeTeamId)?.name ?? `Team ${activeTeamId}`}
                    </span>
                  )}
                </div>
                {filteredEntries.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="font-semibold text-emerald-500 tabular-nums">
                      {Math.floor(filteredTotalHours)}h {Math.round((filteredTotalHours % 1) * 60)}m
                    </span>
                    <span>· {filteredEntries.length} rows</span>
                    {filteredTotalHours < 12 && <span className="text-muted-foreground/60">/ 12h expected</span>}
                    {filteredTotalHours >= 12 && <span className="text-emerald-500/70">✓</span>}
                  </div>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground/60 italic">Select a date and team above to filter</span>
            )}
          </div>
          <Button
            size="sm"
            onClick={handleAddRow}
            disabled={newRow !== null}
            className="gap-1.5 h-7 text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Row
            {(activeDate || activeTeamId) && (
              <span className="opacity-60 font-normal">
                ↳ {activeDate ? (() => { try { return format(parseISO(activeDate), "dd/MM"); } catch { return activeDate; } })() : "all dates"}
                {activeTeamId ? ` · ${teams.find((t) => t.id === activeTeamId)?.name ?? ""}` : ""}
              </span>
            )}
          </Button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {loadingEntries && sortedEntries.length === 0 && !newRow ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-none border-0">
            <Table className="table-fixed w-full min-w-[860px]">
              {/* Column widths — group/actions are fixed px so the pill never overlaps */}
              <colgroup>
                {selectMode && <col className="w-[36px]" />}
                {showDateCol && <col className="w-[9%]" />}
                {showTeamCol && <col className="w-[9%]" />}
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[6%]" />
                <col className="w-[11%]" />
                <col />
                <col style={{ width: 210 }} />
                <col style={{ width: 70 }} />
              </colgroup>
              <TableHeader className="bg-muted/30 sticky top-0 z-10">
                <TableCols />
              </TableHeader>
              <TableBody>

                {/* ── New row form ── */}
                {newRow && (
                  <TableRow className="bg-primary/5 align-top">
                    {selectMode && <TableCell className="w-[36px]" />}
                    {showDateCol && (
                      <TableCell className={COL.date}>
                        <Input type="date" lang="en-GB" value={newRow.date} onChange={(e) => setNewRow({ ...newRow, date: e.target.value })} className="h-8 text-sm" />
                      </TableCell>
                    )}
                    {showTeamCol && (
                      <TableCell className={COL.team}>
                        <Select
                          value={newRow.teamId?.toString() || ""}
                          onValueChange={(v) => { setNewRow({ ...newRow, teamId: parseInt(v) }); setNewRowErrors((e) => ({ ...e, teamId: undefined })); }}
                        >
                          <SelectTrigger className={cn("h-8 text-sm", newRowErrors.teamId && "border-destructive focus:ring-destructive")}>
                            <SelectValue placeholder="Select Team" />
                          </SelectTrigger>
                          <SelectContent>{teams.map((t) => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}</SelectContent>
                        </Select>
                        {newRowErrors.teamId && <p className="text-destructive text-[10px] mt-0.5 leading-tight">{newRowErrors.teamId}</p>}
                      </TableCell>
                    )}
                    <TableCell className={COL.start}>
                      <Input
                        type="text"
                        placeholder="HH:MM"
                        value={newRow.startTime}
                        onChange={(e) => { setNewRow({ ...newRow, startTime: e.target.value }); setNewRowErrors((e) => ({ ...e, startTime: undefined })); }}
                        onBlur={(e) => { const n = normalizeTime(e.target.value); if (n !== e.target.value) setNewRow((r) => r ? { ...r, startTime: n } : r); }}
                        className={cn("h-8 text-sm font-mono tabular-nums", newRowErrors.startTime && "border-destructive focus-visible:ring-destructive")}
                      />
                      {newRowErrors.startTime && <p className="text-destructive text-[10px] mt-0.5 leading-tight">{newRowErrors.startTime}</p>}
                    </TableCell>
                    <TableCell className={COL.end}>
                      <Input
                        type="text"
                        placeholder="HH:MM"
                        value={newRow.endTime}
                        onChange={(e) => { setNewRow({ ...newRow, endTime: e.target.value }); setNewRowErrors((e) => ({ ...e, endTime: undefined })); }}
                        onBlur={(e) => { const n = normalizeTime(e.target.value); if (n !== e.target.value) setNewRow((r) => r ? { ...r, endTime: n } : r); }}
                        className={cn("h-8 text-sm font-mono tabular-nums", newRowErrors.endTime && "border-destructive focus-visible:ring-destructive")}
                      />
                      {newRowErrors.endTime && <p className="text-destructive text-[10px] mt-0.5 leading-tight">{newRowErrors.endTime}</p>}
                    </TableCell>
                    <TableCell>
                      <span className={cn("text-sm font-medium tabular-nums", formatDuration(newRow.startTime, newRow.endTime) !== "—" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/40")}>
                        {formatDuration(newRow.startTime, newRow.endTime)}
                      </span>
                    </TableCell>
                    <TableCell className={COL.location}>
                      <Combobox
                        options={locationOptions}
                        value={newRow.locationId?.toString() || ""}
                        onValueChange={(v) => { setNewRow({ ...newRow, locationId: parseInt(v) }); setNewRowErrors((e) => ({ ...e, locationId: undefined })); }}
                        placeholder="Select Location"
                        searchPlaceholder="Search locations..."
                        triggerClassName={newRowErrors.locationId ? "border-destructive" : undefined}
                      />
                      {newRowErrors.locationId && <p className="text-destructive text-[10px] mt-0.5 leading-tight">{newRowErrors.locationId}</p>}
                    </TableCell>
                    <TableCell className={COL.notes}>
                      <Input
                        value={newRow.notes}
                        onChange={(e) => setNewRow({ ...newRow, notes: e.target.value })}
                        placeholder="Notes..."
                        className="h-8 text-sm"
                        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                      />
                    </TableCell>
                    <TableCell className={COL.group}>
                      <ActivityGroupPicker
                        allowedTypes={allowedTypes}
                        allowedGroups={allowedGroups}
                        workingTypeId={workingTypeId}
                        typeValue={newRow.activityTypeId}
                        groupValue={newRow.activityGroupId}
                        onTypeChange={(id) => setNewRow({ ...newRow, activityTypeId: id })}
                        onGroupChange={(id) => setNewRow({ ...newRow, activityGroupId: id })}
                        onError={(msg) => toast({ title: msg, variant: "destructive" })}
                      />
                    </TableCell>
                    <TableCell className={cn(COL.actions, "text-right")}>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:bg-primary/10" onClick={handleCreate} disabled={createMutation.isPending}>
                          {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => { setNewRow(null); setNewRowErrors({}); }}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}

                {/* ── Existing entries — per-cell inline editing ── */}
                {filteredEntries.map((entry) => {
                  const isSelected = selectedIds.has(entry.id);
                  const isCellEditing = (field: string) =>
                    editingCell?.entryId === entry.id && editingCell?.field === field;
                  const isCellFailed = (field: string) =>
                    failedCell?.entryId === entry.id && failedCell?.field === field;
                  // In select mode let the click bubble to the TableRow's onClick (which toggles selection).
                  // In edit mode stop propagation so cell interactions don't accidentally trigger row handlers.
                  const onCellClick = (e: React.MouseEvent) => { if (!selectMode) e.stopPropagation(); };

                  return (
                    <TableRow
                      key={entry.id}
                      className={cn(
                        "transition-colors",
                        isSelected ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-muted/20",
                        selectMode ? "cursor-pointer" : ""
                      )}
                      onClick={selectMode ? () => toggleSelectRow(entry.id) : undefined}
                      style={{ height: 52 }}
                    >
                      {/* Checkbox — select mode only */}
                      {selectMode && (
                        <TableCell className="w-[36px]" onClick={(e) => { e.stopPropagation(); toggleSelectRow(entry.id); }}>
                          {isSelected
                            ? <CheckSquare className="w-4 h-4 text-primary cursor-pointer" />
                            : <Square className="w-4 h-4 text-muted-foreground/50 cursor-pointer" />}
                        </TableCell>
                      )}
                      {/* Date — inline editable */}
                      {showDateCol && (
                        <TableCell className={cn(COL.date, "font-medium")} onClick={onCellClick}>
                          {isCellEditing("date") ? (
                            <input
                              autoFocus
                              type="date"
                              lang="en-GB"
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onBlur={() => deactivateCell(entry.id, "date")}
                              onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
                              className="w-full bg-primary/10 border border-primary rounded px-1.5 py-0.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
                            />
                          ) : (
                            <span
                              onClick={() => activateCell(entry.id, "date", entry.date)}
                              className="cursor-text select-none hover:bg-muted/40 rounded px-1 -mx-1 transition-colors text-sm font-medium"
                            >
                              {(() => { try { return format(parseISO(entry.date), "dd/MM/yyyy"); } catch { return entry.date; } })()}
                            </span>
                          )}
                        </TableCell>
                      )}
                      {/* Team — inline select */}
                      {showTeamCol && (
                        <TableCell className={COL.team} onClick={onCellClick}>
                          {isCellEditing("teamId") ? (
                            <Select
                              value={editingValue}
                              onValueChange={(v) => {
                                saveCell(entry.id, "teamId", v);
                                setEditingCell(null);
                                setEditingValue("");
                              }}
                              onOpenChange={(open) => { if (!open) { setEditingCell(null); setEditingValue(""); } }}
                              defaultOpen
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Select Team" />
                              </SelectTrigger>
                              <SelectContent>
                                {teams.map((t) => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span
                              onClick={() => activateCell(entry.id, "teamId", entry.teamId?.toString() || "")}
                              className="cursor-text select-none hover:bg-muted/40 rounded px-1 -mx-1 transition-colors text-sm"
                            >
                              {entry.team?.name || <span className="text-muted-foreground/50">—</span>}
                            </span>
                          )}
                        </TableCell>
                      )}
                      {/* Start — inline editable */}
                      <TableCell className={cn(COL.start, isCellFailed("startTime") && "ring-1 ring-inset ring-destructive rounded")} onClick={onCellClick}>
                        {isCellEditing("startTime") ? (
                          <input
                            autoFocus
                            type="time"
                            lang="en-GB"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onBlur={() => deactivateCell(entry.id, "startTime")}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
                            className="w-full bg-primary/10 border border-primary rounded px-1.5 py-0.5 text-sm font-mono tabular-nums text-foreground outline-none focus:ring-1 focus:ring-primary"
                          />
                        ) : (
                          <span
                            onClick={() => activateCell(entry.id, "startTime", entry.startTime || "")}
                            className={cn("cursor-text select-none hover:bg-muted/40 rounded px-1 -mx-1 transition-colors text-sm font-mono tabular-nums", isCellFailed("startTime") && "text-destructive")}
                          >
                            {entry.startTime ? formatTimeDisplay(entry.startTime) : <span className="text-muted-foreground/50">—</span>}
                          </span>
                        )}
                      </TableCell>
                      {/* End — inline editable */}
                      <TableCell className={cn(COL.end, isCellFailed("endTime") && "ring-1 ring-inset ring-destructive rounded")} onClick={onCellClick}>
                        {isCellEditing("endTime") ? (
                          <input
                            autoFocus
                            type="time"
                            lang="en-GB"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onBlur={() => deactivateCell(entry.id, "endTime")}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
                            className="w-full bg-primary/10 border border-primary rounded px-1.5 py-0.5 text-sm font-mono tabular-nums text-foreground outline-none focus:ring-1 focus:ring-primary"
                          />
                        ) : (
                          <span
                            onClick={() => activateCell(entry.id, "endTime", entry.endTime || "")}
                            className={cn("cursor-text select-none hover:bg-muted/40 rounded px-1 -mx-1 transition-colors text-sm font-mono tabular-nums", isCellFailed("endTime") && "text-destructive")}
                          >
                            {entry.endTime ? formatTimeDisplay(entry.endTime) : <span className="text-muted-foreground/50">—</span>}
                          </span>
                        )}
                      </TableCell>
                      {/* Duration */}
                      <TableCell>
                        <span className={cn("text-sm font-semibold tabular-nums", formatDuration(entry.startTime, entry.endTime) !== "—" ? "text-emerald-500" : "text-muted-foreground/30")}>
                          {formatDuration(entry.startTime, entry.endTime)}
                        </span>
                      </TableCell>
                      {/* Location — inline text input */}
                      <TableCell className={COL.location} onClick={onCellClick}>
                        {isCellEditing("locationId") ? (
                          <input
                            autoFocus
                            list={`location-list-${entry.id}`}
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onBlur={() => {
                              const matched = findByNameFuzzy(locations, editingValue);
                              if (matched) {
                                autosaveMutation.mutate({ id: entry.id, data: buildUpdatePayload({ ...entry, locationId: matched.id, location: { id: matched.id, name: matched.name } }) });
                              }
                              setEditingCell(null);
                              setEditingValue("");
                            }}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
                            className="w-full bg-primary/10 border border-primary rounded px-1.5 py-0.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
                          />
                        ) : (
                          <span
                            onClick={() => activateCell(entry.id, "locationId", entry.location?.name || "")}
                            className="cursor-text select-none hover:bg-muted/40 rounded px-1 -mx-1 transition-colors text-sm"
                          >
                            {entry.location?.name || <span className="text-muted-foreground/50">—</span>}
                          </span>
                        )}
                        <datalist id={`location-list-${entry.id}`}>
                          {locations.map((l) => <option key={l.id} value={l.name} />)}
                        </datalist>
                      </TableCell>
                      {/* Notes — inline editable */}
                      <TableCell className={cn(COL.notes, "max-w-[180px]")} onClick={onCellClick}>
                        {isCellEditing("notes") ? (
                          <input
                            autoFocus
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onBlur={() => deactivateCell(entry.id, "notes")}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
                            className="w-full bg-primary/10 border border-primary rounded px-1.5 py-0.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
                          />
                        ) : (
                          <span
                            onClick={() => activateCell(entry.id, "notes", entry.notes || "")}
                            className="cursor-text select-none hover:bg-muted/40 rounded px-1 -mx-1 transition-colors text-sm truncate block"
                          >
                            {entry.notes || <span className="text-muted-foreground/50">—</span>}
                          </span>
                        )}
                      </TableCell>
                      {/* Activity Group — instant toggle, no editing mode needed */}
                      <TableCell className={COL.group} onClick={onCellClick}>
                        <ActivityGroupPicker
                          allowedTypes={allowedTypes}
                          allowedGroups={allowedGroups}
                          workingTypeId={workingTypeId}
                          typeValue={entry.activityTypeId ?? null}
                          groupValue={entry.activityGroupId ?? null}
                          onTypeChange={(id) => handleQuickSetType(entry, id)}
                          onGroupChange={(id) => handleQuickSetGroup(entry, id)}
                          onError={(msg) => toast({ title: msg, variant: "destructive" })}
                        />
                      </TableCell>
                      {/* Actions */}
                      <TableCell className={cn(COL.actions, "text-right")} onClick={onCellClick}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                            title="Approve — send to Clarify"
                            onClick={() => handleApprove(entry.id)}
                          >
                            {approveMutation.isPending && approveMutation.variables?.id === entry.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Info className="w-4 h-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => deleteMutation.mutate({ id: entry.id })}
                          >
                            {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {/* ── Duration footer — only when entries are visible ── */}
                {filteredEntries.length > 0 && (
                  <TableRow className="bg-muted/10 border-t-2 border-border">
                    <TableCell colSpan={2 + (showDateCol ? 1 : 0) + (showTeamCol ? 1 : 0) + (selectMode ? 1 : 0)} className="text-right text-xs text-muted-foreground pr-2 py-1.5">
                      Total
                    </TableCell>
                    <TableCell className="py-1.5">
                      <span className={cn("text-sm font-bold tabular-nums", filteredTotalHours > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/40")}>
                        {filteredTotalHours > 0
                          ? `${Math.floor(filteredTotalHours)}h ${Math.round((filteredTotalHours % 1) * 60)}m`
                          : "—"}
                      </span>
                    </TableCell>
                    <TableCell colSpan={4} className="py-1.5 text-xs text-muted-foreground">
                      {filteredTotalHours > 0 && filteredTotalHours < 12 && (
                        <span>{(12 - filteredTotalHours).toFixed(2)}h remaining of 12h expected</span>
                      )}
                      {filteredTotalHours >= 12 && (
                        <span className="text-emerald-600 dark:text-emerald-400">✓ Full day covered</span>
                      )}
                    </TableCell>
                  </TableRow>
                )}

                {/* Empty state */}
                {!loadingEntries && filteredEntries.length === 0 && !newRow && (
                  <TableRow>
                    <TableCell colSpan={7 + (showDateCol ? 1 : 0) + (showTeamCol ? 1 : 0) + (selectMode ? 1 : 0)} className="text-center py-16 text-muted-foreground">
                      {sortedEntries.length === 0
                        ? <span>No entries yet. Click <strong>Add Row</strong> or <strong>Paste Rows</strong> to start.</span>
                        : <span>No entries match the selected filters.</span>}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* ── Hint bar ── */}
      <div className="px-6 py-2 border-t border-border bg-card/50 shrink-0">
        <p className="text-xs text-muted-foreground">
          {selectMode
            ? "Click rows to select them, then use Delete or Approve above. Click Cancel Select to return to editing."
            : <>Click any cell in <strong className="text-foreground">Start</strong>, <strong className="text-foreground">End</strong>, <strong className="text-foreground">Location</strong> or <strong className="text-foreground">Notes</strong> to edit inline. Activity Group pills toggle instantly — no dropdowns.</>}
        </p>
      </div>

      {/* ── Paste Rows dialog (unchanged behaviour) ── */}
      <Dialog open={pasteOpen} onOpenChange={(open) => { if (!open) closePasteDialog(); else setPasteOpen(true); }}>
        <DialogContent className="max-w-[95vw] w-full max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Paste rows from a spreadsheet</DialogTitle>
            <DialogDescription>
              Copy rows from your source sheet (Date, Team, Start, End, Location, Notes) and paste below.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto flex flex-col gap-3 min-h-0">
            <Textarea
              ref={pasteTextareaRef}
              value={pasteText}
              onChange={(e) => handlePasteChange(e.target.value)}
              placeholder={"2024-06-01\tTeam 1\t07:00\t15:30\tA01\tRoutine works"}
              className="min-h-[100px] font-mono text-xs shrink-0"
            />

            {pendingRows && pendingRows.length > 0 && (
              <div className="rounded-md border border-border overflow-auto flex-1 min-h-0">
                <Table className="table-fixed w-full min-w-[1100px]">
                  <colgroup>
                    <col className="w-[130px]" />
                    <col className="w-[140px]" />
                    <col className="w-[100px]" />
                    <col className="w-[100px]" />
                    <col className="w-[180px]" />
                    <col className="w-[220px]" />
                    <col />
                    <col className="w-[44px]" />
                  </colgroup>
                  <TableHeader className="bg-muted/50 sticky top-0 z-10">
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Team</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>End</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Activity Type</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRows.map((row) => {
                      const teamUnmatched = row.teamRaw && !row.teamId;
                      const locationUnmatched = row.locationRaw && !row.locationId;
                      return (
                        <TableRow key={row.key} className="align-top">
                          <TableCell className="pt-3">
                            <div className="flex flex-col gap-0.5">
                              <Input
                                type="date"
                                lang="en-GB"
                                value={row.date ?? ""}
                                onChange={(e) => updatePendingRow(row.key, { date: e.target.value || null, dateRaw: e.target.value })}
                                className={cn("h-8 text-sm", !row.date && row.dateRaw && "border-red-500 focus-visible:ring-red-500")}
                              />
                              {!row.date && row.dateRaw && (
                                <span className="text-[10px] text-red-500 truncate" title={row.dateRaw}>
                                  Can't parse: {row.dateRaw}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="pt-3">
                            <Select value={row.teamId?.toString() || ""} onValueChange={(v) => updatePendingRow(row.key, { teamId: parseInt(v) })}>
                              <SelectTrigger className={`h-8 text-sm ${teamUnmatched ? "border-amber-500" : ""}`}>
                                <SelectValue placeholder={teamUnmatched ? row.teamRaw : "Select Team"} />
                              </SelectTrigger>
                              <SelectContent>{teams.map((t) => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}</SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="pt-3">
                            <Input type="time" lang="en-GB" value={row.startTime} onChange={(e) => updatePendingRow(row.key, { startTime: e.target.value })} className="h-8 text-sm" />
                          </TableCell>
                          <TableCell className="pt-3">
                            <Input type="time" lang="en-GB" value={row.endTime} onChange={(e) => updatePendingRow(row.key, { endTime: e.target.value })} className="h-8 text-sm" />
                          </TableCell>
                          <TableCell className="pt-3">
                            <Combobox options={locationOptions} value={row.locationId?.toString() || ""} onValueChange={(v) => updatePendingRow(row.key, { locationId: parseInt(v) })} placeholder={locationUnmatched ? row.locationRaw : "Select Location"} searchPlaceholder="Search locations..." triggerClassName={locationUnmatched ? "border-amber-500" : undefined} />
                          </TableCell>
                          <TableCell className="pt-3">
                            <ActivityGroupPicker
                              allowedTypes={allowedTypes}
                              allowedGroups={allowedGroups}
                              workingTypeId={workingTypeId}
                              typeValue={row.activityTypeId}
                              groupValue={row.activityGroupId}
                              onTypeChange={(id) => updatePendingRow(row.key, { activityTypeId: id })}
                              onGroupChange={(id) => updatePendingRow(row.key, { activityGroupId: id })}
                              onError={(msg) => toast({ title: msg, variant: "destructive" })}
                            />
                          </TableCell>
                          <TableCell className="pt-2">
                            <Textarea
                              value={row.notes}
                              onChange={(e) => updatePendingRow(row.key, { notes: e.target.value })}
                              className="text-sm min-h-[56px] resize-none leading-snug"
                              rows={2}
                            />
                          </TableCell>
                          <TableCell className="pt-3">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removePendingRow(row.key)}>
                              <X className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {pendingRows && pendingRows.some((r) => r.dateRaw && !r.date) && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/30 rounded-md px-3 py-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Some dates couldn't be parsed — fix them before saving (accepted: DD/MM/YYYY, DD.MM.YY, YYYY-MM-DD).
              </div>
            )}
            {pendingRows && pendingRows.some((r) => (r.teamRaw && !r.teamId) || (r.locationRaw && !r.locationId)) && (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Some locations didn't match — select a valid location for every highlighted row before saving.
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0">
            {pendingRows && pendingRows.length > 0 && (
              <Badge variant="secondary" className="mr-auto">{pendingRows.length} row{pendingRows.length === 1 ? "" : "s"} parsed</Badge>
            )}
            <Button variant="outline" onClick={closePasteDialog}>Cancel</Button>
            <Button onClick={handleSaveBulk} disabled={!pendingRows || pendingRows.length === 0 || isSavingBulk || (pendingRows?.some((r) => r.dateRaw && !r.date) ?? false) || (pendingRows?.some((r) => r.locationRaw && !r.locationId) ?? false)} className="gap-2">
              {isSavingBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save {pendingRows?.length ?? 0} Row{pendingRows?.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
