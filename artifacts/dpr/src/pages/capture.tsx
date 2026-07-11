import { useState, useMemo, useRef } from "react";
import { format } from "date-fns";
import { 
  useListDprTimesheetEntries, 
  useCreateDprTimesheetEntry, 
  useUpdateDprTimesheetEntry, 
  useDeleteDprTimesheetEntry,
  useListDprTeams,
  useListDprLocations,
  useListDprActivityTypes,
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
import { Loader2, Plus, Save, Trash2, X, ClipboardPaste, AlertTriangle, Lock } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { formatTimeDisplay } from "@/lib/utils";

const DEFAULT_ACTIVITY_TYPE_NAME = "Effective Working Time";

type BillingParty = "jdr" | "orsted" | null;

type RowDraft = {
  date: string;
  teamId: number | null;
  startTime: string;
  endTime: string;
  locationId: number | null;
  notes: string;
  activityTypeId: number | null;
  billingParty: BillingParty;
};

function emptyDraft(defaultActivityTypeId: number | null): RowDraft {
  return {
    date: format(new Date(), "yyyy-MM-dd"),
    teamId: null,
    startTime: "",
    endTime: "",
    locationId: null,
    notes: "",
    activityTypeId: defaultActivityTypeId,
    billingParty: null,
  };
}

function BillingPartyToggle({ value, onChange }: { value: BillingParty; onChange: (v: BillingParty) => void }) {
  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => onChange(value === "jdr" ? null : "jdr")}
        className={`px-2 py-1 text-xs font-medium transition-colors ${value === "jdr" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
      >
        JDR
      </button>
      <button
        type="button"
        onClick={() => onChange(value === "orsted" ? null : "orsted")}
        className={`px-2 py-1 text-xs font-medium border-l border-border transition-colors ${value === "orsted" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
      >
        Orsted
      </button>
    </div>
  );
}

const QUICK_TYPE_NAMES = ["Effective Working Time", "Non-Working Time", "Weather Down Time"];
const QUICK_TYPE_LABELS: Record<string, string> = {
  "Effective Working Time": "EWT",
  "Non-Working Time": "Non-Working",
  "Weather Down Time": "Weather",
};

function QuickTypeButtons({
  activityTypes,
  value,
  onChange,
}: {
  activityTypes: { id: number; name: string }[];
  value: number | null;
  onChange: (id: number) => void;
}) {
  const options = QUICK_TYPE_NAMES
    .map(name => activityTypes.find(t => t.name.trim().toLowerCase() === name.toLowerCase()))
    .filter((t): t is { id: number; name: string } => !!t);

  if (options.length === 0) return null;

  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden">
      {options.map((type, idx) => (
        <button
          key={type.id}
          type="button"
          title={type.name}
          onClick={() => onChange(type.id)}
          className={`px-2 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${idx > 0 ? "border-l border-border" : ""} ${value === type.id ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
        >
          {QUICK_TYPE_LABELS[type.name] ?? type.name}
        </button>
      ))}
    </div>
  );
}

function findByName<T extends { id: number; name: string }>(list: T[], name: string): T | undefined {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return undefined;
  return list.find(item => item.name.trim().toLowerCase() === normalized);
}

function normalizeTime(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  }
  return trimmed;
}

function normalizeDate(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return format(new Date(), "yyyy-MM-dd");
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) return format(parsed, "yyyy-MM-dd");
  return trimmed;
}

type PendingRow = RowDraft & {
  key: string;
  teamRaw: string;
  locationRaw: string;
};

function parsePastedText(
  text: string,
  teams: DprTeam[],
  locations: DprLocation[],
  defaultActivityTypeId: number | null,
): PendingRow[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  return lines.map((line, idx) => {
    const cols = line.split("\t");
    const [rawDate = "", rawTeam = "", rawStart = "", rawEnd = "", rawLocation = "", rawNotes = ""] = cols;

    const team = findByName(teams, rawTeam);
    const location = findByName(locations, rawLocation);

    return {
      key: `${Date.now()}-${idx}`,
      date: normalizeDate(rawDate),
      teamId: team?.id ?? null,
      startTime: normalizeTime(rawStart),
      endTime: normalizeTime(rawEnd),
      locationId: location?.id ?? null,
      notes: rawNotes.trim(),
      activityTypeId: defaultActivityTypeId,
      billingParty: null,
      teamRaw: rawTeam.trim(),
      locationRaw: rawLocation.trim(),
    };
  });
}

export default function CapturePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: entries = [], isLoading: loadingEntries } = useListDprTimesheetEntries({ stage: "draft" });

  const { data: teams = [] } = useListDprTeams();
  const { data: locations = [] } = useListDprLocations();
  const { data: activityTypes = [] } = useListDprActivityTypes();

  const defaultActivityType = useMemo(
    () => findByName(activityTypes, DEFAULT_ACTIVITY_TYPE_NAME),
    [activityTypes]
  );
  const defaultActivityTypeId = defaultActivityType?.id ?? null;

  const locationOptions: ComboboxOption[] = useMemo(
    () => locations.map(l => ({ value: l.id.toString(), label: l.name })),
    [locations]
  );

  // Helper: snapshot all timesheet-entry caches so any mutation can roll back.
  const snapshotEntries = () =>
    queryClient.getQueriesData<DprTimesheetEntry[]>({ queryKey: getListDprTimesheetEntriesQueryKey() });

  // Helper: restore a previously snapshotted set of caches.
  const restoreEntries = (snap: ReturnType<typeof snapshotEntries>) =>
    snap.forEach(([key, data]) => queryClient.setQueryData(key, data));

  // Helper: patch a single entry across all cached entry lists.
  const patchEntry = (updated: DprTimesheetEntry) =>
    queryClient.setQueriesData<DprTimesheetEntry[]>(
      { queryKey: getListDprTimesheetEntriesQueryKey() },
      (old) => old?.map((e) => (e.id === updated.id ? updated : e))
    );

  const createMutation = useCreateDprTimesheetEntry({
    mutation: {
      onSuccess: (newEntry) => {
        // Append the server-confirmed entry to every cached list instead of
        // invalidating, so the row appears instantly with its real ID.
        queryClient.setQueriesData<DprTimesheetEntry[]>(
          { queryKey: getListDprTimesheetEntriesQueryKey() },
          (old) => (old ? [...old, newEntry] : [newEntry])
        );
        queryClient.invalidateQueries({ queryKey: getGetDprTimesheetSummaryQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Failed to create", description: err.message, variant: "destructive" });
      }
    }
  });

  const updateMutation = useUpdateDprTimesheetEntry({
    mutation: {
      onMutate: async ({ id, data }) => {
        await queryClient.cancelQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
        const snapshot = snapshotEntries();
        queryClient.setQueriesData<DprTimesheetEntry[]>(
          { queryKey: getListDprTimesheetEntriesQueryKey() },
          (old) => old?.map((e) => e.id === id ? { ...e, ...data } : e)
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
      }
    }
  });

  // Autosave runs silently in the background (no success toast, doesn't close
  // edit mode) so pasting/tabbing through rows doesn't require an explicit
  // save click. Errors still surface via toast.
  const autosaveMutation = useUpdateDprTimesheetEntry({
    mutation: {
      onMutate: async ({ id, data }) => {
        await queryClient.cancelQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
        const snapshot = snapshotEntries();
        queryClient.setQueriesData<DprTimesheetEntry[]>(
          { queryKey: getListDprTimesheetEntriesQueryKey() },
          (old) => old?.map((e) => e.id === id ? { ...e, ...data } : e)
        );
        return { snapshot };
      },
      onSuccess: (updated) => {
        patchEntry(updated);
      },
      onError: (err, _, ctx) => {
        if (ctx?.snapshot) restoreEntries(ctx.snapshot);
        toast({ title: "Autosave failed", description: err.message, variant: "destructive" });
      }
    }
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
      }
    }
  });

  // Bulk variants intentionally skip per-row toasts so a single summary toast
  // (fired after the whole batch finishes) isn't clobbered by per-row ones.
  // They have no onSuccess — the handler patches the cache after Promise.allSettled
  // so we get one cache update per batch, not N invalidations.
  const bulkDeleteMutation = useDeleteDprTimesheetEntry({ mutation: {} });

  const bulkUpdateMutation = useUpdateDprTimesheetEntry({ mutation: {} });

  // Dedicated mutation for the one-click quick-classify buttons on display
  // rows, kept separate from the editing autosave path since it fires
  // outside of edit mode. Uses optimistic cache update so the badge flips
  // instantly without waiting for the server round-trip.
  const quickTypeMutation = useUpdateDprTimesheetEntry({
    mutation: {
      onMutate: async ({ id, data }) => {
        await queryClient.cancelQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
        const snapshot = snapshotEntries();
        queryClient.setQueriesData<DprTimesheetEntry[]>(
          { queryKey: getListDprTimesheetEntriesQueryKey() },
          (old) => old?.map((e) => e.id === id ? { ...e, ...data } : e)
        );
        return { snapshot };
      },
      onSuccess: (updated) => {
        patchEntry(updated);
      },
      onError: (err, _, ctx) => {
        if (ctx?.snapshot) restoreEntries(ctx.snapshot);
        toast({ title: "Failed to set Activity Type", description: err.message, variant: "destructive" });
      }
    }
  });

  const approveMutation = useUpdateDprTimesheetEntry({
    mutation: {
      onMutate: async ({ id }) => {
        await queryClient.cancelQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
        const snapshot = snapshotEntries();
        // Move the entry to stage "captured" so it disappears from the draft
        // view immediately without waiting for a refetch.
        queryClient.setQueriesData<DprTimesheetEntry[]>(
          { queryKey: getListDprTimesheetEntriesQueryKey() },
          (old) => old?.map((e) => e.id === id ? { ...e, stage: "captured" as const } : e)
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
      }
    }
  });

  // Bulk approve — no per-mutation side effects; the handler does one cache
  // patch + one summary invalidation after the whole batch resolves.
  const bulkApproveMutation = useUpdateDprTimesheetEntry({ mutation: {} });

  const [newRow, setNewRow] = useState<RowDraft | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<DprTimesheetEntry>>({});
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pendingRows, setPendingRows] = useState<PendingRow[] | null>(null);
  const [isSavingBulk, setIsSavingBulk] = useState(false);
  const pasteTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBulkWorking, setIsBulkWorking] = useState(false);
  const [bulkLocationId, setBulkLocationId] = useState<string>("");

  const capturedEntries = useMemo(() => entries.filter(e => e.stage === "draft"), [entries]);

  const teamGroups = useMemo(() => {
    const byKey = new Map<string, { teamId: number | null; teamName: string; date: string; entries: DprTimesheetEntry[] }>();
    for (const entry of capturedEntries) {
      const teamId = entry.teamId ?? null;
      const key = `${teamId ?? "none"}__${entry.date}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.entries.push(entry);
      } else {
        byKey.set(key, {
          teamId,
          teamName: entry.team?.name || "Unassigned Team",
          date: entry.date,
          entries: [entry],
        });
      }
    }
    return Array.from(byKey.values()).sort((a, b) => {
      const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateCompare !== 0) return dateCompare;
      return a.teamName.localeCompare(b.teamName);
    });
  }, [capturedEntries]);

  const allSelected = capturedEntries.length > 0 && capturedEntries.every(e => selectedIds.has(e.id));
  const someSelected = capturedEntries.some(e => selectedIds.has(e.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(capturedEntries.map(e => e.id)));
    }
  };

  const toggleSelectRow = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setBulkLocationId("");
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkWorking(true);
    const ids = Array.from(selectedIds);
    // Optimistically remove all selected rows from the cache immediately so
    // the table clears without waiting for any server round-trip.
    queryClient.setQueriesData<DprTimesheetEntry[]>(
      { queryKey: getListDprTimesheetEntriesQueryKey() },
      (old) => old?.filter((e) => !ids.includes(e.id))
    );
    const results = await Promise.allSettled(ids.map(id => bulkDeleteMutation.mutateAsync({ id })));
    const succeededIds = ids.filter((_, i) => results[i].status === "fulfilled");
    const failed = results.length - succeededIds.length;
    // Restore any rows whose deletes actually failed.
    if (failed > 0) {
      queryClient.invalidateQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
    }
    queryClient.invalidateQueries({ queryKey: getGetDprTimesheetSummaryQueryKey() });
    setIsBulkWorking(false);
    clearSelection();
    if (succeededIds.length > 0) {
      toast({ title: `${succeededIds.length} row${succeededIds.length === 1 ? "" : "s"} deleted`, description: failed > 0 ? `${failed} row(s) failed to delete.` : undefined });
    } else if (failed > 0) {
      toast({ title: "Delete failed", description: "Check the rows and try again.", variant: "destructive" });
    }
  };

  const handleApprove = (id: number) => {
    approveMutation.mutate({ id, data: { stage: "captured" } });
  };

  const handleApproveGroup = async (ids: number[]) => {
    if (ids.length === 0) return;
    setIsBulkWorking(true);
    // Optimistically flip all rows to "captured" so they vanish from the draft
    // view immediately; any individual failures get restored by the invalidate.
    queryClient.setQueriesData<DprTimesheetEntry[]>(
      { queryKey: getListDprTimesheetEntriesQueryKey() },
      (old) => old?.map((e) => ids.includes(e.id) ? { ...e, stage: "captured" as const } : e)
    );
    const results = await Promise.allSettled(ids.map(id => bulkApproveMutation.mutateAsync({ id, data: { stage: "captured" } })));
    const succeeded = results.filter(r => r.status === "fulfilled").length;
    const failed = results.length - succeeded;
    if (failed > 0) {
      queryClient.invalidateQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
    }
    queryClient.invalidateQueries({ queryKey: getGetDprTimesheetSummaryQueryKey() });
    setIsBulkWorking(false);
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
    if (succeeded > 0) {
      toast({ title: `${succeeded} row${succeeded === 1 ? "" : "s"} approved`, description: failed > 0 ? `${failed} row(s) failed to approve.` : "Sent to Clarify." });
    } else if (failed > 0) {
      toast({ title: "Approve failed", description: "Check the rows and try again.", variant: "destructive" });
    }
  };

  const handleBulkApproveSelected = async () => {
    if (selectedIds.size === 0) return;
    await handleApproveGroup(Array.from(selectedIds));
    setBulkLocationId("");
  };

  const handleBulkSetLocation = async () => {
    if (selectedIds.size === 0 || !bulkLocationId) return;
    setIsBulkWorking(true);
    const ids = Array.from(selectedIds);
    const locationId = parseInt(bulkLocationId);
    const locationObj = locations.find(l => l.id === locationId);
    // Optimistically patch location on all selected rows immediately.
    queryClient.setQueriesData<DprTimesheetEntry[]>(
      { queryKey: getListDprTimesheetEntriesQueryKey() },
      (old) => old?.map((e) =>
        ids.includes(e.id)
          ? { ...e, locationId, location: locationObj ? { id: locationObj.id, name: locationObj.name } : e.location }
          : e
      )
    );
    const results = await Promise.allSettled(ids.map(id => bulkUpdateMutation.mutateAsync({ id, data: { locationId } })));
    const succeeded = results.filter(r => r.status === "fulfilled").length;
    const failed = results.length - succeeded;
    // Confirm each succeeded row with actual server data; restore on any failure.
    results.forEach((r, i) => {
      if (r.status === "fulfilled") patchEntry(r.value);
    });
    if (failed > 0) {
      queryClient.invalidateQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
    }
    setIsBulkWorking(false);
    clearSelection();
    if (succeeded > 0) {
      toast({ title: `Location updated on ${succeeded} row${succeeded === 1 ? "" : "s"}`, description: failed > 0 ? `${failed} row(s) failed to update.` : undefined });
    } else if (failed > 0) {
      toast({ title: "Update failed", description: "Check the rows and try again.", variant: "destructive" });
    }
  };

  const handleCreate = () => {
    if (!newRow || !newRow.date) return;
    createMutation.mutate({
      data: {
        date: newRow.date,
        teamId: newRow.teamId || undefined,
        startTime: newRow.startTime || undefined,
        endTime: newRow.endTime || undefined,
        locationId: newRow.locationId || undefined,
        notes: newRow.notes || undefined,
        activityTypeId: newRow.activityTypeId || undefined,
        billingParty: newRow.billingParty || undefined,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Entry created" });
        setNewRow(null);
      }
    });
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

  // Quick-classify a display row's Activity Type in one click without
  // entering the full inline edit mode.
  const handleQuickSetType = (entry: DprTimesheetEntry, activityTypeId: number) => {
    quickTypeMutation.mutate({ id: entry.id, data: buildUpdatePayload({ ...entry, activityTypeId }) });
  };

  const handleUpdate = () => {
    if (!editingId) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    updateMutation.mutate({ id: editingId, data: buildUpdatePayload(editDraft) });
  };

  // Start editing a row, flushing any pending autosave on the previously
  // edited row first so switching rows never drops an unsaved change.
  const startEditing = (entry: DprTimesheetEntry) => {
    flushAutosave();
    setEditingId(entry.id);
    setEditDraft({
      date: entry.date,
      teamId: entry.teamId,
      startTime: entry.startTime || "",
      endTime: entry.endTime || "",
      locationId: entry.locationId,
      notes: entry.notes || "",
      activityTypeId: entry.activityTypeId,
      billingParty: entry.billingParty ?? null,
    });
  };

  // Immediately save the current edit draft in the background (no toast,
  // doesn't close edit mode). Used on blur/select so the user can paste and
  // move on without waiting for or clicking a save button.
  const flushAutosave = () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (!editingId || !editDraft.date) return;
    autosaveMutation.mutate({ id: editingId, data: buildUpdatePayload(editDraft) });
  };

  // Update the draft and immediately autosave with the new value (for
  // discrete selections like Team/Location where there's no "typing" to
  // debounce).
  const commitDraft = (patch: Partial<DprTimesheetEntry>) => {
    const next = { ...editDraft, ...patch };
    setEditDraft(next);
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (!editingId || !next.date) return;
    autosaveMutation.mutate({ id: editingId, data: buildUpdatePayload(next) });
  };

  // Update the draft and schedule a debounced autosave (for free-typed
  // fields like Notes/Date/Times) so rapid keystrokes don't fire a request
  // per character; blur still flushes immediately via flushAutosave.
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

  const handlePasteChange = (text: string) => {
    setPasteText(text);
    if (!text.trim()) {
      setPendingRows(null);
      return;
    }
    setPendingRows(parsePastedText(text, teams, locations, defaultActivityTypeId));
  };

  const updatePendingRow = (key: string, patch: Partial<PendingRow>) => {
    setPendingRows(rows => rows?.map(r => r.key === key ? { ...r, ...patch } : r) ?? null);
  };

  const removePendingRow = (key: string) => {
    setPendingRows(rows => rows?.filter(r => r.key !== key) ?? null);
  };

  const closePasteDialog = () => {
    setPasteOpen(false);
    setPasteText("");
    setPendingRows(null);
  };

  const handleSaveBulk = async () => {
    if (!pendingRows || pendingRows.length === 0) return;
    setIsSavingBulk(true);
    const rowsToSave = pendingRows.filter(row => row.date);
    const skipped = pendingRows.length - rowsToSave.length;
    // Save all pasted rows in parallel rather than one request at a time —
    // this is the main lever for the "paste feels slow" complaint since a
    // batch of 20+ rows previously took 20+ sequential round trips.
    const results = await Promise.allSettled(rowsToSave.map(row => createMutation.mutateAsync({
      data: {
        date: row.date,
        teamId: row.teamId || undefined,
        startTime: row.startTime || undefined,
        endTime: row.endTime || undefined,
        locationId: row.locationId || undefined,
        notes: row.notes || undefined,
        activityTypeId: row.activityTypeId || undefined,
        billingParty: row.billingParty || undefined,
      }
    })));
    const succeeded = results.filter(r => r.status === "fulfilled").length;
    const failed = results.length - succeeded + skipped;
    setIsSavingBulk(false);
    if (succeeded > 0) {
      toast({ title: `${succeeded} row${succeeded === 1 ? "" : "s"} added`, description: failed > 0 ? `${failed} row(s) failed to save.` : undefined });
    } else {
      toast({ title: "No rows saved", description: "Check the rows and try again.", variant: "destructive" });
    }
    if (failed === 0) {
      closePasteDialog();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b border-border bg-card flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Timesheet Capture</h1>
          <p className="text-sm text-muted-foreground">Enter raw field hours to be clarified. Paste directly from a spreadsheet or add rows one at a time.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setPasteOpen(true)}
            className="gap-2"
          >
            <ClipboardPaste className="w-4 h-4" />
            Paste Rows
          </Button>
          <Button 
            onClick={() => setNewRow(emptyDraft(defaultActivityTypeId))}
            disabled={newRow !== null}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Row
          </Button>
        </div>
      </header>

      {someSelected && (
        <div className="px-6 py-2 border-b border-border bg-sidebar-accent/40 flex items-center gap-3 shrink-0">
          <Badge variant="secondary">{selectedIds.size} selected</Badge>
          <div className="flex items-center gap-2">
            <div className="w-[220px]">
              <Combobox
                options={locationOptions}
                value={bulkLocationId}
                onValueChange={setBulkLocationId}
                placeholder="Set location..."
                searchPlaceholder="Search locations..."
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkSetLocation}
              disabled={!bulkLocationId || isBulkWorking}
              className="gap-1"
            >
              {isBulkWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Apply Location
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleBulkApproveSelected}
            disabled={isBulkWorking}
            className="gap-1 text-primary hover:text-primary"
          >
            {isBulkWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
            Approve Selected
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleBulkDelete}
            disabled={isBulkWorking}
            className="gap-1 text-destructive hover:text-destructive"
          >
            {isBulkWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Delete Selected
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSelection} className="ml-auto">
            Clear selection
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-auto p-6 bg-background space-y-6">
        {loadingEntries && !newRow && teamGroups.length === 0 && (
          <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        )}

        {newRow && (
        <div className="rounded-md border border-border bg-card overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead className="w-[140px]">Date</TableHead>
                <TableHead className="w-[160px]">Team</TableHead>
                <TableHead className="w-[110px]">Start Time</TableHead>
                <TableHead className="w-[110px]">End Time</TableHead>
                <TableHead className="w-[220px]">Location</TableHead>
                <TableHead className="w-[160px]">Billing</TableHead>
                <TableHead className="w-[190px]">Activity Type</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {newRow && (
                <TableRow className="bg-primary/5">
                  <TableCell></TableCell>
                  <TableCell>
                    <Input 
                      type="date" 
                      value={newRow.date} 
                      onChange={e => setNewRow({ ...newRow, date: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Select value={newRow.teamId?.toString() || ""} onValueChange={v => setNewRow({ ...newRow, teamId: parseInt(v) })}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select Team" /></SelectTrigger>
                      <SelectContent>
                        {teams.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input 
                      type="time" 
                      value={newRow.startTime} 
                      onChange={e => setNewRow({ ...newRow, startTime: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Input 
                      type="time" 
                      value={newRow.endTime} 
                      onChange={e => setNewRow({ ...newRow, endTime: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Combobox
                      options={locationOptions}
                      value={newRow.locationId?.toString() || ""}
                      onValueChange={v => setNewRow({ ...newRow, locationId: parseInt(v) })}
                      placeholder="Select Location"
                      searchPlaceholder="Search locations..."
                    />
                  </TableCell>
                  <TableCell>
                    <BillingPartyToggle
                      value={newRow.billingParty}
                      onChange={v => setNewRow({ ...newRow, billingParty: v })}
                    />
                  </TableCell>
                  <TableCell>
                    <QuickTypeButtons
                      activityTypes={activityTypes}
                      value={newRow.activityTypeId}
                      onChange={id => setNewRow({ ...newRow, activityTypeId: id })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input 
                      value={newRow.notes} 
                      onChange={e => setNewRow({ ...newRow, notes: e.target.value })}
                      placeholder="Notes..."
                      className="h-8 text-sm"
                      onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-green-500 hover:text-green-600 hover:bg-green-500/10" onClick={handleCreate} disabled={createMutation.isPending || !newRow.date}>
                        {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setNewRow(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        )}

        {teamGroups.map(group => {
          const groupIds = group.entries.map(e => e.id);
          const groupAllSelected = groupIds.length > 0 && groupIds.every(id => selectedIds.has(id));
          return (
          <Card key={`${group.teamId ?? "none"}__${group.date}`} className="overflow-hidden py-0">
            <CardHeader className="flex flex-row items-center justify-between gap-3 bg-muted/50 border-b border-border py-3 px-4">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-sm">{group.teamName}</h3>
                <span className="text-sm text-muted-foreground">{format(new Date(group.date), "MMM d, yyyy")}</span>
                <Badge variant="secondary">{group.entries.length} row{group.entries.length === 1 ? "" : "s"}</Badge>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-primary hover:text-primary"
                disabled={isBulkWorking}
                onClick={() => handleApproveGroup(groupIds)}
              >
                {isBulkWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                Approve All
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={groupAllSelected}
                        onCheckedChange={() => {
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            if (groupAllSelected) {
                              groupIds.forEach(id => next.delete(id));
                            } else {
                              groupIds.forEach(id => next.add(id));
                            }
                            return next;
                          });
                        }}
                        aria-label={`Select all rows for ${group.teamName} on ${group.date}`}
                      />
                    </TableHead>
                    <TableHead className="w-[140px]">Date</TableHead>
                    <TableHead className="w-[160px]">Team</TableHead>
                    <TableHead className="w-[110px]">Start Time</TableHead>
                    <TableHead className="w-[110px]">End Time</TableHead>
                    <TableHead className="w-[220px]">Location</TableHead>
                    <TableHead className="w-[160px]">Billing</TableHead>
                    <TableHead className="w-[190px]">Activity Type</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-[130px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
              {group.entries.map(entry => {
                const isEditing = editingId === entry.id;
                const isSelected = selectedIds.has(entry.id);
                
                if (isEditing) {
                  return (
                    <TableRow key={entry.id} className="bg-sidebar-accent/30">
                      <TableCell></TableCell>
                      <TableCell>
                        <Input 
                          type="date" 
                          value={editDraft.date || ""} 
                          onChange={e => updateDraftDebounced({ date: e.target.value })}
                          onBlur={flushAutosave}
                          className="h-8 text-sm"
                        />
                      </TableCell>
                      <TableCell>
                        <Select value={editDraft.teamId?.toString() || ""} onValueChange={v => commitDraft({ teamId: parseInt(v) })}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select Team" /></SelectTrigger>
                          <SelectContent>
                            {teams.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input 
                          type="time" 
                          value={editDraft.startTime || ""} 
                          onChange={e => updateDraftDebounced({ startTime: e.target.value })}
                          onBlur={flushAutosave}
                          className="h-8 text-sm"
                        />
                      </TableCell>
                      <TableCell>
                        <Input 
                          type="time" 
                          value={editDraft.endTime || ""} 
                          onChange={e => updateDraftDebounced({ endTime: e.target.value })}
                          onBlur={flushAutosave}
                          className="h-8 text-sm"
                        />
                      </TableCell>
                      <TableCell>
                        <Combobox
                          options={locationOptions}
                          value={editDraft.locationId?.toString() || ""}
                          onValueChange={v => commitDraft({ locationId: parseInt(v) })}
                          placeholder="Select Location"
                          searchPlaceholder="Search locations..."
                        />
                      </TableCell>
                      <TableCell>
                        <BillingPartyToggle
                          value={(editDraft.billingParty ?? null) as BillingParty}
                          onChange={v => commitDraft({ billingParty: v })}
                        />
                      </TableCell>
                      <TableCell>
                        <QuickTypeButtons
                          activityTypes={activityTypes}
                          value={editDraft.activityTypeId ?? null}
                          onChange={id => commitDraft({ activityTypeId: id })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input 
                          value={editDraft.notes || ""} 
                          onChange={e => updateDraftDebounced({ notes: e.target.value })}
                          onBlur={flushAutosave}
                          className="h-8 text-sm"
                          onKeyDown={e => e.key === 'Enter' && handleUpdate()}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {autosaveMutation.isPending && !updateMutation.isPending && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground mr-1" aria-label="Saving" />
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-green-500 hover:text-green-600 hover:bg-green-500/10" onClick={handleUpdate} disabled={updateMutation.isPending || !editDraft.date}>
                            {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => {
                            if (autosaveTimerRef.current) {
                              clearTimeout(autosaveTimerRef.current);
                              autosaveTimerRef.current = null;
                            }
                            setEditingId(null);
                          }}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }

                return (
                  <TableRow
                    key={entry.id}
                    className={`group hover:bg-sidebar-accent/10 ${isSelected ? "bg-sidebar-accent/20" : ""}`}
                  >
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelectRow(entry.id)}
                        aria-label={`Select row ${entry.id}`}
                      />
                    </TableCell>
                    <TableCell
                      className="font-medium cursor-pointer"
                      onClick={() => startEditing(entry)}
                    >
                      {entry.date}
                    </TableCell>
                    <TableCell
                      className="cursor-pointer"
                      onClick={() => startEditing(entry)}
                    >
                      {entry.team?.name || <span className="text-muted-foreground/50">--</span>}
                    </TableCell>
                    <TableCell
                      className="cursor-pointer"
                      onClick={() => startEditing(entry)}
                    >
                      {entry.startTime ? formatTimeDisplay(entry.startTime) : <span className="text-muted-foreground/50">--</span>}
                    </TableCell>
                    <TableCell
                      className="cursor-pointer"
                      onClick={() => startEditing(entry)}
                    >
                      {entry.endTime ? formatTimeDisplay(entry.endTime) : <span className="text-muted-foreground/50">--</span>}
                    </TableCell>
                    <TableCell
                      className="cursor-pointer"
                      onClick={() => startEditing(entry)}
                    >
                      {entry.location?.name || <span className="text-muted-foreground/50">--</span>}
                    </TableCell>
                    <TableCell
                      className="cursor-pointer"
                      onClick={() => startEditing(entry)}
                    >
                      {entry.billingParty ? (
                        <Badge variant={entry.billingParty === "jdr" ? "default" : "secondary"} className="capitalize">
                          {entry.billingParty}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/50">--</span>
                      )}
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <QuickTypeButtons
                        activityTypes={activityTypes}
                        value={entry.activityTypeId ?? null}
                        onChange={id => handleQuickSetType(entry, id)}
                      />
                    </TableCell>
                    <TableCell
                      className="max-w-[300px] truncate cursor-pointer"
                      onClick={() => startEditing(entry)}
                    >
                      {entry.notes || <span className="text-muted-foreground/50">--</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary hover:bg-primary/10"
                          onClick={(e) => { e.stopPropagation(); handleApprove(entry.id); }}
                          title="Approve row"
                        >
                          {approveMutation.isPending && approveMutation.variables?.id === entry.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => { e.stopPropagation(); deleteMutation.mutate({ id: entry.id }); }}
                        >
                          {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          );
        })}

        {!loadingEntries && teamGroups.length === 0 && !newRow && (
          <div className="text-center p-12 border border-dashed rounded-lg border-border text-muted-foreground">
            No captured entries. Click "Add Row" or "Paste Rows" to start.
          </div>
        )}
      </div>

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
              onChange={e => handlePasteChange(e.target.value)}
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
                      <TableHead className="w-[160px]">Billing</TableHead>
                      <TableHead className="w-[190px]">Activity Type</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRows.map(row => {
                      const teamUnmatched = row.teamRaw && !row.teamId;
                      const locationUnmatched = row.locationRaw && !row.locationId;
                      return (
                        <TableRow key={row.key}>
                          <TableCell>
                            <Input
                              type="date"
                              value={row.date}
                              onChange={e => updatePendingRow(row.key, { date: e.target.value })}
                              className="h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell>
                            <Select value={row.teamId?.toString() || ""} onValueChange={v => updatePendingRow(row.key, { teamId: parseInt(v) })}>
                              <SelectTrigger className={`h-8 text-sm ${teamUnmatched ? "border-amber-500" : ""}`}>
                                <SelectValue placeholder={teamUnmatched ? row.teamRaw : "Select Team"} />
                              </SelectTrigger>
                              <SelectContent>
                                {teams.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="time"
                              value={row.startTime}
                              onChange={e => updatePendingRow(row.key, { startTime: e.target.value })}
                              className="h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="time"
                              value={row.endTime}
                              onChange={e => updatePendingRow(row.key, { endTime: e.target.value })}
                              className="h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell>
                            <Combobox
                              options={locationOptions}
                              value={row.locationId?.toString() || ""}
                              onValueChange={v => updatePendingRow(row.key, { locationId: parseInt(v) })}
                              placeholder={locationUnmatched ? row.locationRaw : "Select Location"}
                              searchPlaceholder="Search locations..."
                              triggerClassName={locationUnmatched ? "border-amber-500" : undefined}
                            />
                          </TableCell>
                          <TableCell>
                            <BillingPartyToggle
                              value={row.billingParty}
                              onChange={v => updatePendingRow(row.key, { billingParty: v })}
                            />
                          </TableCell>
                          <TableCell>
                            <QuickTypeButtons
                              activityTypes={activityTypes}
                              value={row.activityTypeId}
                              onChange={id => updatePendingRow(row.key, { activityTypeId: id })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={row.notes}
                              onChange={e => updatePendingRow(row.key, { notes: e.target.value })}
                              className="h-8 text-sm"
                            />
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

            {pendingRows && pendingRows.some(r => (r.teamRaw && !r.teamId) || (r.locationRaw && !r.locationId)) && (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Some rows have a team or location that didn't match reference data — pick a value from the dropdown before saving.
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0">
            {pendingRows && pendingRows.length > 0 && (
              <Badge variant="secondary" className="mr-auto">{pendingRows.length} row{pendingRows.length === 1 ? "" : "s"} parsed</Badge>
            )}
            <Button variant="outline" onClick={closePasteDialog}>Cancel</Button>
            <Button onClick={handleSaveBulk} disabled={!pendingRows || pendingRows.length === 0 || isSavingBulk} className="gap-2">
              {isSavingBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save {pendingRows?.length ?? 0} Row{pendingRows?.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
