import { Fragment, useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import {
  useListDprTimesheetEntries,
  useListDprTeams,
  useUpdateDprTimesheetEntry,
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
  DprActivityGroup,
  DprJdrCode,
  DprTeam,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Loader2, Clock, MapPin, Users, CheckCircle2, Check, Search, Lock, Timer,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatTimeDisplay, hoursForEntry, formatDuration, cn } from "@/lib/utils";
import { useCaptureNav } from "@/contexts/CaptureNavContext";

// ─── Column widths ─────────────────────────────────────────────────────────────
const COL_COUNT = 8; // Start End Duration Location Notes ActivityGroup JDRCode Action

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
      <div className="px-6 py-2 border-b border-border bg-background shrink-0">
        <div className="flex items-center flex-wrap gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0 w-8">Team</span>
          {teams.map(t => renderPill(t))}
        </div>
      </div>
    );
  }

  const todoTeams = teams.filter(t => (pendingByTeam.get(t.id) ?? 0) > 0);
  const doneTeams = teams.filter(t => (pendingByTeam.get(t.id) ?? 0) === 0);

  return (
    <div className="px-6 py-2 border-b border-border bg-background shrink-0 flex flex-col gap-1.5">
      <div className="flex items-center flex-wrap gap-1.5">
        <span className="text-xs text-muted-foreground shrink-0 w-8">To do</span>
        {todoTeams.length > 0
          ? todoTeams.map(t => renderPill(t))
          : <span className="text-xs text-muted-foreground italic">none</span>}
      </div>
      {doneTeams.length > 0 && (
        <div className="flex items-center flex-wrap gap-1.5">
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
  const { data: allEntries = [], isLoading: loadingEntries } = useListDprTimesheetEntries();
  const { data: teams = [] } = useListDprTeams();
  const { data: activityGroups = [] } = useListDprActivityGroups(
    {},
    { query: { queryKey: getListDprActivityGroupsQueryKey({}) } }
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
    return Array.from(byKey.values())
      .filter(g => g.entries.some(e => e.stage === "captured"))
      .sort((a, b) => {
        const d = new Date(a.date).getTime() - new Date(b.date).getTime();
        return d !== 0 ? d : a.teamName.localeCompare(b.teamName);
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
      for (const g of groups) {
        if (g.date !== activeDate) continue;
        const pending = g.entries.filter(e => e.stage === "captured").length;
        m.set(g.teamId, (m.get(g.teamId) ?? 0) + pending);
      }
      // teams with 0 pending still need an entry so pill shows Done
      for (const t of teams) {
        if (!m.has(t.id)) m.set(t.id, 0);
      }
    }
    return m;
  }, [groups, activeDate, teams]);

  const filteredGroups = useMemo(() => groups.filter(g => {
    if (activeDate && g.date !== activeDate) return false;
    if (activeTeamId !== null && g.teamId !== activeTeamId) return false;
    return true;
  }), [groups, activeDate, activeTeamId]);

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

  const handleTeamClick = (id: number | null) => setActiveTeamId(activeTeamId === id ? null : id);

  return (
    <div className="flex flex-col h-full">
      {/* ── Header — matches Capture exactly ── */}
      <header className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border flex flex-wrap items-center justify-between gap-y-2 gap-x-3 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight">Clarify Queue</h1>
          <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
            Categorize raw timesheet entries against JDR codes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <span className="text-sm font-medium">{totalPending} Pending</span>
        </div>
      </header>

      {/* ── Team pills — mirrors Capture's FilterPills ── */}
      <ClarifyPills
        teams={teams}
        activeDate={activeDate}
        activeTeamId={activeTeamId}
        onTeamClick={handleTeamClick}
        pendingByTeam={pendingByTeam}
      />

      {/* ── Filter / context bar ── */}
      <div className="px-4 sm:px-6 py-2 border-b border-border bg-muted/20 flex flex-wrap items-center justify-between gap-y-1 gap-x-2 shrink-0">
        <div className="flex items-center gap-3">
          {activeDate || activeTeamId !== null ? (
            <>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Showing:</span>
                {activeDate && (
                  <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/30 text-primary text-xs font-medium">
                    {(() => { try { return format(parseISO(activeDate), "dd/MM"); } catch { return activeDate; } })()}
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

      {/* ── Main content — flat table ── */}
      <div className="flex-1 overflow-auto">
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
            <Table className="table-fixed w-full min-w-[1000px]">
              <colgroup>
                <col className="w-[7%]" />   {/* Start */}
                <col className="w-[7%]" />   {/* End */}
                <col className="w-[6%]" />   {/* Duration */}
                <col className="w-[11%]" />  {/* Location */}
                <col />                       {/* Notes — flex */}
                <col style={{ width: 200 }} /> {/* Activity Group */}
                <col style={{ width: 240 }} /> {/* JDR Code */}
                <col style={{ width: 44 }} />  {/* Action */}
              </colgroup>
              <TableHeader className="bg-muted/30 sticky top-0 z-10">
                <TableRow>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead className="text-emerald-600 dark:text-emerald-400">Duration</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="pr-4">Activity Group</TableHead>
                  <TableHead>JDR Code</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGroups.map(group => {
                  const pending = group.entries.filter(e => e.stage === "captured");
                  const clarified = group.entries.filter(e => e.stage === "clarified");
                  const totalHours = group.entries.reduce((acc, e) => acc + hoursForEntry(e.startTime, e.endTime), 0);
                  const h = Math.floor(totalHours);
                  const m = Math.round((totalHours - h) * 60);
                  const totalLabel = totalHours > 0 ? (m === 0 ? `${h}h total` : `${h}h ${m}m total`) : null;

                  return (
                    <Fragment key={`${group.teamId ?? "none"}__${group.date}`}>
                      {/* ── Group divider row ── */}
                      <TableRow className="bg-amber-950/20">
                        <TableCell colSpan={COL_COUNT} className="py-1.5 px-4">
                          <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 font-medium">
                            <Users className="w-3 h-3" />
                            <span>{group.teamName}</span>
                            <span className="font-mono text-amber-500/70">
                              {(() => { try { return format(parseISO(group.date), "d MMM yyyy"); } catch { return group.date; } })()}
                            </span>
                            {totalLabel && (
                              <span className="inline-flex items-center gap-1">
                                <Timer className="w-3 h-3" />{totalLabel}
                              </span>
                            )}
                            <span className="ml-auto text-muted-foreground font-normal">
                              {pending.length} of {group.entries.length} remaining
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* ── Pending rows ── */}
                      {pending.map(entry => (
                        <ClarifyRow key={entry.id} entry={entry} activityGroups={activityGroups} />
                      ))}

                      {/* ── Clarified rows (greyed, below pending) ── */}
                      {clarified.length > 0 && (
                        <>
                          <TableRow className="bg-muted/10">
                            <TableCell colSpan={COL_COUNT} className="py-1 px-4">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground/60 font-medium">
                                <Lock className="w-3 h-3" />
                                Clarified — {clarified.length} row{clarified.length !== 1 ? "s" : ""}
                              </div>
                            </TableCell>
                          </TableRow>
                          {clarified.map(entry => (
                            <ClarifiedRow key={entry.id} entry={entry} activityGroups={activityGroups} />
                          ))}
                        </>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* ── Hint bar — matches Capture exactly ── */}
      <div className="px-6 py-2 border-t border-border bg-card/50 shrink-0">
        <p className="text-xs text-muted-foreground">
          Use <strong className="text-foreground">Quick Fill</strong> to search and apply a JDR code in one step — it auto-fills Activity Group and Activity.
          Or pick <strong className="text-foreground">Activity Group</strong> first, then select the <strong className="text-foreground">JDR Code</strong>.
        </p>
      </div>
    </div>
  );
}

// ─── ClarifiedRow ─────────────────────────────────────────────────────────────
function ClarifiedRow({ entry, activityGroups }: { entry: DprTimesheetEntry; activityGroups: DprActivityGroup[] }) {
  const { data: jdrCodes = [] } = useListDprJdrCodes(
    { activityId: entry.activityId || undefined },
    { query: { queryKey: getListDprJdrCodesQueryKey({ activityId: entry.activityId || undefined }), enabled: !!entry.activityId } }
  );
  const group = activityGroups.find(g => g.id === entry.activityGroupId);
  const code = jdrCodes.find(c => entry.jdrCodeIds?.includes(c.id));

  return (
    <TableRow className="opacity-40 bg-muted/5">
      {/* Start */}
      <TableCell className="text-sm font-mono tabular-nums text-muted-foreground">
        {entry.startTime ? formatTimeDisplay(entry.startTime) : <span className="text-muted-foreground/40">—</span>}
        {entry.shiftDate && entry.shiftDate !== entry.date && entry.startTime && (
          <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
            {(() => { try { return format(parseISO(entry.date as string), "d MMM"); } catch { return ""; } })()}
          </div>
        )}
      </TableCell>
      {/* End */}
      <TableCell className="text-sm font-mono tabular-nums text-muted-foreground">
        {entry.endTime ? formatTimeDisplay(entry.endTime) : <span className="text-muted-foreground/40">—</span>}
      </TableCell>
      {/* Duration */}
      <TableCell className="text-sm font-semibold tabular-nums text-emerald-600/50 dark:text-emerald-400/50">
        {formatDuration(entry.startTime, entry.endTime)}
      </TableCell>
      {/* Location */}
      <TableCell className="text-sm text-muted-foreground truncate">
        {entry.location?.name || <span className="text-muted-foreground/40">—</span>}
      </TableCell>
      {/* Notes */}
      <TableCell className="text-sm text-muted-foreground truncate">
        {entry.combinedComment || entry.notes || <span className="text-muted-foreground/40">—</span>}
      </TableCell>
      {/* Activity Group */}
      <TableCell className="text-sm text-muted-foreground pr-4">
        {group?.name || <span className="text-muted-foreground/40">—</span>}
      </TableCell>
      {/* JDR Code */}
      <TableCell className="text-sm text-muted-foreground">
        {code ? <span className="font-mono text-xs">{code.contractualCode}</span> : <span className="text-muted-foreground/40">—</span>}
      </TableCell>
      {/* Lock */}
      <TableCell className="text-right pr-3">
        <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 inline-block" />
      </TableCell>
    </TableRow>
  );
}

// ─── ClarifyRow ───────────────────────────────────────────────────────────────
function ClarifyRow({ entry, activityGroups }: { entry: DprTimesheetEntry; activityGroups: DprActivityGroup[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activityGroupId, setActivityGroupId] = useState<number | null>(entry.activityGroupId || null);
  const [activityId, setActivityId] = useState<number | null>(entry.activityId || null);
  const [jdrCodeId, setJdrCodeId] = useState<number | null>(entry.jdrCodeIds?.[0] || null);
  const [notes, setNotes] = useState(entry.combinedComment || entry.notes || "");

  // Cascading: JDR codes filtered by activity group (via activities)
  const { data: allActivities = [] } = useListDprActivities(
    {},
    { query: { queryKey: getListDprActivitiesQueryKey({}) } }
  );
  const { data: allJdrCodes = [] } = useListDprJdrCodes(
    {},
    { query: { queryKey: getListDprJdrCodesQueryKey({}) } }
  );

  // Build search index: all codes with their resolved activity+group
  const searchIndex = useMemo(() => {
    const activityById = new Map<number, DprActivity>(allActivities.map(a => [a.id, a]));
    const groupById = new Map<number, DprActivityGroup>(activityGroups.map(g => [g.id, g]));
    return allJdrCodes.map(code => {
      const activity = code.activityId != null ? activityById.get(code.activityId) : undefined;
      const group = activity?.activityGroupId != null ? groupById.get(activity.activityGroupId) : undefined;
      return { code, activity, group } as {
        code: DprJdrCode; activity: DprActivity | undefined; group: DprActivityGroup | undefined;
      };
    });
  }, [allJdrCodes, allActivities, activityGroups]);

  // When Activity Group is set, filter search to that group's codes only
  const filteredSearchIndex = useMemo(() => {
    if (!activityGroupId) return searchIndex;
    return searchIndex.filter(m => m.group?.id === activityGroupId);
  }, [searchIndex, activityGroupId]);

  const [selectedCode, setSelectedCode] = useState<DprJdrCode | null>(() =>
    allJdrCodes.find(c => c.id === (entry.jdrCodeIds?.[0] || null)) || null
  );

  const resolvedCode = useMemo(() => {
    if (selectedCode) return selectedCode;
    if (!jdrCodeId) return null;
    return allJdrCodes.find(c => c.id === jdrCodeId) || null;
  }, [selectedCode, jdrCodeId, allJdrCodes]);

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

  const applyCode = (match: { code: DprJdrCode; activity: DprActivity | undefined; group: DprActivityGroup | undefined }) => {
    const { code, activity } = match;
    if (activity?.activityGroupId != null) setActivityGroupId(activity.activityGroupId);
    if (code.activityId != null) setActivityId(code.activityId);
    setJdrCodeId(code.id);
    setSelectedCode(code);
    const base = entry.notes ? entry.notes + "\n\n" : "";
    setNotes(base + "Generic Comment: " + code.genericComment);
  };

  const [searchOpen, setSearchOpen] = useState(false);

  const handleQuickFillSelect = (codeId: number) => {
    const match = filteredSearchIndex.find(m => m.code.id === codeId);
    if (!match) return;
    applyCode(match);
    setSearchOpen(false);
    toast({ title: "Applied", description: `${match.code.contractualCode} — ${match.code.jdrWorkActivity}` });
  };

  const handleSave = () => {
    const group = activityGroups.find(g => g.id === activityGroupId);
    updateMutation.mutate({
      id: entry.id,
      data: {
        activityTypeId: group?.activityTypeId ?? null,
        activityGroupId,
        activityId,
        jdrCodeIds: jdrCodeId ? [jdrCodeId] : [],
        combinedComment: notes,
        stage: "clarified",
      }
    });
  };

  const canSave = !!(activityGroupId && jdrCodeId);

  return (
    <TableRow className="align-top">
      {/* Start */}
      <TableCell className="text-sm font-mono tabular-nums">
        {entry.startTime
          ? <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3 text-muted-foreground" />{formatTimeDisplay(entry.startTime)}</span>
          : <span className="text-muted-foreground/40">—</span>}
        {entry.shiftDate && entry.shiftDate !== entry.date && entry.startTime && (
          <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
            {(() => { try { return format(parseISO(entry.date), "d MMM"); } catch { return ""; } })()}
          </div>
        )}
      </TableCell>
      {/* End */}
      <TableCell className="text-sm font-mono tabular-nums">
        {entry.endTime ? formatTimeDisplay(entry.endTime) : <span className="text-muted-foreground/40">—</span>}
      </TableCell>
      {/* Duration */}
      <TableCell>
        <span className={cn("text-sm font-semibold tabular-nums", formatDuration(entry.startTime, entry.endTime) !== "—" ? "text-emerald-500" : "text-muted-foreground/30")}>
          {formatDuration(entry.startTime, entry.endTime)}
        </span>
      </TableCell>
      {/* Location */}
      <TableCell className="text-sm text-muted-foreground truncate">
        {entry.location
          ? <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" />{entry.location.name}</span>
          : <span className="text-muted-foreground/40">—</span>}
      </TableCell>
      {/* Notes — editable textarea */}
      <TableCell>
        <Textarea
          className="h-16 resize-none bg-background text-xs min-w-[160px]"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Will appear on the invoice…"
        />
      </TableCell>
      {/* Activity Group */}
      <TableCell className="pr-4">
        <Select
          value={activityGroupId?.toString() || ""}
          onValueChange={v => {
            setActivityGroupId(parseInt(v));
            setActivityId(null);
            setJdrCodeId(null);
            setSelectedCode(null);
          }}
        >
          <SelectTrigger className="h-8 text-xs bg-background"><SelectValue placeholder="Group…" /></SelectTrigger>
          <SelectContent>
            {activityGroups.map(g => <SelectItem key={g.id} value={g.id.toString()}>{g.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      {/* JDR Code — searchable Quick Fill */}
      <TableCell>
        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title={resolvedCode ? `${resolvedCode.contractualCode} — ${resolvedCode.jdrWorkActivity}` : "Search JDR code or activity"}
              className={cn(
                "h-8 w-full flex items-center gap-1.5 px-2 rounded border text-xs font-normal transition-colors bg-background",
                resolvedCode ? "border-primary/50 text-foreground" : "border-border text-muted-foreground hover:bg-muted/40"
              )}
            >
              {resolvedCode ? (
                <><Check className="w-3 h-3 shrink-0 text-primary" /><span className="truncate font-mono font-medium">{resolvedCode.contractualCode}</span></>
              ) : (
                <><Search className="w-3 h-3 shrink-0" /><span className="truncate">Quick Fill</span></>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[420px] p-0" align="start">
            <Command filter={(value, search) => {
              const item = filteredSearchIndex.find(m => m.code.id.toString() === value);
              if (!item) return 0;
              const hay = `${item.code.contractualCode} ${item.code.jdrWorkActivity} ${item.code.lautecActivity} ${item.code.lautecActivityGroup} ${item.code.genericComment}`.toLowerCase();
              return hay.includes(search.toLowerCase()) ? 1 : 0;
            }}>
              <CommandInput placeholder={activityGroupId ? "Search within this group…" : "Search all JDR codes…"} />
              <CommandList>
                <CommandEmpty>No matches found.</CommandEmpty>
                <CommandGroup>
                  {filteredSearchIndex.map(match => (
                    <CommandItem key={match.code.id} value={match.code.id.toString()} onSelect={() => handleQuickFillSelect(match.code.id)}>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-medium">{match.code.contractualCode} — {match.code.jdrWorkActivity}</span>
                        <span className="text-[11px] text-muted-foreground">{match.code.lautecActivity} / {match.code.lautecActivityGroup}</span>
                        <span className="text-[11px] text-primary/80 truncate">{match.code.genericComment}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </TableCell>
      {/* Save */}
      <TableCell className="text-right pr-2">
        <Button
          size="icon"
          className="h-8 w-8"
          onClick={handleSave}
          disabled={!canSave || updateMutation.isPending}
          title={canSave ? "Mark as Clarified" : "Pick Activity Group and JDR Code first"}
        >
          {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        </Button>
      </TableCell>
    </TableRow>
  );
}
