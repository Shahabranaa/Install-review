import { useMemo, useState } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, Plus, Pencil, Trash2, Search, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function JdrMappingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: types = [], isLoading: typesLoading } = useListDprActivityTypes();
  const { data: groups = [], isLoading: groupsLoading } = useListDprActivityGroups({});
  const { data: activities = [], isLoading: activitiesLoading } = useListDprActivities({});
  const { data: jdrCodes = [], isLoading: jdrCodesLoading } = useListDprJdrCodes({});

  const isLoading = typesLoading || groupsLoading || activitiesLoading || jdrCodesLoading;

  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const activityById = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities]);

  const typeOfGroup = (groupId: number | null | undefined) =>
    groupId != null ? groupById.get(groupId)?.activityTypeId ?? null : null;
  const typeOfActivity = (activityId: number | null | undefined) => {
    const activity = activityId != null ? activityById.get(activityId) : undefined;
    return activity ? typeOfGroup(activity.activityGroupId) : null;
  };

  const typeCount = (typeId: number) =>
    jdrCodes.filter((j) => typeOfActivity(j.activityId) === typeId).length;
  const groupCount = (groupId: number) =>
    jdrCodes.filter((j) => activityById.get(j.activityId ?? -1)?.activityGroupId === groupId).length;
  const activityCount = (activityId: number) =>
    jdrCodes.filter((j) => j.activityId === activityId).length;

  const term = search.trim().toLowerCase();
  const matchesSearch = (code: DprJdrCode) =>
    !term ||
    [code.contractualCode, code.jdrWorkActivity, code.lautecActivity, code.lautecActivityGroup, code.genericComment]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(term));

  const searchedJdrCodes = useMemo(() => jdrCodes.filter(matchesSearch), [jdrCodes, term]);
  const activityIdsWithMatch = useMemo(
    () => new Set(searchedJdrCodes.map((c) => c.activityId).filter((id): id is number => id != null)),
    [searchedJdrCodes]
  );
  const groupIdsWithMatch = useMemo(() => {
    const s = new Set<number>();
    activities.forEach((a) => {
      if (activityIdsWithMatch.has(a.id) && a.activityGroupId != null) s.add(a.activityGroupId);
    });
    return s;
  }, [activities, activityIdsWithMatch]);
  const typeIdsWithMatch = useMemo(() => {
    const s = new Set<number>();
    groups.forEach((g) => {
      if (groupIdsWithMatch.has(g.id) && g.activityTypeId != null) s.add(g.activityTypeId);
    });
    return s;
  }, [groups, groupIdsWithMatch]);

  const visibleTypes = term ? types.filter((t) => typeIdsWithMatch.has(t.id)) : types;

  const visibleGroups = groups.filter((g) => {
    if (selectedTypeId != null && g.activityTypeId !== selectedTypeId) return false;
    if (term && !groupIdsWithMatch.has(g.id)) return false;
    return true;
  });

  const visibleActivities = activities.filter((a) => {
    if (selectedGroupId != null && a.activityGroupId !== selectedGroupId) return false;
    if (selectedGroupId == null && selectedTypeId != null && typeOfGroup(a.activityGroupId) !== selectedTypeId) return false;
    if (term && !activityIdsWithMatch.has(a.id)) return false;
    return true;
  });

  const visibleJdrCodes = jdrCodes.filter((j) => {
    if (selectedActivityId != null && j.activityId !== selectedActivityId) return false;
    if (selectedActivityId == null && selectedGroupId != null && activityById.get(j.activityId ?? -1)?.activityGroupId !== selectedGroupId) return false;
    if (selectedActivityId == null && selectedGroupId == null && selectedTypeId != null && typeOfActivity(j.activityId) !== selectedTypeId) return false;
    if (!matchesSearch(j)) return false;
    return true;
  });

  function selectType(id: number) {
    setSelectedTypeId((prev) => (prev === id ? null : id));
    setSelectedGroupId(null);
    setSelectedActivityId(null);
  }
  function selectGroup(id: number) {
    setSelectedGroupId((prev) => (prev === id ? null : id));
    setSelectedActivityId(null);
  }
  function selectActivity(id: number) {
    setSelectedActivityId((prev) => (prev === id ? null : id));
  }

  // ── Type CRUD ──
  const createType = useCreateDprActivityType({
    mutation: {
      onSuccess: (created) => {
        queryClient.setQueriesData<DprActivityType[]>(
          { queryKey: getListDprActivityTypesQueryKey() },
          (old) => (old ? [...old, created] : [created])
        );
        toast({ title: "Activity type created" });
        setTypeDialog(null);
      },
      onError: (e) => toast({ title: "Failed to create", description: e.message, variant: "destructive" }),
    },
  });
  const updateType = useUpdateDprActivityType({
    mutation: {
      onMutate: async ({ id, data }) => {
        await queryClient.cancelQueries({ queryKey: getListDprActivityTypesQueryKey() });
        const snapshot = queryClient.getQueriesData<DprActivityType[]>({ queryKey: getListDprActivityTypesQueryKey() });
        queryClient.setQueriesData<DprActivityType[]>(
          { queryKey: getListDprActivityTypesQueryKey() },
          (old) => old?.map((t) => (t.id === id ? { ...t, ...data } : t))
        );
        return { snapshot };
      },
      onSuccess: (updated) => {
        queryClient.setQueriesData<DprActivityType[]>(
          { queryKey: getListDprActivityTypesQueryKey() },
          (old) => old?.map((t) => (t.id === updated.id ? updated : t))
        );
        toast({ title: "Activity type updated" });
        setTypeDialog(null);
      },
      onError: (e, _, ctx) => {
        ctx?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data));
        toast({ title: "Failed to update", description: e.message, variant: "destructive" });
      },
    },
  });
  const deleteType = useDeleteDprActivityType({
    mutation: {
      onMutate: async ({ id }) => {
        await queryClient.cancelQueries({ queryKey: getListDprActivityTypesQueryKey() });
        const snapshot = queryClient.getQueriesData<DprActivityType[]>({ queryKey: getListDprActivityTypesQueryKey() });
        queryClient.setQueriesData<DprActivityType[]>(
          { queryKey: getListDprActivityTypesQueryKey() },
          (old) => old?.filter((t) => t.id !== id)
        );
        return { snapshot };
      },
      onSuccess: () => toast({ title: "Activity type deleted" }),
      onError: (e, _, ctx) => {
        ctx?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data));
        toast({ title: "Failed to delete", description: e.message, variant: "destructive" });
      },
    },
  });

  // ── Group CRUD ──
  const createGroup = useCreateDprActivityGroup({
    mutation: {
      onSuccess: (created) => {
        queryClient.setQueriesData<DprActivityGroup[]>(
          { queryKey: getListDprActivityGroupsQueryKey() },
          (old) => (old ? [...old, created] : [created])
        );
        toast({ title: "Activity group created" });
        setGroupDialog(null);
      },
      onError: (e) => toast({ title: "Failed to create", description: e.message, variant: "destructive" }),
    },
  });
  const updateGroup = useUpdateDprActivityGroup({
    mutation: {
      onMutate: async ({ id, data }) => {
        await queryClient.cancelQueries({ queryKey: getListDprActivityGroupsQueryKey() });
        const snapshot = queryClient.getQueriesData<DprActivityGroup[]>({ queryKey: getListDprActivityGroupsQueryKey() });
        queryClient.setQueriesData<DprActivityGroup[]>(
          { queryKey: getListDprActivityGroupsQueryKey() },
          (old) => old?.map((g) => (g.id === id ? { ...g, ...data } : g))
        );
        return { snapshot };
      },
      onSuccess: (updated) => {
        queryClient.setQueriesData<DprActivityGroup[]>(
          { queryKey: getListDprActivityGroupsQueryKey() },
          (old) => old?.map((g) => (g.id === updated.id ? updated : g))
        );
        toast({ title: "Activity group updated" });
        setGroupDialog(null);
      },
      onError: (e, _, ctx) => {
        ctx?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data));
        toast({ title: "Failed to update", description: e.message, variant: "destructive" });
      },
    },
  });
  const deleteGroup = useDeleteDprActivityGroup({
    mutation: {
      onMutate: async ({ id }) => {
        await queryClient.cancelQueries({ queryKey: getListDprActivityGroupsQueryKey() });
        const snapshot = queryClient.getQueriesData<DprActivityGroup[]>({ queryKey: getListDprActivityGroupsQueryKey() });
        queryClient.setQueriesData<DprActivityGroup[]>(
          { queryKey: getListDprActivityGroupsQueryKey() },
          (old) => old?.filter((g) => g.id !== id)
        );
        return { snapshot };
      },
      onSuccess: () => toast({ title: "Activity group deleted" }),
      onError: (e, _, ctx) => {
        ctx?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data));
        toast({ title: "Failed to delete", description: e.message, variant: "destructive" });
      },
    },
  });

  // ── Activity CRUD ──
  const createActivity = useCreateDprActivity({
    mutation: {
      onSuccess: (created) => {
        queryClient.setQueriesData<DprActivity[]>(
          { queryKey: getListDprActivitiesQueryKey() },
          (old) => (old ? [...old, created] : [created])
        );
        toast({ title: "Activity created" });
        setActivityDialog(null);
      },
      onError: (e) => toast({ title: "Failed to create", description: e.message, variant: "destructive" }),
    },
  });
  const updateActivity = useUpdateDprActivity({
    mutation: {
      onMutate: async ({ id, data }) => {
        await queryClient.cancelQueries({ queryKey: getListDprActivitiesQueryKey() });
        const snapshot = queryClient.getQueriesData<DprActivity[]>({ queryKey: getListDprActivitiesQueryKey() });
        queryClient.setQueriesData<DprActivity[]>(
          { queryKey: getListDprActivitiesQueryKey() },
          (old) => old?.map((a) => (a.id === id ? { ...a, ...data } : a))
        );
        return { snapshot };
      },
      onSuccess: (updated) => {
        queryClient.setQueriesData<DprActivity[]>(
          { queryKey: getListDprActivitiesQueryKey() },
          (old) => old?.map((a) => (a.id === updated.id ? updated : a))
        );
        toast({ title: "Activity updated" });
        setActivityDialog(null);
      },
      onError: (e, _, ctx) => {
        ctx?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data));
        toast({ title: "Failed to update", description: e.message, variant: "destructive" });
      },
    },
  });
  const deleteActivity = useDeleteDprActivity({
    mutation: {
      onMutate: async ({ id }) => {
        await queryClient.cancelQueries({ queryKey: getListDprActivitiesQueryKey() });
        const snapshot = queryClient.getQueriesData<DprActivity[]>({ queryKey: getListDprActivitiesQueryKey() });
        queryClient.setQueriesData<DprActivity[]>(
          { queryKey: getListDprActivitiesQueryKey() },
          (old) => old?.filter((a) => a.id !== id)
        );
        return { snapshot };
      },
      onSuccess: () => toast({ title: "Activity deleted" }),
      onError: (e, _, ctx) => {
        ctx?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data));
        toast({ title: "Failed to delete", description: e.message, variant: "destructive" });
      },
    },
  });

  // ── JDR Code CRUD ──
  const createJdrCode = useCreateDprJdrCode({
    mutation: {
      onSuccess: (created) => {
        queryClient.setQueriesData<DprJdrCode[]>(
          { queryKey: getListDprJdrCodesQueryKey() },
          (old) => (old ? [...old, created] : [created])
        );
        toast({ title: "JDR code created" });
        setJdrDialog(null);
      },
      onError: (e) => toast({ title: "Failed to create", description: e.message, variant: "destructive" }),
    },
  });
  const updateJdrCode = useUpdateDprJdrCode({
    mutation: {
      onMutate: async ({ id, data }) => {
        await queryClient.cancelQueries({ queryKey: getListDprJdrCodesQueryKey() });
        const snapshot = queryClient.getQueriesData<DprJdrCode[]>({ queryKey: getListDprJdrCodesQueryKey() });
        queryClient.setQueriesData<DprJdrCode[]>(
          { queryKey: getListDprJdrCodesQueryKey() },
          (old) => old?.map((c) => (c.id === id ? { ...c, ...data } : c))
        );
        return { snapshot };
      },
      onSuccess: (updated) => {
        queryClient.setQueriesData<DprJdrCode[]>(
          { queryKey: getListDprJdrCodesQueryKey() },
          (old) => old?.map((c) => (c.id === updated.id ? updated : c))
        );
        toast({ title: "JDR code updated" });
        setJdrDialog(null);
      },
      onError: (e, _, ctx) => {
        ctx?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data));
        toast({ title: "Failed to update", description: e.message, variant: "destructive" });
      },
    },
  });
  const deleteJdrCode = useDeleteDprJdrCode({
    mutation: {
      onMutate: async ({ id }) => {
        await queryClient.cancelQueries({ queryKey: getListDprJdrCodesQueryKey() });
        const snapshot = queryClient.getQueriesData<DprJdrCode[]>({ queryKey: getListDprJdrCodesQueryKey() });
        queryClient.setQueriesData<DprJdrCode[]>(
          { queryKey: getListDprJdrCodesQueryKey() },
          (old) => old?.filter((c) => c.id !== id)
        );
        return { snapshot };
      },
      onSuccess: () => toast({ title: "JDR code deleted" }),
      onError: (e, _, ctx) => {
        ctx?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data));
        toast({ title: "Failed to delete", description: e.message, variant: "destructive" });
      },
    },
  });

  const [typeDialog, setTypeDialog] = useState<{ editing: DprActivityType | null } | null>(null);
  const [groupDialog, setGroupDialog] = useState<{ editing: DprActivityGroup | null; defaultTypeId: number | null } | null>(null);
  const [activityDialog, setActivityDialog] = useState<{ editing: DprActivity | null; defaultGroupId: number | null } | null>(null);
  const [jdrDialog, setJdrDialog] = useState<{ editing: DprJdrCode | null; defaultActivityId: number | null } | null>(null);

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b border-border bg-card flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">JDR Mapping</h1>
            <p className="text-sm text-muted-foreground">
              Click a card to drill down. Use + Add to create new entries at any level.
            </p>
          </div>
        </div>
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search comments or activities"
            className="pl-8 pr-8"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {(selectedTypeId != null || selectedGroupId != null || selectedActivityId != null) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Filtered by drill-down.</span>
            <button
              className="underline hover:text-foreground"
              onClick={() => { setSelectedTypeId(null); setSelectedGroupId(null); setSelectedActivityId(null); }}
            >
              Clear
            </button>
          </div>
        )}
      </header>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto bg-background p-6">
          <div className="grid grid-cols-4 gap-4 min-w-[1100px] h-full">
            <KanbanColumn
              title="Activity Type"
              count={visibleTypes.length}
              onAdd={() => setTypeDialog({ editing: null })}
            >
              {visibleTypes.map((t) => (
                <KanbanCard
                  key={t.id}
                  title={t.name}
                  subtitle={`${typeCount(t.id)} codes`}
                  selected={selectedTypeId === t.id}
                  onClick={() => selectType(t.id)}
                  onEdit={() => setTypeDialog({ editing: t })}
                  onDelete={() => deleteType.mutate({ id: t.id })}
                  deletePending={deleteType.isPending}
                  deleteDescription={`Delete activity type "${t.name}"? This may affect activity groups linked to it.`}
                />
              ))}
              {visibleTypes.length === 0 && <EmptyHint text="No activity types." />}
            </KanbanColumn>

            <KanbanColumn
              title="Activity Group"
              count={visibleGroups.length}
              onAdd={() => setGroupDialog({ editing: null, defaultTypeId: selectedTypeId })}
            >
              {visibleGroups.map((g) => {
                const typeName = types.find((t) => t.id === g.activityTypeId)?.name;
                return (
                  <KanbanCard
                    key={g.id}
                    title={g.name}
                    subtitle={`${typeName ? typeName + " • " : ""}${groupCount(g.id)} codes`}
                    selected={selectedGroupId === g.id}
                    onClick={() => selectGroup(g.id)}
                    onEdit={() => setGroupDialog({ editing: g, defaultTypeId: g.activityTypeId ?? null })}
                    onDelete={() => deleteGroup.mutate({ id: g.id })}
                    deletePending={deleteGroup.isPending}
                    deleteDescription={`Delete activity group "${g.name}"? This may affect activities linked to it.`}
                  />
                );
              })}
              {visibleGroups.length === 0 && <EmptyHint text="No activity groups." />}
            </KanbanColumn>

            <KanbanColumn
              title="Activity"
              count={visibleActivities.length}
              onAdd={() => setActivityDialog({ editing: null, defaultGroupId: selectedGroupId })}
            >
              {visibleActivities.map((a) => {
                const groupName = groups.find((g) => g.id === a.activityGroupId)?.name;
                return (
                  <KanbanCard
                    key={a.id}
                    title={a.name}
                    subtitle={`${groupName ? groupName + " • " : ""}${activityCount(a.id)} codes`}
                    selected={selectedActivityId === a.id}
                    onClick={() => selectActivity(a.id)}
                    onEdit={() => setActivityDialog({ editing: a, defaultGroupId: a.activityGroupId })}
                    onDelete={() => deleteActivity.mutate({ id: a.id })}
                    deletePending={deleteActivity.isPending}
                    deleteDescription={`Delete activity "${a.name}"? This may affect JDR codes linked to it.`}
                  />
                );
              })}
              {visibleActivities.length === 0 && <EmptyHint text="No activities." />}
            </KanbanColumn>

            <KanbanColumn
              title="JDR Code"
              count={visibleJdrCodes.length}
              onAdd={() => setJdrDialog({ editing: null, defaultActivityId: selectedActivityId })}
            >
              {visibleJdrCodes.map((j) => (
                <KanbanCard
                  key={j.id}
                  badge={j.contractualCode}
                  title={j.jdrWorkActivity}
                  subtitle={j.genericComment}
                  footnote={`Linked: ${j.lautecActivity} · ${j.lautecActivityGroup}`}
                  onClick={() => {}}
                  onEdit={() => setJdrDialog({ editing: j, defaultActivityId: j.activityId ?? null })}
                  onDelete={() => deleteJdrCode.mutate({ id: j.id })}
                  deletePending={deleteJdrCode.isPending}
                  deleteDescription={`Delete JDR code "${j.contractualCode}"?`}
                />
              ))}
              {visibleJdrCodes.length === 0 && <EmptyHint text="No JDR codes." />}
            </KanbanColumn>
          </div>
        </div>
      )}

      {typeDialog && (
        <TypeDialog
          editing={typeDialog.editing}
          onClose={() => setTypeDialog(null)}
          onSave={(name) =>
            typeDialog.editing
              ? updateType.mutate({ id: typeDialog.editing.id, data: { name } })
              : createType.mutate({ data: { name } })
          }
          saving={createType.isPending || updateType.isPending}
        />
      )}

      {groupDialog && (
        <GroupDialog
          editing={groupDialog.editing}
          defaultTypeId={groupDialog.defaultTypeId}
          types={types}
          onClose={() => setGroupDialog(null)}
          onSave={(data) =>
            groupDialog.editing
              ? updateGroup.mutate({ id: groupDialog.editing.id, data })
              : createGroup.mutate({ data })
          }
          saving={createGroup.isPending || updateGroup.isPending}
        />
      )}

      {activityDialog && (
        <ActivityDialog
          editing={activityDialog.editing}
          defaultGroupId={activityDialog.defaultGroupId}
          groups={groups}
          onClose={() => setActivityDialog(null)}
          onSave={(data) =>
            activityDialog.editing
              ? updateActivity.mutate({ id: activityDialog.editing.id, data })
              : createActivity.mutate({ data })
          }
          saving={createActivity.isPending || updateActivity.isPending}
        />
      )}

      {jdrDialog && (
        <JdrCodeDialog
          editing={jdrDialog.editing}
          defaultActivityId={jdrDialog.defaultActivityId}
          activities={activities}
          onClose={() => setJdrDialog(null)}
          onSave={(data) =>
            jdrDialog.editing
              ? updateJdrCode.mutate({ id: jdrDialog.editing.id, data })
              : createJdrCode.mutate({ data })
          }
          saving={createJdrCode.isPending || updateJdrCode.isPending}
        />
      )}
    </div>
  );
}

// ─── Kanban primitives ──────────────────────────────────────────────────────

function KanbanColumn({ title, count, onAdd, children }: { title: string; count: number; onAdd: () => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-0 rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
          <span className="text-[10px] text-muted-foreground">({count})</span>
        </div>
        <Button size="sm" variant="outline" className="h-6 px-2 gap-1 text-xs" onClick={onAdd}>
          <Plus className="w-3 h-3" />Add
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">{children}</div>
    </div>
  );
}

function KanbanCard({
  badge,
  title,
  subtitle,
  footnote,
  selected,
  onClick,
  onEdit,
  onDelete,
  deletePending,
  deleteDescription,
}: {
  badge?: string;
  title: string;
  subtitle?: string;
  footnote?: string;
  selected?: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deletePending: boolean;
  deleteDescription: string;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative rounded-md border px-3 py-2 cursor-pointer transition-colors",
        selected ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-muted/50"
      )}
    >
      <div className="pr-12">
        {badge && (
          <span className="inline-block mb-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            {badge}
          </span>
        )}
        <div className="text-sm font-medium leading-snug">{title}</div>
        {subtitle && <div className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</div>}
        {footnote && <div className="text-[10px] text-muted-foreground/80 mt-1 truncate">{footnote}</div>}
      </div>
      <div className="absolute top-1.5 right-1.5 hidden group-hover:flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onEdit}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>{deleteDescription}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete} disabled={deletePending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deletePending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="text-xs text-muted-foreground text-center py-6">{text}</div>;
}

// ─── Dialogs ────────────────────────────────────────────────────────────────

function TypeDialog({ editing, onClose, onSave, saving }: { editing: DprActivityType | null; onClose: () => void; onSave: (name: string) => void; saving: boolean }) {
  const [name, setName] = useState(editing?.name ?? "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Edit Activity Type" : "New Activity Type"}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Effective Working Time" autoFocus />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(name.trim())} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GroupDialog({
  editing,
  defaultTypeId,
  types,
  onClose,
  onSave,
  saving,
}: {
  editing: DprActivityGroup | null;
  defaultTypeId: number | null;
  types: DprActivityType[];
  onClose: () => void;
  onSave: (data: { name: string; activityTypeId: number | null }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [activityTypeId, setActivityTypeId] = useState<number | null>(editing?.activityTypeId ?? defaultTypeId);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Edit Activity Group" : "New Activity Group"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Travel" autoFocus />
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
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave({ name: name.trim(), activityTypeId })} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActivityDialog({
  editing,
  defaultGroupId,
  groups,
  onClose,
  onSave,
  saving,
}: {
  editing: DprActivity | null;
  defaultGroupId: number | null;
  groups: DprActivityGroup[];
  onClose: () => void;
  onSave: (data: { name: string; activityGroupId: number }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [activityGroupId, setActivityGroupId] = useState<number | null>(editing?.activityGroupId ?? defaultGroupId);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Edit Activity" : "New Activity"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Site Travel" autoFocus />
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
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => activityGroupId != null && onSave({ name: name.trim(), activityGroupId })} disabled={!name.trim() || !activityGroupId || saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JdrCodeDialog({
  editing,
  defaultActivityId,
  activities,
  onClose,
  onSave,
  saving,
}: {
  editing: DprJdrCode | null;
  defaultActivityId: number | null;
  activities: DprActivity[];
  onClose: () => void;
  onSave: (data: {
    lautecActivity: string;
    lautecActivityGroup: string;
    jdrWorkActivity: string;
    contractualCode: string;
    genericComment: string;
    activityId: number | null;
  }) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    lautecActivity: editing?.lautecActivity ?? "",
    lautecActivityGroup: editing?.lautecActivityGroup ?? "",
    jdrWorkActivity: editing?.jdrWorkActivity ?? "",
    contractualCode: editing?.contractualCode ?? "",
    genericComment: editing?.genericComment ?? "",
    activityId: editing?.activityId ?? defaultActivityId,
  });

  const isValid =
    form.lautecActivity.trim() &&
    form.lautecActivityGroup.trim() &&
    form.jdrWorkActivity.trim() &&
    form.contractualCode.trim() &&
    form.genericComment.trim();

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "Edit JDR Code" : "New JDR Code"}</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label>Lautec Activity</Label>
            <Input value={form.lautecActivity} onChange={(e) => setForm({ ...form, lautecActivity: e.target.value })} autoFocus />
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
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() =>
              onSave({
                lautecActivity: form.lautecActivity.trim(),
                lautecActivityGroup: form.lautecActivityGroup.trim(),
                jdrWorkActivity: form.jdrWorkActivity.trim(),
                contractualCode: form.contractualCode.trim(),
                genericComment: form.genericComment.trim(),
                activityId: form.activityId,
              })
            }
            disabled={!isValid || saving}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
