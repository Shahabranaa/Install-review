import { useState, useMemo } from "react";
import { format, parseISO, subDays, addDays } from "date-fns";
import {
  useListDprTimesheetEntries,
  useListDprTeams,
  useUpdateDprTimesheetEntry,
  useListDprActivityTypes,
  useListDprActivityGroups,
  useListDprActivities,
  useListDprJdrCodes,
  getListDprActivityGroupsQueryKey,
  getListDprTimesheetEntriesQueryKey,
  getGetDprTimesheetSummaryQueryKey,
  getListDprActivitiesQueryKey,
  getListDprJdrCodesQueryKey,
  DprTimesheetEntry,
  DprActivity,
  DprActivityType,
  DprActivityGroup,
  DprJdrCode,
  DprTeam,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Loader2, CheckCircle2, Check, Unlock, Download, CheckSquare, Square, Minus, CheckCheck,
} from "lucide-react";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { buildLautecCsv, downloadCsv } from "@/lib/export-csv";
import { useToast } from "@/hooks/use-toast";
import { formatTimeDisplay, hoursForEntry, formatDuration, cn } from "@/lib/utils";
import { useCaptureNav } from "@/contexts/CaptureNavContext";
import { compareDprRows } from "@/lib/sorting";

// ─── Column widths ─────────────────────────────────────────────────────────────
const SHEET_CELL = "border-r border-border/40 px-2 py-1 align-middle";
const SHEET_HEAD = "h-8 border-r border-border/50 px-2 py-1 text-[11px] font-semibold text-muted-foreground whitespace-nowrap";

function ActivityGroupPill({ name, muted = false }: { name?: string; muted?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        muted
          ? "border-border/60 bg-muted/30 text-muted-foreground"
          : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", muted ? "bg-muted-foreground/40" : "bg-amber-500")} />
      <span className="truncate">{name || "Not set"}</span>
    </span>
  );
}

function activityLabel(
  entry: DprTimesheetEntry,
  activityGroups: DprActivityGroup[],
  activityTypes: DprActivityType[],
): string | undefined {
  const type = activityTypes.find((item) => item.id === entry.activityTypeId);
  // A non-working entry deliberately has no sub-group. Prefer its selected
  // type over any stale group that may have been saved by older versions.
  if (type?.name === "Non-Working Time") return type.name;

  return activityGroups.find((item) => item.id === entry.activityGroupId)?.name
    ?? type?.name;
}

function formatDateIfDifferent(raw: string | null | undefined, currentDate: string | null): string | null {
  if (!raw || raw === currentDate) return null;
  try { return format(parseISO(raw), "dd MMM yyyy"); } catch { return raw; }
}

function EntryTeamCell({ entry, currentDate, muted = false }: {
  entry: DprTimesheetEntry;
  currentDate: string | null;
  muted?: boolean;
}) {
  const dateLabel = formatDateIfDifferent(entry.date, currentDate);
  return (
    <div className={cn("min-w-0", muted && "text-muted-foreground")}>
      <div className="truncate text-xs font-medium">{entry.team?.name || "Unassigned"}</div>
      {dateLabel && (
        <div className="truncate text-[10px] leading-tight text-muted-foreground">
          {dateLabel}
          {entry.shiftDate && entry.shiftDate !== entry.date && <span className="ml-1 text-indigo-500">overnight</span>}
        </div>
      )}
    </div>
  );
}

// ─── Team pills (mirrors Capture's FilterPills) ───────────────────────────────
function ClarifyPills({
  teams,
  activeDate,
  activeTeamId,
  onTeamClick,
  pendingByTeam,
}: {
  teams: DprTeam[];
  activeDate: string | null;
  activeTeamId: number | null;
  onTeamClick: (id: number | null) => void;
  pendingByTeam: Map<number | null, number>;
}) {
  const renderPill = (team: DprTeam | { id: null; name: string }) => {
    const isActive = activeTeamId === team.id;
    const pending = pendingByTeam.get(team.id) ?? 0;
    return (
      <button
        key={team.id ?? "none"}
        type="button"
        onClick={() => onTeamClick(team.id)}
        className={cn(
          "shrink-0 rounded-full px-3 py-0.5 text-xs font-medium transition-colors",
          isActive
            ? "border-2 border-amber-500 bg-amber-500 text-white"
            : pending > 0
            ? "border-2 bg-transparent border-amber-500/60 text-muted-foreground hover:border-amber-500 hover:text-foreground"
            : "border-2 bg-transparent border-border text-muted-foreground hover:border-primary/60 hover:text-foreground"
        )}
      >
        {team.name}
      </button>
    );
  };

  if (!activeDate) {
    return (
      <div className="shrink-0 overflow-x-auto overscroll-contain border-b border-border bg-background px-4 sm:px-6 py-2">
        <div className="flex min-w-max items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0 w-8">Team</span>
          {teams.map(t => renderPill(t))}
        </div>
      </div>
    );
  }

  const todoTeams = teams.filter(t => (pendingByTeam.get(t.id) ?? 0) > 0);
  const doneTeams = teams.filter(t => (pendingByTeam.get(t.id) ?? 0) === 0);

  return (
    <div className="shrink-0 overflow-x-auto overscroll-contain border-b border-border bg-background px-4 sm:px-6 py-2">
      <div className="flex min-w-max items-center gap-1.5">
        <span className="text-xs text-muted-foreground shrink-0 w-8">To do</span>
        {todoTeams.length > 0
          ? todoTeams.map(t => renderPill(t))
          : <span className="text-xs text-muted-foreground italic">none</span>}
      </div>
      {doneTeams.length > 0 && (
        <div className="mt-1.5 flex min-w-max items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0 w-8">Done</span>
          {doneTeams.map(t => renderPill(t))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ClarifyPage() {
  const { activeDate, activeTeamId, setActiveTeamId } = useCaptureNav();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: allEntries = [], isLoading: loadingEntries } = useListDprTimesheetEntries();
  const { data: teams = [] } = useListDprTeams();
  const { data: activityTypes = [] } = useListDprActivityTypes();
  const { data: activityGroups = [] } = useListDprActivityGroups(
    {},
    { query: { queryKey: getListDprActivityGroupsQueryKey({}) } }
  );
  // Hoisted here so ClarifyRow instances share one cache subscription each
  const { data: allActivities = [] } = useListDprActivities(
    {},
    { query: { queryKey: getListDprActivitiesQueryKey({}) } }
  );
  const { data: allJdrCodes = [] } = useListDprJdrCodes(
    {},
    { query: { queryKey: getListDprJdrCodesQueryKey({}) } }
  );

  // All captured + clarified entries, grouped by shiftDate+team
  const groups = useMemo(() => {
    const relevant = allEntries.filter(e => e.stage === "captured" || e.stage === "clarified");
    const byKey = new Map<string, {
      teamId: number | null; teamName: string; date: string; entries: DprTimesheetEntry[];
    }>();
    for (const entry of relevant) {
      const teamId = entry.teamId ?? null;
      const effectiveDate = (entry.shiftDate ?? entry.date) as string;
      const key = `${teamId ?? "none"}__${effectiveDate}`;
      const existing = byKey.get(key);
      if (existing) { existing.entries.push(entry); }
      else byKey.set(key, { teamId, teamName: entry.team?.name || "Unassigned", date: effectiveDate, entries: [entry] });
    }
    // Sort entries within each group chronologically: calendar date first
    // (so cross-midnight entries on the next calendar date come after same-date entries),
    // then by start time within the same date.
    for (const g of byKey.values()) {
      g.entries.sort((a, b) => {
        return compareDprRows(
          { date: a.date, startTime: a.startTime, teamName: a.team?.name },
          { date: b.date, startTime: b.startTime, teamName: b.team?.name },
        );
      });
    }
    return Array.from(byKey.values())
      .sort((a, b) => {
        return compareDprRows(
          { date: a.date, startTime: a.entries[0]?.startTime, teamName: a.teamName },
          { date: b.date, startTime: b.entries[0]?.startTime, teamName: b.teamName },
        );
      });
  }, [allEntries]);

  // Pending count per teamId (across ALL dates, used for pill colours when no date filter)
  const pendingByTeam = useMemo(() => {
    const m = new Map<number | null, number>();
    if (!activeDate) {
      for (const g of groups) {
        const pending = g.entries.filter(e => e.stage === "captured").length;
        m.set(g.teamId, (m.get(g.teamId) ?? 0) + pending);
      }
    } else {
      // Only add teams that actually have entries on this date (captured or clarified).
      // Also include previous-day groups that have overnight entries crossing into activeDate.
      // Teams with zero entries remain absent from the map and won't appear in either pill row.
      const prevDay = format(subDays(parseISO(activeDate), 1), "yyyy-MM-dd");
      for (const g of groups) {
        if (g.date === activeDate) {
          const pending = g.entries.filter(e => e.stage === "captured").length;
          m.set(g.teamId, (m.get(g.teamId) ?? 0) + pending);
        } else if (g.date === prevDay) {
          const hasOvernight = g.entries.some(e => e.startTime && e.endTime && e.endTime < e.startTime);
          if (hasOvernight) {
            const pending = g.entries.filter(e => e.stage === "captured").length;
            m.set(g.teamId, (m.get(g.teamId) ?? 0) + pending);
          }
        }
      }
    }
    return m;
  }, [groups, activeDate]);

  const filteredGroups = useMemo(() => {
    const prevDay = activeDate ? format(subDays(parseISO(activeDate), 1), "yyyy-MM-dd") : null;
    return groups.filter(g => {
      if (activeTeamId !== null && g.teamId !== activeTeamId) return false;
      if (!activeDate) {
        // No date filter: only show groups that still have pending entries so the
        // "all" view isn't flooded with historical clarified-only data.
        return g.entries.some(e => e.stage === "captured");
      }
      if (g.date === activeDate) return true;
      // Include previous-day groups that have at least one overnight entry
      if (g.date === prevDay) {
        return g.entries.some(e => e.startTime && e.endTime && e.endTime < e.startTime);
      }
      return false;
    });
  }, [groups, activeDate, activeTeamId]);

  const flattenedEntries = useMemo(
    () => filteredGroups
      .flatMap(group => [
        ...group.entries.filter(entry => entry.stage === "captured"),
        ...group.entries.filter(entry => entry.stage === "clarified"),
      ])
      .sort((a, b) => compareDprRows(
        { date: a.date, startTime: a.startTime, teamName: a.team?.name },
        { date: b.date, startTime: b.startTime, teamName: b.team?.name },
      )),
    [filteredGroups],
  );

  // ── Bulk selection ──
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const visibleSelectedCount = flattenedEntries.filter((entry) => selectedIds.has(entry.id)).length;
  const allSelected = flattenedEntries.length > 0 && visibleSelectedCount === flattenedEntries.length;
  const someSelected = visibleSelectedCount > 0;

  const enterSelectMode = () => {
    setSelectMode(true);
    setSelectedIds(new Set());
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds((current) => {
        const next = new Set(current);
        flattenedEntries.forEach((entry) => next.delete(entry.id));
        return next;
      });
    } else {
      setSelectedIds((current) => {
        const next = new Set(current);
        flattenedEntries.forEach((entry) => next.add(entry.id));
        return next;
      });
    }
  };

  const toggleSelectRow = (id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalPending = useMemo(
    () => allEntries.filter(e => e.stage === "captured").length,
    [allEntries]
  );
  const filteredPending = useMemo(
    () => filteredGroups.reduce((acc, g) => acc + g.entries.filter(e => e.stage === "captured").length, 0),
    [filteredGroups]
  );
  const filteredHours = useMemo(
    () => filteredGroups.reduce((acc, g) => acc + g.entries.reduce((s, e) => s + hoursForEntry(e.startTime, e.endTime), 0), 0),
    [filteredGroups]
  );

  // Teams that have at least one locked (captured or clarified) entry for the active date.
  // When a date is filtered, Clarify only shows these teams — not teams that haven't been locked yet.
  const lockedTeams = useMemo(() => {
    if (!activeDate) return teams; // no date filter → show all teams as before
    const prevDay = format(subDays(parseISO(activeDate), 1), "yyyy-MM-dd");
    const ids = new Set<number>();
    for (const e of allEntries) {
      if (e.stage !== "captured" && e.stage !== "clarified") continue;
      if (!e.teamId) continue;
      const d = (e.shiftDate ?? e.date) as string;
      if (d === activeDate) { ids.add(e.teamId); continue; }
      // Include overnight entries from the previous day
      if (d === prevDay && e.startTime && e.endTime && e.endTime < e.startTime) {
        ids.add(e.teamId);
      }
    }
    return teams.filter(t => ids.has(t.id));
  }, [teams, allEntries, activeDate]);

  const handleTeamClick = (id: number | null) => setActiveTeamId(activeTeamId === id ? null : id);

  const [unlockingEntryId, setUnlockingEntryId] = useState<number | null>(null);
  const unlockMutation = useUpdateDprTimesheetEntry({
    mutation: {
      onSuccess: (updated) => {
        queryClient.setQueriesData<DprTimesheetEntry[]>(
          { queryKey: getListDprTimesheetEntriesQueryKey() },
          (old) => old?.map((entry) => entry.id === updated.id ? updated : entry)
        );
        queryClient.invalidateQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDprTimesheetSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["/api/dpr/timesheet-entries/date-summary"] });
        toast({
          title: "Entry unlocked",
          description: "Returned to Capture for editing.",
        });
      },
      onError: (error) => {
        toast({
          title: "Unlock failed",
          description: error instanceof Error ? error.message : "Unable to return this entry to Capture.",
          variant: "destructive",
        });
      },
      onSettled: () => setUnlockingEntryId(null),
    },
  });

  const handleUnlock = (entry: DprTimesheetEntry) => {
    if (unlockMutation.isPending) return;
    setUnlockingEntryId(entry.id);
    unlockMutation.mutate({
      id: entry.id,
      data: { stage: "draft" },
    });
  };

  // ── CSV export ──
  const handleExportCsv = () => {
    const entries = filteredGroups.flatMap(g => g.entries);
    const csv = buildLautecCsv(entries, { teams, activityGroups, activities: allActivities });
    const datePart = activeDate ?? "all";
    downloadCsv(`DPR_Clarify_${datePart}.csv`, csv);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* ── Header — matches Capture exactly ── */}
      <header className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border flex flex-wrap items-center justify-between gap-y-2 gap-x-3 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight">Clarify Queue</h1>
          <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
            Categorize raw timesheet entries against JDR codes.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <span className="text-sm font-medium">{totalPending} Pending</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => selectMode ? exitSelectMode() : enterSelectMode()}
              className={cn("gap-1.5 ml-2", selectMode && "border-primary bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary")}
            >
              <CheckSquare className="w-4 h-4" />
              <span className="hidden xs:inline">{selectMode ? "Cancel Select" : "Select"}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1.5">
            <Download className="w-4 h-4" />
            <span className="hidden xs:inline">Export CSV</span>
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* ── Team pills — mirrors Capture's FilterPills ── */}
      <ClarifyPills
        teams={lockedTeams}
        activeDate={activeDate}
        activeTeamId={activeTeamId}
        onTeamClick={handleTeamClick}
        pendingByTeam={pendingByTeam}
      />

      {/* ── Filter / selection context bar ── */}
      {selectMode ? (
        <div className="px-3 sm:px-4 py-1 border-b border-primary/30 bg-primary/5 flex flex-wrap items-center gap-x-3 gap-y-1 shrink-0">
          <span className="text-xs font-semibold text-primary shrink-0">
            {visibleSelectedCount === 0
              ? "Select rows below"
              : `${visibleSelectedCount} row${visibleSelectedCount !== 1 ? "s" : ""} selected`}
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
          {someSelected && (
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      ) : (
        <div className="px-4 sm:px-6 py-2 border-b border-border bg-muted/20 flex flex-wrap items-center justify-between gap-y-1 gap-x-2 shrink-0">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            {activeDate || activeTeamId !== null ? (
              <>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>Showing:</span>
                  {activeDate && (
                    <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/30 text-primary text-xs font-medium">
                      {(() => { try { return format(parseISO(activeDate), "dd-MM"); } catch { return activeDate; } })()}
                    </span>
                  )}
                  {activeDate && activeTeamId !== null && <span className="text-muted-foreground/50">·</span>}
                  {activeTeamId !== null && (
                    <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/30 text-primary text-xs font-medium">
                      {teams.find(t => t.id === activeTeamId)?.name ?? `Team ${activeTeamId}`}
                    </span>
                  )}
                </div>
                {filteredGroups.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="font-semibold text-emerald-500 tabular-nums">
                      {Math.floor(filteredHours)}h {Math.round((filteredHours % 1) * 60)}m
                    </span>
                    <span>·</span>
                    <span className="font-semibold text-foreground tabular-nums">{filteredPending}</span>
                    <span>rows pending</span>
                  </div>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground/60 italic">Select a date and team above to filter</span>
            )}
          </div>
        </div>
      )}

      {/* ── Main content — flat table ── */}
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        {loadingEntries && filteredGroups.length === 0 ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="text-center p-12 border border-dashed rounded-lg border-border m-6">
            <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium">
              {activeDate ? "Nothing to clarify here" : "All caught up!"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {activeDate
                ? "No captured entries waiting on this date."
                : "There are no pending timesheets to clarify."}
            </p>
          </div>
        ) : (
          <div className="rounded-none border-0">
            <Table className="table-auto w-full min-w-max border-collapse border border-border/70 text-xs">
              <colgroup>
                {selectMode && <col style={{ width: 32 }} />}
                <col style={{ width: 32 }} />
                <col style={{ width: 88 }} />
                <col style={{ width: 66 }} />
                <col style={{ width: 66 }} />
                <col style={{ width: 70 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 52 }} />
                <col style={{ width: 122 }} />
                <col style={{ width: 160 }} />
                <col style={{ width: 170 }} />
                <col style={{ width: 176 }} />
                <col style={{ width: 66 }} />
              </colgroup>
              <TableHeader className="sticky top-0 z-10 bg-muted/30">
                <TableRow className="h-8 hover:bg-transparent">
                   {selectMode && (
                     <TableHead className={cn(SHEET_HEAD, "w-[32px] text-center")}>
                       <button
                         type="button"
                         onClick={toggleSelectAll}
                         className="flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                         aria-label={allSelected ? "Deselect all rows" : "Select all rows"}
                       >
                         {allSelected
                           ? <CheckCheck className="w-4 h-4 text-primary" />
                           : someSelected
                           ? <Minus className="w-4 h-4 text-primary" />
                           : <Square className="w-4 h-4" />}
                       </button>
                     </TableHead>
                   )}
                  <TableHead className={cn(SHEET_HEAD, "text-center")}>#</TableHead>
                  <TableHead className={SHEET_HEAD}>Team</TableHead>
                  <TableHead className={SHEET_HEAD}>Start</TableHead>
                  <TableHead className={SHEET_HEAD}>Finish</TableHead>
                  <TableHead className={cn(SHEET_HEAD, "text-emerald-600")}>Duration</TableHead>
                   <TableHead className={SHEET_HEAD}>Location</TableHead>
                   <TableHead className={cn(SHEET_HEAD, "text-center")}>PAX</TableHead>
                  <TableHead className={cn(SHEET_HEAD, "pr-3")}>Activity Group</TableHead>
                  <TableHead className={SHEET_HEAD}>Generic Comment</TableHead>
                  <TableHead className={SHEET_HEAD}>JDR Code</TableHead>
                   <TableHead className={SHEET_HEAD}>Comment</TableHead>
                  <TableHead className={cn(SHEET_HEAD, "text-right")}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flattenedEntries.map((entry, idx) =>
                  entry.stage === "captured" ? (
                    <ClarifyRow
                      key={entry.id}
                      entry={entry}
                      currentDate={activeDate}
                      activityTypes={activityTypes}
                      activityGroups={activityGroups}
                      allActivities={allActivities}
                      allJdrCodes={allJdrCodes}
                      rowIndex={idx + 1}
                      selectMode={selectMode}
                      isSelected={selectedIds.has(entry.id)}
                      onToggleSelect={() => toggleSelectRow(entry.id)}
                      onUnlock={handleUnlock}
                      isUnlocking={unlockingEntryId === entry.id}
                    />
                  ) : (
                    <ClarifiedRow
                      key={entry.id}
                      entry={entry}
                      currentDate={activeDate}
                      activityTypes={activityTypes}
                      activityGroups={activityGroups}
                      rowIndex={idx + 1}
                      selectMode={selectMode}
                      isSelected={selectedIds.has(entry.id)}
                      onToggleSelect={() => toggleSelectRow(entry.id)}
                      onUnlock={handleUnlock}
                      isUnlocking={unlockingEntryId === entry.id}
                    />
                  ),
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* ── Hint bar — matches Capture exactly ── */}
      <div className="px-6 py-2 border-t border-border bg-card/50 shrink-0">
        <p className="text-xs text-muted-foreground">
          Select a <strong className="text-foreground">JDR Code</strong> from the dropdown — codes are pre-filtered to the entry's activity group. Hit <strong className="text-foreground">✓</strong> to mark as clarified.
        </p>
      </div>
      </div>
    </div>
  );
}

// ─── ClarifiedRow ─────────────────────────────────────────────────────────────
function ClarifiedRow({
  entry,
  currentDate,
  activityTypes,
  activityGroups,
  rowIndex,
  selectMode,
  isSelected,
  onToggleSelect,
  onUnlock,
  isUnlocking,
}: {
  entry: DprTimesheetEntry;
  currentDate: string | null;
  activityTypes: DprActivityType[];
  activityGroups: DprActivityGroup[];
  rowIndex?: number;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onUnlock: (entry: DprTimesheetEntry) => void;
  isUnlocking: boolean;
}) {
  const { data: jdrCodes = [] } = useListDprJdrCodes(
    { activityId: entry.activityId || undefined },
    { query: { queryKey: getListDprJdrCodesQueryKey({ activityId: entry.activityId || undefined }), enabled: !!entry.activityId } }
  );
  const code = jdrCodes.find(c => entry.jdrCodeIds?.includes(c.id));

  return (
    <TableRow className="h-10 bg-muted/5 opacity-50 hover:bg-muted/10">
      {selectMode && (
        <TableCell className={cn(SHEET_CELL, "w-[32px] text-center")} onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            onClick={onToggleSelect}
            className="inline-flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
            aria-label={isSelected ? "Deselect row" : "Select row"}
          >
            {isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
          </button>
        </TableCell>
      )}
      <TableCell className={cn(SHEET_CELL, "text-center text-[11px] tabular-nums text-muted-foreground/50")}>{rowIndex ?? ""}</TableCell>
      <TableCell className={SHEET_CELL}><EntryTeamCell entry={entry} currentDate={currentDate} muted /></TableCell>
      <TableCell className={cn(SHEET_CELL, "font-mono text-xs tabular-nums text-muted-foreground")}>
        {entry.startTime || <span className="text-muted-foreground/40">—</span>}
        {entry.shiftDate && entry.shiftDate !== entry.date && entry.startTime && formatDateIfDifferent(entry.date, currentDate) && (
          <div className="text-[10px] leading-tight text-muted-foreground">
            {formatDateIfDifferent(entry.date, currentDate)}
          </div>
        )}
      </TableCell>
      <TableCell className={cn(SHEET_CELL, "font-mono text-xs tabular-nums text-muted-foreground")}>
        {entry.endTime || <span className="text-muted-foreground/40">—</span>}
        {entry.startTime && entry.endTime && entry.endTime < entry.startTime && (() => {
          const finishDate = (() => {
            try { return format(addDays(parseISO((entry.shiftDate ?? entry.date) as string), 1), "yyyy-MM-dd"); }
            catch { return null; }
          })();
          const finishDateLabel = formatDateIfDifferent(finishDate, currentDate);
          return finishDateLabel ? (
            <div className="text-[10px] leading-tight text-muted-foreground">{finishDateLabel}</div>
          ) : null;
        })()}
      </TableCell>
      <TableCell className={cn(SHEET_CELL, "font-semibold tabular-nums text-emerald-600/60 dark:text-emerald-400/60")}>{formatDuration(entry.startTime, entry.endTime)}</TableCell>
      <TableCell className={cn(SHEET_CELL, "truncate text-xs text-muted-foreground")}>{entry.location?.name || <span className="text-muted-foreground/40">—</span>}</TableCell>
      <TableCell className={cn(SHEET_CELL, "text-center text-xs tabular-nums text-muted-foreground")}>{entry.pax ?? <span className="text-muted-foreground/40">—</span>}</TableCell>
      <TableCell className={cn(SHEET_CELL, "pr-3")}><ActivityGroupPill name={activityLabel(entry, activityGroups, activityTypes)} muted /></TableCell>
      <TableCell className={cn(SHEET_CELL, "truncate text-xs text-muted-foreground")}>{entry.genericComment || <span className="text-muted-foreground/40">—</span>}</TableCell>
      <TableCell className={cn(SHEET_CELL, "font-mono text-[11px] text-muted-foreground")}>{code?.contractualCode || <span className="text-muted-foreground/40">—</span>}</TableCell>
      <TableCell className={cn(SHEET_CELL, "truncate text-xs text-muted-foreground")}>{entry.combinedComment || entry.notes || <span className="text-muted-foreground/40">—</span>}</TableCell>
      <TableCell className={cn(SHEET_CELL, "text-right")}>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7 opacity-100"
          onClick={() => onUnlock(entry)}
          disabled={isUnlocking}
          title="Unlock and return to Capture"
          aria-label="Unlock and return to Capture"
        >
          {isUnlocking
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Unlock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />}
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ─── ClarifyRow ───────────────────────────────────────────────────────────────
function ClarifyRow({ entry, currentDate, activityTypes, activityGroups, allActivities, allJdrCodes, rowIndex, selectMode, isSelected, onToggleSelect, onUnlock, isUnlocking }: {
  entry: DprTimesheetEntry;
  currentDate: string | null;
  activityTypes: DprActivityType[];
  activityGroups: DprActivityGroup[];
  allActivities: DprActivity[];
  allJdrCodes: DprJdrCode[];
  rowIndex?: number;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onUnlock: (entry: DprTimesheetEntry) => void;
  isUnlocking: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [jdrCodeId, setJdrCodeId] = useState<number | null>(entry.jdrCodeIds?.[0] || null);
  const [genericComment, setGenericComment] = useState<string>(entry.genericComment ?? "");

  // Filter codes to this entry's activity group (via activities relationship)
  const filteredCodes = useMemo(() => {
    if (!entry.activityGroupId) return allJdrCodes;
    const activityIdsInGroup = new Set(
      allActivities.filter(a => a.activityGroupId === entry.activityGroupId).map(a => a.id)
    );
    return allJdrCodes.filter(c => c.activityId != null && activityIdsInGroup.has(c.activityId));
  }, [allJdrCodes, allActivities, entry.activityGroupId]);

  // Generic Comment options — scoped to filteredCodes so the auto-linked code
  // always appears in the adjacent JDR selector.  The combobox value is the JDR
  // code ID (string) so the match is unambiguous.  When the same comment text
  // belongs to more than one eligible code (e.g. "Earthing" appears in both HV
  // Termination and FO Termination), each gets its own disambiguated label
  // ("Earthing (HV Termination)" / "Earthing (FO termination)") instead of
  // silently resolving to the first match.
  const commentOptions = useMemo((): ComboboxOption[] => {
    // Group codes by comment text to detect duplicates
    const byComment = new Map<string, DprJdrCode[]>();
    for (const code of filteredCodes) {
      const gc = code.genericComment;
      if (!gc || !gc.trim()) continue;
      if (!byComment.has(gc)) byComment.set(gc, []);
      byComment.get(gc)!.push(code);
    }

    const opts: ComboboxOption[] = [];
    for (const [comment, codes] of byComment) {
      if (codes.length === 1) {
        opts.push({ value: String(codes[0].id), label: comment });
      } else {
        // Append jdrWorkActivity to disambiguate
        for (const code of codes) {
          opts.push({ value: String(code.id), label: `${comment} (${code.jdrWorkActivity})` });
        }
      }
    }

    return opts.sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredCodes]);

  // Resolve the selected code's activityId for saving
  const selectedCodeObj = useMemo(
    () => allJdrCodes.find(c => c.id === jdrCodeId) || null,
    [allJdrCodes, jdrCodeId]
  );

  const updateMutation = useUpdateDprTimesheetEntry({
    mutation: {
      onMutate: async () => {
        await queryClient.cancelQueries({ queryKey: getGetDprTimesheetSummaryQueryKey() });
        const snap = queryClient.getQueryData<{ capturedCount: number; clarifiedCount: number }>(
          getGetDprTimesheetSummaryQueryKey()
        );
        queryClient.setQueryData<{ capturedCount: number; clarifiedCount: number }>(
          getGetDprTimesheetSummaryQueryKey(),
          old => old ? { ...old, capturedCount: Math.max(0, old.capturedCount - 1), clarifiedCount: old.clarifiedCount + 1 } : old
        );
        return { snap };
      },
      onSuccess: (updated) => {
        queryClient.setQueriesData<DprTimesheetEntry[] | undefined>(
          { queryKey: getListDprTimesheetEntriesQueryKey() },
          old => old?.map(e => e.id === updated.id ? updated : e)
        );
        queryClient.invalidateQueries({ queryKey: getGetDprTimesheetSummaryQueryKey() });
        toast({ title: "Entry clarified" });
      },
      onError: (err, _, ctx) => {
        if (ctx?.snap !== undefined) queryClient.setQueryData(getGetDprTimesheetSummaryQueryKey(), ctx.snap);
        toast({ title: "Save failed", description: err.message, variant: "destructive" });
        queryClient.invalidateQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
      }
    }
  });

  const handleSave = () => {
    // Derive activity group from the selected code → activity → group chain.
    // Entries often arrive from Capture with activityGroupId=null, so we must
    // write the correct group based on the chosen JDR code, not just echo back
    // whatever was already on the entry.
    const selectedActivity = selectedCodeObj
      ? allActivities.find(a => a.id === selectedCodeObj.activityId) ?? null
      : null;
    const resolvedGroupId = selectedActivity?.activityGroupId ?? entry.activityGroupId ?? null;
    const resolvedGroup = activityGroups.find(g => g.id === resolvedGroupId) ?? null;

    updateMutation.mutate({
      id: entry.id,
      data: {
        activityTypeId: resolvedGroup?.activityTypeId ?? null,
        activityGroupId: resolvedGroupId,
        activityId: selectedCodeObj?.activityId ?? null,
        jdrCodeIds: jdrCodeId ? [jdrCodeId] : [],
        genericComment: genericComment || null,
        stage: "clarified",
      }
    });
  };

  const canSave = !!jdrCodeId;

  return (
    <TableRow className="h-10 hover:bg-muted/20">
      {selectMode && (
        <TableCell className={cn(SHEET_CELL, "w-[32px] text-center")} onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            onClick={onToggleSelect}
            className="inline-flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
            aria-label={isSelected ? "Deselect row" : "Select row"}
          >
            {isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
          </button>
        </TableCell>
      )}
      <TableCell className={cn(SHEET_CELL, "text-center text-[11px] tabular-nums text-muted-foreground")}>{rowIndex ?? ""}</TableCell>
      <TableCell className={SHEET_CELL}><EntryTeamCell entry={entry} currentDate={currentDate} /></TableCell>
      <TableCell className={cn(SHEET_CELL, "font-mono text-xs tabular-nums")}>
        {entry.startTime ? formatTimeDisplay(entry.startTime) : <span className="text-muted-foreground/40">—</span>}
        {entry.shiftDate && entry.shiftDate !== entry.date && entry.startTime && formatDateIfDifferent(entry.date, currentDate) && (
          <div className="text-[10px] leading-tight text-muted-foreground">
            {formatDateIfDifferent(entry.date, currentDate)}
          </div>
        )}
      </TableCell>
      <TableCell className={cn(SHEET_CELL, "font-mono text-xs tabular-nums")}>
        {entry.endTime ? formatTimeDisplay(entry.endTime) : <span className="text-muted-foreground/40">—</span>}
        {entry.startTime && entry.endTime && entry.endTime < entry.startTime && (() => {
          const finishDate = (() => {
            try { return format(addDays(parseISO((entry.shiftDate ?? entry.date) as string), 1), "yyyy-MM-dd"); }
            catch { return null; }
          })();
          const finishDateLabel = formatDateIfDifferent(finishDate, currentDate);
          return finishDateLabel ? (
            <div className="text-[10px] leading-tight text-muted-foreground">{finishDateLabel}</div>
          ) : null;
        })()}
      </TableCell>
      <TableCell className={cn(SHEET_CELL, "font-semibold tabular-nums text-emerald-600 dark:text-emerald-400")}>{formatDuration(entry.startTime, entry.endTime)}</TableCell>
      <TableCell className={cn(SHEET_CELL, "truncate text-xs text-muted-foreground")}>{entry.location?.name || <span className="text-muted-foreground/40">—</span>}</TableCell>
      <TableCell className={cn(SHEET_CELL, "text-center text-xs tabular-nums")}>{entry.pax ?? <span className="text-muted-foreground/40">—</span>}</TableCell>
      <TableCell className={cn(SHEET_CELL, "pr-3")}><ActivityGroupPill name={activityLabel(entry, activityGroups, activityTypes)} /></TableCell>
      <TableCell className={SHEET_CELL}>
        <Combobox
          options={commentOptions}
          value={jdrCodeId?.toString() || ""}
          onValueChange={(val) => {
            // val is the code ID (string) — unambiguous even for duplicate comment texts
            const matchedCode = filteredCodes.find(c => String(c.id) === val);
            if (matchedCode) {
              setJdrCodeId(matchedCode.id);
              setGenericComment(matchedCode.genericComment ?? "");
            }
          }}
          placeholder="Select comment…"
          searchPlaceholder="Search comments…"
          emptyText="No matching comment."
          className="w-full min-w-0"
          triggerClassName="h-7 min-w-0 px-2 text-[11px]"
        />
      </TableCell>
      <TableCell className={SHEET_CELL}>
        <Select
          value={jdrCodeId?.toString() || ""}
          onValueChange={v => setJdrCodeId(parseInt(v))}
        >
          <SelectTrigger className="h-7 min-w-0 bg-background px-2 text-[11px]">
            <SelectValue placeholder="Select code…" />
          </SelectTrigger>
          <SelectContent>
            {filteredCodes.map(c => (
              <SelectItem key={c.id} value={c.id.toString()}>
                {c.contractualCode} — {c.jdrWorkActivity}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className={cn(SHEET_CELL, "truncate text-xs text-muted-foreground")} title={entry.combinedComment || entry.notes || undefined}>{entry.combinedComment || entry.notes || <span className="text-muted-foreground/40">—</span>}</TableCell>
      <TableCell className={cn(SHEET_CELL, "text-right")}>
        <div className="flex justify-end gap-1">
          <Button
            size="icon"
            className="h-7 w-7"
            onClick={handleSave}
            disabled={!canSave || updateMutation.isPending || isUnlocking}
            title={canSave ? "Mark as Clarified" : "Select a JDR code first"}
            aria-label="Mark as Clarified"
          >
            {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => onUnlock(entry)}
            disabled={updateMutation.isPending || isUnlocking}
            title="Unlock and return to Capture"
            aria-label="Unlock and return to Capture"
          >
            {isUnlocking
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Unlock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
