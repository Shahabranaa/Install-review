import { useState, useMemo, useRef, useEffect } from "react";
import { format, parseISO, addDays } from "date-fns";
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
  usePreviewDprLautecImport,
  useStartDprLautecImport,
  useGetDprLautecImport,
  listDprTimesheetEntries,
  updateDprTimesheetEntry,
  LautecImportPreview,
  DprTimesheetEntry,
  DprTeam,
  DprLocation,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as DateCalendar } from "@/components/ui/calendar";
import { Loader2, Plus, Save, Trash2, X, ClipboardPaste, AlertTriangle, Lock, Info, CheckSquare, Square, Minus, CheckCheck, Users, ChevronRight, ArrowLeftRight, Calendar, Circle, CheckCircle2, Download, MessageSquare, RefreshCw, Sheet, Send, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatTimeDisplay, hoursForEntry, formatDuration } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { buildLautecCsv, downloadCsv } from "@/lib/export-csv";
import { useCaptureNav } from "@/contexts/CaptureNavContext";
import { useAuth } from "@/contexts/AuthContext";
import { compareDprRows } from "@/lib/sorting";

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
type LautecProgressState = "complete" | "active" | "waiting" | "error";
type ActivitySelection = {
  activityTypeId: number | null;
  activityGroupId: number | null;
};
type ActivityUpdateRequest = {
  id: number;
  data: Parameters<typeof updateDprTimesheetEntry>[1];
  selection: ActivitySelection;
  version: number;
};

type RowDraft = {
  date: string;
  teamId: number | null;
  startTime: string;
  endTime: string;
  locationId: number | null;
  notes: string;
  pax: number | null;
  paxRaw: string;
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
    pax: null,
    paxRaw: "",
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
  isSaving = false,
}: {
  allowedTypes: { id: number; name: string }[];
  allowedGroups: { id: number; name: string }[];
  workingTypeId: number | null;
  typeValue: number | null;
  groupValue: number | null;
  onTypeChange: (id: number) => void;
  onGroupChange: (id: number) => void;
  onError?: (msg: string) => void;
  isSaving?: boolean;
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
    <div className="inline-flex w-fit items-stretch rounded-md border overflow-hidden shadow-sm text-xs font-semibold whitespace-nowrap"
         style={{ borderColor: isWorking ? "rgb(22 163 74 / 0.4)" : "rgb(234 179 8 / 0.4)" }}>
      {/* Left — type toggle */}
      <button
        type="button"
        onClick={handleTypeClick}
        disabled={isSaving}
        title={isSaving ? "Saving activity group…" : canToggleType ? "Toggle Working / Non-Working Time" : "Only one activity type is configured"}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1.5 transition-all duration-150 border-r",
          isWorking
            ? "bg-green-500/10 text-green-400 border-r-green-600/30"
            : "bg-yellow-500/10 text-yellow-400 border-r-yellow-500/30",
          isSaving ? "cursor-wait opacity-75" : canToggleType ? (isWorking ? "hover:bg-green-500/20" : "hover:bg-yellow-500/20") : "opacity-60 cursor-not-allowed"
        )}
      >
        <span className={cn(
          "w-1.5 h-1.5 rounded-full shrink-0 ring-1",
          isWorking ? "bg-green-400 ring-green-400/40" : "bg-yellow-400 ring-yellow-400/40"
        )} />
        <span className="leading-none whitespace-nowrap">{kindLabel}</span>
        {isSaving
          ? <Loader2 className="w-3 h-3 animate-spin opacity-60 shrink-0 ml-0.5" />
          : canToggleType && <ArrowLeftRight className="w-2.5 h-2.5 opacity-30 shrink-0 ml-0.5" />}
      </button>

      {/* Right — sub-group cycler */}
      {isWorking ? (
        <button
          type="button"
          onClick={handleGroupClick}
          disabled={isSaving}
          title={isSaving ? "Saving activity group…" : canCycleGroup ? "Cycle sub-group" : "No sub-groups configured"}
          className={cn(
            "flex items-center gap-1 px-2 py-1.5 bg-green-500/5 text-green-300/70 transition-all duration-150",
            isSaving ? "cursor-wait opacity-75" : canCycleGroup ? "hover:bg-green-500/15 hover:text-green-300" : "opacity-50 cursor-not-allowed"
          )}
        >
          <span className="leading-none whitespace-nowrap">{groupLabel ?? "—"}</span>
          {isSaving
            ? <Loader2 className="w-3 h-3 animate-spin opacity-60 shrink-0" />
            : canCycleGroup && <ChevronRight className="w-3 h-3 opacity-40 shrink-0" />}
        </button>
      ) : (
        <div className="flex items-center px-2 py-1.5 bg-muted/10 text-muted-foreground/25 select-none">
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
  const parts = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!parts) return null;

  const day = Number(parts[1]);
  const month = Number(parts[2]);
  const year = Number(parts[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return `${parts[3]}-${parts[2]}-${parts[1]}`;
}

function usesHyphenDateFormat(raw: string): boolean {
  return /^\d{2}-\d{2}-\d{4}$/.test(raw.trim());
}

function normalizeIsoDate(raw: string): string | null {
  const trimmed = raw.trim();
  const parts = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return null;

  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return trimmed;
}

function addIsoDays(raw: string, days: number): string | null {
  const normalized = normalizeIsoDate(raw);
  if (!normalized) return null;
  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [
    date.getUTCFullYear().toString().padStart(4, "0"),
    (date.getUTCMonth() + 1).toString().padStart(2, "0"),
    date.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}

function formatDateAsDmyHyphen(date: string): string {
  const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? `${iso[3]}-${iso[2]}-${iso[1]}` : date;
}

function formatDateAsDmy(date: string): string {
  const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? `${iso[3]}-${iso[2]}-${iso[1]}` : date;
}

function normalizeDmyOrIsoDate(raw: string): string | null {
  return normalizeIsoDate(raw) ?? normalizeDate(raw);
}

function formatDateForSelector(raw: string): string {
  const normalized = normalizeDmyOrIsoDate(raw);
  return normalized ? formatDateAsDmy(normalized) : raw;
}

function formatDateIfDifferent(raw: string | null | undefined, currentDate: string | null): string | null {
  if (!raw || raw === currentDate) return null;
  try { return format(parseISO(raw), "d MMM"); } catch { return raw; }
}

function DmyDateInput({
  value,
  onChange,
  onBlur,
  className,
  id,
  ariaLabel,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  className?: string;
  id?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}) {
  const isFocusedRef = useRef(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [displayValue, setDisplayValue] = useState(() => formatDateForSelector(value));

  useEffect(() => {
    if (!isFocusedRef.current) setDisplayValue(formatDateForSelector(value));
  }, [value]);
  const selectedDate = normalizeDmyOrIsoDate(value);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <Input
        id={id}
        autoFocus={autoFocus}
        type="text"
        inputMode="numeric"
        value={displayValue}
        placeholder="DD-MM-YYYY"
        maxLength={10}
        aria-label={ariaLabel}
        onFocus={() => { isFocusedRef.current = true; }}
        onChange={(e) => {
          setDisplayValue(e.target.value);
          onChange(e.target.value);
        }}
        onBlur={() => {
          isFocusedRef.current = false;
          const normalized = normalizeDmyOrIsoDate(displayValue);
          if (normalized) setDisplayValue(formatDateAsDmy(normalized));
          onBlur?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
        }}
        className={cn("pr-8", className)}
      />
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Choose ${ariaLabel ?? "date"}`}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            onMouseDown={(e) => e.preventDefault()}
          >
            <Calendar className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <DateCalendar
            mode="single"
            selected={selectedDate ? parseISO(selectedDate) : undefined}
            defaultMonth={selectedDate ? parseISO(selectedDate) : undefined}
            onSelect={(date) => {
              if (!date) return;
              const formatted = format(date, "dd-MM-yyyy");
              setDisplayValue(formatted);
              onChange(formatted);
              setCalendarOpen(false);
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function normalizePax(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function splitTrailingPax(notes: string): { notes: string; paxRaw: string } {
  const trimmed = notes.trim();
  const match = trimmed.match(/(?:^|\s)([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/);
  if (!match || match.index === undefined) {
    return { notes: trimmed, paxRaw: "" };
  }

  return {
    notes: trimmed.slice(0, match.index).trim(),
    paxRaw: match[1],
  };
}

const PASTE_GRID_CELL =
  "h-8 w-full min-w-0 border-0 bg-transparent px-2 py-0 text-center text-xs text-foreground outline-none focus:bg-primary/5 focus:ring-2 focus:ring-inset focus:ring-primary";

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
  pax: number | null;
  paxRaw: string;
  activityTypeId: number | null;
  activityGroupId: number | null;
  billingParty: BillingParty;
};

type PendingCopy = {
  sourceDate: string;
  rows: PendingRow[];
};

function pendingRowTeamKey(row: PendingRow): string {
  if (row.teamId !== null) return `id:${row.teamId}`;
  const teamName = row.teamRaw.trim().toLowerCase();
  return teamName ? `name:${teamName}` : "unassigned";
}

function compareCopiedRows(a: PendingRow, b: PendingRow): number {
  return compareDprRows(
    { date: a.date, startTime: a.startTime, teamName: a.teamRaw },
    { date: b.date, startTime: b.startTime, teamName: b.teamRaw },
  );
}

function parsePastedText(
  text: string,
  teams: DprTeam[],
  locations: DprLocation[],
  defaultActivityTypeId: number | null,
  defaultGroupId: number | null,
): PendingRow[] {
  // A line starts a new row only when it begins with a recognisable date.
  // Continuation lines (e.g. multi-line notes) are folded into the preceding
  // row's notes field. Bare row-number lines (pure digits) are discarded.
  const STARTS_WITH_DATE = /^\s*\d{1,2}[/\-.\s]\d{1,2}[/\-.\s]\d{2,4}/;
  const IS_ROW_NUMBER    = /^\s*\d{1,6}\s*$/;

  // Group lines into [anchor-line, ...continuation-lines]
  const groups: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (IS_ROW_NUMBER.test(line))         continue; // skip spreadsheet row numbers
    if (STARTS_WITH_DATE.test(line))      groups.push([line]);
    else if (line.trim() && groups.length) groups[groups.length - 1].push(line);
  }

  return groups.map((group, idx) => {
    const cols = group[0].split("\t");
    const [rawDate = "", rawTeam = "", rawStart = "", rawEnd = "", rawLocation = "", rawNotes = "", rawPax = ""] = cols;

    // Any continuation lines become extra lines appended to notes
    const extra = group.slice(1).map((l) => l.trim()).filter(Boolean).join("\n");
    const fullNotes = [rawNotes.trim(), extra].filter(Boolean).join("\n");
    const inferred = cols.length === 6 ? splitTrailingPax(fullNotes) : { notes: fullNotes, paxRaw: "" };
    const effectivePaxRaw = rawPax.trim() || inferred.paxRaw;
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
      notes: inferred.notes,
      pax: normalizePax(effectivePaxRaw),
      paxRaw: effectivePaxRaw,
      activityTypeId: defaultActivityTypeId,
      activityGroupId: defaultGroupId,
      billingParty: null,
    };
  });
}

function copyEntriesToPendingRows(
  entries: DprTimesheetEntry[],
  sourceDprDate: string,
  destinationDprDate: string,
): PendingRow[] {
  const sourceOvernightDate = addIsoDays(sourceDprDate, 1);
  const destinationOvernightDate = addIsoDays(destinationDprDate, 1);

  return entries.map((entry, index) => {
    const sourceCalendarDate = entry.date.slice(0, 10);
    const isOvernight = sourceCalendarDate === sourceOvernightDate;
    const destinationCalendarDate = isOvernight && destinationOvernightDate
      ? destinationOvernightDate
      : destinationDprDate;

    return {
      key: `${Date.now()}-copy-${index}`,
      date: destinationCalendarDate,
      dateRaw: formatDateAsDmy(destinationCalendarDate),
      teamId: entry.teamId ?? null,
      teamRaw: entry.team?.name ?? "",
      startTime: entry.startTime ?? "",
      endTime: entry.endTime ?? "",
      locationId: entry.locationId ?? null,
      locationRaw: entry.location?.name ?? "",
      notes: entry.notes ?? "",
      pax: entry.pax ?? null,
      paxRaw: entry.pax ? String(entry.pax) : "",
      activityTypeId: entry.activityTypeId ?? null,
      activityGroupId: entry.activityGroupId ?? null,
      billingParty: entry.billingParty === "jdr" || entry.billingParty === "orsted" ? entry.billingParty : null,
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


// ─── Filter pills component ───────────────────────────────────────────────────
interface FilterPillsProps {
  teams: DprTeam[];
  activeDate: string | null;
  activeTeamId: number | null;
  onTeamClick: (id: number) => void;
  teamHoursMap: Map<string, Map<number, number>>;
  /** Team IDs that have at least one locked (captured/clarified) entry on the active date */
  teamLockedSet: Set<number>;
}

function FilterPills({ teams, activeDate, activeTeamId, onTeamClick, teamHoursMap, teamLockedSet }: FilterPillsProps) {
  // Team status for active date
  const activeDm = activeDate ? (teamHoursMap.get(activeDate) ?? new Map<number, number>()) : null;

  const renderPill = (team: DprTeam) => {
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
          "shrink-0 rounded border px-2 py-0.5 text-[11px] font-medium transition-colors",
          isActive
            ? "border-primary bg-primary text-primary-foreground"
            : hasStatus
              ? cn("bg-transparent hover:bg-muted/40", STATUS_BORDER[status], "text-muted-foreground hover:text-foreground")
              : "border bg-transparent text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
        )}
      >
        {team.name}
      </button>
    );
  };

  return (
    <div className="shrink-0 overflow-x-auto overscroll-contain border-b border-border bg-muted/10 px-3 py-1">
      <div className="flex min-w-max items-center gap-1.5">
        <span className="mr-1 shrink-0 text-[11px] font-medium text-muted-foreground">Team filter</span>
        {teams.length > 0
          ? teams.map(renderPill)
          : <span className="text-[11px] text-muted-foreground italic">No teams available</span>}
        {activeDm !== null && teamLockedSet.size > 0 && (
          <span className="ml-1 text-[10px] text-muted-foreground/60">locked teams use green status borders</span>
        )}
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

// ─── WhatsApp Capture Panel ───────────────────────────────────────────────────

interface WhatsAppRow {
  rowIndex: number;
  date: string; team: string; start: string; end: string;
  location: string; notes: string; rowHash: string;
  stage: "draft" | "captured" | "clarified" | null;
}

function WhatsAppCapturePanel({
  teams, locations, activeDate, onSendToCapture,
}: {
  teams: DprTeam[];
  locations: DprLocation[];
  activeDate: string | null;
  onSendToCapture: (rows: WhatsAppRow[]) => void;
}) {
  const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set());
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  // Clear selection whenever the active date changes
  useEffect(() => { setSelectedHashes(new Set()); }, [activeDate]);

  // Each date gets its own cache slot — switching dates naturally shows the "Load rows" state
  // until the user fetches. The server filters by date so client-side normalisation isn't needed.
  const dateParam = activeDate ? `?date=${activeDate}` : "";
  const { data: rows = [], isFetching, refetch, error } = useQuery<WhatsAppRow[]>({
    queryKey: ["/api/dpr/whatsapp-rows", activeDate ?? "all"],
    queryFn: () =>
      fetch(`/api/dpr/whatsapp-rows${dateParam}`, { credentials: "include" }).then(async (r) => {
        if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Failed to fetch"); }
        return r.json();
      }),
    staleTime: Infinity,  // never auto-refresh — fetch is manual only
    enabled: false,
  });

  const unimported = rows.filter((r) => !r.stage);
  const allSelected = unimported.length > 0 && unimported.every((r) => selectedHashes.has(r.rowHash));
  const someSelected = unimported.some((r) => selectedHashes.has(r.rowHash));

  function toggleRow(hash: string) {
    setSelectedHashes((prev) => { const next = new Set(prev); next.has(hash) ? next.delete(hash) : next.add(hash); return next; });
  }
  function toggleAll() {
    setSelectedHashes(allSelected ? new Set() : new Set(unimported.map((r) => r.rowHash)));
  }
  async function handleRefresh() {
    await refetch();
    setLastFetched(new Date());
  }
  function handleSendSelected() {
    const selected = rows.filter((r) => selectedHashes.has(r.rowHash));
    onSendToCapture(selected);
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      {/* Action bar */}
      <div className="shrink-0 px-4 sm:px-6 py-2.5 border-b border-border bg-muted/20 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">WhatsApp Bot Submissions</span>
          {rows.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {unimported.length} unimported · {rows.length - unimported.length} done
            </span>
          )}
        </div>
        {lastFetched && (
          <span className="text-[11px] text-muted-foreground/60 hidden sm:inline">
            Last fetched {lastFetched.toLocaleTimeString()}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {someSelected && (
            <Button size="sm" className="h-7 text-xs gap-1.5" onClick={handleSendSelected}>
              <ClipboardPaste className="w-3 h-3" />
              Review & Import ({selectedHashes.size})
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handleRefresh} disabled={isFetching}>
            {isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {rows.length === 0 && !isFetching ? "Load rows" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Table / states */}
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-8 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive/60" />
            <p className="text-sm font-medium">{(error as Error).message}</p>
            <p className="text-xs text-muted-foreground/60">
              Make sure <code className="bg-muted rounded px-1">GOOGLE_SERVICE_ACCOUNT_JSON</code> is configured and the sheet is shared with the service account.
            </p>
            <Button variant="outline" size="sm" onClick={handleRefresh}>Try again</Button>
          </div>
        ) : isFetching ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-8 text-center">
            <MessageSquare className="w-10 h-10 opacity-20" />
            <p className="text-sm">Click <strong>Load rows</strong> to fetch the latest bot submissions from Google Sheets.</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background border-b border-border">
              <TableRow>
                <TableHead className="w-10">
                  <button type="button" onClick={toggleAll} className="flex items-center justify-center text-muted-foreground hover:text-primary transition-colors">
                    {allSelected ? <CheckCheck className="w-4 h-4 text-primary" /> : someSelected ? <Minus className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                  </button>
                </TableHead>
                <TableHead className="whitespace-nowrap">Date</TableHead>
                <TableHead>Team</TableHead>
                <TableHead className="whitespace-nowrap">Start</TableHead>
                <TableHead className="whitespace-nowrap">End</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right w-24">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const selected = selectedHashes.has(row.rowHash);
                const teamMatched = teams.some((t) => t.name.trim().toLowerCase() === row.team.trim().toLowerCase());
                const locationMatched = locations.some((l) => l.name.trim().toLowerCase() === row.location.trim().toLowerCase());
                return (
                  <TableRow
                    key={row.rowIndex}
                    className={cn("transition-colors", !row.stage && "cursor-pointer", selected && "bg-primary/5", row.stage && "opacity-60")}
                    onClick={() => !row.stage && toggleRow(row.rowHash)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {row.stage
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                        : <Checkbox checked={selected} onCheckedChange={() => toggleRow(row.rowHash)} />
                      }
                    </TableCell>
                    <TableCell className="text-sm font-mono whitespace-nowrap">{row.date}</TableCell>
                    <TableCell>
                      <span className={cn("text-sm", row.team && !teamMatched && "text-amber-600 font-medium")}>
                        {row.team || <span className="text-muted-foreground/40 italic text-xs">—</span>}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm font-mono">{row.start}</TableCell>
                    <TableCell className="text-sm font-mono">{row.end}</TableCell>
                    <TableCell>
                      <span className={cn("text-sm", row.location && !locationMatched && "text-amber-600 font-medium")}>
                        {row.location || <span className="text-muted-foreground/40 italic text-xs">—</span>}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm max-w-[240px] truncate text-muted-foreground">{row.notes}</TableCell>
                    <TableCell className="text-right">
                      {row.stage === "draft"     && <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-200">In Draft</Badge>}
                      {row.stage === "captured"  && <Badge variant="secondary" className="text-[10px] bg-blue-500/10 text-blue-700 border-blue-200">In Clarify</Badge>}
                      {row.stage === "clarified" && <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-200">Clarified</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Unmatched warning */}
      {rows.some((r) => !r.stage && r.team && !teams.some((t) => t.name.trim().toLowerCase() === r.team.trim().toLowerCase())) && (
        <div className="shrink-0 px-4 py-2 border-t border-border bg-amber-500/5 flex items-center gap-2 text-xs text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Amber team/location names don't match any record — they'll be left blank on import for you to fill in.
        </div>
      )}
    </div>
  );
}

export default function CapturePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const activityRequestVersionRef = useRef(new Map<number, number>());
  const [activityOverrides, setActivityOverrides] = useState<Record<number, ActivitySelection>>({});

  // Load draft + captured entries (clarified are handled by the Clarify page)
  const { data: entries = [], isLoading: loadingEntries } = useListDprTimesheetEntries({});
  const { data: teams = [] } = useListDprTeams();
  const { data: locations = [] } = useListDprLocations();

  // Fetch which teams are selected for the active date (set via Team Setup)
  const { activeDate: activeDateForVisible } = useCaptureNav();
  const { data: visibleTeamsData } = useQuery<{ teamIds: number[] }>({
    queryKey: ["/api/dpr/roster-visible-teams", activeDateForVisible],
    queryFn: ({ signal }) =>
      fetch(`/api/dpr/roster-visible-teams?date=${activeDateForVisible}`, { signal }).then((r) => r.json()),
    enabled: !!activeDateForVisible,
  });

  // When a date is selected and has a saved team selection, restrict to those teams only
  const visibleTeams = useMemo(() => {
    if (!activeDateForVisible) return teams;
    const ids = visibleTeamsData?.teamIds;
    if (!ids || ids.length === 0) return teams;
    const idSet = new Set(ids);
    return teams.filter((t) => idSet.has(t.id));
  }, [teams, activeDateForVisible, visibleTeamsData]);

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

  // All active entries (draft + captured) sorted; clarified are handled by the Clarify page
  const sortedEntries = useMemo(
    () =>
      [...entries.filter((e) => e.stage !== "clarified")].sort((a, b) =>
        compareDprRows(
          { date: a.date, startTime: a.startTime, teamName: a.team?.name },
          { date: b.date, startTime: b.startTime, teamName: b.team?.name },
        )
      ),
    [entries]
  );

  // Only draft entries — editable rows
  const draftEntries = useMemo(
    () => sortedEntries.filter((e) => e.stage === "draft"),
    [sortedEntries]
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
          { queryKey: getListDprTimesheetEntriesQueryKey() },
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

  const quickTypeMutation = useMutation({
    mutationFn: ({ id, data }: ActivityUpdateRequest) => updateDprTimesheetEntry(id, data),
    onMutate: async ({ id, selection }) => {
      await queryClient.cancelQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
      const snapshot = snapshotEntries();
      queryClient.setQueriesData<DprTimesheetEntry[]>(
        { queryKey: getListDprTimesheetEntriesQueryKey() },
        (old) => old?.map((entry) => (
          entry.id === id ? { ...entry, ...selection } : entry
        ))
      );
      return { snapshot };
    },
    onSuccess: (updated, request) => {
      if (activityRequestVersionRef.current.get(request.id) !== request.version) return;
      patchEntry(updated);
      setActivityOverrides((current) => {
        if (!current[request.id]) return current;
        const { [request.id]: _completed, ...remaining } = current;
        return remaining;
      });
    },
    onError: (err, request, context) => {
      if (activityRequestVersionRef.current.get(request.id) !== request.version) return;
      if (context?.snapshot) restoreEntries(context.snapshot);
      setActivityOverrides((current) => {
        if (!current[request.id]) return current;
        const { [request.id]: _failed, ...remaining } = current;
        return remaining;
      });
      toast({ title: "Failed to set Activity Type", description: err.message, variant: "destructive" });
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

  // Lock all draft entries for the active team+date → captured
  const [captureTab, setCaptureTab] = useState<"timesheet" | "whatsapp">("timesheet");
  const [isLocking, setIsLocking] = useState(false);
  const handleLock = async () => {
    if (!activeDate || !activeTeamId || filteredEntries.length === 0) return;
    setIsLocking(true);
    // Optimistic: move matching draft entries to captured in the cache
    const snapshot = snapshotEntries();
    queryClient.setQueriesData<DprTimesheetEntry[]>(
      { queryKey: getListDprTimesheetEntriesQueryKey() },
      (old) => old?.map((e) =>
        e.stage === "draft" && e.teamId === activeTeamId && (e.shiftDate ?? e.date) === activeDate
          ? { ...e, stage: "captured" as const }
          : e
      )
    );
    try {
      const res = await fetch("/api/dpr/timesheet-entries/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: activeTeamId, date: activeDate }),
      });
      if (!res.ok) throw new Error(`Lock failed: ${res.status}`);
      const updated: DprTimesheetEntry[] = await res.json();
      // Patch cache with server data
      queryClient.setQueriesData<DprTimesheetEntry[]>(
        { queryKey: getListDprTimesheetEntriesQueryKey() },
        (old) => {
          if (!old) return old;
          const byId = new Map(updated.map((e) => [e.id, e]));
          return old.map((e) => byId.get(e.id) ?? e);
        }
      );
      queryClient.invalidateQueries({ queryKey: getGetDprTimesheetSummaryQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["/api/dpr/timesheet-entries/date-summary"] });
      toast({ title: `${updated.length} row${updated.length !== 1 ? "s" : ""} locked`, description: "Sent to Clarify queue." });
    } catch (err) {
      restoreEntries(snapshot);
      toast({ title: "Lock failed", description: String(err), variant: "destructive" });
    } finally {
      setIsLocking(false);
    }
  };

  // ── UI state ──
  const [newRow, setNewRow] = useState<RowDraft | null>(null);
  const [newRowErrors, setNewRowErrors] = useState<Partial<Record<"teamId" | "startTime" | "endTime" | "locationId" | "pax", string>>>({});
  // Per-cell inline editing — tracks which cell is active and its current typed value
  const [editingCell, setEditingCell] = useState<{ entryId: number; field: string } | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  // Tracks cells that failed to autosave (shows red ring until next successful edit)
  const [failedCell, setFailedCell] = useState<{ entryId: number; field: string } | null>(null);
  const lastSavedCellRef = useRef<{ entryId: number; field: string } | null>(null);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [isSavingToGoogleSheet, setIsSavingToGoogleSheet] = useState(false);
  const [lautecDialogOpen, setLautecDialogOpen] = useState(false);
  const [lautecPreview, setLautecPreview] = useState<LautecImportPreview | null>(null);
  const [lautecRunId, setLautecRunId] = useState<number | null>(null);
  const [lautecError, setLautecError] = useState<string | null>(null);
  const [confirmLautecResend, setConfirmLautecResend] = useState(false);
  const [confirmLautecUncertain, setConfirmLautecUncertain] = useState(false);
  const [requiresLautecUncertainConfirmation, setRequiresLautecUncertainConfirmation] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteShiftDate, setPasteShiftDate] = useState<string>("");
  const [pendingRows, setPendingRows] = useState<PendingRow[] | null>(null);
  const [copySourcePickerOpen, setCopySourcePickerOpen] = useState(false);
  const [copySourceDate, setCopySourceDate] = useState("");
  const [pendingCopy, setPendingCopy] = useState<PendingCopy | null>(null);
  // Team keys hidden from the copied-review grid. An empty list means all
  // teams are selected, which keeps every copied activity visible by default.
  const [copyExcludedTeamKeys, setCopyExcludedTeamKeys] = useState<string[]>([]);
  const [copySourceStatus, setCopySourceStatus] = useState<{
    tone: "loading" | "success" | "warning" | "error";
    message: string;
  } | null>(null);
  const [isSavingBulk, setIsSavingBulk] = useState(false);
  const [highlightEntryId, setHighlightEntryId] = useState<number | null>(null);
  const pasteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingRowsRef = useRef<PendingRow[] | null>(null);
  const pasteShiftDateRef = useRef("");
  const copySourceSelectionRef = useRef<string | null>(null);

  useEffect(() => {
    pendingRowsRef.current = pendingRows;
  }, [pendingRows]);

  useEffect(() => {
    pasteShiftDateRef.current = pasteShiftDate;
  }, [pasteShiftDate]);

  const copyDprEntriesMutation = useMutation({
    mutationFn: ({ sourceDate }: { sourceDate: string }) =>
      listDprTimesheetEntries({ dprDate: sourceDate }),
    onSuccess: (sourceEntries, { sourceDate }) => {
      if (copySourceSelectionRef.current !== sourceDate) return;

      const destinationDprDate = normalizeIsoDate(pasteShiftDateRef.current);
      if (!destinationDprDate) {
        setCopySourceStatus({
          tone: "error",
          message: "Choose a valid DPR for Date before copying activity reports.",
        });
        return;
      }

      const copiedRows = copyEntriesToPendingRows(sourceEntries, sourceDate, destinationDprDate);
      if (copiedRows.length === 0) {
        setCopySourceStatus({
          tone: "warning",
          message: `No activity reports were found for ${formatDateAsDmy(sourceDate)}.`,
        });
        return;
      }

      if (pendingRowsRef.current?.length) {
        setPendingCopy({ sourceDate, rows: copiedRows });
        setCopySourceStatus({
          tone: "warning",
          message: `${copiedRows.length} row${copiedRows.length === 1 ? "" : "s"} found. Choose whether to add or replace the current grid.`,
        });
        return;
      }

      setPasteText("");
      setPendingRows(copiedRows);
      setCopySourceStatus({
        tone: "success",
        message: `${copiedRows.length} activity report${copiedRows.length === 1 ? "" : "s"} copied from ${formatDateAsDmy(sourceDate)}. Review the rows before saving.`,
      });
    },
    onError: (error, { sourceDate }) => {
      if (copySourceSelectionRef.current !== sourceDate) return;
      setCopySourceStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not load activity reports for that DPR date.",
      });
    },
  });

  // Date / team filter — sourced from shared sidebar context so the sidebar date
  // list and this page stay in sync.
  const { activeDate, setActiveDate, activeTeamId, setActiveTeamId } = useCaptureNav();
  const previewLautecMutation = usePreviewDprLautecImport();
  const startLautecMutation = useStartDprLautecImport();
  const lautecRunQuery = useGetDprLautecImport(lautecRunId ?? 0, {
    query: {
      queryKey: ["dpr", "lautec-import-run", lautecRunId ?? 0],
      enabled: lautecRunId !== null,
      refetchInterval: lautecRunId !== null ? 2000 : false,
      refetchOnWindowFocus: true,
    },
  });
  const activeTeamName = activeTeamId === null
    ? null
    : teams.find((team) => team.id === activeTeamId)?.name ?? `Team ${activeTeamId}`;
  const lautecRunStatus = lautecRunQuery.data?.status;
  const isLautecSyncing = startLautecMutation.isPending || lautecRunStatus === "running" || lautecRunStatus === "submitting";
  const lautecProgress = useMemo(() => {
    const sourceState: LautecProgressState =
      lautecError && !lautecPreview ? "error" : previewLautecMutation.isPending ? "active" : lautecPreview ? "complete" : "waiting";
    const browserState: LautecProgressState =
      lautecRunStatus === "success" || lautecRunStatus === "submitting" ? "complete"
        : lautecRunStatus === "running" || startLautecMutation.isPending ? "active"
          : lautecRunStatus === "failed" || lautecRunStatus === "interrupted" || lautecRunStatus === "uncertain" ? "error" : "waiting";
    const submitState: LautecProgressState =
      lautecRunStatus === "success" ? "complete"
        : lautecRunStatus === "submitting" ? "active"
          : lautecRunStatus === "failed" || lautecRunStatus === "interrupted" || lautecRunStatus === "uncertain" ? "error" : "waiting";
    const savedState: LautecProgressState =
      lautecRunStatus === "success" ? "complete"
        : lautecRunStatus === "failed" || lautecRunStatus === "interrupted" || lautecRunStatus === "uncertain" ? "error" : "waiting";
    return [
      {
        label: "Check Capture rows",
        detail: lautecPreview ? `${lautecPreview.rowCount} row${lautecPreview.rowCount === 1 ? "" : "s"} ready from the date tab` : "Read the selected date and team from Google Sheets",
        state: sourceState,
      },
      {
        label: "Fill and verify Lautec",
        detail: "Open the visible Import Data form and check every value",
        state: browserState,
      },
      {
        label: "Submit to Lautec",
        detail: "Send the verified grid with PAX left blank",
        state: submitState,
      },
      {
        label: "Confirm saved",
        detail: "Wait for Lautec’s visible completion confirmation",
        state: savedState,
      },
    ];
  }, [lautecError, lautecPreview, lautecRunStatus, previewLautecMutation.isPending, startLautecMutation.isPending]);

  // Auto-select first visible team when teams load (date defaults to today via context)
  const defaultsApplied = useRef(false);

  // On mount: read URL params so the activity log can link directly to a date/entry
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get("date");
    const highlightParam = params.get("highlight");
    if (dateParam) {
      setActiveDate(dateParam);
      defaultsApplied.current = true; // prevent auto-team-select so all teams remain visible
      setActiveTeamId(null);
    }
    if (highlightParam) {
      const id = parseInt(highlightParam, 10);
      if (!isNaN(id)) setHighlightEntryId(id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (defaultsApplied.current) return;
    if (visibleTeams.length === 0) return;
    defaultsApplied.current = true;
    setActiveTeamId(visibleTeams[0].id);
  }, [visibleTeams, setActiveTeamId]);

  // Clear selection whenever filters change so the bulk toolbar stays accurate
  useEffect(() => { setSelectedIds(new Set()); }, [activeDate, activeTeamId]);

  // Scroll to and highlight an entry linked from the activity log
  useEffect(() => {
    if (!highlightEntryId || loadingEntries) return;
    const el = document.getElementById(`entry-${highlightEntryId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = setTimeout(() => setHighlightEntryId(null), 3000);
    return () => clearTimeout(timer);
  }, [highlightEntryId, loadingEntries]);

  const handleTeamClick = (id: number) =>
    setActiveTeamId(activeTeamId === id ? null : id);

  const filteredEntries = useMemo(
    () =>
      draftEntries.filter((e) => {
        if (activeDate && (e.shiftDate ?? e.date) !== activeDate) return false;
        if (activeTeamId !== null && e.teamId !== activeTeamId) return false;
        return true;
      }),
    [draftEntries, activeDate, activeTeamId]
  );

  // Captured (locked) entries matching the current date+team filter
  const filteredLockedEntries = useMemo(
    () =>
      sortedEntries.filter((e) => {
        if (e.stage !== "captured") return false;
        if (activeDate && (e.shiftDate ?? e.date) !== activeDate) return false;
        if (activeTeamId !== null && e.teamId !== activeTeamId) return false;
        return true;
      }),
    [sortedEntries, activeDate, activeTeamId]
  );

  // When a shift date is active and entries span more than one raw calendar date
  // (e.g. overnight: some entries date=27th, some date=28th) surface that range.
  const calendarDateSpan = useMemo(() => {
    if (!activeDate) return null;
    const allVisible = [...filteredEntries, ...filteredLockedEntries];
    const dates = [...new Set(allVisible.map((e) => e.date))].sort();
    if (dates.length < 2) return null;
    const fmt = (d: string) => { try { return format(parseISO(d), "d MMM"); } catch { return d; } };
    return { from: fmt(dates[0]), to: fmt(dates[dates.length - 1]), count: dates.length };
  }, [activeDate, filteredEntries, filteredLockedEntries]);

  // Hours per team per date — drives filter pill border colours
  // Uses shiftDate when set so overnight shifts group under their start date.
  const teamHoursMap = useMemo(() => {
    const map = new Map<string, Map<number, number>>();
    for (const e of sortedEntries) {
      if (!e.teamId) continue;
      const h = hoursForEntry(e.startTime, e.endTime);
      const d = e.shiftDate ?? e.date;
      if (!map.has(d)) map.set(d, new Map());
      const dm = map.get(d)!;
      dm.set(e.teamId, (dm.get(e.teamId) ?? 0) + h);
    }
    return map;
  }, [sortedEntries]);

  // Team IDs with at least one locked (captured/clarified) entry per date — drives To Do / Done split
  const teamLockedMap = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const e of sortedEntries) {
      if (e.stage !== "captured" && e.stage !== "clarified") continue;
      if (!e.teamId) continue;
      const d = (e.shiftDate ?? e.date) as string;
      if (!map.has(d)) map.set(d, new Set());
      map.get(d)!.add(e.teamId);
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

  // ── CSV export ──
  const handleExportCsv = () => {
    const entries = [...filteredEntries, ...filteredLockedEntries];
    const csv = buildLautecCsv(entries, { teams, activityGroups, activities: [] });
    const datePart = activeDate ?? "all";
    downloadCsv(`DPR_Capture_${datePart}.csv`, csv);
  };

  const handleSaveToGoogleSheet = async () => {
    const visibleEntries = [...filteredEntries, ...filteredLockedEntries];
    if (visibleEntries.length === 0) {
      toast({ title: "No Capture rows to save", variant: "destructive" });
      return;
    }

    setIsSavingToGoogleSheet(true);
    try {
      const response = await fetch("/api/dpr/timesheet-entries/save-to-google-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ entryIds: visibleEntries.map((entry) => entry.id) }),
      });
      const result = await response.json().catch(() => ({ error: "Could not save Capture rows to Google Sheets." }));
      if (!response.ok) throw new Error(result.error ?? "Could not save Capture rows to Google Sheets.");

      const appended = Number(result.appended ?? visibleEntries.length);
      toast({
        title: `${appended} Capture row${appended === 1 ? "" : "s"} synced to Google Sheet`,
        description: "Each date-specific Capture tab was refreshed without adding duplicates.",
      });
    } catch (err) {
      toast({
        title: "Google Sheet save failed",
        description: err instanceof Error ? err.message : "Could not save Capture rows to Google Sheets.",
        variant: "destructive",
      });
    } finally {
      setIsSavingToGoogleSheet(false);
    }
  };

  const lautecErrorMessage = (error: unknown) => {
    if (error && typeof error === "object") {
      const apiError = error as { data?: { error?: string }; message?: string };
      return apiError.data?.error ?? apiError.message ?? "The Lautec import could not be started.";
    }
    return "The Lautec import could not be started.";
  };

  const handlePreviewLautecImport = () => {
    if (!activeDate || !activeTeamId) {
      toast({ title: "Select one Capture date and team first", variant: "destructive" });
      return;
    }
    setLautecDialogOpen(true);
    setLautecPreview(null);
    setLautecRunId(null);
    setLautecError(null);
    setConfirmLautecResend(false);
    setConfirmLautecUncertain(false);
    setRequiresLautecUncertainConfirmation(false);
    previewLautecMutation.mutate(
      { data: { date: activeDate, teamId: activeTeamId } },
      {
        onSuccess: (preview) => setLautecPreview(preview),
        onError: (error) => setLautecError(lautecErrorMessage(error)),
      },
    );
  };

  const handleStartLautecImport = () => {
    if (!lautecPreview) return;
    setLautecError(null);
    startLautecMutation.mutate(
      {
        data: {
          date: lautecPreview.date,
          teamId: lautecPreview.teamId,
          snapshotHash: lautecPreview.snapshotHash,
          confirmResend: confirmLautecResend,
          confirmUncertain: confirmLautecUncertain,
        },
      },
      {
        onSuccess: (run) => {
          setLautecRunId(run.id);
          queryClient.invalidateQueries({ queryKey: ["/api/dpr/lautec-imports"] });
        },
        onError: (error) => {
          const message = lautecErrorMessage(error);
          setLautecError(message);
          const apiError = error as { status?: number; data?: { code?: string } };
          if (apiError.status === 409) {
            if (apiError.data?.code === "uncertain_submission") {
              setRequiresLautecUncertainConfirmation(true);
            } else {
              setConfirmLautecResend(true);
            }
          }
        },
      },
    );
  };

  const closeLautecDialog = () => {
    if (lautecRunQuery.data?.status === "running" || lautecRunQuery.data?.status === "submitting" || startLautecMutation.isPending) return;
    setLautecDialogOpen(false);
    setLautecPreview(null);
    setLautecRunId(null);
    setLautecError(null);
    setConfirmLautecResend(false);
    setConfirmLautecUncertain(false);
    setRequiresLautecUncertainConfirmation(false);
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
    const errors: Partial<Record<"teamId" | "startTime" | "endTime" | "locationId" | "pax", string>> = {};
    if (!newRow.teamId) errors.teamId = "Team is required";
    if (!newRow.startTime) errors.startTime = "Start time is required";
    else { const e = validate48hTime(newRow.startTime); if (e) errors.startTime = e; }
    if (!newRow.endTime) errors.endTime = "End time is required";
    else { const e = validate48hTime(newRow.endTime); if (e) errors.endTime = e; }
    if (!newRow.locationId) errors.locationId = "Location is required";
    if (newRow.paxRaw.trim() && newRow.pax === null) errors.pax = "PAX must be a positive whole number";
    if (Object.keys(errors).length) { setNewRowErrors(errors); return; }
    setNewRowErrors({});
    createMutation.mutate(
      { data: { date: newRow.date, shiftDate: activeDate ?? newRow.date, teamId: newRow.teamId || undefined, startTime: newRow.startTime || undefined, endTime: newRow.endTime || undefined, locationId: newRow.locationId || undefined, notes: newRow.notes || undefined, pax: newRow.pax ?? undefined, activityTypeId: newRow.activityTypeId || undefined, activityGroupId: newRow.activityGroupId || undefined, billingParty: newRow.billingParty || undefined } },
      { onSuccess: () => { toast({ title: "Entry created" }); setNewRow(null); setNewRowErrors({}); } }
    );
  };

  const buildUpdatePayload = (draft: Partial<DprTimesheetEntry>) => ({
    date: draft.date,
    shiftDate: draft.shiftDate ?? null,
    teamId: draft.teamId || null,
    startTime: draft.startTime || null,
    endTime: draft.endTime || null,
    locationId: draft.locationId || null,
    notes: draft.notes || null,
    pax: draft.pax ?? null,
    activityTypeId: draft.activityTypeId || null,
    activityGroupId: draft.activityGroupId ?? null,
    billingParty: draft.billingParty ?? null,
  });

  const saveActivitySelection = (entry: DprTimesheetEntry, selection: ActivitySelection) => {
    if (entry.id < 0 || activityOverrides[entry.id]) return;
    const version = (activityRequestVersionRef.current.get(entry.id) ?? 0) + 1;
    activityRequestVersionRef.current.set(entry.id, version);
    setActivityOverrides((current) => ({ ...current, [entry.id]: selection }));
    quickTypeMutation.mutate({
      id: entry.id,
      data: buildUpdatePayload({ ...entry, ...selection }),
      selection,
      version,
    });
  };

  const handleQuickSetType = (entry: DprTimesheetEntry, activityTypeId: number) => {
    saveActivitySelection(entry, {
      activityTypeId,
      activityGroupId: entry.activityGroupId ?? null,
    });
  };

  const handleQuickSetGroup = (entry: DprTimesheetEntry, activityGroupId: number) => {
    saveActivitySelection(entry, {
      activityTypeId: entry.activityTypeId ?? null,
      activityGroupId,
    });
  };

  // ── Per-cell inline editing helpers ──────────────────────────────────────────
  const saveCell = (entryId: number, field: string, value: string) => {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    const editedDate = field === "date" ? normalizeDmyOrIsoDate(value) : null;
    // Validate time fields before saving
    if ((field === "startTime" || field === "endTime") && value) {
      const err = validate48hTime(value);
      if (err) {
        toast({ title: `Invalid ${field === "startTime" ? "start" : "end"} time`, description: err, variant: "destructive" });
        setFailedCell({ entryId, field });
        return;
      }
    }
    if (field === "pax" && value.trim() && normalizePax(value) === null) {
      toast({ title: "Invalid PAX", description: "Enter a positive whole number or leave it blank.", variant: "destructive" });
      setFailedCell({ entryId, field });
      return;
    }
    if (field === "date" && value) {
      const dprDate =
        normalizeIsoDate(activeDate ?? "")
        ?? normalizeIsoDate(entry.shiftDate ?? "")
        ?? normalizeIsoDate(entry.date);
      const overnightDate = dprDate ? addIsoDays(dprDate, 1) : null;
      if (!editedDate || !dprDate || (editedDate !== dprDate && editedDate !== overnightDate)) {
        toast({
          title: "Pasted date is outside the DPR window.",
          description: dprDate
            ? `Rows must be dated ${formatDateAsDmyHyphen(dprDate)} or ${formatDateAsDmyHyphen(overnightDate ?? "")}.`
            : "Choose a valid DPR date before editing the calendar date.",
          variant: "destructive",
        });
        setFailedCell({ entryId, field });
        return;
      }
    }
    const patch: Partial<DprTimesheetEntry> = {};
    if (field === "startTime") patch.startTime = value || undefined;
    else if (field === "endTime") patch.endTime = value || undefined;
    else if (field === "notes") patch.notes = value || undefined;
    else if (field === "date") patch.date = editedDate ?? entry.date;
    else if (field === "shiftDate") patch.shiftDate = normalizeDmyOrIsoDate(value) ?? entry.date; // fall back to raw date if cleared
    else if (field === "teamId") patch.teamId = value ? parseInt(value) : null;
    else if (field === "pax") patch.pax = value.trim() ? normalizePax(value) : null;
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

  const openPasteDialog = () => {
    setPasteShiftDate(activeDate ?? "");
    setCopySourcePickerOpen(false);
    setCopySourceDate("");
    setPendingCopy(null);
    setCopyExcludedTeamKeys([]);
    setCopySourceStatus(null);
    copySourceSelectionRef.current = null;
    setPasteOpen(true);
  };

  const updatePendingRow = (key: string, patch: Partial<PendingRow>) =>
    setPendingRows((rows) => rows?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? null);

  const removePendingRow = (key: string) =>
    setPendingRows((rows) => rows?.filter((r) => r.key !== key) ?? null);

  const applyPendingCopy = (action: "append" | "replace") => {
    if (!pendingCopy) return;
    const count = pendingCopy.rows.length;
    setPasteText("");
    setPendingRows((rows) => action === "append" && rows?.length ? [...rows, ...pendingCopy.rows] : pendingCopy.rows);
    setCopyExcludedTeamKeys([]);
    setPendingCopy(null);
    setCopySourceStatus({
      tone: "success",
      message: action === "append"
        ? `${count} activity report${count === 1 ? "" : "s"} added from ${formatDateAsDmy(pendingCopy.sourceDate)}. Review the combined grid before saving.`
        : `${count} activity report${count === 1 ? "" : "s"} replaced the grid from ${formatDateAsDmy(pendingCopy.sourceDate)}. Review the rows before saving.`,
    });
  };

  const handleCopySourceDateChange = (value: string) => {
    const normalizedValue = normalizeDate(value) ?? value;
    setCopySourceDate(normalizedValue);
    copySourceSelectionRef.current = normalizeIsoDate(normalizedValue) ? normalizedValue : null;
    setPendingCopy(null);
    setCopyExcludedTeamKeys([]);
    setCopySourceStatus(null);
    if (!normalizedValue) return;

    const sourceDate = normalizeIsoDate(normalizedValue);
    const destinationDate = normalizeIsoDate(pasteShiftDate);
    if (!sourceDate || !destinationDate) {
      setCopySourceStatus({
        tone: "error",
        message: "Choose a valid DPR for Date before copying activity reports.",
      });
      return;
    }

    setCopySourceStatus({
      tone: "loading",
      message: `Loading activity reports from ${formatDateAsDmy(sourceDate)}…`,
    });
    copyDprEntriesMutation.mutate({ sourceDate });
  };

  const closePasteDialog = () => {
    setPasteOpen(false);
    setPasteText("");
    setPasteShiftDate("");
    setPendingRows(null);
    setCopySourcePickerOpen(false);
    setCopySourceDate("");
    setPendingCopy(null);
    setCopyExcludedTeamKeys([]);
    setCopySourceStatus(null);
    copySourceSelectionRef.current = null;
  };

  const handleSaveBulk = async () => {
    if (!pendingRows || pendingRows.length === 0) return;
    const normalizedShiftDate = pasteShiftDate.trim() ? normalizeIsoDate(pasteShiftDate) : null;
    if (!normalizedShiftDate) {
      toast({
        title: "Select a DPR date.",
        description: "Choose the DPR for Date before saving pasted rows.",
        variant: "destructive",
      });
      return;
    }
    const overnightDate = addIsoDays(normalizedShiftDate, 1);
    const invalidDateRows = pendingRows.filter(
      (row) => !!row.date && row.date !== normalizedShiftDate && row.date !== overnightDate,
    );
    if (invalidDateRows.length > 0) {
      toast({
        title: "Pasted date is outside the DPR window.",
        description: `Rows must be dated ${formatDateAsDmyHyphen(normalizedShiftDate)} or ${formatDateAsDmyHyphen(overnightDate ?? "")}.`,
        variant: "destructive",
      });
      return;
    }
    setIsSavingBulk(true);
    const rowsToSave = pendingRows.filter((row): row is PendingRow & { date: string } => !!row.date);
    const skipped = pendingRows.length - rowsToSave.length;
    // Both the selected DPR date and the following date are displayed under
    // the selected DPR date; the following date represents an overnight shift.
    const effectiveShiftDate = normalizedShiftDate;
    const results = await Promise.allSettled(
      rowsToSave.map((row) =>
        createMutation.mutateAsync({ data: { date: row.date, shiftDate: effectiveShiftDate ?? row.date, teamId: row.teamId || undefined, startTime: row.startTime || undefined, endTime: row.endTime || undefined, locationId: row.locationId || undefined, notes: row.notes || undefined, pax: row.pax ?? undefined, activityTypeId: row.activityTypeId || undefined, activityGroupId: row.activityGroupId || undefined, billingParty: row.billingParty || undefined } })
      )
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - succeeded + skipped;
    setIsSavingBulk(false);
    if (succeeded > 0) toast({ title: `${succeeded} row${succeeded === 1 ? "" : "s"} added`, description: failed > 0 ? `${failed} row(s) failed to save.` : undefined });
    else toast({ title: "No rows saved", variant: "destructive" });
    if (failed === 0) closePasteDialog();
  };

  const normalizedPasteDprDate = normalizeIsoDate(pasteShiftDate);
  const overnightPasteDate = normalizedPasteDprDate ? addIsoDays(normalizedPasteDprDate, 1) : null;
  const invalidPasteDateRows = pendingRows?.filter(
    (row) =>
      !!row.date
      && !!normalizedPasteDprDate
      && row.date !== normalizedPasteDprDate
      && row.date !== overnightPasteDate,
  ) ?? [];
  // Keep the copied-review layout active after the user excludes every row.
  // `pendingRows` remains an empty array in that state so the dialog can show
  // the empty review state instead of switching back to the paste flow.
  const isCopiedActivityReview = copySourceStatus?.tone === "success" && pendingRows !== null;
  const isCopyFlow = isCopiedActivityReview || copySourcePickerOpen;
  const copyTeamOptions = useMemo(() => {
    if (!isCopiedActivityReview || !pendingRows) return [];

    const teamOrder = new Map(teams.map((team, index) => [team.id, index]));
    const teamNameOrder = new Map(teams.map((team, index) => [team.name.trim().toLowerCase(), index]));
    const options = new Map<string, { key: string; label: string; count: number; order: number }>();
    for (const row of pendingRows) {
      const key = pendingRowTeamKey(row);
      const label = row.teamRaw.trim() || "Unassigned";
      const configuredOrder = row.teamId !== null
        ? teamOrder.get(row.teamId)
        : teamNameOrder.get(row.teamRaw.trim().toLowerCase());
      const existing = options.get(key);
      if (existing) existing.count += 1;
      else options.set(key, {
        key,
        label,
        count: 1,
        order: configuredOrder ?? Number.MAX_SAFE_INTEGER,
      });
    }
    return Array.from(options.values()).sort((a, b) =>
      a.order - b.order || a.label.localeCompare(b.label)
    );
  }, [isCopiedActivityReview, pendingRows, teams]);

  useEffect(() => {
    const availableKeys = new Set(copyTeamOptions.map((option) => option.key));
    setCopyExcludedTeamKeys((keys) => {
      const nextKeys = keys.filter((key) => availableKeys.has(key));
      return nextKeys.length === keys.length ? keys : nextKeys;
    });
  }, [copyTeamOptions]);

  const visiblePendingRows = useMemo(() => {
    if (!pendingRows || !isCopiedActivityReview || copyExcludedTeamKeys.length === 0) {
      return isCopiedActivityReview
        ? [...(pendingRows ?? [])].sort(compareCopiedRows)
        : (pendingRows ?? []);
    }
    const excluded = new Set(copyExcludedTeamKeys);
    return pendingRows
      .filter((row) => !excluded.has(pendingRowTeamKey(row)))
      .sort(compareCopiedRows);
  }, [pendingRows, isCopiedActivityReview, copyExcludedTeamKeys]);

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
    <TableRow className="h-8 hover:bg-transparent">
      {selectMode && (
        <TableHead className="w-[36px] text-center">
          <button type="button" onClick={toggleSelectAll} className="flex items-center justify-center text-muted-foreground hover:text-primary transition-colors">
            {allSelected
              ? <CheckCheck className="w-4 h-4 text-primary" />
              : someSelected
              ? <Minus className="w-4 h-4 text-primary" />
              : <Square className="w-4 h-4" />}
          </button>
        </TableHead>
      )}
      <TableHead className="text-center">#</TableHead>
      {showDateCol && <TableHead className={COL.date}>Date</TableHead>}
      {showTeamCol && <TableHead className={COL.team}>Team</TableHead>}
      <TableHead className="text-center">Status</TableHead>
      <TableHead className={COL.start}>Start</TableHead>
      <TableHead className={COL.end}>Finish</TableHead>
      <TableHead className="text-emerald-600">Duration</TableHead>
      <TableHead className={COL.location}>Location</TableHead>
      <TableHead className={COL.notes}>Comment</TableHead>
      <TableHead className="text-center">PAX</TableHead>
      <TableHead className={COL.group}>Activity Group</TableHead>
      <TableHead className={cn(COL.actions, "text-right")}>Actions</TableHead>
    </TableRow>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header */}
      <header className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border flex flex-wrap items-center justify-between gap-y-2 gap-x-3 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight">Timesheet Capture</h1>
          <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
            Click any cell to edit it directly, like a spreadsheet.
          </p>
        </div>
        {captureTab === "timesheet" && (
          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => selectMode ? exitSelectMode() : enterSelectMode()}
              className={cn("gap-1.5", selectMode && "border-primary bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary")}
            >
              <CheckSquare className="w-4 h-4" />
              <span className="hidden xs:inline">{selectMode ? "Cancel Select" : "Select"}</span>
            </Button>
             <Button variant="outline" size="sm" onClick={openPasteDialog} className="gap-1.5">
              <ClipboardPaste className="w-4 h-4" />
              <span className="hidden xs:inline">Paste Rows</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1.5">
              <Download className="w-4 h-4" />
              <span className="hidden xs:inline">Export CSV</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveToGoogleSheet}
              disabled={isSavingToGoogleSheet}
              className="gap-1.5"
            >
              {isSavingToGoogleSheet ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sheet className="w-4 h-4" />}
              <span className="hidden xs:inline">Save to Sheet</span>
            </Button>
            {isAdmin && (
              <Button
                variant="default"
                size="sm"
                onClick={handlePreviewLautecImport}
                disabled={!activeDate || !activeTeamId || previewLautecMutation.isPending}
                title={!activeDate || !activeTeamId ? "Select one Capture date and one team first" : `Sync ${activeTeamName ?? "the selected team"} on ${activeDate} to Lautec`}
                className="gap-1.5"
              >
                {previewLautecMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span className="hidden sm:inline">Sync to Lautec</span>
                {activeDate && activeTeamName && (
                  <span className="hidden 2xl:inline text-[11px] font-normal opacity-75">
                    {activeTeamName} · {format(parseISO(activeDate), "dd MMM")}
                  </span>
                )}
              </Button>
            )}
          </div>
        )}
      </header>

      {/* Tab bar */}
      <div className="flex shrink-0 overflow-x-auto border-b border-border bg-background px-4 sm:px-6">
        {(["timesheet", "whatsapp"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setCaptureTab(tab)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              captureTab === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab === "whatsapp" && <MessageSquare className="w-3.5 h-3.5" />}
            {tab === "timesheet" ? "Timesheet" : "WhatsApp"}
          </button>
        ))}
      </div>

      {captureTab === "whatsapp" ? (
        <WhatsAppCapturePanel
          teams={teams}
          locations={locations}
          activeDate={activeDate}
          onSendToCapture={(selectedRows) => {
            // Format as tab-separated text matching the paste dialog's column order:
            // Date, Team, Start, End, Location, Notes
            const tsv = selectedRows
              .map((r) => [formatDateAsDmy(r.date), r.team, r.start, r.end, r.location, r.notes].join("\t"))
              .join("\n");
            setPasteText(tsv);
            setPendingRows(parsePastedText(tsv, teams, locations, defaultActivityTypeId, defaultGroupId));
            setCaptureTab("timesheet");
            openPasteDialog();
          }}
        />
      ) : (
      <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Team filter pills */}
      <FilterPills
        teams={visibleTeams}
        activeDate={activeDate}
        activeTeamId={activeTeamId}
        onTeamClick={handleTeamClick}
        teamHoursMap={teamHoursMap}
        teamLockedSet={activeDate ? (teamLockedMap.get(activeDate) ?? new Set()) : new Set()}
      />

      {/* Context bar — bulk action bar when selectMode, normal context bar otherwise */}
      {selectMode ? (
        <div className="px-3 sm:px-4 py-1 border-b border-primary/30 bg-primary/5 flex flex-wrap items-center gap-x-3 gap-y-1 shrink-0">
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
          <div className="px-3 sm:px-4 py-1 border-b border-border bg-muted/10 flex flex-wrap items-center justify-between gap-y-1 gap-x-2 shrink-0">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            {activeDate || activeTeamId ? (
              <>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>Showing:</span>
                  {activeDate && (
                    <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/30 text-primary text-xs font-medium">
                      {(() => { try { return format(parseISO(activeDate), "dd-MM"); } catch { return activeDate; } })()}
                    </span>
                  )}
                  {activeDate && activeTeamId && <span className="text-muted-foreground/50">·</span>}
                  {activeTeamId && (
                    <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/30 text-primary text-xs font-medium">
                      {teams.find((t) => t.id === activeTeamId)?.name ?? `Team ${activeTeamId}`}
                    </span>
                  )}
                </div>
                {(filteredEntries.length > 0 || filteredLockedEntries.length > 0) && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="font-semibold text-emerald-500 tabular-nums">
                      {Math.floor(filteredTotalHours)}h {Math.round((filteredTotalHours % 1) * 60)}m
                    </span>
                    <span>· {filteredEntries.length} rows</span>
                    {filteredTotalHours < 12 && <span className="text-muted-foreground/60">/ 12h expected</span>}
                    {filteredTotalHours >= 12 && <span className="text-emerald-500/70">✓</span>}
                    {filteredLockedEntries.length > 0 && (
                      <span className="text-muted-foreground/50">· {filteredLockedEntries.length} locked</span>
                    )}
                    {calendarDateSpan && (
                      <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-medium" title={`This shift spans ${calendarDateSpan.count} calendar dates`}>
                        ⏱ {calendarDateSpan.from}–{calendarDateSpan.to}
                      </span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground/60 italic">Select a date and team above to filter</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {activeDate && activeTeamId && filteredEntries.length > 0 && (
              <Button
                size="sm"
                onClick={handleLock}
                disabled={isLocking}
                className="gap-1.5 h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-0"
              >
                {isLocking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                Lock for Clarify
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleAddRow}
              disabled={newRow !== null}
              title={newRow !== null ? "Finish or cancel the open row first" : undefined}
              className="gap-1.5 h-7 text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Row
              {(activeDate || activeTeamId) && (
                <span className="opacity-60 font-normal">
                  ↳ {activeDate ? (() => { try { return format(parseISO(activeDate), "dd-MM"); } catch { return activeDate; } })() : "all dates"}
                  {activeTeamId ? ` · ${teams.find((t) => t.id === activeTeamId)?.name ?? ""}` : ""}
                </span>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        {loadingEntries && sortedEntries.length === 0 && !newRow ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
           <div className="rounded-none border-0">
             <Table className="table-auto w-full min-w-max border-collapse text-xs [&_th]:h-8 [&_th]:border-r [&_th]:border-border/60 [&_th]:px-2 [&_th]:py-1 [&_th]:text-[11px] [&_th]:font-semibold [&_th]:text-muted-foreground [&_td]:border-r [&_td]:border-border/40 [&_td]:px-2 [&_td]:py-1">
              <TableHeader className="sticky top-0 z-10 bg-muted/30">
                <TableCols />
              </TableHeader>
              <TableBody>

                {/* ── New row form ── */}
                {newRow && (
                  <TableRow className="bg-primary/5 align-middle">
                    {selectMode && <TableCell className="w-[36px]" />}
                    <TableCell className="w-[36px]" />
                    {showDateCol && (
                      <TableCell className={COL.date}>
                        <DmyDateInput
                          value={newRow.date}
                          onChange={(value) => setNewRow({ ...newRow, date: normalizeDate(value) ?? "" })}
                          className="h-8 text-sm"
                          ariaLabel="Date"
                        />
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
                          <SelectContent>{visibleTeams.map((t) => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}</SelectContent>
                        </Select>
                        {newRowErrors.teamId && <p className="text-destructive text-[10px] mt-0.5 leading-tight">{newRowErrors.teamId}</p>}
                      </TableCell>
                    )}
                    <TableCell className="w-[44px]" />
                    <TableCell className={COL.start}>
                      <Input
                        type="text"
                        placeholder="HH:MM"
                        value={newRow.startTime}
                        onChange={(e) => { setNewRow({ ...newRow, startTime: e.target.value }); setNewRowErrors((e) => ({ ...e, startTime: undefined })); }}
                        onBlur={(e) => { const n = normalizeTime(e.target.value); if (n !== e.target.value) setNewRow((r) => r ? { ...r, startTime: n } : r); }}
                        className={cn("h-8 min-w-[72px] text-sm font-mono tabular-nums", newRowErrors.startTime && "border-destructive focus-visible:ring-destructive")}
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
                        className={cn("h-8 min-w-[72px] text-sm font-mono tabular-nums", newRowErrors.endTime && "border-destructive focus-visible:ring-destructive")}
                      />
                      {newRowErrors.endTime && <p className="text-destructive text-[10px] mt-0.5 leading-tight">{newRowErrors.endTime}</p>}
                    </TableCell>
                    <TableCell>
                      <span className={cn("whitespace-nowrap text-sm font-medium tabular-nums", formatDuration(newRow.startTime, newRow.endTime) !== "—" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/40")}>
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
                        className="h-8 min-w-0 text-sm"
                        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                      />
                    </TableCell>
                     <TableCell className="text-center">
                       <Input
                         type="text"
                         inputMode="numeric"
                         placeholder="—"
                         value={newRow.paxRaw}
                         onChange={(e) => {
                           const paxRaw = e.target.value;
                           setNewRow({ ...newRow, paxRaw, pax: normalizePax(paxRaw) });
                           setNewRowErrors((errors) => ({ ...errors, pax: undefined }));
                         }}
                         className={cn("h-8 min-w-[100px] text-sm text-center tabular-nums", newRowErrors.pax && "border-destructive focus-visible:ring-destructive")}
                       />
                       {newRowErrors.pax && <p className="text-destructive text-[10px] mt-0.5 leading-tight">{newRowErrors.pax}</p>}
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
                {filteredEntries.map((entry, idx) => {
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
                      id={`entry-${entry.id}`}
                      className={cn(
                        "transition-colors",
                        isSelected ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-muted/20",
                        selectMode ? "cursor-pointer" : "",
                        highlightEntryId === entry.id ? "ring-2 ring-inset ring-amber-400 bg-amber-50/60 dark:bg-amber-900/20" : ""
                      )}
                      onClick={selectMode ? () => toggleSelectRow(entry.id) : undefined}
                    >
                      {/* Checkbox — select mode only */}
                      {selectMode && (
                        <TableCell className="w-[36px]" onClick={(e) => { e.stopPropagation(); toggleSelectRow(entry.id); }}>
                          {isSelected
                            ? <CheckSquare className="w-4 h-4 text-primary cursor-pointer" />
                            : <Square className="w-4 h-4 text-muted-foreground/50 cursor-pointer" />}
                        </TableCell>
                      )}
                      {/* # */}
                      <TableCell className="w-[36px] text-center text-xs tabular-nums text-muted-foreground">{idx + 1}</TableCell>
                      {/* Date — inline editable (edits shiftDate; raw calendar date shown as annotation) */}
                      {showDateCol && (
                        <TableCell className={cn(COL.date, "font-medium")} onClick={onCellClick}>
                          {isCellEditing("shiftDate") ? (
                            <DmyDateInput
                              autoFocus
                              value={editingValue}
                              onChange={setEditingValue}
                              onBlur={() => deactivateCell(entry.id, "shiftDate")}
                              className="w-full bg-primary/10 border border-primary rounded px-1.5 py-0.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
                              ariaLabel="Shift date"
                            />
                          ) : (
                            <span
                              onClick={() => activateCell(entry.id, "shiftDate", entry.shiftDate ?? entry.date)}
                              className="cursor-text select-none hover:bg-muted/40 rounded px-1 -mx-1 transition-colors text-sm font-medium"
                              title="Click to change shift date"
                            >
                              {(() => {
                                const display = entry.shiftDate ?? entry.date;
                                const formatted = (() => { try { return format(parseISO(display), "dd-MM-yyyy"); } catch { return display; } })();
                              const calDiffers = entry.shiftDate && entry.shiftDate !== entry.date;
                              const calFormatted = calDiffers ? (() => { try { return format(parseISO(entry.date), "dd-MM"); } catch { return entry.date; } })() : null;
                                return (
                                  <>
                                    {formatted}
                                  {calDiffers && (
                                    isCellEditing("date") ? (
                                      <DmyDateInput
                                        autoFocus
                                        value={editingValue}
                                        onChange={setEditingValue}
                                        onBlur={() => deactivateCell(entry.id, "date")}
                                        className="ml-1 w-[118px] bg-primary/10 border border-primary rounded px-1.5 py-0.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                                        ariaLabel="Calendar date"
                                      />
                                    ) : (
                                      <button
                                        type="button"
                                        className="ml-1 cursor-text border-0 bg-transparent p-0 text-[10px] text-muted-foreground/50 font-normal hover:text-primary"
                                        title={`Click to change calendar date (currently ${calFormatted})`}
                                        onClick={(e) => { e.stopPropagation(); activateCell(entry.id, "date", entry.date); }}
                                      >
                                        (cal {calFormatted})
                                      </button>
                                    )
                                  )}
                                  </>
                                );
                              })()}
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
                                {visibleTeams.map((t) => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span
                              onClick={() => activateCell(entry.id, "teamId", entry.teamId?.toString() || "")}
                              className="cursor-text select-none hover:bg-muted/40 rounded px-1 -mx-1 transition-colors text-sm truncate block"
                            >
                              {entry.team?.name || <span className="text-muted-foreground/50">—</span>}
                            </span>
                          )}
                        </TableCell>
                      )}
                                             {/* Status */}
                       <TableCell className="w-[44px] text-center"><Circle className="w-3.5 h-3.5 text-muted-foreground/30 inline-block" /></TableCell>
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
                            className="w-full min-w-[72px] bg-primary/10 border border-primary rounded px-1.5 py-0.5 text-sm font-mono tabular-nums text-foreground outline-none focus:ring-1 focus:ring-primary"
                          />
                        ) : (
                          <span
                            onClick={() => activateCell(entry.id, "startTime", entry.startTime || "")}
                            className={cn("cursor-text select-none hover:bg-muted/40 rounded px-1 -mx-1 transition-colors text-sm font-mono tabular-nums", isCellFailed("startTime") && "text-destructive")}
                          >
                            {entry.startTime ? formatTimeDisplay(entry.startTime) : <span className="text-muted-foreground/50">—</span>}
                            {!showDateCol && entry.startTime && formatDateIfDifferent(entry.date, activeDate) && (
                              isCellEditing("date") ? (
                                <DmyDateInput
                                  autoFocus
                                  value={editingValue}
                                  onChange={setEditingValue}
                                  onBlur={() => deactivateCell(entry.id, "date")}
                                  className="block w-[118px] bg-primary/10 border border-primary rounded px-1.5 py-0.5 text-[10px] font-sans font-normal text-foreground outline-none focus:ring-1 focus:ring-primary"
                                  ariaLabel="Calendar date"
                                />
                              ) : (
                                <button
                                  type="button"
                                  className="block cursor-text border-0 bg-transparent p-0 text-[10px] font-sans font-normal text-muted-foreground leading-tight hover:text-primary"
                                  title={`Click to change calendar date (currently ${formatDateIfDifferent(entry.date, activeDate)})`}
                                  onClick={(e) => { e.stopPropagation(); activateCell(entry.id, "date", entry.date); }}
                                >
                                  {formatDateIfDifferent(entry.date, activeDate)}
                                </button>
                              )
                            )}
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
                            className="w-full min-w-[72px] bg-primary/10 border border-primary rounded px-1.5 py-0.5 text-sm font-mono tabular-nums text-foreground outline-none focus:ring-1 focus:ring-primary"
                          />
                        ) : (
                          <span
                            onClick={() => activateCell(entry.id, "endTime", entry.endTime || "")}
                            className={cn("cursor-text select-none hover:bg-muted/40 rounded px-1 -mx-1 transition-colors text-sm font-mono tabular-nums", isCellFailed("endTime") && "text-destructive")}
                          >
                            {entry.endTime ? formatTimeDisplay(entry.endTime) : <span className="text-muted-foreground/50">—</span>}
                        {entry.startTime && entry.endTime && entry.endTime < entry.startTime && (() => {
                          const finishDate = (() => {
                            try { return format(addDays(parseISO(entry.shiftDate ?? entry.date), 1), "yyyy-MM-dd"); }
                            catch { return null; }
                          })();
                          const finishDateLabel = formatDateIfDifferent(finishDate, activeDate);
                          return finishDateLabel ? (
                            <span className="block text-[10px] font-sans font-normal text-muted-foreground leading-tight">
                              {finishDateLabel}
                            </span>
                          ) : null;
                        })()}
                          </span>
                        )}
                      </TableCell>
                      {/* Duration */}
                      <TableCell className="tabular-nums">
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
                            className="cursor-text select-none hover:bg-muted/40 rounded px-1 -mx-1 transition-colors text-sm truncate block"
                          >
                            {entry.location?.name || <span className="text-muted-foreground/50">—</span>}
                          </span>
                        )}
                        <datalist id={`location-list-${entry.id}`}>
                          {locations.map((l) => <option key={l.id} value={l.name} />)}
                        </datalist>
                      </TableCell>
                      {/* Notes — inline editable */}
                      <TableCell className={COL.notes} onClick={onCellClick}>
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
                      {/* PAX working on task — inline editable */}
                      <TableCell className="text-center" onClick={onCellClick}>
                        {isCellEditing("pax") ? (
                          <input
                            autoFocus
                            type="text"
                            inputMode="numeric"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onBlur={() => deactivateCell(entry.id, "pax")}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
                            className={cn("w-full bg-primary/10 border border-primary rounded px-1.5 py-0.5 text-sm tabular-nums text-center text-foreground outline-none focus:ring-1 focus:ring-primary", isCellFailed("pax") && "border-destructive")}
                          />
                        ) : (
                          <span
                            onClick={() => activateCell(entry.id, "pax", entry.pax?.toString() || "")}
                            className={cn("cursor-text select-none hover:bg-muted/40 rounded px-1 -mx-1 transition-colors text-sm tabular-nums", isCellFailed("pax") && "text-destructive")}
                            title="Click to edit PAX working on task"
                          >
                            {entry.pax ?? <span className="text-muted-foreground/50">—</span>}
                          </span>
                        )}
                      </TableCell>
                      {/* Activity Group — instant toggle, no editing mode needed */}
                      <TableCell className={COL.group} onClick={onCellClick}>
                        {(() => {
                          const pendingSelection = activityOverrides[entry.id];
                          return (
                        <ActivityGroupPicker
                          allowedTypes={allowedTypes}
                          allowedGroups={allowedGroups}
                          workingTypeId={workingTypeId}
                          typeValue={pendingSelection?.activityTypeId ?? entry.activityTypeId ?? null}
                          groupValue={pendingSelection?.activityGroupId ?? entry.activityGroupId ?? null}
                          onTypeChange={(id) => handleQuickSetType(entry, id)}
                          onGroupChange={(id) => handleQuickSetGroup(entry, id)}
                          onError={(msg) => toast({ title: msg, variant: "destructive" })}
                          isSaving={Boolean(pendingSelection)}
                        />
                          );
                        })()}
                      </TableCell>
                      {/* Actions */}
                      <TableCell className={cn(COL.actions, "text-right")} onClick={onCellClick}>
                        <div className="flex items-center justify-end gap-1">
                          {/* Shift-date editor — only shown when the date column is hidden (date filter active) */}
                          {!showDateCol && (
                            isCellEditing("shiftDate") ? (
                              <DmyDateInput
                                autoFocus
                                value={editingValue}
                                onChange={setEditingValue}
                                onBlur={() => deactivateCell(entry.id, "shiftDate")}
                                className="w-28 bg-primary/10 border border-primary rounded px-1.5 py-0.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                                ariaLabel="Shift date"
                              />
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground/40 hover:text-primary hover:bg-primary/10"
                                title={`Move to a different shift date (currently ${(() => { try { return format(parseISO(entry.shiftDate ?? entry.date), "d MMM"); } catch { return entry.shiftDate ?? entry.date; } })()})`}
                                onClick={(e) => { e.stopPropagation(); activateCell(entry.id, "shiftDate", entry.shiftDate ?? entry.date); }}
                              >
                                <Calendar className="w-3.5 h-3.5" />
                              </Button>
                            )
                          )}
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

                {/* ── Locked (captured) rows — read-only, shown below draft entries ── */}
                {filteredLockedEntries.length > 0 && (
                  <>
                    {filteredLockedEntries.map((entry, idx) => (
                      <TableRow key={`locked-${entry.id}`} id={`entry-${entry.id}`} className={cn("opacity-50 bg-muted/5", highlightEntryId === entry.id ? "!opacity-100 ring-2 ring-inset ring-amber-400 bg-amber-50/60 dark:bg-amber-900/20" : "")}>
                        {selectMode && <TableCell className="w-[36px]" />}
                        <TableCell className="w-[36px] text-center text-xs tabular-nums text-muted-foreground">{filteredEntries.length + idx + 1}</TableCell>
                        {showDateCol && (
                          <TableCell className={cn(COL.date, "text-sm text-muted-foreground")}>
                            {(() => {
                              const display = entry.shiftDate ?? entry.date;
                              return (() => { try { return format(parseISO(display), "dd-MM-yyyy"); } catch { return display; } })();
                            })()}
                          </TableCell>
                        )}
                        {showTeamCol && (
                          <TableCell className={cn(COL.team, "text-sm text-muted-foreground truncate")}>
                            {entry.team?.name || "—"}
                          </TableCell>
                        )}
                        <TableCell className="w-[44px] text-center"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 inline-block" /></TableCell>
                        <TableCell className="text-sm font-mono tabular-nums text-muted-foreground">
                          {entry.startTime ? formatTimeDisplay(entry.startTime) : "—"}
                          {entry.shiftDate && entry.shiftDate !== entry.date && entry.startTime && formatDateIfDifferent(entry.date, activeDate) && (
                            <span className="block text-[10px] font-sans font-normal leading-tight">
                              {formatDateIfDifferent(entry.date, activeDate)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-mono tabular-nums text-muted-foreground">
                          {entry.endTime ? formatTimeDisplay(entry.endTime) : "—"}
                        {entry.startTime && entry.endTime && entry.endTime < entry.startTime && (() => {
                          const finishDate = (() => {
                            try { return format(addDays(parseISO(entry.shiftDate ?? entry.date), 1), "yyyy-MM-dd"); }
                            catch { return null; }
                          })();
                          const finishDateLabel = formatDateIfDifferent(finishDate, activeDate);
                          return finishDateLabel ? (
                            <span className="block text-[10px] font-sans font-normal leading-tight">
                              {finishDateLabel}
                            </span>
                          ) : null;
                        })()}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums text-muted-foreground">
                          {formatDuration(entry.startTime, entry.endTime)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground truncate">
                          {entry.location?.name || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground truncate">
                          {entry.notes || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground text-center tabular-nums">
                          {entry.pax ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {(() => {
                            const grp = activityGroups.find((g) => g.id === entry.activityGroupId);
                            return grp ? (GROUP_LABELS[grp.name] ?? grp.name) : "—";
                          })()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 inline-block" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                )}

                {/* Empty state */}
                {!loadingEntries && filteredEntries.length === 0 && filteredLockedEntries.length === 0 && !newRow && (
                  <TableRow>
                    <TableCell colSpan={10 + (showDateCol ? 1 : 0) + (showTeamCol ? 1 : 0) + (selectMode ? 1 : 0)} className="text-center py-16 text-muted-foreground">
                      {draftEntries.length === 0
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
      <Dialog open={lautecDialogOpen} onOpenChange={(open) => { if (!open) closeLautecDialog(); else setLautecDialogOpen(true); }}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5" />
              Sync Capture to Lautec
            </DialogTitle>
            <DialogDescription>
              This sends one selected date and team using Lautec’s visible Import Data form. PAX is intentionally left blank.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Syncing</p>
                <p className="mt-0.5 text-sm font-semibold">
                  {activeTeamName ?? "Select a team"}{activeDate ? ` · ${format(parseISO(activeDate), "dd MMM yyyy")}` : ""}
                </p>
              </div>
              {lautecPreview && (
                <Badge variant="secondary">{lautecPreview.rowCount} row{lautecPreview.rowCount === 1 ? "" : "s"}</Badge>
              )}
              {isLautecSyncing && (
                <span className="flex items-center gap-1.5 text-xs text-primary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Updates automatically
                </span>
              )}
            </div>
            <ol className="mt-3 grid gap-2 sm:grid-cols-2">
              {lautecProgress.map((step) => (
                <li
                  key={step.label}
                  className={cn(
                    "flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs",
                    step.state === "complete" && "border-emerald-500/30 bg-emerald-500/5",
                    step.state === "active" && "border-primary/40 bg-primary/5",
                    step.state === "error" && "border-destructive/40 bg-destructive/5",
                    step.state === "waiting" && "border-border bg-background/40 text-muted-foreground",
                  )}
                >
                  {step.state === "complete" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    : step.state === "active" ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
                      : step.state === "error" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                        : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />}
                  <span>
                    <span className="block font-medium text-foreground">{step.label}</span>
                    <span className="block mt-0.5 text-muted-foreground">{step.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {previewLautecMutation.isPending && (
            <div className="flex flex-1 min-h-[180px] items-center justify-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              Reading and validating the Capture tab…
            </div>
          )}

          {!previewLautecMutation.isPending && lautecError && !lautecPreview && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {lautecError}
            </div>
          )}

          {lautecPreview && !lautecRunId && (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <strong>{lautecPreview.rowCount} row{lautecPreview.rowCount === 1 ? "" : "s"}</strong>
                {" "}will be sent to <strong>{lautecPreview.teamName}</strong> for <strong>{lautecPreview.date}</strong>.
              </div>
              {lautecError && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                  <p>{lautecError}</p>
                  {requiresLautecUncertainConfirmation ? (
                    <label className="mt-3 flex items-start gap-2 text-foreground">
                      <Checkbox className="mt-0.5" checked={confirmLautecUncertain} onCheckedChange={(checked) => setConfirmLautecUncertain(checked === true)} />
                      <span>I checked Lautec and understand this snapshot may already have been imported. I explicitly allow one retry.</span>
                    </label>
                  ) : (
                    <label className="mt-3 flex items-center gap-2 text-foreground">
                      <Checkbox checked={confirmLautecResend} onCheckedChange={(checked) => setConfirmLautecResend(checked === true)} />
                      I understand this exact snapshot was already completed and want to re-send it.
                    </label>
                  )}
                </div>
              )}
              <div className="min-h-0 overflow-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted">
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Activity Group</TableHead>
                      <TableHead>Activity</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>Finish</TableHead>
                      <TableHead>Comment</TableHead>
                      <TableHead>PAX</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lautecPreview.rows.map((row, index) => (
                      <TableRow key={`${row.activityGroup}-${row.activity}-${index}`}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>{row.activityGroup}</TableCell>
                        <TableCell>{row.activity}</TableCell>
                        <TableCell>{row.location}</TableCell>
                        <TableCell className="font-mono">{row.start}</TableCell>
                        <TableCell className="font-mono">{row.finish}</TableCell>
                        <TableCell className="max-w-[260px] whitespace-pre-wrap">{row.comment || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">blank</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {lautecRunId !== null && (
            <div className="flex min-h-[180px] flex-col justify-center gap-3">
              {!lautecRunQuery.data || lautecRunQuery.data.status === "running" || lautecRunQuery.data.status === "submitting" ? (
                <div className="flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 p-4 text-sm">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <div>
                    <p className="font-medium">{lautecRunQuery.data?.status === "submitting" ? "Submitting and saving in Lautec" : "Preparing the Lautec import"}</p>
                    <p className="text-muted-foreground">{lautecRunQuery.data?.status === "submitting" ? "The verified grid is being saved. Keep this window open while DPR waits for Lautec’s visible completion confirmation." : "DPR is signing in, opening the selected DPR, filling Import Data, and checking each visible value."}</p>
                  </div>
                </div>
              ) : lautecRunQuery.data.status === "success" ? (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
                  <p className="font-medium text-emerald-700 dark:text-emerald-300">Import completed successfully</p>
                  <p className="mt-1 text-muted-foreground">{lautecRunQuery.data.rowsSubmitted} row{lautecRunQuery.data.rowsSubmitted === 1 ? "" : "s"} submitted to Lautec.</p>
                </div>
              ) : (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
                  <p className="font-medium text-destructive">
                    {lautecRunQuery.data.status === "uncertain" ? "Import needs Lautec verification" : lautecRunQuery.data.status === "interrupted" ? "Import interrupted" : "Import did not complete"}
                  </p>
                  <p className="mt-1 text-muted-foreground">{lautecRunQuery.data.errorDetail ?? "Check Lautec before retrying this snapshot."}</p>
                  {lautecRunQuery.data.rejectedRows.length > 0 && (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-destructive">
                      {lautecRunQuery.data.rejectedRows.map((rejection) => (
                        <li key={`${rejection.rowNumber}-${rejection.reason}`}>Row {rejection.rowNumber}: {rejection.reason}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {lautecRunQuery.error && (
                <p className="text-sm text-destructive">{lautecErrorMessage(lautecRunQuery.error)}</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeLautecDialog} disabled={lautecRunQuery.data?.status === "running" || lautecRunQuery.data?.status === "submitting" || startLautecMutation.isPending}>
              Close
            </Button>
            {lautecPreview && lautecRunId === null && (
              <Button onClick={handleStartLautecImport} disabled={startLautecMutation.isPending || (requiresLautecUncertainConfirmation && !confirmLautecUncertain) || (!requiresLautecUncertainConfirmation && lautecError !== null && !confirmLautecResend)} className="gap-2">
                {startLautecMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {requiresLautecUncertainConfirmation ? "Confirm verified retry" : confirmLautecResend ? "Confirm re-send" : "Start Lautec import"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pasteOpen} onOpenChange={(open) => { if (!open) closePasteDialog(); else openPasteDialog(); }}>
        <DialogContent className={cn(
          "max-w-[95vw] w-full max-h-[90vh] flex flex-col",
          isCopiedActivityReview && "max-w-[98vw] max-h-[94vh]",
        )}>
          <DialogHeader>
            <DialogTitle>{isCopiedActivityReview ? "Review copied activity reports" : "Paste rows from a spreadsheet"}</DialogTitle>
            <DialogDescription>
              {isCopiedActivityReview
                ? "Review and edit the copied activity reports before saving them to the selected DPR."
                : "Copy rows from your source sheet (Date, Team, Start, End, Location, Notes, PAX). For six-column rows, a number at the end of Notes is treated as PAX."}
            </DialogDescription>
          </DialogHeader>

          <div className={cn(
            "flex-1 flex flex-col gap-2 min-h-0",
            isCopiedActivityReview ? "overflow-hidden" : "overflow-auto",
          )}>
            <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-y border-border bg-muted/20 px-3 py-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="paste-shift-date" className="text-sm font-medium text-foreground" title="Destination DPR date (DD-MM-YYYY)">
                  {isCopyFlow ? "DPR date" : <>DPR for Date <span className="font-mono text-xs font-normal text-muted-foreground">(DD-MM-YYYY)</span></>}
                </label>
                <DmyDateInput
                  id="paste-shift-date"
                  value={pasteShiftDate}
                  onChange={(value) => setPasteShiftDate(normalizeDate(value) ?? value)}
                  className={cn("h-8 w-[155px] text-sm font-mono", pasteShiftDate && !normalizeIsoDate(pasteShiftDate) && "border-red-500 focus-visible:ring-red-500")}
                  ariaLabel="DPR for Date"
                />
                {copySourcePickerOpen && (
                  <>
                    <span className="text-muted-foreground/50" aria-hidden="true">·</span>
                    <label htmlFor="copy-source-date" className="text-sm font-medium text-foreground" title="Source DPR date">
                      Source DPR
                    </label>
                    <DmyDateInput
                      id="copy-source-date"
                      value={copySourceDate}
                      onChange={handleCopySourceDateChange}
                      className="h-8 w-[155px] text-sm font-mono"
                      ariaLabel="Copy activity reports from DPR date"
                    />
                  </>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto h-8 gap-2"
                onClick={() => {
                  setCopySourcePickerOpen((open) => !open);
                  setCopySourceStatus(null);
                }}
              >
                <Copy className="h-4 w-4" />
                Copy from previous DPR
              </Button>
              {copySourceStatus && (
                <div
                  title={copySourceStatus.message}
                  className={cn(
                    "flex min-w-[180px] flex-1 items-center gap-2 truncate rounded-md px-2 py-1 text-xs",
                    copySourceStatus.tone === "error" && "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300",
                    copySourceStatus.tone === "warning" && "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
                    copySourceStatus.tone === "success" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
                    copySourceStatus.tone === "loading" && "bg-primary/5 text-primary",
                  )}
                >
                  {copySourceStatus.tone === "loading" ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Info className="h-4 w-4 shrink-0" />}
                  <span className="truncate">{copySourceStatus.message}</span>
                </div>
              )}
            </div>

            {isCopiedActivityReview && copyTeamOptions.length > 0 && (
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-3 py-1.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {visiblePendingRows.length} of {pendingRows?.length ?? 0} copied
                  </span>
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-8 gap-2 text-xs">
                      <Users className="h-3.5 w-3.5" />
                      Teams
                      {copyExcludedTeamKeys.length > 0 && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                          {copyTeamOptions.length - copyExcludedTeamKeys.length}/{copyTeamOptions.length}
                        </Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 p-2">
                    <div className="flex items-center justify-between border-b border-border px-2 pb-2">
                      <div>
                        <p className="text-sm font-medium">Filter teams</p>
                        <p className="text-[11px] text-muted-foreground">Only teams with copied activity are listed.</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setCopyExcludedTeamKeys([])}
                      >
                        All teams
                      </Button>
                    </div>
                    <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                      {copyTeamOptions.map((option) => {
                        const selected = !copyExcludedTeamKeys.includes(option.key);
                        return (
                          <label
                            key={option.key}
                            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted"
                          >
                            <Checkbox
                              checked={selected}
                              onCheckedChange={(checked) => {
                                setCopyExcludedTeamKeys((keys) => {
                                  if (checked) return keys.filter((key) => key !== option.key);
                                  return keys.includes(option.key) ? keys : [...keys, option.key];
                                });
                              }}
                            />
                            <span className="min-w-0 flex-1 truncate">{option.label}</span>
                            <span className="text-[10px] text-muted-foreground">{option.count}</span>
                          </label>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {!isCopiedActivityReview && (
              <>
                <Textarea
                  ref={pasteTextareaRef}
                  value={pasteText}
                  onChange={(e) => handlePasteChange(e.target.value)}
                  placeholder={"01-06-2024\tTeam 1\t07:00\t15:30\tA01\tRoutine works\t8"}
                  className="min-h-[92px] font-mono text-xs shrink-0"
                />

                {/* Compact spreadsheet controls */}
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-y border-border bg-muted/20 px-2 py-1.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Date format</span>
                    <Badge variant="secondary" className="h-6 rounded-sm font-mono">DD-MM-YYYY</Badge>
                  </div>
                </div>
              </>
            )}

            {pendingRows && (pendingRows.length > 0 || isCopiedActivityReview) && (
              <div className={cn(
                "flex-1 min-h-[180px] overflow-auto",
                isCopiedActivityReview && "min-h-0",
              )}>
                <table className={cn(
                  "w-full table-fixed border-collapse text-xs",
                  isCopiedActivityReview ? "min-w-[1040px]" : "min-w-[980px]",
                )}>
                  <colgroup>
                    <col className={isCopiedActivityReview ? "w-[13%]" : "w-[14%]"} />
                    <col className={isCopiedActivityReview ? "w-[13%]" : "w-[14%]"} />
                    <col className={isCopiedActivityReview ? "w-[9%]" : "w-[10%]"} />
                    <col className={isCopiedActivityReview ? "w-[9%]" : "w-[10%]"} />
                    <col className={isCopiedActivityReview ? "w-[16%]" : "w-[17%]"} />
                    <col className={isCopiedActivityReview ? "w-[20%]" : "w-[21%]"} />
                    <col className={isCopiedActivityReview ? "w-[13%]" : "w-[14%]"} />
                    {isCopiedActivityReview && <col className="w-[7%]" />}
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <tr>
                      {[
                        "Date",
                        "Team",
                        "Start",
                        "End",
                        "Location",
                        "Notes",
                        "PAX working on task",
                        ...(isCopiedActivityReview ? ["Action"] : []),
                      ].map((heading) => (
                        <th key={heading} scope="col" className="h-7 border border-slate-400 px-2 text-center text-xs font-medium dark:border-slate-600">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePendingRows.map((row) => {
                      const teamUnmatched = Boolean(row.teamRaw && !row.teamId);
                      const locationUnmatched = Boolean(row.locationRaw && !row.locationId);
                      // A copied report can belong to a valid team that is not in
                      // today's roster filter. Keep that team selectable so the
                      // copied row remains visible and reviewable before saving.
                      const teamsForRow = row.teamId && !visibleTeams.some((team) => team.id === row.teamId)
                        ? teams
                        : visibleTeams;
                      const invalidDate = !row.date;
                      const hyphenDateFormat = usesHyphenDateFormat(row.dateRaw);
                      const invalidDprDate = Boolean(
                        row.date
                        && normalizedPasteDprDate
                        && row.date !== normalizedPasteDprDate
                        && row.date !== overnightPasteDate,
                      );
                      const invalidPax = Boolean(row.paxRaw.trim() && row.pax === null);
                      return (
                        <tr key={row.key} className="bg-background">
                          <td className={cn("border border-slate-400 p-0 dark:border-slate-600", (invalidDate || invalidDprDate) && "bg-red-50 dark:bg-red-950/30")}>
                            <input
                              aria-label="Date"
                              aria-invalid={invalidDate || invalidDprDate}
                              title={
                                invalidDate
                                   ? !hyphenDateFormat
                                   ? "Use DD-MM-YYYY with - separators, for example 23-08-2026. Slashes are not accepted."
                                  : "Please give a valid date."
                                  : invalidDprDate
                                  ? `Date must be ${formatDateAsDmyHyphen(normalizedPasteDprDate ?? "")} or ${formatDateAsDmyHyphen(overnightPasteDate ?? "")}.`
                                  : undefined
                              }
                              type="text"
                              inputMode="numeric"
                              value={row.dateRaw}
                              onChange={(e) => updatePendingRow(row.key, { date: normalizeDate(e.target.value), dateRaw: e.target.value })}
                              placeholder="DD-MM-YYYY"
                              maxLength={10}
                              className={cn(PASTE_GRID_CELL, (invalidDate || invalidDprDate) && "text-red-700 focus:ring-red-500 dark:text-red-300")}
                            />
                          </td>
                          <td className={cn("border border-slate-400 p-0 dark:border-slate-600", teamUnmatched && "bg-amber-50 dark:bg-amber-950/30")}>
                            <select
                              aria-label="Team"
                              value={row.teamId?.toString() ?? ""}
                              onChange={(e) => updatePendingRow(row.key, { teamId: e.target.value ? Number(e.target.value) : null })}
                              className={cn(PASTE_GRID_CELL, "appearance-none cursor-pointer", teamUnmatched && "text-amber-700 dark:text-amber-300")}
                            >
                              <option value="">{teamUnmatched ? row.teamRaw : "Select team"}</option>
                              {teamsForRow.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                            </select>
                          </td>
                          <td className="border border-slate-400 p-0 dark:border-slate-600">
                            <input
                              aria-label="Start"
                              type="text"
                              inputMode="numeric"
                              value={row.startTime}
                              onChange={(e) => updatePendingRow(row.key, { startTime: e.target.value })}
                              className={cn(PASTE_GRID_CELL, "font-mono")}
                            />
                          </td>
                          <td className="border border-slate-400 p-0 dark:border-slate-600">
                            <input
                              aria-label="End"
                              type="text"
                              inputMode="numeric"
                              value={row.endTime}
                              onChange={(e) => updatePendingRow(row.key, { endTime: e.target.value })}
                              className={cn(PASTE_GRID_CELL, "font-mono")}
                            />
                          </td>
                          <td className={cn("border border-slate-400 p-0 dark:border-slate-600", locationUnmatched && "bg-amber-50 dark:bg-amber-950/30")}>
                            <select
                              aria-label="Location"
                              value={row.locationId?.toString() ?? ""}
                              onChange={(e) => updatePendingRow(row.key, { locationId: e.target.value ? Number(e.target.value) : null })}
                              className={cn(PASTE_GRID_CELL, "appearance-none cursor-pointer", locationUnmatched && "text-amber-700 dark:text-amber-300")}
                            >
                              <option value="">{locationUnmatched ? row.locationRaw : "Select location"}</option>
                              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                            </select>
                          </td>
                          <td className="border border-slate-400 p-0 dark:border-slate-600">
                            <input
                              aria-label="Notes"
                              type="text"
                              value={row.notes}
                              onChange={(e) => updatePendingRow(row.key, { notes: e.target.value })}
                              className={PASTE_GRID_CELL}
                            />
                          </td>
                          <td className={cn("border border-slate-400 p-0 dark:border-slate-600", invalidPax && "bg-red-50 dark:bg-red-950/30")}>
                            <input
                              aria-label="PAX working on task"
                              aria-invalid={invalidPax}
                              title={invalidPax ? "Enter a positive whole number." : undefined}
                              type="text"
                              inputMode="numeric"
                              value={row.paxRaw}
                              onChange={(e) => updatePendingRow(row.key, { pax: normalizePax(e.target.value), paxRaw: e.target.value })}
                              className={cn(PASTE_GRID_CELL, invalidPax && "text-red-700 focus:ring-red-500 dark:text-red-300")}
                            />
                          </td>
                          {isCopiedActivityReview && (
                            <td className="border border-slate-400 p-0 text-center dark:border-slate-600">
                              <button
                                type="button"
                                onClick={() => removePendingRow(row.key)}
                                aria-label={`Exclude activity for ${row.teamRaw.trim() || "unassigned"}${row.startTime ? ` at ${row.startTime}` : ""}`}
                                title="Exclude this activity from the entry"
                                className="mx-auto flex h-8 w-8 items-center justify-center rounded text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {visiblePendingRows.length === 0 && (
                      <tr>
                        <td colSpan={isCopiedActivityReview ? 8 : 7} className="border border-slate-400 px-3 py-8 text-center text-xs text-muted-foreground dark:border-slate-600">
                          {isCopiedActivityReview && pendingRows?.length === 0
                            ? "All copied activities have been excluded from this entry."
                            : "No copied activities match the selected teams. Use the Teams filter to select at least one team."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {pendingRows && pendingRows.some((r) => !r.date && !usesHyphenDateFormat(r.dateRaw)) && (
              <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/30">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                The pasted date must use “-” separators. Enter dates as DD-MM-YYYY, for example 23-08-2026.
              </div>
            )}
            {pendingRows && pendingRows.some((r) => !r.date && usesHyphenDateFormat(r.dateRaw)) && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/30 rounded-md px-3 py-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Please give a valid date in DD-MM-YYYY format.
              </div>
            )}
            {pendingRows && pendingRows.length > 0 && !normalizedPasteDprDate && (
              <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/30">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Select a DPR for Date before saving.
              </div>
            )}
            {invalidPasteDateRows.length > 0 && normalizedPasteDprDate && (
              <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/30">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Pasted dates must be {formatDateAsDmyHyphen(normalizedPasteDprDate)} or {formatDateAsDmyHyphen(overnightPasteDate ?? "")}. Highlighted dates must be corrected before saving.
              </div>
            )}
            {pendingRows && pendingRows.some((r) => r.paxRaw.trim() && r.pax === null) && (
              <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/30">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                PAX must be a positive whole number.
              </div>
            )}
            {pendingRows && pendingRows.some((r) => (r.teamRaw && !r.teamId) || (r.locationRaw && !r.locationId)) && (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Some teams or locations didn't match — select a valid value for every highlighted cell before saving.
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0">
            {pendingRows && pendingRows.length > 0 && (
              <Badge variant="secondary" className="mr-auto">
                {isCopiedActivityReview && visiblePendingRows.length !== pendingRows.length
                  ? `${visiblePendingRows.length} of ${pendingRows.length} rows shown`
                  : `${pendingRows.length} row${pendingRows.length === 1 ? "" : "s"} parsed`}
              </Badge>
            )}
            <Button variant="outline" onClick={closePasteDialog}>Cancel</Button>
            <Button onClick={handleSaveBulk} disabled={!pendingRows || pendingRows.length === 0 || isSavingBulk || !normalizedPasteDprDate || invalidPasteDateRows.length > 0 || (pendingRows?.some((r) => !r.date) ?? false) || (pendingRows?.some((r) => r.paxRaw.trim() && r.pax === null) ?? false) || (pendingRows?.some((r) => (r.teamRaw && !r.teamId) || (r.locationRaw && !r.locationId)) ?? false)} className="gap-2">
              {isSavingBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save {pendingRows?.length ?? 0} Row{pendingRows?.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingCopy !== null}
        onOpenChange={(open) => {
          if (!open) setPendingCopy(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Keep the rows already in the grid?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCopy
                ? `${pendingCopy.rows.length} activity report${pendingCopy.rows.length === 1 ? "" : "s"} from ${formatDateAsDmy(pendingCopy.sourceDate)} are ready to copy. You can add them to the current grid or replace the current rows.`
                : "Choose how to apply the copied activity reports."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current rows</AlertDialogCancel>
            <AlertDialogAction onClick={() => applyPendingCopy("append")}>
              Add copied rows
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => applyPendingCopy("replace")}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Replace current rows
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
      </>
      )}
    </div>
  );
}
