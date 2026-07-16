import { useState, useMemo, useRef } from "react";
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
import { Loader2, Plus, Save, Trash2, X, ClipboardPaste, AlertTriangle, Lock, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatTimeDisplay } from "@/lib/utils";
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
    startTime: "",
    endTime: "",
    locationId: null,
    notes: "",
    activityTypeId: defaultActivityTypeId,
    activityGroupId: defaultGroupId,
    billingParty: null,
  };
}

// ─── Two-level Activity Group picker ─────────────────────────────────────────

function ActivityGroupPicker({
  allowedTypes,
  allowedGroups,
  workingTypeId,
  typeValue,
  groupValue,
  onTypeChange,
  onGroupChange,
}: {
  allowedTypes: { id: number; name: string }[];
  allowedGroups: { id: number; name: string }[];
  workingTypeId: number | null;
  typeValue: number | null;
  groupValue: number | null;
  onTypeChange: (id: number) => void;
  onGroupChange: (id: number) => void;
}) {
  const isWorking = typeValue === workingTypeId;

  return (
    <div className="flex flex-col gap-1 min-w-[200px]">
      {/* Row 1: Activity Types — always both visible */}
      <div className="flex flex-wrap gap-1">
        {allowedTypes.map((type) => (
          <button
            key={type.id}
            type="button"
            onClick={() => onTypeChange(type.id)}
            className={cn(
              "px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap",
              typeValue === type.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            )}
          >
            {TYPE_LABELS[type.name] ?? type.name}
          </button>
        ))}
      </div>
      {/* Row 2: Activity Groups — always all three visible; active only when Working Time */}
      <div className="flex flex-wrap gap-1">
        {allowedGroups.map((group) =>
          isWorking ? (
            <button
              key={group.id}
              type="button"
              onClick={() => onGroupChange(group.id)}
              className={cn(
                "px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap",
                groupValue === group.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              )}
            >
              {GROUP_LABELS[group.name] ?? group.name}
            </button>
          ) : (
            <span
              key={group.id}
              className="px-2 py-0.5 text-[11px] font-medium rounded whitespace-nowrap bg-muted/30 text-muted-foreground/40"
            >
              {GROUP_LABELS[group.name] ?? group.name}
            </span>
          )
        )}
      </div>
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

function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // DD.MM.YY or DD.MM.YYYY (common in EU/field spreadsheets, e.g. "14.06.26")
  const dotMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (dotMatch) {
    const day = dotMatch[1].padStart(2, "0");
    const month = dotMatch[2].padStart(2, "0");
    const year = dotMatch[3].length === 2 ? `20${dotMatch[3]}` : dotMatch[3];
    return `${year}-${month}-${day}`;
  }
  // Generic fallback
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

// ─── Column widths ────────────────────────────────────────────────────────────
const COL = {
  date: "w-[130px]",
  team: "w-[150px]",
  start: "w-[110px]",
  end: "w-[110px]",
  location: "w-[200px]",
  notes: "w-[180px]",
  group: "w-[260px]",
  actions: "w-[80px]",
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
        const d = new Date(a.date).getTime() - new Date(b.date).getTime();
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
      onMutate: async ({ data }) => {
        await queryClient.cancelQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
        const snapshot = snapshotEntries();
        const tempId = -(Date.now());
        const tempEntry: DprTimesheetEntry = {
          id: tempId,
          date: data.date ?? format(new Date(), "yyyy-MM-dd"),
          teamId: data.teamId,
          team: teams.find((t) => t.id === data.teamId),
          startTime: data.startTime,
          endTime: data.endTime,
          locationId: data.locationId,
          location: locations.find((l) => l.id === data.locationId),
          notes: data.notes,
          activityTypeId: data.activityTypeId,
          billingParty: data.billingParty as DprTimesheetEntry["billingParty"],
          jdrCodeIds: [],
          combinedComment: null,
          stage: "draft",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        queryClient.setQueriesData<DprTimesheetEntry[]>(
          { queryKey: getListDprTimesheetEntriesQueryKey({ stage: "draft" }) },
          (old) => (old ? [...old, tempEntry] : [tempEntry])
        );
        return { snapshot, tempId };
      },
      onSuccess: (newEntry, _, ctx) => {
        queryClient.setQueriesData<DprTimesheetEntry[]>(
          { queryKey: getListDprTimesheetEntriesQueryKey({ stage: "draft" }) },
          (old) => (old ? [...old.filter((e) => e.id !== ctx?.tempId), newEntry] : [newEntry])
        );
        queryClient.invalidateQueries({ queryKey: getGetDprTimesheetSummaryQueryKey() });
      },
      onError: (err, _, ctx) => {
        if (ctx?.snapshot) restoreEntries(ctx.snapshot);
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
        setEditingId(null);
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
      onSuccess: (updated) => { patchEntry(updated); },
      onError: (err, _, ctx) => {
        if (ctx?.snapshot) restoreEntries(ctx.snapshot);
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<DprTimesheetEntry>>({});
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pendingRows, setPendingRows] = useState<PendingRow[] | null>(null);
  const [isSavingBulk, setIsSavingBulk] = useState(false);
  const pasteTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Bulk select — kept for power users; toolbar visible when something is selected
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBulkWorking, setIsBulkWorking] = useState(false);
  const [bulkLocationId, setBulkLocationId] = useState<string>("");
  const someSelected = sortedEntries.some((e) => selectedIds.has(e.id));

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
    clearSelection();
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
    setIsBulkWorking(true);
    const ids = Array.from(selectedIds);
    queryClient.setQueriesData<DprTimesheetEntry[]>(
      { queryKey: getListDprTimesheetEntriesQueryKey() },
      (old) => old?.map((e) => ids.includes(e.id) ? { ...e, stage: "captured" as const } : e)
    );
    const results = await Promise.allSettled(ids.map((id) => bulkApproveMutation.mutateAsync({ id, data: { stage: "captured" } })));
    const failed = results.length - results.filter((r) => r.status === "fulfilled").length;
    if (failed > 0) queryClient.invalidateQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDprTimesheetSummaryQueryKey() });
    setIsBulkWorking(false);
    setSelectedIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
    setBulkLocationId("");
    const succeeded = ids.length - failed;
    if (succeeded > 0) toast({ title: `${succeeded} row${succeeded === 1 ? "" : "s"} approved`, description: "Sent to Clarify." });
    else toast({ title: "Approve failed", variant: "destructive" });
  };

  const handleApprove = (id: number) => approveMutation.mutate({ id, data: { stage: "captured" } });

  // ── Create / edit helpers ──
  const handleCreate = () => {
    if (!newRow || !newRow.date) return;
    createMutation.mutate(
      { data: { date: newRow.date, teamId: newRow.teamId || undefined, startTime: newRow.startTime || undefined, endTime: newRow.endTime || undefined, locationId: newRow.locationId || undefined, notes: newRow.notes || undefined, activityTypeId: newRow.activityTypeId || undefined, billingParty: newRow.billingParty || undefined } },
      { onSuccess: () => { toast({ title: "Entry created" }); setNewRow(null); } }
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

  const handleUpdate = () => {
    if (!editingId) return;
    if (autosaveTimerRef.current) { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null; }
    updateMutation.mutate({ id: editingId, data: buildUpdatePayload(editDraft) });
  };

  const startEditing = (entry: DprTimesheetEntry) => {
    flushAutosave();
    setEditingId(entry.id);
    setEditDraft({ date: entry.date, teamId: entry.teamId, startTime: entry.startTime || "", endTime: entry.endTime || "", locationId: entry.locationId, notes: entry.notes || "", activityTypeId: entry.activityTypeId, activityGroupId: entry.activityGroupId ?? null, billingParty: entry.billingParty ?? null });
  };

  const flushAutosave = () => {
    if (autosaveTimerRef.current) { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null; }
    if (!editingId || !editDraft.date) return;
    autosaveMutation.mutate({ id: editingId, data: buildUpdatePayload(editDraft) });
  };

  const commitDraft = (patch: Partial<DprTimesheetEntry>) => {
    const next = { ...editDraft, ...patch };
    setEditDraft(next);
    if (autosaveTimerRef.current) { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null; }
    if (!editingId || !next.date) return;
    autosaveMutation.mutate({ id: editingId, data: buildUpdatePayload(next) });
  };

  const updateDraftDebounced = (patch: Partial<DprTimesheetEntry>) => {
    const next = { ...editDraft, ...patch };
    setEditDraft(next);
    if (!editingId) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      if (!next.date) return;
      autosaveMutation.mutate({ id: editingId, data: buildUpdatePayload(next) });
    }, 700);
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
        createMutation.mutateAsync({ data: { date: row.date, teamId: row.teamId || undefined, startTime: row.startTime || undefined, endTime: row.endTime || undefined, locationId: row.locationId || undefined, notes: row.notes || undefined, activityTypeId: row.activityTypeId || undefined, billingParty: row.billingParty || undefined } })
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
  const allSelected = sortedEntries.length > 0 && sortedEntries.every(e => selectedIds.has(e.id));

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(sortedEntries.map(e => e.id)));
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
      <TableHead className="w-[36px]">
        <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" />
      </TableHead>
      <TableHead className={COL.date}>Date</TableHead>
      <TableHead className={COL.team}>Team</TableHead>
      <TableHead className={COL.start}>Start Time</TableHead>
      <TableHead className={COL.end}>End Time</TableHead>
      <TableHead className={COL.location}>Location</TableHead>
      <TableHead className={COL.notes}>Notes</TableHead>
      <TableHead className={COL.group}>Activity Group</TableHead>
      <TableHead className={cn(COL.actions, "text-right")}>Actions</TableHead>
    </TableRow>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Timesheet Capture</h1>
          <p className="text-sm text-muted-foreground">
            Enter raw field hours to be clarified. Paste directly from a spreadsheet or add rows one at a time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setPasteOpen(true)} className="gap-2">
            <ClipboardPaste className="w-4 h-4" />
            Paste Rows
          </Button>
          <Button onClick={() => setNewRow(emptyDraft(defaultActivityTypeId, defaultGroupId))} disabled={newRow !== null} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Row
          </Button>
        </div>
      </header>

      {/* Bulk toolbar — only shown when rows are selected */}
      {someSelected && (
        <div className="px-6 py-2 border-b border-border bg-muted/30 flex items-center gap-3 shrink-0">
          <Badge variant="secondary">{selectedIds.size} selected</Badge>
          <div className="flex items-center gap-2">
            <div className="w-[220px]">
              <Combobox options={locationOptions} value={bulkLocationId} onValueChange={setBulkLocationId} placeholder="Set location..." searchPlaceholder="Search locations..." />
            </div>
            <Button size="sm" variant="outline" onClick={handleBulkSetLocation} disabled={!bulkLocationId || isBulkWorking} className="gap-1">
              {isBulkWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Apply Location
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={handleBulkApproveSelected} disabled={isBulkWorking} className="gap-1 text-primary hover:text-primary">
            {isBulkWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
            Approve Selected
          </Button>
          <Button size="sm" variant="outline" onClick={handleBulkDelete} disabled={isBulkWorking} className="gap-1 text-destructive hover:text-destructive">
            {isBulkWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Delete Selected
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSelection} className="ml-auto">Clear selection</Button>
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
            <Table>
              <TableHeader className="bg-muted/30 sticky top-0 z-10">
                <TableCols />
              </TableHeader>
              <TableBody>

                {/* ── New row form ── */}
                {newRow && (
                  <TableRow className="bg-primary/5">
                    <TableCell className="w-[36px]" />
                    <TableCell className={COL.date}>
                      <Input type="date" lang="en-GB" value={newRow.date} onChange={(e) => setNewRow({ ...newRow, date: e.target.value })} className="h-8 text-sm" />
                    </TableCell>
                    <TableCell className={COL.team}>
                      <Select value={newRow.teamId?.toString() || ""} onValueChange={(v) => setNewRow({ ...newRow, teamId: parseInt(v) })}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select Team" /></SelectTrigger>
                        <SelectContent>{teams.map((t) => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className={COL.start}>
                      <Input type="time" value={newRow.startTime} onChange={(e) => setNewRow({ ...newRow, startTime: e.target.value })} className="h-8 text-sm" />
                    </TableCell>
                    <TableCell className={COL.end}>
                      <Input type="time" value={newRow.endTime} onChange={(e) => setNewRow({ ...newRow, endTime: e.target.value })} className="h-8 text-sm" />
                    </TableCell>
                    <TableCell className={COL.location}>
                      <Combobox options={locationOptions} value={newRow.locationId?.toString() || ""} onValueChange={(v) => setNewRow({ ...newRow, locationId: parseInt(v) })} placeholder="Select Location" searchPlaceholder="Search locations..." />
                    </TableCell>
                    <TableCell className={COL.notes}>
                      <Input value={newRow.notes} onChange={(e) => setNewRow({ ...newRow, notes: e.target.value })} placeholder="Notes..." className="h-8 text-sm" onKeyDown={(e) => e.key === "Enter" && handleCreate()} />
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
                      />
                    </TableCell>
                    <TableCell className={cn(COL.actions, "text-right")}>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:bg-primary/10" onClick={handleCreate} disabled={createMutation.isPending || !newRow.date}>
                          {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => setNewRow(null)}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}

                {/* ── Existing entries ── */}
                {sortedEntries.map((entry) => {
                  const isEditing = editingId === entry.id;

                  if (isEditing) {
                    return (
                      <TableRow key={entry.id} className="bg-muted/20">
                        <TableCell className="w-[36px]" />
                        <TableCell className={COL.date}>
                          <Input type="date" lang="en-GB" value={editDraft.date || ""} onChange={(e) => updateDraftDebounced({ date: e.target.value })} onBlur={flushAutosave} className="h-8 text-sm" />
                        </TableCell>
                        <TableCell className={COL.team}>
                          <Select value={editDraft.teamId?.toString() || ""} onValueChange={(v) => commitDraft({ teamId: parseInt(v) })}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select Team" /></SelectTrigger>
                            <SelectContent>{teams.map((t) => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className={COL.start}>
                          <Input type="time" value={editDraft.startTime || ""} onChange={(e) => updateDraftDebounced({ startTime: e.target.value })} onBlur={flushAutosave} className="h-8 text-sm" />
                        </TableCell>
                        <TableCell className={COL.end}>
                          <Input type="time" value={editDraft.endTime || ""} onChange={(e) => updateDraftDebounced({ endTime: e.target.value })} onBlur={flushAutosave} className="h-8 text-sm" />
                        </TableCell>
                        <TableCell className={COL.location}>
                          <Combobox options={locationOptions} value={editDraft.locationId?.toString() || ""} onValueChange={(v) => commitDraft({ locationId: parseInt(v) })} placeholder="Select Location" searchPlaceholder="Search locations..." />
                        </TableCell>
                        <TableCell className={COL.notes}>
                          <Input value={editDraft.notes || ""} onChange={(e) => updateDraftDebounced({ notes: e.target.value })} onBlur={flushAutosave} className="h-8 text-sm" onKeyDown={(e) => e.key === "Enter" && handleUpdate()} />
                        </TableCell>
                        <TableCell className={COL.group}>
                          <ActivityGroupPicker
                            allowedTypes={allowedTypes}
                            allowedGroups={allowedGroups}
                            workingTypeId={workingTypeId}
                            typeValue={editDraft.activityTypeId ?? null}
                            groupValue={editDraft.activityGroupId ?? null}
                            onTypeChange={(id) => commitDraft({ activityTypeId: id })}
                            onGroupChange={(id) => commitDraft({ activityGroupId: id })}
                          />
                        </TableCell>
                        <TableCell className={cn(COL.actions, "text-right")}>
                          <div className="flex items-center justify-end gap-1">
                            {autosaveMutation.isPending && !updateMutation.isPending && (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground mr-1" />
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:bg-primary/10" onClick={handleUpdate} disabled={updateMutation.isPending || !editDraft.date}>
                              {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => { if (autosaveTimerRef.current) { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null; } setEditingId(null); }}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  // ── Display row ──
                  const isSelected = selectedIds.has(entry.id);
                  return (
                    <TableRow key={entry.id} className={cn("hover:bg-muted/20 cursor-pointer", isSelected && "bg-muted/30")} onClick={() => startEditing(entry)}>
                      <TableCell className="w-[36px]" onClick={e => e.stopPropagation()}>
                        <Checkbox checked={isSelected} onCheckedChange={() => toggleSelectRow(entry.id)} aria-label={`Select row ${entry.id}`} />
                      </TableCell>
                      <TableCell className={cn(COL.date, "font-medium")}>
                        {(() => { try { return format(parseISO(entry.date), "dd/MM/yyyy"); } catch { return entry.date; } })()}
                      </TableCell>
                      <TableCell className={COL.team}>
                        {entry.team?.name || <span className="text-muted-foreground/50">--</span>}
                      </TableCell>
                      <TableCell className={COL.start}>
                        {entry.startTime ? formatTimeDisplay(entry.startTime) : <span className="text-muted-foreground/50">--</span>}
                      </TableCell>
                      <TableCell className={COL.end}>
                        {entry.endTime ? formatTimeDisplay(entry.endTime) : <span className="text-muted-foreground/50">--</span>}
                      </TableCell>
                      <TableCell className={COL.location}>
                        {entry.location?.name || <span className="text-muted-foreground/50">--</span>}
                      </TableCell>
                      <TableCell className={cn(COL.notes, "max-w-[180px] truncate")}>
                        {entry.notes || <span className="text-muted-foreground/50">--</span>}
                      </TableCell>
                      <TableCell className={COL.group} onClick={(e) => e.stopPropagation()}>
                        <ActivityGroupPicker
                          allowedTypes={allowedTypes}
                          allowedGroups={allowedGroups}
                          workingTypeId={workingTypeId}
                          typeValue={entry.activityTypeId ?? null}
                          groupValue={entry.activityGroupId ?? null}
                          onTypeChange={(id) => handleQuickSetType(entry, id)}
                          onGroupChange={(id) => handleQuickSetGroup(entry, id)}
                        />
                      </TableCell>
                      <TableCell className={cn(COL.actions, "text-right")} onClick={(e) => e.stopPropagation()}>
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

                {/* Empty state */}
                {!loadingEntries && sortedEntries.length === 0 && !newRow && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-16 text-muted-foreground">
                      No entries yet. Click <strong>Add Row</strong> or <strong>Paste Rows</strong> to start.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* ── Paste Rows dialog (unchanged behaviour) ── */}
      <Dialog open={pasteOpen} onOpenChange={(open) => { if (!open) closePasteDialog(); else setPasteOpen(true); }}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
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
                <Table>
                  <TableHeader className="bg-muted/50 sticky top-0">
                    <TableRow>
                      <TableHead className="w-[120px]">Date</TableHead>
                      <TableHead className="w-[140px]">Team</TableHead>
                      <TableHead className="w-[90px]">Start</TableHead>
                      <TableHead className="w-[90px]">End</TableHead>
                      <TableHead className="w-[200px]">Location</TableHead>
                      <TableHead className="w-[160px]">Activity Type</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRows.map((row) => {
                      const teamUnmatched = row.teamRaw && !row.teamId;
                      const locationUnmatched = row.locationRaw && !row.locationId;
                      return (
                        <TableRow key={row.key}>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <Input
                                type="date"
                                value={row.date ?? ""}
                                onChange={(e) => updatePendingRow(row.key, { date: e.target.value || null, dateRaw: e.target.value })}
                                className={cn("h-8 text-sm", !row.date && row.dateRaw && "border-red-500 focus-visible:ring-red-500")}
                              />
                              {!row.date && row.dateRaw && (
                                <span className="text-[10px] text-red-500 truncate max-w-[110px]" title={row.dateRaw}>
                                  Can't parse: {row.dateRaw}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Select value={row.teamId?.toString() || ""} onValueChange={(v) => updatePendingRow(row.key, { teamId: parseInt(v) })}>
                              <SelectTrigger className={`h-8 text-sm ${teamUnmatched ? "border-amber-500" : ""}`}>
                                <SelectValue placeholder={teamUnmatched ? row.teamRaw : "Select Team"} />
                              </SelectTrigger>
                              <SelectContent>{teams.map((t) => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}</SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input type="time" value={row.startTime} onChange={(e) => updatePendingRow(row.key, { startTime: e.target.value })} className="h-8 text-sm" />
                          </TableCell>
                          <TableCell>
                            <Input type="time" value={row.endTime} onChange={(e) => updatePendingRow(row.key, { endTime: e.target.value })} className="h-8 text-sm" />
                          </TableCell>
                          <TableCell>
                            <Combobox options={locationOptions} value={row.locationId?.toString() || ""} onValueChange={(v) => updatePendingRow(row.key, { locationId: parseInt(v) })} placeholder={locationUnmatched ? row.locationRaw : "Select Location"} searchPlaceholder="Search locations..." triggerClassName={locationUnmatched ? "border-amber-500" : undefined} />
                          </TableCell>
                          <TableCell>
                            <ActivityGroupPicker
                              allowedTypes={allowedTypes}
                              allowedGroups={allowedGroups}
                              workingTypeId={workingTypeId}
                              typeValue={row.activityTypeId}
                              groupValue={row.activityGroupId}
                              onTypeChange={(id) => updatePendingRow(row.key, { activityTypeId: id })}
                              onGroupChange={(id) => updatePendingRow(row.key, { activityGroupId: id })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input value={row.notes} onChange={(e) => updatePendingRow(row.key, { notes: e.target.value })} className="h-8 text-sm" />
                          </TableCell>
                          <TableCell>
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
                Some dates couldn't be parsed — fix them before saving (try YYYY-MM-DD or DD.MM.YY format).
              </div>
            )}
            {pendingRows && pendingRows.some((r) => (r.teamRaw && !r.teamId) || (r.locationRaw && !r.locationId)) && (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Some rows have a team or location that didn't match — pick a value from the dropdown before saving.
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0">
            {pendingRows && pendingRows.length > 0 && (
              <Badge variant="secondary" className="mr-auto">{pendingRows.length} row{pendingRows.length === 1 ? "" : "s"} parsed</Badge>
            )}
            <Button variant="outline" onClick={closePasteDialog}>Cancel</Button>
            <Button onClick={handleSaveBulk} disabled={!pendingRows || pendingRows.length === 0 || isSavingBulk || (pendingRows?.some((r) => r.dateRaw && !r.date) ?? false)} className="gap-2">
              {isSavingBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save {pendingRows?.length ?? 0} Row{pendingRows?.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
