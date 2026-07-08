import { useState, useMemo } from "react";
import { format } from "date-fns";
import { 
  useListDprTimesheetEntries, 
  useCreateDprTimesheetEntry, 
  useUpdateDprTimesheetEntry, 
  useDeleteDprTimesheetEntry,
  useListDprTeams,
  useListDprLocations,
  getListDprTimesheetEntriesQueryKey,
  getGetDprTimesheetSummaryQueryKey,
  DprTimesheetEntry
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function CapturePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: entries = [], isLoading: loadingEntries } = useListDprTimesheetEntries({
    query: {
      queryKey: getListDprTimesheetEntriesQueryKey({ stage: "captured" })
    }
  });

  const { data: teams = [] } = useListDprTeams();
  const { data: locations = [] } = useListDprLocations();

  const createMutation = useCreateDprTimesheetEntry({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDprTimesheetEntriesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDprTimesheetSummaryQueryKey() });
        toast({ title: "Entry created" });
        setNewRow(null);
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

  // Local state for new row
  const [newRow, setNewRow] = useState<{
    date: string;
    teamId: number | null;
    startTime: string;
    endTime: string;
    locationId: number | null;
    notes: string;
  } | null>(null);

  // Local state for editing existing row
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<DprTimesheetEntry>>({});

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
      }
    });
  };

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b border-border bg-card flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Timesheet Capture</h1>
          <p className="text-sm text-muted-foreground">Enter raw field hours to be clarified.</p>
        </div>
        <Button 
          onClick={() => setNewRow({ date: format(new Date(), "yyyy-MM-dd"), teamId: null, startTime: "", endTime: "", locationId: null, notes: "" })}
          disabled={newRow !== null}
          className="gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Row
        </Button>
      </header>

      <div className="flex-1 overflow-auto p-6 bg-background">
        <div className="rounded-md border border-border bg-card overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[150px]">Date</TableHead>
                <TableHead className="w-[180px]">Team</TableHead>
                <TableHead className="w-[120px]">Start Time</TableHead>
                <TableHead className="w-[120px]">End Time</TableHead>
                <TableHead className="w-[200px]">Location</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingEntries && !newRow && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
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
                    });
                  }}>
                    <TableCell className="font-medium">{entry.date}</TableCell>
                    <TableCell>{entry.team?.name || <span className="text-muted-foreground/50">--</span>}</TableCell>
                    <TableCell>{entry.startTime || <span className="text-muted-foreground/50">--</span>}</TableCell>
                    <TableCell>{entry.endTime || <span className="text-muted-foreground/50">--</span>}</TableCell>
                    <TableCell>{entry.location?.name || <span className="text-muted-foreground/50">--</span>}</TableCell>
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
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No captured entries. Click "Add Row" to start.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
