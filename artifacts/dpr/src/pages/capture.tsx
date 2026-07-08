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
  DprActivityType,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Save, Trash2, X, ClipboardPaste, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_ACTIVITY_TYPE_NAME = "Effective Working Time";

type RowDraft = {
  date: string;
  teamId: number | null;
  startTime: string;
  endTime: string;
  locationId: number | null;
  notes: string;
  activityTypeId: number | null;
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
  };
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
  activityRaw: string;
};

function parsePastedText(
  text: string,
  teams: DprTeam[],
  locations: DprLocation[],
  activityTypes: DprActivityType[],
  defaultActivityTypeId: number | null,
): PendingRow[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  return lines.map((line, idx) => {
    const cols = line.split("\t");
    const [rawDate = "", rawTeam = "", rawStart = "", rawEnd = "", rawLocation = "", rawNotes = "", rawActivity = ""] = cols;

    const team = findByName(teams, rawTeam);
    const location = findByName(locations, rawLocation);
    const activityType = rawActivity.trim() ? findByName(activityTypes, rawActivity) : undefined;

    return {
      key: `${Date.now()}-${idx}`,
      date: normalizeDate(rawDate),
      teamId: team?.id ?? null,
      startTime: normalizeTime(rawStart),
      endTime: normalizeTime(rawEnd),
      locationId: location?.id ?? null,
      notes: rawNotes.trim(),
      activityTypeId: activityType?.id ?? defaultActivityTypeId,
      teamRaw: rawTeam.trim(),
      locationRaw: rawLocation.trim(),
      activityRaw: rawActivity.trim(),
    };
  });
}

export default function CapturePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: entries = [], isLoading: loadingEntries } = useListDprTimesheetEntries({ stage: "captured" });

  const { data: teams = [] } = useListDprTeams();
  const { data: locations = [] } = useListDprLocations();
  const { data: activityTypes = [] } = useListDprActivityTypes();

  const defaultActivityType = useMemo(
    () => findByName(activityTypes, DEFAULT_ACTIVITY_TYPE_NAME),
    [activityTypes]
  );
  const defaultActivityTypeId = defaultActivityType?.id ?? null;

  const createMutation = useCreateDprTimesheetEntry({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDprTimesheetSummaryQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Failed to create", description: err.message, variant: "destructive" });
      }
    }
  });

  const updateMutation = useUpdateDprTimesheetEntry({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
        toast({ title: "Entry updated" });
        setEditingId(null);
      },
      onError: (err) => {
        toast({ title: "Failed to update", description: err.message, variant: "destructive" });
      }
    }
  });

  const deleteMutation = useDeleteDprTimesheetEntry({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDprTimesheetSummaryQueryKey() });
        toast({ title: "Entry deleted" });
      }
    }
  });

  const [newRow, setNewRow] = useState<RowDraft | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<DprTimesheetEntry>>({});

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pendingRows, setPendingRows] = useState<PendingRow[] | null>(null);
  const [isSavingBulk, setIsSavingBulk] = useState(false);
  const pasteTextareaRef = useRef<HTMLTextAreaElement>(null);

  const capturedEntries = useMemo(() => entries.filter(e => e.stage === "captured"), [entries]);

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
      }
    }, {
      onSuccess: () => {
        toast({ title: "Entry created" });
        setNewRow(null);
      }
    });
  };

  const handleUpdate = () => {
    if (!editingId) return;
    updateMutation.mutate({
      id: editingId,
      data: {
        date: editDraft.date,
        teamId: editDraft.teamId || null,
        startTime: editDraft.startTime || null,
        endTime: editDraft.endTime || null,
        locationId: editDraft.locationId || null,
        notes: editDraft.notes || null,
        activityTypeId: editDraft.activityTypeId || null,
      }
    });
  };

  const handlePasteChange = (text: string) => {
    setPasteText(text);
    if (!text.trim()) {
      setPendingRows(null);
      return;
    }
    setPendingRows(parsePastedText(text, teams, locations, activityTypes, defaultActivityTypeId));
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
    let succeeded = 0;
    let failed = 0;
    for (const row of pendingRows) {
      if (!row.date) { failed++; continue; }
      try {
        await createMutation.mutateAsync({
          data: {
            date: row.date,
            teamId: row.teamId || undefined,
            startTime: row.startTime || undefined,
            endTime: row.endTime || undefined,
            locationId: row.locationId || undefined,
            notes: row.notes || undefined,
            activityTypeId: row.activityTypeId || undefined,
          }
        });
        succeeded++;
      } catch {
        failed++;
      }
    }
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

      <div className="flex-1 overflow-auto p-6 bg-background">
        <div className="rounded-md border border-border bg-card overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[140px]">Date</TableHead>
                <TableHead className="w-[160px]">Team</TableHead>
                <TableHead className="w-[110px]">Start Time</TableHead>
                <TableHead className="w-[110px]">End Time</TableHead>
                <TableHead className="w-[180px]">Location</TableHead>
                <TableHead className="w-[200px]">Activity</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingEntries && !newRow && (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              )}
              
              {newRow && (
                <TableRow className="bg-primary/5">
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
                    <Select value={newRow.locationId?.toString() || ""} onValueChange={v => setNewRow({ ...newRow, locationId: parseInt(v) })}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select Location" /></SelectTrigger>
                      <SelectContent>
                        {locations.map(l => <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select value={newRow.activityTypeId?.toString() || ""} onValueChange={v => setNewRow({ ...newRow, activityTypeId: parseInt(v) })}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select Activity" /></SelectTrigger>
                      <SelectContent>
                        {activityTypes.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input 
                      value={newRow.notes} 
                      onChange={e => setNewRow({ ...newRow, notes: e.target.value })}
                      placeholder="Raw notes..."
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

              {capturedEntries.map(entry => {
                const isEditing = editingId === entry.id;
                
                if (isEditing) {
                  return (
                    <TableRow key={entry.id} className="bg-sidebar-accent/30">
                      <TableCell>
                        <Input 
                          type="date" 
                          value={editDraft.date || ""} 
                          onChange={e => setEditDraft({ ...editDraft, date: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </TableCell>
                      <TableCell>
                        <Select value={editDraft.teamId?.toString() || ""} onValueChange={v => setEditDraft({ ...editDraft, teamId: parseInt(v) })}>
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
                          onChange={e => setEditDraft({ ...editDraft, startTime: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </TableCell>
                      <TableCell>
                        <Input 
                          type="time" 
                          value={editDraft.endTime || ""} 
                          onChange={e => setEditDraft({ ...editDraft, endTime: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </TableCell>
                      <TableCell>
                        <Select value={editDraft.locationId?.toString() || ""} onValueChange={v => setEditDraft({ ...editDraft, locationId: parseInt(v) })}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select Location" /></SelectTrigger>
                          <SelectContent>
                            {locations.map(l => <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select value={editDraft.activityTypeId?.toString() || ""} onValueChange={v => setEditDraft({ ...editDraft, activityTypeId: parseInt(v) })}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select Activity" /></SelectTrigger>
                          <SelectContent>
                            {activityTypes.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input 
                          value={editDraft.notes || ""} 
                          onChange={e => setEditDraft({ ...editDraft, notes: e.target.value })}
                          className="h-8 text-sm"
                          onKeyDown={e => e.key === 'Enter' && handleUpdate()}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-green-500 hover:text-green-600 hover:bg-green-500/10" onClick={handleUpdate} disabled={updateMutation.isPending || !editDraft.date}>
                            {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setEditingId(null)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }

                return (
                  <TableRow key={entry.id} className="group cursor-pointer hover:bg-sidebar-accent/10" onClick={() => {
                    setEditingId(entry.id);
                    setEditDraft({
                      date: entry.date,
                      teamId: entry.teamId,
                      startTime: entry.startTime || "",
                      endTime: entry.endTime || "",
                      locationId: entry.locationId,
                      notes: entry.notes || "",
                      activityTypeId: entry.activityTypeId,
                    });
                  }}>
                    <TableCell className="font-medium">{entry.date}</TableCell>
                    <TableCell>{entry.team?.name || <span className="text-muted-foreground/50">--</span>}</TableCell>
                    <TableCell>{entry.startTime || <span className="text-muted-foreground/50">--</span>}</TableCell>
                    <TableCell>{entry.endTime || <span className="text-muted-foreground/50">--</span>}</TableCell>
                    <TableCell>{entry.location?.name || <span className="text-muted-foreground/50">--</span>}</TableCell>
                    <TableCell>{activityTypes.find(a => a.id === entry.activityTypeId)?.name || <span className="text-muted-foreground/50">--</span>}</TableCell>
                    <TableCell className="max-w-[300px] truncate">{entry.notes || <span className="text-muted-foreground/50">--</span>}</TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10" 
                        onClick={(e) => { e.stopPropagation(); deleteMutation.mutate({ id: entry.id }); }}
                      >
                        {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}

              {!loadingEntries && capturedEntries.length === 0 && !newRow && (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    No captured entries. Click "Add Row" or "Paste Rows" to start.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={pasteOpen} onOpenChange={(open) => { if (!open) closePasteDialog(); else setPasteOpen(true); }}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Paste rows from a spreadsheet</DialogTitle>
            <DialogDescription>
              Copy rows from your source sheet (Date, Team, Start, End, Location, Notes[, Activity]) and paste below. Rows without an Activity default to "{DEFAULT_ACTIVITY_TYPE_NAME}".
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
                      <TableHead className="w-[140px]">Location</TableHead>
                      <TableHead className="w-[170px]">Activity</TableHead>
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
                            <Select value={row.locationId?.toString() || ""} onValueChange={v => updatePendingRow(row.key, { locationId: parseInt(v) })}>
                              <SelectTrigger className={`h-8 text-sm ${locationUnmatched ? "border-amber-500" : ""}`}>
                                <SelectValue placeholder={locationUnmatched ? row.locationRaw : "Select Location"} />
                              </SelectTrigger>
                              <SelectContent>
                                {locations.map(l => <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select value={row.activityTypeId?.toString() || ""} onValueChange={v => updatePendingRow(row.key, { activityTypeId: parseInt(v) })}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select Activity" /></SelectTrigger>
                              <SelectContent>
                                {activityTypes.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
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
