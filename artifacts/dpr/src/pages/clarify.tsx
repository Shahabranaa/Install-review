import { useState, useMemo } from "react";
import { 
  useListDprTimesheetEntries, 
  useUpdateDprTimesheetEntry, 
  useListDprActivityGroups,
  useListDprActivities,
  getListDprActivityGroupsQueryKey,
  useListDprJdrCodes,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Clock, MapPin, Users, CheckCircle2, ChevronRight, Check, Search, Lock } from "lucide-react";
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

export default function ClarifyPage() {
  const { toast: _toast } = useToast();

  const [activeTab, setActiveTab] = useState<"queue" | "clarified">("queue");

  const { data: entries = [], isLoading: loadingEntries } = useListDprTimesheetEntries();

  const queue = useMemo(() => entries.filter(e => e.stage === "captured").sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()), [entries]);
  const clarified = useMemo(() => entries.filter(e => e.stage === "clarified").sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [entries]);

  // Groups keep the whole shift (team + date) visible together — including
  // rows that have already been clarified — until every row in the group is
  // clarified. This way the group doesn't shrink/disappear row-by-row while
  // someone is working through it; clarified rows are shown greyed-out and
  // locked instead of vanishing immediately.
  const groups = useMemo(() => {
    const relevant = entries.filter(e => e.stage === "captured" || e.stage === "clarified");
    const byKey = new Map<string, { teamId: number | null; teamName: string; date: string; entries: DprTimesheetEntry[] }>();
    for (const entry of relevant) {
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
    return Array.from(byKey.values())
      .filter(group => group.entries.some(e => e.stage === "captured"))
      .sort((a, b) => {
        const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (dateCompare !== 0) return dateCompare;
        return a.teamName.localeCompare(b.teamName);
      });
  }, [entries]);

  return (
    <div className="flex flex-col h-full">
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
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-muted-foreground" />
            <span className="text-muted-foreground">{clarified.length} Clarified</span>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col bg-background p-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="h-full flex flex-col">
          <div className="shrink-0 mb-4">
            <TabsList>
              <TabsTrigger value="queue">Queue ({queue.length})</TabsTrigger>
              <TabsTrigger value="clarified">Clarified History</TabsTrigger>
            </TabsList>
          </div>
          
          <div className="flex-1 overflow-hidden relative">
            <TabsContent value="queue" className="absolute inset-0 m-0 overflow-y-auto space-y-6 pr-2">
              {loadingEntries && queue.length === 0 && (
                <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
              )}
              {!loadingEntries && queue.length === 0 && (
                <div className="text-center p-12 border border-dashed rounded-lg border-border">
                  <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-medium">All caught up!</h3>
                  <p className="text-sm text-muted-foreground mt-1">There are no pending timesheets to clarify.</p>
                </div>
              )}
              {groups.map(group => (
                <ClarifyGroup key={`${group.teamId ?? "none"}__${group.date}`} teamName={group.teamName} date={group.date} entries={group.entries} />
              ))}
            </TabsContent>
            
            <TabsContent value="clarified" className="absolute inset-0 m-0 overflow-y-auto space-y-4 pr-2">
              {clarified.map(entry => (
                <ClarifiedCard key={entry.id} entry={entry} />
              ))}
              {!loadingEntries && clarified.length === 0 && (
                <div className="text-center p-12 text-muted-foreground">No clarified records yet.</div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

function ClarifyGroup({ teamName, date, entries }: { teamName: string; date: string; entries: DprTimesheetEntry[] }) {
  const remaining = entries.filter(e => e.stage === "captured").length;
  return (
    <Card className="border-border shadow-sm bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-3">
        <Users className="w-4 h-4 text-muted-foreground" />
        <span className="font-semibold text-sm">{teamName}</span>
        <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary">{date}</Badge>
        <span className="text-xs text-muted-foreground ml-auto">{remaining} of {entries.length} remaining</span>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Start</TableHead>
              <TableHead className="w-[80px]">Finish</TableHead>
              <TableHead className="w-[130px]">Location</TableHead>
              <TableHead className="min-w-[160px]">Notes</TableHead>
              <TableHead className="min-w-[240px]">Quick Fill</TableHead>
              <TableHead className="min-w-[140px]">Activity Group</TableHead>
              <TableHead className="min-w-[140px]">Activity</TableHead>
              <TableHead className="min-w-[160px]">JDR Code</TableHead>
              <TableHead className="min-w-[220px]">Billing Comment</TableHead>
              <TableHead className="w-[60px] text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map(entry => (
              entry.stage === "clarified"
                ? <ClarifiedRow key={entry.id} entry={entry} />
                : <ClarifyRow key={entry.id} entry={entry} />
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

// A locked, read-only rendering of an already-clarified row within a group
// that still has other rows pending. Kept visible (greyed out) instead of
// disappearing so the whole shift stays together until the group is done.
function ClarifiedRow({ entry }: { entry: DprTimesheetEntry }) {
  const { data: jdrCodes = [] } = useListDprJdrCodes(
    { activityId: entry.activityId || undefined },
    { query: { queryKey: getListDprJdrCodesQueryKey({ activityId: entry.activityId || undefined }), enabled: !!entry.activityId } }
  );
  const code = jdrCodes.find(c => entry.jdrCodeIds?.includes(c.id));

  return (
    <TableRow className="align-top bg-muted/30 opacity-60">
      <TableCell className="whitespace-nowrap text-sm">
        {entry.startTime ? (
          <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3 text-muted-foreground" />{entry.startTime}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm">
        {entry.endTime || <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-sm">
        {entry.location ? (
          <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3 text-muted-foreground shrink-0" />{entry.location.name}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-sm max-w-[220px]">
        {entry.notes ? (
          <span className="text-foreground/80 whitespace-pre-wrap line-clamp-3">{entry.notes}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell colSpan={2} className="text-sm text-muted-foreground">
        <span className="italic">Clarified</span>
      </TableCell>
      <TableCell className="text-sm">
        {code ? `${code.contractualCode} — ${code.jdrWorkActivity}` : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-sm max-w-[220px] truncate">
        {entry.combinedComment || <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-right">
        <Lock className="w-4 h-4 text-muted-foreground inline-block" />
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
  
  const [combinedComment, setCombinedComment] = useState(entry.combinedComment || entry.notes || "");

  // Activity Type is no longer chosen directly by the user — it's superseded
  // by JDR/Allstead classification at Capture. We derive it automatically
  // from whichever Activity Group gets picked, unfiltered by type.
  const { data: activityGroups = [] } = useListDprActivityGroups(
    {},
    { query: { queryKey: getListDprActivityGroupsQueryKey({}) } }
  );
  const { data: activities = [] } = useListDprActivities(
    { activityGroupId: activityGroupId || undefined },
    { query: { queryKey: getListDprActivitiesQueryKey({ activityGroupId: activityGroupId || undefined }), enabled: !!activityGroupId } }
  );
  const { data: jdrCodes = [] } = useListDprJdrCodes(
    { activityId: activityId || undefined },
    { query: { queryKey: getListDprJdrCodesQueryKey({ activityId: activityId || undefined }), enabled: !!activityId } }
  );

  // Unfiltered lookups used to build the combined quick-fill search index,
  // independent of the cascading dropdown state above.
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

  // Once something has been selected via Quick Fill, remember which match it
  // was so we can show clear, visible confirmation in the trigger itself.
  const [selectedMatch, setSelectedMatch] = useState<{ code: DprJdrCode } | null>(null);

  const resolvedSelectedCode = useMemo(() => {
    if (selectedMatch) return selectedMatch.code;
    if (!jdrCodeId) return null;
    return allJdrCodes.find(c => c.id === jdrCodeId) || null;
  }, [selectedMatch, jdrCodeId, allJdrCodes]);

  const updateMutation = useUpdateDprTimesheetEntry({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDprTimesheetSummaryQueryKey() });
        toast({ title: "Entry clarified" });
      },
      onError: (err) => {
        toast({ title: "Save failed", description: err.message, variant: "destructive" });
      }
    }
  });

  const seedCommentFromCode = (code: DprJdrCode) => {
    const baseNotes = entry.notes ? entry.notes + "\n\n" : "";
    setCombinedComment(baseNotes + "Generic Comment: " + code.genericComment);
  };

  const handleJdrSelect = (codeId: number) => {
    setJdrCodeId(codeId);
    const code = jdrCodes.find(c => c.id === codeId);
    if (code) {
      setSelectedMatch({ code });
      seedCommentFromCode(code);
    }
  };

  const [searchOpen, setSearchOpen] = useState(false);

  const handleQuickFillSelect = (codeId: number) => {
    const match = searchIndex.find(m => m.code.id === codeId);
    if (!match) return;
    const { code, activity, group } = match;
    if (activity?.activityGroupId != null) setActivityGroupId(activity.activityGroupId);
    if (code.activityId != null) setActivityId(code.activityId);
    setJdrCodeId(code.id);
    setSelectedMatch({ code });
    seedCommentFromCode(code);
    setSearchOpen(false);
    toast({ title: "Quick Fill applied", description: `${code.contractualCode} — ${code.jdrWorkActivity}` });
  };

  const handleSave = () => {
    // Derive activityTypeId from the chosen Activity Group behind the
    // scenes — the user no longer picks it directly.
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

  const canSave = activityGroupId && activityId && jdrCodeId;

  return (
    <TableRow className="align-top">
      <TableCell className="whitespace-nowrap text-sm">
        {entry.startTime ? (
          <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3 text-muted-foreground" />{entry.startTime}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm">
        {entry.endTime || <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-sm">
        {entry.location ? (
          <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3 text-muted-foreground shrink-0" />{entry.location.name}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-sm max-w-[220px]">
        {entry.notes ? (
          <span className="text-foreground/80 whitespace-pre-wrap line-clamp-3">{entry.notes}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="min-w-[240px]">
        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={searchOpen}
              className={`h-auto min-h-8 w-full justify-start text-xs font-normal bg-background py-1.5 ${resolvedSelectedCode ? "border-primary/50" : ""}`}
            >
              {resolvedSelectedCode ? (
                <div className="flex items-center gap-1.5 min-w-0">
                  <Check className="w-3 h-3 shrink-0 text-primary" />
                  <div className="flex flex-col items-start min-w-0">
                    <span className="truncate font-medium">{resolvedSelectedCode.contractualCode} — {resolvedSelectedCode.jdrWorkActivity}</span>
                    <span className="truncate text-[10px] text-muted-foreground">{resolvedSelectedCode.genericComment}</span>
                  </div>
                </div>
              ) : (
                <>
                  <Search className="w-3 h-3 mr-1.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-muted-foreground">Search JDR code or activity…</span>
                </>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0" align="start">
            <Command filter={(value, search) => {
              const item = searchIndex.find(m => m.code.id.toString() === value);
              if (!item) return 0;
              const haystack = `${item.code.contractualCode} ${item.code.jdrWorkActivity} ${item.code.lautecActivity} ${item.code.lautecActivityGroup} ${item.code.genericComment}`.toLowerCase();
              return haystack.includes(search.toLowerCase()) ? 1 : 0;
            }}>
              <CommandInput placeholder="Search by JDR code, activity, or comment..." />
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
      <TableCell>
        <Select 
          value={activityGroupId?.toString() || ""} 
          onValueChange={v => {
            setActivityGroupId(parseInt(v));
            setActivityId(null);
            setJdrCodeId(null);
            setSelectedMatch(null);
          }}
        >
          <SelectTrigger className="bg-background h-8 text-xs"><SelectValue placeholder="Select Group" /></SelectTrigger>
          <SelectContent>
            {activityGroups.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select 
          disabled={!activityGroupId}
          value={activityId?.toString() || ""} 
          onValueChange={v => {
            setActivityId(parseInt(v));
            setJdrCodeId(null);
            setSelectedMatch(null);
          }}
        >
          <SelectTrigger className="bg-background h-8 text-xs"><SelectValue placeholder="Select Activity" /></SelectTrigger>
          <SelectContent>
            {activities.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select 
          disabled={!activityId}
          value={jdrCodeId?.toString() || ""} 
          onValueChange={v => handleJdrSelect(parseInt(v))}
        >
          <SelectTrigger className="bg-background h-8 text-xs"><SelectValue placeholder="Select Code" /></SelectTrigger>
          <SelectContent>
            {jdrCodes.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.contractualCode} - {t.jdrWorkActivity}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Textarea 
          className="h-16 resize-none bg-background text-xs min-w-[200px]" 
          value={combinedComment}
          onChange={(e) => setCombinedComment(e.target.value)}
          placeholder="Will appear on the invoice..."
        />
      </TableCell>
      <TableCell className="text-right">
        <Button size="icon" onClick={handleSave} disabled={!canSave || updateMutation.isPending} title="Mark as Clarified">
          {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function ClarifiedCard({ entry }: { entry: DprTimesheetEntry }) {
  const { data: jdrCodes = [] } = useListDprJdrCodes(
    { activityId: entry.activityId || undefined },
    { query: { queryKey: getListDprJdrCodesQueryKey({ activityId: entry.activityId || undefined }), enabled: !!entry.activityId } }
  );
  const code = jdrCodes.find(c => entry.jdrCodeIds?.includes(c.id));

  return (
    <Card className="border-border shadow-none opacity-80 hover:opacity-100 transition-opacity bg-card">
      <CardContent className="p-4 flex gap-6">
        <div className="w-48 shrink-0">
          <Badge variant="outline" className="font-mono text-xs mb-2 border-border text-muted-foreground">{entry.date}</Badge>
          <div className="text-sm font-medium">{entry.team?.name}</div>
          <div className="text-xs text-muted-foreground">{entry.location?.name}</div>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium text-primary mb-2">
            <span>{code?.lautecActivity || "Categorized"}</span>
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
            <span>{code?.jdrWorkActivity || "Activity"}</span>
          </div>
          <p className="text-sm text-foreground/80 whitespace-pre-wrap">
            {entry.combinedComment}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
