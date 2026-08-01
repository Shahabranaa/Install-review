import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { 
  useListDprTimesheetEntries, 
  useUpdateDprTimesheetEntry, 
  useListDprActivityGroups,
  useListDprActivities,
  getListDprActivityGroupsQueryKey,
  useListDprJdrCodes,
  useListDprActivityTypes,
  getListDprTimesheetEntriesQueryKey,
  getGetDprTimesheetSummaryQueryKey,
  getListDprActivitiesQueryKey,
  getListDprJdrCodesQueryKey,
  DprTimesheetEntry,
  DprActivity,
  DprActivityGroup,
  DprJdrCode,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Clock, MapPin, Users, CheckCircle2, Check, Search, Lock, Timer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatTimeDisplay, hoursForEntry, formatDuration, cn } from "@/lib/utils";
import { useCaptureNav } from "@/contexts/CaptureNavContext";

type BillingParty = "jdr" | "orsted" | null;

function BillingPartyToggle({ value, onChange }: { value: BillingParty; onChange: (v: BillingParty) => void }) {
  return (
    <div className="inline-flex rounded border border-border overflow-hidden">
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

export default function ClarifyPage() {
  const { activeDate, activeTeamId, setActiveTeamId } = useCaptureNav();

  const { data: entries = [], isLoading: loadingEntries } = useListDprTimesheetEntries();

  const queue = useMemo(() => entries.filter(e => e.stage === "captured"), [entries]);

  const groups = useMemo(() => {
    const relevant = entries.filter(e => e.stage === "captured" || e.stage === "clarified");
    const byKey = new Map<string, { teamId: number | null; teamName: string; date: string; entries: DprTimesheetEntry[] }>();
    for (const entry of relevant) {
      const teamId = entry.teamId ?? null;
      const effectiveDate = (entry.shiftDate ?? entry.date) as string;
      const key = `${teamId ?? "none"}__${effectiveDate}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.entries.push(entry);
      } else {
        byKey.set(key, {
          teamId,
          teamName: entry.team?.name || "Unassigned Team",
          date: effectiveDate,
          entries: [entry],
        });
      }
    }
    return Array.from(byKey.values())
      .filter(group => group.entries.some(e => e.stage === "captured"))
      .sort((a, b) => {
        const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (dateCompare !== 0) return dateCompare;
        return a.teamName.localeCompare(b.teamName);
      });
  }, [entries]);

  const teamsOnActiveDate = useMemo(() => {
    if (!activeDate) return [];
    const seen = new Map<number | null, string>();
    for (const g of groups) {
      if (g.date === activeDate) seen.set(g.teamId, g.teamName);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [groups, activeDate]);

  const filteredGroups = useMemo(() => {
    return groups.filter(g => {
      if (activeDate && g.date !== activeDate) return false;
      if (activeTeamId !== null && g.teamId !== activeTeamId) return false;
      return true;
    });
  }, [groups, activeDate, activeTeamId]);

  const pendingCount = useMemo(
    () => filteredGroups.reduce((acc, g) => acc + g.entries.filter(e => e.stage === "captured").length, 0),
    [filteredGroups]
  );

  const handleTeamClick = (id: number | null) => {
    setActiveTeamId(activeTeamId === id ? null : id);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header — matches Capture header exactly */}
      <header className="px-6 py-4 border-b border-border bg-card flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Clarify Queue</h1>
          <p className="text-sm text-muted-foreground">Categorize raw timesheet entries against JDR codes.</p>
        </div>
        <div className="flex items-center gap-4 text-sm font-medium">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-foreground">{queue.length} Pending</span>
          </div>
        </div>
      </header>

      {/* Filter bar */}
      {activeDate ? (
        <div className="px-4 sm:px-6 py-2 border-b border-border bg-muted/20 flex flex-wrap items-center justify-between gap-y-1 gap-x-2 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Showing:</span>
              <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/30 text-primary text-xs font-medium">
                {(() => { try { return format(parseISO(activeDate), "dd/MM"); } catch { return activeDate; } })()}
              </span>
              {activeTeamId !== null && (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/30 text-primary text-xs font-medium">
                    {teamsOnActiveDate.find(t => t.id === activeTeamId)?.name ?? `Team ${activeTeamId}`}
                  </span>
                </>
              )}
            </div>
            {pendingCount > 0 && (
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground tabular-nums">{pendingCount}</span> rows pending
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="px-4 sm:px-6 py-1.5 border-b border-border bg-muted/10 shrink-0">
          <span className="text-xs text-muted-foreground/60 italic">Select a date from the sidebar to filter the queue</span>
        </div>
      )}

      {/* Team pills */}
      {activeDate && teamsOnActiveDate.length > 0 && (
        <div className="px-6 py-2 border-b border-border bg-background shrink-0 flex flex-col gap-1.5">
          <div className="flex items-center flex-wrap gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0 w-8">Team</span>
            {teamsOnActiveDate.map(team => {
              const isActive = activeTeamId === team.id;
              return (
                <button
                  key={team.id ?? "none"}
                  type="button"
                  onClick={() => handleTeamClick(team.id)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-0.5 text-xs font-medium transition-colors",
                    isActive
                      ? "border-2 border-amber-500 bg-amber-500 text-white"
                      : "border-2 bg-transparent border-border text-muted-foreground hover:border-amber-500/60 hover:text-foreground"
                  )}
                >
                  {team.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {loadingEntries && filteredGroups.length === 0 && (
          <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        )}
        {!loadingEntries && filteredGroups.length === 0 && (
          <div className="text-center p-12 border border-dashed rounded-lg border-border">
            <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium">
              {activeDate ? "Nothing to clarify here" : "All caught up!"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {activeDate
                ? "No captured entries waiting on this date. Try another date or clear the filter."
                : "There are no pending timesheets to clarify."}
            </p>
          </div>
        )}
        {filteredGroups.map(group => (
          <ClarifyGroup key={`${group.teamId ?? "none"}__${group.date}`} teamName={group.teamName} date={group.date} entries={group.entries} />
        ))}
      </div>
    </div>
  );
}

function ClarifyGroup({ teamName, date, entries }: { teamName: string; date: string; entries: DprTimesheetEntry[] }) {
  const remaining = entries.filter(e => e.stage === "captured").length;
  const totalHours = entries.reduce((acc, e) => acc + hoursForEntry(e.startTime, e.endTime), 0);
  const totalLabel = totalHours === 0 ? null : (() => {
    const h = Math.floor(totalHours);
    const m = Math.round((totalHours - h) * 60);
    return m === 0 ? `${h}h total` : `${h}h ${m}m total`;
  })();

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
      {/* Card header — matches Capture's locked-section divider style */}
      <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-3">
        <Users className="w-4 h-4 text-muted-foreground" />
        <span className="font-semibold text-sm">{teamName}</span>
        <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary">{date}</Badge>
        {totalLabel && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <Timer className="w-3 h-3" />{totalLabel}
          </span>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{remaining} of {entries.length} remaining</span>
      </div>

      <div className="overflow-x-auto">
        <Table className="table-fixed w-full min-w-[900px]">
          <colgroup>
            <col style={{ width: "8%" }} />   {/* Start */}
            <col style={{ width: "8%" }} />   {/* End */}
            <col style={{ width: "6%" }} />   {/* Duration */}
            <col style={{ width: "14%" }} />  {/* Location */}
            <col />                            {/* Notes — flex */}
            <col style={{ width: "10%" }} />  {/* JDR|Orsted */}
            <col style={{ width: "18%" }} />  {/* Quick Fill / Code */}
            <col style={{ width: "22%" }} />  {/* Comment */}
            <col style={{ width: 44 }} />     {/* Action */}
          </colgroup>
          <TableHeader className="bg-muted/30 sticky top-0 z-10">
            <TableRow>
              <TableHead className="text-xs">Start</TableHead>
              <TableHead className="text-xs">End</TableHead>
              <TableHead className="text-xs text-emerald-600 dark:text-emerald-400">Duration</TableHead>
              <TableHead className="text-xs">Location</TableHead>
              <TableHead className="text-xs">Notes</TableHead>
              <TableHead className="text-xs">Billing</TableHead>
              <TableHead className="text-xs">JDR Code</TableHead>
              <TableHead className="text-xs">Comment</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map(entry =>
              entry.stage === "clarified"
                ? <ClarifiedRow key={entry.id} entry={entry} />
                : <ClarifyRow key={entry.id} entry={entry} />
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ClarifiedRow({ entry }: { entry: DprTimesheetEntry }) {
  const { data: jdrCodes = [] } = useListDprJdrCodes(
    { activityId: entry.activityId || undefined },
    { query: { queryKey: getListDprJdrCodesQueryKey({ activityId: entry.activityId || undefined }), enabled: !!entry.activityId } }
  );
  const code = jdrCodes.find(c => entry.jdrCodeIds?.includes(c.id));

  return (
    <TableRow className="align-top bg-muted/5 opacity-50">
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
        {entry.notes || <span className="text-muted-foreground/40">—</span>}
      </TableCell>
      {/* Billing */}
      <TableCell className="text-sm text-muted-foreground">
        {entry.billingParty
          ? <span className="text-xs font-medium uppercase tracking-wide">{entry.billingParty}</span>
          : <span className="text-muted-foreground/40">—</span>}
      </TableCell>
      {/* JDR Code */}
      <TableCell className="text-sm text-muted-foreground">
        {code
          ? <span className="font-mono text-xs">{code.contractualCode}</span>
          : <span className="text-muted-foreground/40">—</span>}
      </TableCell>
      {/* Comment */}
      <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">
        {entry.combinedComment || <span className="text-muted-foreground/40">—</span>}
      </TableCell>
      {/* Action */}
      <TableCell className="text-right pr-3">
        <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 inline-block" />
      </TableCell>
    </TableRow>
  );
}

function ClarifyRow({ entry }: { entry: DprTimesheetEntry }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activityGroupId, setActivityGroupId] = useState<number | null>(entry.activityGroupId || null);
  const [activityId, setActivityId] = useState<number | null>(entry.activityId || null);
  const [jdrCodeId, setJdrCodeId] = useState<number | null>(entry.jdrCodeIds?.[0] || null);
  const [billingParty, setBillingParty] = useState<BillingParty>((entry.billingParty as BillingParty) || null);
  const [combinedComment, setCombinedComment] = useState(entry.combinedComment || entry.notes || "");

  const { data: activityGroups = [] } = useListDprActivityGroups(
    {},
    { query: { queryKey: getListDprActivityGroupsQueryKey({}) } }
  );

  // Unfiltered lookup for Quick Fill search index
  const { data: allActivities = [] } = useListDprActivities(
    {},
    { query: { queryKey: getListDprActivitiesQueryKey({}) } }
  );
  const { data: allJdrCodes = [] } = useListDprJdrCodes(
    {},
    { query: { queryKey: getListDprJdrCodesQueryKey({}) } }
  );

  const searchIndex = useMemo(() => {
    const activityById = new Map<number, DprActivity>(allActivities.map(a => [a.id, a]));
    const groupById = new Map<number, DprActivityGroup>(activityGroups.map(g => [g.id, g]));
    return allJdrCodes.map(code => {
      const activity = code.activityId != null ? activityById.get(code.activityId) : undefined;
      const group = activity?.activityGroupId != null ? groupById.get(activity.activityGroupId) : undefined;
      return {
        code,
        activity,
        group,
        label: `${code.contractualCode} - ${code.jdrWorkActivity} (${code.lautecActivity} / ${code.lautecActivityGroup})`,
      } as { code: DprJdrCode; activity: DprActivity | undefined; group: DprActivityGroup | undefined; label: string };
    });
  }, [allJdrCodes, allActivities, activityGroups]);

  const [selectedMatch, setSelectedMatch] = useState<{ code: DprJdrCode } | null>(null);
  const resolvedSelectedCode = useMemo(() => {
    if (selectedMatch) return selectedMatch.code;
    if (!jdrCodeId) return null;
    return allJdrCodes.find(c => c.id === jdrCodeId) || null;
  }, [selectedMatch, jdrCodeId, allJdrCodes]);

  const updateMutation = useUpdateDprTimesheetEntry({
    mutation: {
      onMutate: async () => {
        await queryClient.cancelQueries({ queryKey: getGetDprTimesheetSummaryQueryKey() });
        const summarySnapshot = queryClient.getQueryData<{ capturedCount: number; clarifiedCount: number }>(
          getGetDprTimesheetSummaryQueryKey()
        );
        queryClient.setQueryData<{ capturedCount: number; clarifiedCount: number }>(
          getGetDprTimesheetSummaryQueryKey(),
          (old) => old
            ? { ...old, capturedCount: Math.max(0, old.capturedCount - 1), clarifiedCount: old.clarifiedCount + 1 }
            : old
        );
        return { summarySnapshot };
      },
      onSuccess: (updated) => {
        queryClient.setQueriesData<DprTimesheetEntry[] | undefined>(
          { queryKey: getListDprTimesheetEntriesQueryKey() },
          (old) => old?.map(e => (e.id === updated.id ? updated : e))
        );
        queryClient.invalidateQueries({ queryKey: getGetDprTimesheetSummaryQueryKey() });
        toast({ title: "Entry clarified" });
      },
      onError: (err, _, ctx) => {
        if (ctx?.summarySnapshot !== undefined) {
          queryClient.setQueryData(getGetDprTimesheetSummaryQueryKey(), ctx.summarySnapshot);
        }
        toast({ title: "Save failed", description: err.message, variant: "destructive" });
        queryClient.invalidateQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
      }
    }
  });

  const billingMutation = useUpdateDprTimesheetEntry({
    mutation: {
      onMutate: async ({ id, data }) => {
        await queryClient.cancelQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
        const snapshot = queryClient.getQueriesData<DprTimesheetEntry[]>({ queryKey: getListDprTimesheetEntriesQueryKey() });
        queryClient.setQueriesData<DprTimesheetEntry[]>(
          { queryKey: getListDprTimesheetEntriesQueryKey() },
          (old) => old?.map(e => e.id === id ? { ...e, billingParty: data.billingParty } : e)
        );
        return { snapshot };
      },
      onSuccess: (updated) => {
        queryClient.setQueriesData<DprTimesheetEntry[]>(
          { queryKey: getListDprTimesheetEntriesQueryKey() },
          (old) => old?.map(e => e.id === updated.id ? updated : e)
        );
      },
      onError: (err, _, ctx) => {
        ctx?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data));
        setBillingParty((entry.billingParty as BillingParty) || null);
        toast({ title: "Failed to update billing", description: err.message, variant: "destructive" });
      }
    }
  });

  const handleBillingChange = (next: BillingParty) => {
    setBillingParty(next);
    billingMutation.mutate({ id: entry.id, data: { billingParty: next ?? undefined } });
  };

  const seedCommentFromCode = (code: DprJdrCode) => {
    const baseNotes = entry.notes ? entry.notes + "\n\n" : "";
    setCombinedComment(baseNotes + "Generic Comment: " + code.genericComment);
  };

  const [searchOpen, setSearchOpen] = useState(false);

  const handleQuickFillSelect = (codeId: number) => {
    const match = searchIndex.find(m => m.code.id === codeId);
    if (!match) return;
    const { code, activity } = match;
    if (activity?.activityGroupId != null) setActivityGroupId(activity.activityGroupId);
    if (code.activityId != null) setActivityId(code.activityId);
    setJdrCodeId(code.id);
    setSelectedMatch({ code });
    seedCommentFromCode(code);
    setSearchOpen(false);
    toast({ title: "Quick Fill applied", description: `${code.contractualCode} — ${code.jdrWorkActivity}` });
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
        combinedComment,
        stage: "clarified"
      }
    });
  };

  const canSave = !!jdrCodeId;

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
        {entry.location ? (
          <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3 text-muted-foreground shrink-0" />{entry.location.name}</span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </TableCell>
      {/* Notes */}
      <TableCell className="text-sm text-muted-foreground truncate">
        {entry.notes || <span className="text-muted-foreground/40">—</span>}
      </TableCell>
      {/* JDR | Orsted billing toggle */}
      <TableCell>
        <BillingPartyToggle value={billingParty} onChange={handleBillingChange} />
      </TableCell>
      {/* Quick Fill → JDR Code */}
      <TableCell>
        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title={resolvedSelectedCode ? `${resolvedSelectedCode.contractualCode} — ${resolvedSelectedCode.jdrWorkActivity}` : "Search JDR code or activity"}
              className={cn(
                "h-8 w-full flex items-center gap-1.5 px-2 rounded border text-xs font-normal transition-colors bg-background",
                resolvedSelectedCode
                  ? "border-primary/50 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted/40"
              )}
            >
              {resolvedSelectedCode ? (
                <>
                  <Check className="w-3 h-3 shrink-0 text-primary" />
                  <span className="truncate font-mono font-medium">{resolvedSelectedCode.contractualCode}</span>
                </>
              ) : (
                <>
                  <Search className="w-3 h-3 shrink-0" />
                  <span className="truncate">Quick Fill</span>
                </>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[420px] p-0" align="start">
            <Command filter={(value, search) => {
              const item = searchIndex.find(m => m.code.id.toString() === value);
              if (!item) return 0;
              const haystack = `${item.code.contractualCode} ${item.code.jdrWorkActivity} ${item.code.lautecActivity} ${item.code.lautecActivityGroup} ${item.code.genericComment}`.toLowerCase();
              return haystack.includes(search.toLowerCase()) ? 1 : 0;
            }}>
              <CommandInput placeholder="Search by JDR code, activity, or comment…" />
              <CommandList>
                <CommandEmpty>No matches found.</CommandEmpty>
                <CommandGroup>
                  {searchIndex.map(match => (
                    <CommandItem
                      key={match.code.id}
                      value={match.code.id.toString()}
                      onSelect={() => handleQuickFillSelect(match.code.id)}
                    >
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
      {/* Comment */}
      <TableCell>
        <Textarea
          className="h-16 resize-none bg-background text-xs"
          value={combinedComment}
          onChange={(e) => setCombinedComment(e.target.value)}
          placeholder="Will appear on the invoice…"
        />
      </TableCell>
      {/* Save */}
      <TableCell className="text-right pr-2">
        <Button
          size="icon"
          className="h-8 w-8"
          onClick={handleSave}
          disabled={!canSave || updateMutation.isPending}
          title={canSave ? "Mark as Clarified" : "Pick a JDR code first"}
        >
          {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        </Button>
      </TableCell>
    </TableRow>
  );
}
