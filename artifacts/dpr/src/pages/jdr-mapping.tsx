import { useState } from "react";
import {
  useListDprActivityTypes,
  useCreateDprActivityType,
  useUpdateDprActivityType,
  useDeleteDprActivityType,
  getListDprActivityTypesQueryKey,
  useListDprActivityGroups,
  useCreateDprActivityGroup,
  useUpdateDprActivityGroup,
  useDeleteDprActivityGroup,
  getListDprActivityGroupsQueryKey,
  useListDprActivities,
  useCreateDprActivity,
  useUpdateDprActivity,
  useDeleteDprActivity,
  getListDprActivitiesQueryKey,
  useListDprJdrCodes,
  useCreateDprJdrCode,
  useUpdateDprJdrCode,
  useDeleteDprJdrCode,
  getListDprJdrCodesQueryKey,
  DprActivityType,
  DprActivityGroup,
  DprActivity,
  DprJdrCode,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function JdrMappingPage() {
  const [activeTab, setActiveTab] = useState("activity-types");

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b border-border bg-card flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight">JDR Mapping</h1>
          <p className="text-sm text-muted-foreground">
            Manage the reference data used to categorize timesheet entries: Activity Type → Activity Group → Activity → JDR Code.
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col bg-background p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="shrink-0 mb-4">
            <TabsList>
              <TabsTrigger value="activity-types">Activity Types</TabsTrigger>
              <TabsTrigger value="activity-groups">Activity Groups</TabsTrigger>
              <TabsTrigger value="activities">Activities</TabsTrigger>
              <TabsTrigger value="jdr-codes">JDR Codes</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto pr-2">
            <TabsContent value="activity-types" className="m-0">
              <ActivityTypesTab />
            </TabsContent>
            <TabsContent value="activity-groups" className="m-0">
              <ActivityGroupsTab />
            </TabsContent>
            <TabsContent value="activities" className="m-0">
              <ActivitiesTab />
            </TabsContent>
            <TabsContent value="jdr-codes" className="m-0">
              <JdrCodesTab />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

// ─── Activity Types ─────────────────────────────────────────────────────────

function ActivityTypesTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: types = [], isLoading } = useListDprActivityTypes();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DprActivityType | null>(null);
  const [name, setName] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListDprActivityTypesQueryKey() });

  const createMutation = useCreateDprActivityType({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Activity type created" }); closeDialog(); },
      onError: (err) => toast({ title: "Failed to create", description: err.message, variant: "destructive" }),
    },
  });
  const updateMutation = useUpdateDprActivityType({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Activity type updated" }); closeDialog(); },
      onError: (err) => toast({ title: "Failed to update", description: err.message, variant: "destructive" }),
    },
  });
  const deleteMutation = useDeleteDprActivityType({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Activity type deleted" }); },
      onError: (err) => toast({ title: "Failed to delete", description: err.message, variant: "destructive" }),
    },
  });

  function openCreate() {
    setEditing(null);
    setName("");
    setDialogOpen(true);
  }
  function openEdit(row: DprActivityType) {
    setEditing(row);
    setName(row.name);
    setDialogOpen(true);
  }
  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
    setName("");
  }
  function handleSave() {
    if (!name.trim()) return;
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: { name: name.trim() } });
    } else {
      createMutation.mutate({ data: { name: name.trim() } });
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={(open) => (open ? openCreate() : closeDialog())}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="w-4 h-4" />Add Activity Type</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Activity Type" : "New Activity Type"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Effective Working Time" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button onClick={handleSave} disabled={!name.trim() || saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {types.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(row)}><Pencil className="w-4 h-4" /></Button>
                  <ConfirmDeleteButton
                    onConfirm={() => deleteMutation.mutate({ id: row.id })}
                    pending={deleteMutation.isPending}
                    description={`Delete activity type "${row.name}"? This may affect activity groups linked to it.`}
                  />
                </TableCell>
              </TableRow>
            ))}
            {types.length === 0 && (
              <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-8">No activity types yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ─── Activity Groups ────────────────────────────────────────────────────────

function ActivityGroupsTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: types = [] } = useListDprActivityTypes();
  const { data: groups = [], isLoading } = useListDprActivityGroups({});

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DprActivityGroup | null>(null);
  const [name, setName] = useState("");
  const [activityTypeId, setActivityTypeId] = useState<number | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListDprActivityGroupsQueryKey({}) });

  const createMutation = useCreateDprActivityGroup({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Activity group created" }); closeDialog(); },
      onError: (err) => toast({ title: "Failed to create", description: err.message, variant: "destructive" }),
    },
  });
  const updateMutation = useUpdateDprActivityGroup({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Activity group updated" }); closeDialog(); },
      onError: (err) => toast({ title: "Failed to update", description: err.message, variant: "destructive" }),
    },
  });
  const deleteMutation = useDeleteDprActivityGroup({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Activity group deleted" }); },
      onError: (err) => toast({ title: "Failed to delete", description: err.message, variant: "destructive" }),
    },
  });

  function openCreate() {
    setEditing(null);
    setName("");
    setActivityTypeId(null);
    setDialogOpen(true);
  }
  function openEdit(row: DprActivityGroup) {
    setEditing(row);
    setName(row.name);
    setActivityTypeId(row.activityTypeId ?? null);
    setDialogOpen(true);
  }
  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
    setName("");
    setActivityTypeId(null);
  }
  function handleSave() {
    if (!name.trim()) return;
    const data = { name: name.trim(), activityTypeId };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate({ data });
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending;
  const typeName = (id: number | null | undefined) => types.find((t) => t.id === id)?.name || "—";

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={(open) => (open ? openCreate() : closeDialog())}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="w-4 h-4" />Add Activity Group</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Activity Group" : "New Activity Group"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Travel" />
              </div>
              <div className="space-y-2">
                <Label>Activity Type</Label>
                <Select value={activityTypeId?.toString() || ""} onValueChange={(v) => setActivityTypeId(parseInt(v))}>
                  <SelectTrigger><SelectValue placeholder="Select Activity Type" /></SelectTrigger>
                  <SelectContent>
                    {types.map((t) => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button onClick={handleSave} disabled={!name.trim() || saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Activity Type</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="text-muted-foreground">{typeName(row.activityTypeId)}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(row)}><Pencil className="w-4 h-4" /></Button>
                  <ConfirmDeleteButton
                    onConfirm={() => deleteMutation.mutate({ id: row.id })}
                    pending={deleteMutation.isPending}
                    description={`Delete activity group "${row.name}"? This may affect activities linked to it.`}
                  />
                </TableCell>
              </TableRow>
            ))}
            {groups.length === 0 && (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No activity groups yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ─── Activities ─────────────────────────────────────────────────────────────

function ActivitiesTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: groups = [] } = useListDprActivityGroups({});
  const { data: activities = [], isLoading } = useListDprActivities({});

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DprActivity | null>(null);
  const [name, setName] = useState("");
  const [activityGroupId, setActivityGroupId] = useState<number | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListDprActivitiesQueryKey({}) });

  const createMutation = useCreateDprActivity({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Activity created" }); closeDialog(); },
      onError: (err) => toast({ title: "Failed to create", description: err.message, variant: "destructive" }),
    },
  });
  const updateMutation = useUpdateDprActivity({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Activity updated" }); closeDialog(); },
      onError: (err) => toast({ title: "Failed to update", description: err.message, variant: "destructive" }),
    },
  });
  const deleteMutation = useDeleteDprActivity({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Activity deleted" }); },
      onError: (err) => toast({ title: "Failed to delete", description: err.message, variant: "destructive" }),
    },
  });

  function openCreate() {
    setEditing(null);
    setName("");
    setActivityGroupId(null);
    setDialogOpen(true);
  }
  function openEdit(row: DprActivity) {
    setEditing(row);
    setName(row.name);
    setActivityGroupId(row.activityGroupId);
    setDialogOpen(true);
  }
  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
    setName("");
    setActivityGroupId(null);
  }
  function handleSave() {
    if (!name.trim() || !activityGroupId) return;
    const data = { name: name.trim(), activityGroupId };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate({ data });
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending;
  const groupName = (id: number) => groups.find((g) => g.id === id)?.name || "—";

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={(open) => (open ? openCreate() : closeDialog())}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="w-4 h-4" />Add Activity</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Activity" : "New Activity"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Site Travel" />
              </div>
              <div className="space-y-2">
                <Label>Activity Group</Label>
                <Select value={activityGroupId?.toString() || ""} onValueChange={(v) => setActivityGroupId(parseInt(v))}>
                  <SelectTrigger><SelectValue placeholder="Select Activity Group" /></SelectTrigger>
                  <SelectContent>
                    {groups.map((g) => <SelectItem key={g.id} value={g.id.toString()}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button onClick={handleSave} disabled={!name.trim() || !activityGroupId || saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Activity Group</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activities.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="text-muted-foreground">{groupName(row.activityGroupId)}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(row)}><Pencil className="w-4 h-4" /></Button>
                  <ConfirmDeleteButton
                    onConfirm={() => deleteMutation.mutate({ id: row.id })}
                    pending={deleteMutation.isPending}
                    description={`Delete activity "${row.name}"? This may affect JDR codes linked to it.`}
                  />
                </TableCell>
              </TableRow>
            ))}
            {activities.length === 0 && (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No activities yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ─── JDR Codes ──────────────────────────────────────────────────────────────

const emptyJdrForm = {
  lautecActivity: "",
  lautecActivityGroup: "",
  jdrWorkActivity: "",
  contractualCode: "",
  genericComment: "",
  activityId: null as number | null,
};

function JdrCodesTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: activities = [] } = useListDprActivities({});
  const { data: jdrCodes = [], isLoading } = useListDprJdrCodes({});

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DprJdrCode | null>(null);
  const [form, setForm] = useState(emptyJdrForm);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListDprJdrCodesQueryKey({}) });

  const createMutation = useCreateDprJdrCode({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "JDR code created" }); closeDialog(); },
      onError: (err) => toast({ title: "Failed to create", description: err.message, variant: "destructive" }),
    },
  });
  const updateMutation = useUpdateDprJdrCode({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "JDR code updated" }); closeDialog(); },
      onError: (err) => toast({ title: "Failed to update", description: err.message, variant: "destructive" }),
    },
  });
  const deleteMutation = useDeleteDprJdrCode({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "JDR code deleted" }); },
      onError: (err) => toast({ title: "Failed to delete", description: err.message, variant: "destructive" }),
    },
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyJdrForm);
    setDialogOpen(true);
  }
  function openEdit(row: DprJdrCode) {
    setEditing(row);
    setForm({
      lautecActivity: row.lautecActivity,
      lautecActivityGroup: row.lautecActivityGroup,
      jdrWorkActivity: row.jdrWorkActivity,
      contractualCode: row.contractualCode,
      genericComment: row.genericComment,
      activityId: row.activityId ?? null,
    });
    setDialogOpen(true);
  }
  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
    setForm(emptyJdrForm);
  }

  const isFormValid =
    form.lautecActivity.trim() &&
    form.lautecActivityGroup.trim() &&
    form.jdrWorkActivity.trim() &&
    form.contractualCode.trim() &&
    form.genericComment.trim();

  function handleSave() {
    if (!isFormValid) return;
    const data = {
      lautecActivity: form.lautecActivity.trim(),
      lautecActivityGroup: form.lautecActivityGroup.trim(),
      jdrWorkActivity: form.jdrWorkActivity.trim(),
      contractualCode: form.contractualCode.trim(),
      genericComment: form.genericComment.trim(),
      activityId: form.activityId,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate({ data });
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending;
  const activityName = (id: number | null | undefined) => activities.find((a) => a.id === id)?.name || "—";

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={(open) => (open ? openCreate() : closeDialog())}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="w-4 h-4" />Add JDR Code</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit JDR Code" : "New JDR Code"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              <div className="space-y-2">
                <Label>Lautec Activity</Label>
                <Input value={form.lautecActivity} onChange={(e) => setForm({ ...form, lautecActivity: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Lautec Activity Group</Label>
                <Input value={form.lautecActivityGroup} onChange={(e) => setForm({ ...form, lautecActivityGroup: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>JDR Work Activity</Label>
                <Input value={form.jdrWorkActivity} onChange={(e) => setForm({ ...form, jdrWorkActivity: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Contractual (JDR) Code</Label>
                <Input value={form.contractualCode} onChange={(e) => setForm({ ...form, contractualCode: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Generic Comment</Label>
                <Input value={form.genericComment} onChange={(e) => setForm({ ...form, genericComment: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Linked Activity</Label>
                <Select value={form.activityId?.toString() || ""} onValueChange={(v) => setForm({ ...form, activityId: parseInt(v) })}>
                  <SelectTrigger><SelectValue placeholder="Select Activity" /></SelectTrigger>
                  <SelectContent>
                    {activities.map((a) => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button onClick={handleSave} disabled={!isFormValid || saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contractual Code</TableHead>
              <TableHead>JDR Work Activity</TableHead>
              <TableHead>Lautec Activity</TableHead>
              <TableHead>Lautec Activity Group</TableHead>
              <TableHead>Generic Comment</TableHead>
              <TableHead>Linked Activity</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jdrCodes.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium whitespace-nowrap">{row.contractualCode}</TableCell>
                <TableCell>{row.jdrWorkActivity}</TableCell>
                <TableCell className="text-muted-foreground">{row.lautecActivity}</TableCell>
                <TableCell className="text-muted-foreground">{row.lautecActivityGroup}</TableCell>
                <TableCell className="text-muted-foreground max-w-[220px] truncate" title={row.genericComment}>{row.genericComment}</TableCell>
                <TableCell className="text-muted-foreground">{activityName(row.activityId)}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(row)}><Pencil className="w-4 h-4" /></Button>
                  <ConfirmDeleteButton
                    onConfirm={() => deleteMutation.mutate({ id: row.id })}
                    pending={deleteMutation.isPending}
                    description={`Delete JDR code "${row.contractualCode}"?`}
                  />
                </TableCell>
              </TableRow>
            ))}
            {jdrCodes.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No JDR codes yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ─── Shared ─────────────────────────────────────────────────────────────────

function ConfirmDeleteButton({ onConfirm, pending, description }: { onConfirm: () => void; pending: boolean; description: string }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive">
          <Trash2 className="w-4 h-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={pending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
