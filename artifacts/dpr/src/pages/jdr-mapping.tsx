// @ts-nocheck
import { Fragment, useEffect, useMemo, useState } from "react";
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
  useListDprLocations,
  useCreateDprLocation,
  useUpdateDprLocation,
  useDeleteDprLocation,
  getListDprLocationsQueryKey,
  DprActivityType,
  DprActivityGroup,
  DprActivity,
  DprJdrCode,
  DprLocation,
  useListDprWorkers,
  useCreateDprWorker,
  useDeleteDprWorker,
  getListDprWorkersQueryKey,
  DprWorker,
  DprWorkerInput,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
  Loader2, Plus, Pencil, Trash2, Search, X, Check, ChevronsUpDown,
  Network, Users, MapPin, Layers, FolderOpen, Zap, Tag, MessageSquare, ChevronRight, TableProperties, ShieldCheck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PREDEFINED_ROLES, roleColor, roleAbbr, roleLabel, COLOR_PRESETS, colorPresetClasses } from "@/lib/roles";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface CustomRole { id: number; abbr: string; name: string; color: string | null; }

// ─── Google Sheet Settings ────────────────────────────────────────────────────

function GoogleSheetSettingsPanel() {
  const { toast } = useToast();
  const [sheetId, setSheetId]   = useState("");
  const [sheetGid, setSheetGid] = useState("");
  const [source, setSource]     = useState<"db" | "env" | null>(null);
  const [saving, setSaving]     = useState(false);

  const { isLoading } = useQuery({
    queryKey: ["/api/settings/google-sheet"],
    queryFn: () =>
      fetch("/api/settings/google-sheet", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => { setSheetId(d.sheetId ?? ""); setSheetGid(d.sheetGid ?? ""); setSource(d.source ?? null); return d; }),
  });

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch("/api/settings/google-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sheetId: sheetId.trim(), sheetGid: sheetGid.trim() }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Save failed");
      setSource("db");
      toast({ title: "Saved", description: "Google Sheet settings updated." });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <TableProperties className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-[13px] font-semibold">WhatsApp Bot Sheet</h2>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Configure the Google Sheet the WhatsApp bot writes to. Values saved here take effect immediately without redeployment.
        </p>
        {source === "env" && (
          <p className="mt-2 text-[11px] text-amber-700 bg-amber-500/10 border border-amber-200 rounded px-3 py-1.5">
            Currently reading from environment variables. Saving here will override them.
          </p>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium">Sheet ID</label>
            <input
              value={sheetId}
              onChange={(e) => setSheetId(e.target.value)}
              placeholder="1pnCPVUNsWVzee4h6Dw..."
              className="w-full font-mono text-[12px] h-8 px-2.5 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <p className="text-[10px] text-muted-foreground">
              Found in the sheet URL: docs.google.com/spreadsheets/d/<strong>SHEET_ID</strong>/edit
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium">Sheet GID (tab ID)</label>
            <input
              value={sheetGid}
              onChange={(e) => setSheetGid(e.target.value)}
              placeholder="1853640306"
              className="w-full font-mono text-[12px] h-8 px-2.5 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <p className="text-[10px] text-muted-foreground">
              Found in the sheet URL: …/edit#gid=<strong>GID</strong>
            </p>
          </div>
          <button
            type="submit"
            disabled={saving || (!sheetId.trim() && !sheetGid.trim())}
            className="h-7 px-3 text-[11px] font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving ? <><Loader2 className="w-3 h-3 animate-spin" />Saving…</> : "Save"}
          </button>
        </form>
      )}
    </div>
  );
}

// ─── Lautec Browser Settings ─────────────────────────────────────────────────

function LautecSettingsPanel() {
  const { toast } = useToast();
  const [loginUrl, setLoginUrl] = useState("https://dpr.lautec.com/");
  const [loginSelectors, setLoginSelectors] = useState({
    username: 'input[type="email"]',
    continueSubmit: "button[type=submit]",
    password: 'input[type="password"]',
    loginSubmit: "button[type=submit]",
    loginComplete: "",
  });
  const [status, setStatus] = useState<{ usernameConfigured: boolean; passwordConfigured: boolean; selectorsConfigured: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  const { isLoading } = useQuery({
    queryKey: ["/api/settings/lautec"],
    queryFn: async () => {
      const response = await fetch("/api/settings/lautec", { credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load Lautec settings.");
      setLoginUrl(data.loginUrl ?? "https://dpr.lautec.com/");
      setLoginSelectors((current) => ({ ...current, ...(data.loginSelectors ?? {}) }));
      setStatus(data);
      return data;
    },
  });

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/settings/lautec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ loginUrl: loginUrl.trim(), loginSelectors }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save Lautec settings.");
      toast({ title: "Saved", description: "Lautec browser login settings updated." });
    } catch (error: any) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const configured = status?.usernameConfigured && status?.passwordConfigured && status?.selectorsConfigured;
  return (
    <div className="max-w-lg space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-[13px] font-semibold">Lautec Import Login</h2>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Configure the visible Lautec pages used by the DPR import browser. Imports sign in with one dedicated server-side account.
        </p>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className={`rounded-md border px-3 py-2 text-[11px] ${configured ? "border-emerald-200 bg-emerald-500/10 text-emerald-800" : "border-amber-200 bg-amber-500/10 text-amber-800"}`}>
            {configured ? "Lautec credentials and browser selectors are configured." : "Finish the server-side Lautec setup before sending an import."}
          </div>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[11px]">Login URL</Label>
              <Input value={loginUrl} onChange={(event) => setLoginUrl(event.target.value)} type="url" placeholder="https://dpr.lautec.com/" className="font-mono text-[12px] h-8" />
            </div>
            <div className="rounded-md border border-border/70 bg-muted/20 p-3 space-y-3">
              <div>
                <p className="text-[11px] font-medium">Two-step login controls</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Matches Lautec’s email → Continue → password → Sign in flow.</p>
              </div>
              {[
                ["username", "Email address field"],
                ["continueSubmit", "Continue button"],
                ["password", "Password field"],
                ["loginSubmit", "Sign in button"],
                ["loginComplete", "Post-login marker (optional)"],
              ].map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label className="text-[10px]">{label}</Label>
                  <Input
                    value={loginSelectors[key as keyof typeof loginSelectors]}
                    onChange={(event) => setLoginSelectors((current) => ({ ...current, [key]: event.target.value }))}
                    placeholder={key === "loginComplete" ? "A selector only visible after sign-in" : "CSS selector"}
                    className="font-mono text-[11px] h-7"
                  />
                </div>
              ))}
            </div>
            <Button type="submit" size="sm" disabled={saving || !loginUrl.trim()} className="h-7 text-[11px]">
              {saving && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}Save Lautec settings
            </Button>
          </form>
          <div className="rounded-md border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground space-y-1">
            <p><strong className="text-foreground">Dedicated account:</strong> email {status?.usernameConfigured ? "configured" : "not configured"} · password {status?.passwordConfigured ? "configured" : "not configured"}.</p>
            <p>For security, set the email as <strong>LAUTEC_USERNAME</strong> and the password as <strong>LAUTEC_PASSWORD</strong> in workspace secrets. They are never displayed here or saved to the DPR database.</p>
            {!status?.selectorsConfigured && <p>Browser selectors still need to be configured by a technical administrator.</p>}
          </div>
        </>
      )}
    </div>
  );
}

export default function JdrMappingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: types = [], isLoading: typesLoading } = useListDprActivityTypes();
  const { data: groups = [], isLoading: groupsLoading } = useListDprActivityGroups({});
  const { data: activities = [], isLoading: activitiesLoading } = useListDprActivities({});
  const { data: jdrCodes = [], isLoading: jdrCodesLoading } = useListDprJdrCodes({});
  const { data: locations = [], isLoading: locationsLoading } = useListDprLocations();
  const { data: workers = [] } = useListDprWorkers({ query: { refetchOnMount: "always" } });

  const { data: customRoles = [], refetch: refetchCustomRoles } = useQuery<CustomRole[]>({
    queryKey: ["dpr-custom-roles"],
    queryFn: () => fetch(`${API_BASE}/api/dpr/custom-roles`, { credentials: "include" }).then((r) => r.json()),
  });

  const isLoading = typesLoading || groupsLoading || activitiesLoading || jdrCodesLoading || locationsLoading;

  const [activeTab, setActiveTab] = useState<"teams" | "locations" | "roles" | "workers" | "activities" | "sheets" | "lautec">("activities");
  const [workerDialog, setWorkerDialog] = useState<{ editing: DprWorker | null } | null>(null);
  const [roleDialog, setRoleDialog] = useState<{ abbr: string; name: string; color: string; saving: boolean; error: string | null } | null>(null);

  const allKnownRoles = useMemo(() => {
    const set = new Set<string>([...PREDEFINED_ROLES, ...customRoles.map((r) => r.abbr)]);
    workers.forEach((w) => (w.roles ?? []).forEach((r) => set.add(r)));
    return [...set].sort();
  }, [workers, customRoles]);

  const createCustomRole = useMutation({
    mutationFn: ({ abbr, name, color }: { abbr: string; name: string; color: string }) =>
      fetch(`${API_BASE}/api/dpr/custom-roles`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ abbr, name, color }), credentials: "include" })
        .then(async (r) => { if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Failed"); } return r.json(); }),
    onSuccess: () => { refetchCustomRoles(); setRoleDialog(null); toast({ title: "Role added" }); },
    onError: (e) => setRoleDialog((d) => d ? { ...d, saving: false, error: e.message } : d),
  });

  const deleteCustomRole = useMutation({
    mutationFn: (abbr: string) =>
      fetch(`${API_BASE}/api/dpr/custom-roles/${encodeURIComponent(abbr)}`, { method: "DELETE", credentials: "include" }),
    onSuccess: () => { refetchCustomRoles(); toast({ title: "Role removed" }); },
    onError: (e) => toast({ title: "Failed to remove role", description: e.message, variant: "destructive" }),
  });

  // ── Worker mutations ────────────────────────────────────────────────────────
  const createWorker = useCreateDprWorker({
    mutation: {
      onSuccess: (created) => {
        queryClient.setQueriesData<DprWorker[]>({ queryKey: getListDprWorkersQueryKey() }, (old) => old ? [...old, created] : [created]);
        toast({ title: "Worker added" }); setWorkerDialog(null);
      },
      onError: (e) => toast({ title: "Failed to add worker", description: e.message, variant: "destructive" }),
    },
  });
  const updateWorker = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<DprWorkerInput> }) =>
      fetch(`/api/dpr/workers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), credentials: "include" }).then((r) => r.json()),
    onSuccess: (updated: DprWorker) => {
      queryClient.setQueriesData<DprWorker[]>({ queryKey: getListDprWorkersQueryKey() }, (old) => old?.map((w) => w.id === updated.id ? updated : w));
      toast({ title: "Worker updated" }); setWorkerDialog(null);
    },
    onError: (e) => toast({ title: "Failed to update worker", description: e.message, variant: "destructive" }),
  });
  const deleteWorker = useDeleteDprWorker({
    mutation: {
      onMutate: async ({ id }) => {
        await queryClient.cancelQueries({ queryKey: getListDprWorkersQueryKey() });
        const snapshot = queryClient.getQueriesData<DprWorker[]>({ queryKey: getListDprWorkersQueryKey() });
        queryClient.setQueriesData<DprWorker[]>({ queryKey: getListDprWorkersQueryKey() }, (old) => old?.filter((w) => w.id !== id));
        return { snapshot };
      },
      onSuccess: () => toast({ title: "Worker deleted" }),
      onError: (e, _, ctx) => { ctx?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data)); toast({ title: "Failed to delete worker", description: e.message, variant: "destructive" }); },
    },
  });

  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [showAllLocations, setShowAllLocations] = useState(false);

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

  const activityBadge = useMemo(() => {
    const map = new Map<number, string>();
    activities.forEach((a) => {
      const codes = jdrCodes.filter((j) => j.activityId === a.id);
      if (codes.length > 0) {
        const code = (codes[0].contractualCode ?? "").toUpperCase();
        map.set(a.id, code.includes("ORSTED") ? "ORSTED" : "JDR");
      }
    });
    return map;
  }, [activities, jdrCodes]);

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

  // ── CRUD mutations ─────────────────────────────────────────────────────────
  const createType = useCreateDprActivityType({
    mutation: {
      onMutate: async ({ data }) => {
        await queryClient.cancelQueries({ queryKey: getListDprActivityTypesQueryKey() });
        const snapshot = queryClient.getQueriesData<DprActivityType[]>({ queryKey: getListDprActivityTypesQueryKey() });
        const tempId = -(Date.now());
        queryClient.setQueriesData<DprActivityType[]>({ queryKey: getListDprActivityTypesQueryKey() }, (old) => (old ? [...old, { id: tempId, name: data.name }] : [{ id: tempId, name: data.name }]));
        return { snapshot, tempId };
      },
      onSuccess: (created, _, ctx) => {
        queryClient.setQueriesData<DprActivityType[]>({ queryKey: getListDprActivityTypesQueryKey() }, (old) => old ? [...old.filter(t => t.id !== ctx?.tempId), created] : [created]);
        toast({ title: "Category created" }); setTypeDialog(null);
      },
      onError: (e, _, ctx) => { ctx?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data)); toast({ title: "Failed to create", description: e.message, variant: "destructive" }); },
    },
  });
  const updateType = useUpdateDprActivityType({
    mutation: {
      onMutate: async ({ id, data }) => {
        await queryClient.cancelQueries({ queryKey: getListDprActivityTypesQueryKey() });
        const snapshot = queryClient.getQueriesData<DprActivityType[]>({ queryKey: getListDprActivityTypesQueryKey() });
        queryClient.setQueriesData<DprActivityType[]>({ queryKey: getListDprActivityTypesQueryKey() }, (old) => old?.map((t) => (t.id === id ? { ...t, ...data } : t)));
        return { snapshot };
      },
      onSuccess: (updated) => {
        queryClient.setQueriesData<DprActivityType[]>({ queryKey: getListDprActivityTypesQueryKey() }, (old) => old?.map((t) => (t.id === updated.id ? updated : t)));
        toast({ title: "Category updated" }); setTypeDialog(null);
      },
      onError: (e, _, ctx) => { ctx?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data)); toast({ title: "Failed to update", description: e.message, variant: "destructive" }); },
    },
  });
  const deleteType = useDeleteDprActivityType({
    mutation: {
      onMutate: async ({ id }) => {
        await queryClient.cancelQueries({ queryKey: getListDprActivityTypesQueryKey() });
        const snapshot = queryClient.getQueriesData<DprActivityType[]>({ queryKey: getListDprActivityTypesQueryKey() });
        queryClient.setQueriesData<DprActivityType[]>({ queryKey: getListDprActivityTypesQueryKey() }, (old) => old?.filter((t) => t.id !== id));
        return { snapshot };
      },
      onSuccess: () => toast({ title: "Category deleted" }),
      onError: (e, _, ctx) => { ctx?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data)); toast({ title: "Failed to delete", description: e.message, variant: "destructive" }); },
    },
  });
  const createGroup = useCreateDprActivityGroup({
    mutation: {
      onMutate: async ({ data }) => {
        await queryClient.cancelQueries({ queryKey: getListDprActivityGroupsQueryKey() });
        const snapshot = queryClient.getQueriesData<DprActivityGroup[]>({ queryKey: getListDprActivityGroupsQueryKey() });
        const tempId = -(Date.now());
        const tempEntry: DprActivityGroup = { id: tempId, name: data.name, activityTypeId: data.activityTypeId ?? null };
        queryClient.setQueriesData<DprActivityGroup[]>({ queryKey: getListDprActivityGroupsQueryKey() }, (old) => (old ? [...old, tempEntry] : [tempEntry]));
        return { snapshot, tempId };
      },
      onSuccess: (created, _, ctx) => {
        queryClient.setQueriesData<DprActivityGroup[]>({ queryKey: getListDprActivityGroupsQueryKey() }, (old) => old ? [...old.filter(g => g.id !== ctx?.tempId), created] : [created]);
        toast({ title: "Activity group created" }); setGroupDialog(null);
      },
      onError: (e, _, ctx) => { ctx?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data)); toast({ title: "Failed to create", description: e.message, variant: "destructive" }); },
    },
  });
  const updateGroup = useUpdateDprActivityGroup({
    mutation: {
      onMutate: async ({ id, data }) => {
        await queryClient.cancelQueries({ queryKey: getListDprActivityGroupsQueryKey() });
        const snapshot = queryClient.getQueriesData<DprActivityGroup[]>({ queryKey: getListDprActivityGroupsQueryKey() });
        queryClient.setQueriesData<DprActivityGroup[]>({ queryKey: getListDprActivityGroupsQueryKey() }, (old) => old?.map((g) => (g.id === id ? { ...g, ...data } : g)));
        return { snapshot };
      },
      onSuccess: (updated) => {
        queryClient.setQueriesData<DprActivityGroup[]>({ queryKey: getListDprActivityGroupsQueryKey() }, (old) => old?.map((g) => (g.id === updated.id ? updated : g)));
        toast({ title: "Activity group updated" }); setGroupDialog(null);
      },
      onError: (e, _, ctx) => { ctx?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data)); toast({ title: "Failed to update", description: e.message, variant: "destructive" }); },
    },
  });
  const deleteGroup = useDeleteDprActivityGroup({
    mutation: {
      onMutate: async ({ id }) => {
        await queryClient.cancelQueries({ queryKey: getListDprActivityGroupsQueryKey() });
        const snapshot = queryClient.getQueriesData<DprActivityGroup[]>({ queryKey: getListDprActivityGroupsQueryKey() });
        queryClient.setQueriesData<DprActivityGroup[]>({ queryKey: getListDprActivityGroupsQueryKey() }, (old) => old?.filter((g) => g.id !== id));
        return { snapshot };
      },
      onSuccess: () => toast({ title: "Activity group deleted" }),
      onError: (e, _, ctx) => { ctx?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data)); toast({ title: "Failed to delete", description: e.message, variant: "destructive" }); },
    },
  });
  const createActivity = useCreateDprActivity({
    mutation: {
      onMutate: async ({ data }) => {
        await queryClient.cancelQueries({ queryKey: getListDprActivitiesQueryKey() });
        const snapshot = queryClient.getQueriesData<DprActivity[]>({ queryKey: getListDprActivitiesQueryKey() });
        const tempId = -(Date.now());
        queryClient.setQueriesData<DprActivity[]>({ queryKey: getListDprActivitiesQueryKey() }, (old) => (old ? [...old, { id: tempId, name: data.name, activityGroupId: data.activityGroupId }] : [{ id: tempId, name: data.name, activityGroupId: data.activityGroupId }]));
        return { snapshot, tempId };
      },
      onSuccess: (created, _, ctx) => {
        queryClient.setQueriesData<DprActivity[]>({ queryKey: getListDprActivitiesQueryKey() }, (old) => old ? [...old.filter(a => a.id !== ctx?.tempId), created] : [created]);
        toast({ title: "Activity created" }); setActivityDialog(null);
      },
      onError: (e, _, ctx) => { ctx?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data)); toast({ title: "Failed to create", description: e.message, variant: "destructive" }); },
    },
  });
  const updateActivity = useUpdateDprActivity({
    mutation: {
      onMutate: async ({ id, data }) => {
        await queryClient.cancelQueries({ queryKey: getListDprActivitiesQueryKey() });
        const snapshot = queryClient.getQueriesData<DprActivity[]>({ queryKey: getListDprActivitiesQueryKey() });
        queryClient.setQueriesData<DprActivity[]>({ queryKey: getListDprActivitiesQueryKey() }, (old) => old?.map((a) => (a.id === id ? { ...a, ...data } : a)));
        return { snapshot };
      },
      onSuccess: (updated) => {
        queryClient.setQueriesData<DprActivity[]>({ queryKey: getListDprActivitiesQueryKey() }, (old) => old?.map((a) => (a.id === updated.id ? updated : a)));
        toast({ title: "Activity updated" }); setActivityDialog(null);
      },
      onError: (e, _, ctx) => { ctx?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data)); toast({ title: "Failed to update", description: e.message, variant: "destructive" }); },
    },
  });
  const deleteActivity = useDeleteDprActivity({
    mutation: {
      onMutate: async ({ id }) => {
        await queryClient.cancelQueries({ queryKey: getListDprActivitiesQueryKey() });
        const snapshot = queryClient.getQueriesData<DprActivity[]>({ queryKey: getListDprActivitiesQueryKey() });
        queryClient.setQueriesData<DprActivity[]>({ queryKey: getListDprActivitiesQueryKey() }, (old) => old?.filter((a) => a.id !== id));
        return { snapshot };
      },
      onSuccess: () => toast({ title: "Activity deleted" }),
      onError: (e, _, ctx) => { ctx?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data)); toast({ title: "Failed to delete", description: e.message, variant: "destructive" }); },
    },
  });
  const createJdrCode = useCreateDprJdrCode({
    mutation: {
      onMutate: async ({ data }) => {
        await queryClient.cancelQueries({ queryKey: getListDprJdrCodesQueryKey() });
        const snapshot = queryClient.getQueriesData<DprJdrCode[]>({ queryKey: getListDprJdrCodesQueryKey() });
        const tempId = -(Date.now());
        queryClient.setQueriesData<DprJdrCode[]>({ queryKey: getListDprJdrCodesQueryKey() }, (old) => (old ? [...old, { id: tempId, lautecActivity: data.lautecActivity, lautecActivityGroup: data.lautecActivityGroup, jdrWorkActivity: data.jdrWorkActivity, contractualCode: data.contractualCode, genericComment: data.genericComment, activityId: data.activityId ?? null }] : []));
        return { snapshot, tempId };
      },
      onSuccess: (created, _, ctx) => {
        queryClient.setQueriesData<DprJdrCode[]>({ queryKey: getListDprJdrCodesQueryKey() }, (old) => old ? [...old.filter(c => c.id !== ctx?.tempId), created] : [created]);
        toast({ title: "JDR code created" }); setJdrDialog(null);
      },
      onError: (e, _, ctx) => { ctx?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data)); toast({ title: "Failed to create", description: e.message, variant: "destructive" }); },
    },
  });
  const updateJdrCode = useUpdateDprJdrCode({
    mutation: {
      onMutate: async ({ id, data }) => {
        await queryClient.cancelQueries({ queryKey: getListDprJdrCodesQueryKey() });
        const snapshot = queryClient.getQueriesData<DprJdrCode[]>({ queryKey: getListDprJdrCodesQueryKey() });
        queryClient.setQueriesData<DprJdrCode[]>({ queryKey: getListDprJdrCodesQueryKey() }, (old) => old?.map((c) => (c.id === id ? { ...c, ...data } : c)));
        return { snapshot };
      },
      onSuccess: (updated) => {
        queryClient.setQueriesData<DprJdrCode[]>({ queryKey: getListDprJdrCodesQueryKey() }, (old) => old?.map((c) => (c.id === updated.id ? updated : c)));
        toast({ title: "JDR code updated" }); setJdrDialog(null);
      },
      onError: (e, _, ctx) => { ctx?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data)); toast({ title: "Failed to update", description: e.message, variant: "destructive" }); },
    },
  });
  const deleteJdrCode = useDeleteDprJdrCode({
    mutation: {
      onMutate: async ({ id }) => {
        await queryClient.cancelQueries({ queryKey: getListDprJdrCodesQueryKey() });
        const snapshot = queryClient.getQueriesData<DprJdrCode[]>({ queryKey: getListDprJdrCodesQueryKey() });
        queryClient.setQueriesData<DprJdrCode[]>({ queryKey: getListDprJdrCodesQueryKey() }, (old) => old?.filter((c) => c.id !== id));
        return { snapshot };
      },
      onSuccess: () => toast({ title: "JDR code deleted" }),
      onError: (e, _, ctx) => { ctx?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data)); toast({ title: "Failed to delete", description: e.message, variant: "destructive" }); },
    },
  });
  const createLocation = useCreateDprLocation({
    mutation: {
      onMutate: async ({ data }) => {
        await queryClient.cancelQueries({ queryKey: getListDprLocationsQueryKey() });
        const snapshot = queryClient.getQueriesData<DprLocation[]>({ queryKey: getListDprLocationsQueryKey() });
        const tempId = -(Date.now());
        queryClient.setQueriesData<DprLocation[]>({ queryKey: getListDprLocationsQueryKey() }, (old) => (old ? [...old, { id: tempId, name: data.name }] : [{ id: tempId, name: data.name }]));
        return { snapshot, tempId };
      },
      onSuccess: (created, _, ctx) => {
        queryClient.setQueriesData<DprLocation[]>({ queryKey: getListDprLocationsQueryKey() }, (old) => old ? [...old.filter((l) => l.id !== ctx?.tempId), created] : [created]);
        toast({ title: "Location created" }); setLocationDialog(null);
      },
      onError: (e, _, ctx) => { ctx?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data)); toast({ title: "Failed to create", description: e.message, variant: "destructive" }); },
    },
  });
  const updateLocation = useUpdateDprLocation({
    mutation: {
      onMutate: async ({ id, data }) => {
        await queryClient.cancelQueries({ queryKey: getListDprLocationsQueryKey() });
        const snapshot = queryClient.getQueriesData<DprLocation[]>({ queryKey: getListDprLocationsQueryKey() });
        queryClient.setQueriesData<DprLocation[]>({ queryKey: getListDprLocationsQueryKey() }, (old) => old?.map((l) => (l.id === id ? { ...l, ...data } : l)));
        return { snapshot };
      },
      onSuccess: (updated) => {
        queryClient.setQueriesData<DprLocation[]>({ queryKey: getListDprLocationsQueryKey() }, (old) => old?.map((l) => (l.id === updated.id ? updated : l)));
        toast({ title: "Location updated" }); setLocationDialog(null);
      },
      onError: (e, _, ctx) => { ctx?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data)); toast({ title: "Failed to update", description: e.message, variant: "destructive" }); },
    },
  });
  const deleteLocation = useDeleteDprLocation({
    mutation: {
      onMutate: async ({ id }) => {
        await queryClient.cancelQueries({ queryKey: getListDprLocationsQueryKey() });
        const snapshot = queryClient.getQueriesData<DprLocation[]>({ queryKey: getListDprLocationsQueryKey() });
        queryClient.setQueriesData<DprLocation[]>({ queryKey: getListDprLocationsQueryKey() }, (old) => old?.filter((l) => l.id !== id));
        return { snapshot };
      },
      onSuccess: () => toast({ title: "Location deleted" }),
      onError: (e, _, ctx) => { ctx?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data)); toast({ title: "Failed to delete", description: e.message, variant: "destructive" }); },
    },
  });

  // ── Teams ──────────────────────────────────────────────────────────────────
  const teamsKey = ["/api/dpr/teams"];
  const { data: teams = [] } = useQuery({
    queryKey: teamsKey,
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/dpr/teams", { signal });
      if (!res.ok) throw new Error("Failed to fetch teams");
      return res.json() as Promise<{ id: number; name: string }[]>;
    },
  });
  const createTeam = useMutation({
    mutationFn: (name: string) => fetch("/api/dpr/teams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }).then((r) => r.json()),
    onMutate: async (name) => { const prev = queryClient.getQueryData(teamsKey); queryClient.setQueryData(teamsKey, (old: any[]) => [...(old ?? []), { id: -(Date.now()), name }]); return { prev }; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: teamsKey }); setTeamDialog(null); toast({ title: "Team created" }); },
    onError: (_e, _v, ctx: any) => { queryClient.setQueryData(teamsKey, ctx?.prev); toast({ title: "Failed to create team", variant: "destructive" }); },
  });
  const updateTeam = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => fetch(`/api/dpr/teams/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }).then((r) => r.json()),
    onMutate: async ({ id, name }) => { const prev = queryClient.getQueryData(teamsKey); queryClient.setQueryData(teamsKey, (old: any[]) => (old ?? []).map((t) => t.id === id ? { ...t, name } : t)); return { prev }; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: teamsKey }); setTeamDialog(null); toast({ title: "Team updated" }); },
    onError: (_e, _v, ctx: any) => { queryClient.setQueryData(teamsKey, ctx?.prev); toast({ title: "Failed to update team", variant: "destructive" }); },
  });
  const deleteTeam = useMutation({
    mutationFn: (id: number) => fetch(`/api/dpr/teams/${id}`, { method: "DELETE" }),
    onMutate: async (id) => { const prev = queryClient.getQueryData(teamsKey); queryClient.setQueryData(teamsKey, (old: any[]) => (old ?? []).filter((t) => t.id !== id)); return { prev }; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: teamsKey }); toast({ title: "Team deleted" }); },
    onError: (_e, _v, ctx: any) => { queryClient.setQueryData(teamsKey, ctx?.prev); toast({ title: "Failed to delete team", variant: "destructive" }); },
  });

  // ── Dialog state ──────────────────────────────────────────────────────────
  const [typeDialog, setTypeDialog] = useState<{ editing: DprActivityType | null } | null>(null);
  const [groupDialog, setGroupDialog] = useState<{ editing: DprActivityGroup | null; defaultTypeId: number | null } | null>(null);
  const [activityDialog, setActivityDialog] = useState<{ editing: DprActivity | null; defaultGroupId: number | null } | null>(null);
  const [jdrDialog, setJdrDialog] = useState<{ editing: DprJdrCode | null; defaultActivityId: number | null } | null>(null);
  const [locationDialog, setLocationDialog] = useState<{ editing: DprLocation | null } | null>(null);
  const [teamDialog, setTeamDialog] = useState<{ editing: { id: number; name: string } | null } | null>(null);

  // breadcrumb
  const selectedType = selectedTypeId != null ? types.find((t) => t.id === selectedTypeId) : null;
  const selectedGroup = selectedGroupId != null ? groups.find((g) => g.id === selectedGroupId) : null;
  const selectedActivity = selectedActivityId != null ? activities.find((a) => a.id === selectedActivityId) : null;
  const hasFilter = selectedType || selectedGroup || selectedActivity;

  const LOCATION_PAGE = 20;
  const visibleLocations = showAllLocations ? locations : locations.slice(0, LOCATION_PAGE);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-muted/20">

      {/* ── Page header ─────────────────────────────────────────────── */}
      <header className="flex shrink-0 flex-wrap items-center gap-2.5 border-b border-border/70 bg-card px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <Network className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold tracking-tight leading-none">DPR Mapping</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-none">Activity hierarchy &amp; comment mapping</p>
          </div>
        </div>

        <div className="hidden flex-1 sm:block" />

        {/* Search */}
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search codes or comments…"
            className="pl-7 pr-7 h-7 text-xs bg-muted/40 border-border/60 rounded-md"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </header>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

          {/* ══ Tab bar ══ */}
          <div className="shrink-0 overflow-x-auto border-b border-border/50 bg-background px-4">
            <div className="flex min-w-max items-center gap-0">
            {([ 
              { id: "teams",      label: "Teams",      icon: <Users className="w-3.5 h-3.5" />,   count: teams.length },
              { id: "locations",  label: "Locations",  icon: <MapPin className="w-3.5 h-3.5" />,  count: locations.length },
              { id: "roles",      label: "Roles",      icon: <Tag className="w-3.5 h-3.5" />,     count: PREDEFINED_ROLES.length },
              { id: "workers",    label: "Workers",    icon: <Users className="w-3.5 h-3.5" />,   count: workers.filter((w) => w.active).length },
              { id: "activities", label: "Activities", icon: <Network className="w-3.5 h-3.5" />, count: jdrCodes.length },
              { id: "sheets",     label: "Sheets",     icon: <TableProperties className="w-3.5 h-3.5" />, count: null },
              { id: "lautec",     label: "Lautec",     icon: <ShieldCheck className="w-3.5 h-3.5" />, count: null },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                  activeTab === tab.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border/60"
                )}
              >
                {tab.icon}
                {tab.label}
                {tab.count !== null && <span className="text-[10px] text-muted-foreground/50 font-mono ml-0.5">({tab.count})</span>}
              </button>
            ))}
            </div>
          </div>

          {/* ══ Tab content ══ */}
          {activeTab !== "activities" ? (
            <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-3 sm:p-4">

              {/* ── Teams ── */}
              {activeTab === "teams" && (
                <div className="max-w-4xl">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <h2 className="text-[13px] font-semibold text-foreground">Teams</h2>
                      <span className="text-[11px] text-muted-foreground/50 font-mono">({teams.length})</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setTeamDialog({ editing: null })} className="h-7 text-[11px] gap-1">
                      <Plus className="w-3 h-3" /> Add team
                    </Button>
                  </div>
                  {teams.length === 0
                    ? <p className="text-[12px] text-muted-foreground italic">No teams yet — add one to get started.</p>
                    : <div className="flex flex-wrap gap-2">
                      {teams.map((team) => (
                        <Chip
                          key={team.id}
                          label={team.name}
                          onEdit={() => setTeamDialog({ editing: team })}
                          onDelete={() => deleteTeam.mutate(team.id)}
                          deletePending={deleteTeam.isPending}
                          deleteDescription={`Delete team "${team.name}"? This will also remove all role slots and daily assignments.`}
                        />
                      ))}
                    </div>
                  }
                </div>
              )}

              {/* ── Locations ── */}
              {activeTab === "locations" && (
                <div className="max-w-4xl">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <h2 className="text-[13px] font-semibold text-foreground">Locations</h2>
                      <span className="text-[11px] text-muted-foreground/50 font-mono">({locations.length})</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setLocationDialog({ editing: null })} className="h-7 text-[11px] gap-1">
                      <Plus className="w-3 h-3" /> Add location
                    </Button>
                  </div>
                  {locations.length === 0
                    ? <p className="text-[12px] text-muted-foreground italic">No locations yet.</p>
                    : <>
                      <div className="flex flex-wrap gap-2">
                        {visibleLocations.map((loc) => (
                          <Chip
                            key={loc.id}
                            label={loc.name}
                            onEdit={() => setLocationDialog({ editing: loc })}
                            onDelete={() => deleteLocation.mutate({ id: loc.id })}
                            deletePending={deleteLocation.isPending}
                            deleteDescription={`Delete location "${loc.name}"? Timesheet entries referencing it will lose their location link.`}
                          />
                        ))}
                      </div>
                      {locations.length > LOCATION_PAGE && (
                        <button
                          onClick={() => setShowAllLocations((v) => !v)}
                          className="mt-3 text-[11px] text-primary hover:underline"
                        >
                          {showAllLocations ? "Show fewer" : `+${locations.length - LOCATION_PAGE} more`}
                        </button>
                      )}
                    </>
                  }
                </div>
              )}

              {/* ── Roles ── */}
              {activeTab === "roles" && (
                <div className="max-w-2xl">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-muted-foreground" />
                      <h2 className="text-[13px] font-semibold text-foreground">Roles</h2>
                      <span className="text-[11px] text-muted-foreground/50 font-mono">({PREDEFINED_ROLES.length + customRoles.length})</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setRoleDialog({ abbr: "", name: "", color: COLOR_PRESETS[0].key, saving: false, error: null })} className="h-7 text-[11px] gap-1">
                      <Plus className="w-3 h-3" /> Add role
                    </Button>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-card overflow-hidden shadow-sm">
                    <table className="w-full text-[12px] border-collapse">
                      <thead className="bg-muted/30">
                        <tr className="border-b border-border/40">
                          <th className="text-left px-4 py-2 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider w-20">Abbr</th>
                          <th className="text-left px-4 py-2 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Role Name</th>
                          <th className="w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {/* ── Built-in section ── */}
                        <tr className="bg-muted/20">
                          <td colSpan={3} className="px-4 py-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">Built-in · {PREDEFINED_ROLES.length}</span>
                          </td>
                        </tr>
                        {PREDEFINED_ROLES.map((abbr) => (
                          <tr key={abbr} className="border-t border-border/20 hover:bg-muted/10 transition-colors">
                            <td className="px-4 py-2">
                              <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold tracking-wide", roleColor(abbr))}>
                                {abbr}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-foreground/80">{roleLabel(abbr)}</td>
                            <td />
                          </tr>
                        ))}
                        {/* ── Custom section ── */}
                        <tr className="bg-muted/20">
                          <td colSpan={3} className="px-4 py-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">Custom · {customRoles.length}</span>
                          </td>
                        </tr>
                        {customRoles.length === 0 && (
                          <tr className="border-t border-border/20">
                            <td colSpan={3} className="px-4 py-3 text-[12px] text-muted-foreground/50 italic">No custom roles yet — click Add role to create one.</td>
                          </tr>
                        )}
                        {customRoles.map((role) => (
                          <tr key={role.abbr} className="border-t border-border/20 hover:bg-muted/10 transition-colors">
                            <td className="px-4 py-2">
                              <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold tracking-wide", colorPresetClasses(role.color))}>
                                {role.abbr}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-foreground/80">{role.name}</td>
                            <td className="px-2 py-1.5 text-right">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remove "{role.abbr}"?</AlertDialogTitle>
                                    <AlertDialogDescription>This removes the <strong>{role.name}</strong> role definition. Workers who already have this role assigned will not be affected.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteCustomRole.mutate(role.abbr)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Workers ── */}
              {activeTab === "workers" && (() => {
                const activeWorkers = workers.filter((w) => w.active);
                const byRole = new Map<string, DprWorker[]>();
                const sortedByName = [...activeWorkers].sort((a, b) =>
                  `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
                );
                for (const w of sortedByName) {
                  const role = (w.roles ?? []).length > 0 ? w.roles![0] : "Unassigned";
                  if (!byRole.has(role)) byRole.set(role, []);
                  byRole.get(role)!.push(w);
                }
                const sections: { label: string; rows: DprWorker[]; dim?: boolean }[] = [
                  ...[...byRole.entries()]
                    .filter(([r]) => r !== "Unassigned")
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([r, rows]) => ({ label: r, rows })),
                  ...(byRole.has("Unassigned") ? [{ label: "Unassigned", rows: byRole.get("Unassigned")!, dim: true }] : []),
                ];
                return (
                  <div className="max-w-2xl">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <h2 className="text-[13px] font-semibold text-foreground">Workers</h2>
                        <span className="text-[11px] text-muted-foreground/50 font-mono">({activeWorkers.length} active)</span>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setWorkerDialog({ editing: null })} className="h-7 text-[11px] gap-1">
                        <Plus className="w-3 h-3" /> Add worker
                      </Button>
                    </div>
                    {workers.length === 0
                      ? <p className="text-[12px] text-muted-foreground italic">No workers yet — add one to get started.</p>
                      : <div className="rounded-xl border border-border/70 bg-card overflow-hidden shadow-sm">
                        <table className="w-full text-[12px] border-collapse">
                          <thead className="sticky top-0 z-10 bg-muted/30">
                            <tr className="border-b border-border/40">
                              <th className="text-left px-4 py-2 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Name</th>
                              <th className="text-left px-4 py-2 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Role</th>
                              <th className="text-left px-4 py-2 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider w-20">Abbr</th>
                              <th className="w-16" />
                            </tr>
                          </thead>
                          <tbody>
                            {sections.map(({ label, rows, dim }) => (
                              <Fragment key={label}>
                                <tr className="bg-muted/20">
                                  <td colSpan={4} className="px-4 py-1.5">
                                    <span className={cn("text-[10px] font-semibold uppercase tracking-widest", dim ? "text-muted-foreground/40" : "text-muted-foreground")}>{label}</span>
                                  </td>
                                </tr>
                                {rows.map((w) => {
                                  return (
                                    <tr key={w.id} className={cn("border-t border-border/20 hover:bg-muted/10 transition-colors group", !w.active && "opacity-50")}>
                                      <td className="px-4 py-2 text-foreground/80">{w.firstName} {w.lastName}</td>
                                      <td className="px-4 py-2 text-foreground/60 text-[12px]">
                                        {(w.roles ?? []).length ? (w.roles ?? []).join(", ") : <span className="text-muted-foreground/40 italic">—</span>}
                                      </td>
                                      <td className="px-4 py-2">
                                        {(w.roles ?? []).length
                                          ? <div className="flex flex-wrap gap-1">{(w.roles ?? []).map((r) => { const a = roleAbbr(r); return <span key={r} className={cn("inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 rounded border text-[10px]", roleColor(a))}><span className="font-bold tracking-wide">{a}</span><span className="opacity-60">{roleLabel(a)}</span></span>; })}</div>
                                          : <span className="text-muted-foreground/40 italic text-[11px]">—</span>
                                        }
                                      </td>
                                      <td className="px-2 py-1.5">
                                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => setWorkerDialog({ editing: w })}>
                                            <Pencil className="w-3 h-3" />
                                          </Button>
                                          <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" disabled={deleteWorker.isPending}>
                                                <Trash2 className="w-3 h-3" />
                                              </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                              <AlertDialogHeader>
                                                <AlertDialogTitle>Delete worker?</AlertDialogTitle>
                                                <AlertDialogDescription>This will permanently remove {w.firstName} {w.lastName} and cannot be undone.</AlertDialogDescription>
                                              </AlertDialogHeader>
                                              <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => deleteWorker.mutate({ id: w.id })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                                              </AlertDialogFooter>
                                            </AlertDialogContent>
                                          </AlertDialog>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    }
                  </div>
                );
              })()}

              {/* ── Sheets ── */}
              {activeTab === "sheets" && <GoogleSheetSettingsPanel />}
              {activeTab === "lautec" && <LautecSettingsPanel />}

            </div>
          ) : (
            /* ══ Activities tab: full-height hierarchy ══ */
            <div className="flex-1 min-h-0 flex flex-col p-2 sm:p-3">
            <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-border/70 overflow-hidden bg-card shadow-sm">

              {/* Breadcrumb / filter bar */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border/50 bg-muted/30 shrink-0 min-h-[28px]">
                {hasFilter ? (
                  <>
                    <span className="text-[11px] text-muted-foreground">Filtered:</span>
                    {selectedType && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground/80">
                        <Layers className="w-3 h-3 text-muted-foreground" />
                        {selectedType.name}
                      </span>
                    )}
                    {selectedGroup && (
                      <>
                        <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground/80">
                          <FolderOpen className="w-3 h-3 text-muted-foreground" />
                          {selectedGroup.name}
                        </span>
                      </>
                    )}
                    {selectedActivity && (
                      <>
                        <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground/80">
                          <Zap className="w-3 h-3 text-muted-foreground" />
                          {selectedActivity.name}
                        </span>
                      </>
                    )}
                    <button
                      onClick={() => { setSelectedTypeId(null); setSelectedGroupId(null); setSelectedActivityId(null); }}
                      className="ml-1 text-[11px] text-muted-foreground hover:text-foreground underline transition-colors"
                    >
                      Clear
                    </button>
                  </>
                ) : (
                  <span className="text-[11px] text-muted-foreground/60">
                    {search ? `Showing results for "${search}"` : "Click a row to drill down"}
                  </span>
                )}
              </div>

              {/* 5 columns */}
              <div className="flex-1 min-h-0 grid grid-cols-5 divide-x divide-border/60">

                {/* Col 1 — Category */}
                <DrillColumn
                  step="01"
                  icon={<Layers className="w-3.5 h-3.5" />}
                  label="Category"
                  count={visibleTypes.length}
                  onAdd={() => setTypeDialog({ editing: null })}
                >
                  {visibleTypes.map((t) => (
                    <DrillCard
                      key={t.id}
                      title={t.name}
                      meta={`${typeCount(t.id)} codes`}
                      selected={selectedTypeId === t.id}
                      onClick={() => selectType(t.id)}
                      onEdit={() => setTypeDialog({ editing: t })}
                      onDelete={() => deleteType.mutate({ id: t.id })}
                      deletePending={deleteType.isPending}
                      deleteDescription={`Delete category "${t.name}"? This may affect activity groups linked to it.`}
                    />
                  ))}
                  {visibleTypes.length === 0 && <EmptyHint />}
                </DrillColumn>

                {/* Col 2 — Activity Group */}
                <DrillColumn
                  step="02"
                  icon={<FolderOpen className="w-3.5 h-3.5" />}
                  label="Activity Group"
                  count={visibleGroups.length}
                  onAdd={() => setGroupDialog({ editing: null, defaultTypeId: selectedTypeId })}
                >
                  {visibleGroups.map((g) => {
                    const typeName = types.find((t) => t.id === g.activityTypeId)?.name;
                    return (
                      <DrillCard
                        key={g.id}
                        title={g.name}
                        meta={typeName}
                        secondary={`${groupCount(g.id)} codes`}
                        selected={selectedGroupId === g.id}
                        onClick={() => selectGroup(g.id)}
                        onEdit={() => setGroupDialog({ editing: g, defaultTypeId: g.activityTypeId ?? null })}
                        onDelete={() => deleteGroup.mutate({ id: g.id })}
                        deletePending={deleteGroup.isPending}
                        deleteDescription={`Delete activity group "${g.name}"? This may affect activities linked to it.`}
                      />
                    );
                  })}
                  {visibleGroups.length === 0 && <EmptyHint />}
                </DrillColumn>

                {/* Col 3 — Activity */}
                <DrillColumn
                  step="03"
                  icon={<Zap className="w-3.5 h-3.5" />}
                  label="Activity"
                  count={visibleActivities.length}
                  onAdd={() => setActivityDialog({ editing: null, defaultGroupId: selectedGroupId })}
                >
                  {visibleActivities.map((a) => {
                    const badge = activityBadge.get(a.id);
                    return (
                      <DrillCard
                        key={a.id}
                        title={a.name}
                        meta={`${activityCount(a.id)} codes`}
                        badge={badge}
                        selected={selectedActivityId === a.id}
                        onClick={() => selectActivity(a.id)}
                        onEdit={() => setActivityDialog({ editing: a, defaultGroupId: a.activityGroupId })}
                        onDelete={() => deleteActivity.mutate({ id: a.id })}
                        deletePending={deleteActivity.isPending}
                        deleteDescription={`Delete activity "${a.name}"? This may affect JDR codes linked to it.`}
                      />
                    );
                  })}
                  {visibleActivities.length === 0 && <EmptyHint />}
                </DrillColumn>

                {/* Col 4 — Code */}
                <DrillColumn
                  step="04"
                  icon={<Tag className="w-3.5 h-3.5" />}
                  label="Code"
                  count={visibleJdrCodes.length}
                  onAdd={() => setJdrDialog({ editing: null, defaultActivityId: selectedActivityId })}
                >
                  {visibleJdrCodes.map((j) => (
                    <JdrCodeRow
                      key={j.id}
                      jdrWorkActivity={j.jdrWorkActivity}
                      contractualCode={j.contractualCode}
                      onEdit={() => setJdrDialog({ editing: j, defaultActivityId: j.activityId ?? null })}
                      onDelete={() => deleteJdrCode.mutate({ id: j.id })}
                      deletePending={deleteJdrCode.isPending}
                      deleteDescription={`Delete JDR code "${j.jdrWorkActivity}"?`}
                    />
                  ))}
                  {visibleJdrCodes.length === 0 && <EmptyHint />}
                </DrillColumn>

                {/* Col 5 — Generic Comment */}
                <DrillColumn
                  step="05"
                  icon={<MessageSquare className="w-3.5 h-3.5" />}
                  label="Generic Comment"
                  count={visibleJdrCodes.length}
                  onAdd={() => setJdrDialog({ editing: null, defaultActivityId: selectedActivityId })}
                >
                  {visibleJdrCodes.map((j) => (
                    <JdrGenericCommentRow
                      key={j.id}
                      comment={j.genericComment}
                      onEdit={() => setJdrDialog({ editing: j, defaultActivityId: j.activityId ?? null })}
                    />
                  ))}
                  {visibleJdrCodes.length === 0 && <EmptyHint />}
                </DrillColumn>

              </div>
            </div>
            </div>
          )}

        </div>
      )}

      {/* ── Dialogs ──────────────────────────────────────────────────── */}
      {roleDialog && (
        <Dialog open onOpenChange={(o) => !o && setRoleDialog(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Add Role</DialogTitle></DialogHeader>
            <div className="space-y-4">
              {/* Live chip preview */}
              <div className="flex items-center justify-center py-3 rounded-lg bg-muted/30 border border-border/40">
                <span className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[13px] transition-all",
                  colorPresetClasses(roleDialog.color)
                )}>
                  <span className="font-bold tracking-wide">{roleDialog.abbr || "—"}</span>
                  <span className="opacity-60">{roleDialog.name || "Role name"}</span>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Abbreviation</Label>
                  <Input
                    value={roleDialog.abbr}
                    onChange={(e) => setRoleDialog((d) => d ? { ...d, abbr: e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 5), error: null } : d)}
                    placeholder="ENG"
                    autoFocus
                    className="font-mono text-center tracking-widest uppercase font-bold"
                    maxLength={5}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Full Name</Label>
                  <Input
                    value={roleDialog.name}
                    onChange={(e) => setRoleDialog((d) => d ? { ...d, name: e.target.value, error: null } : d)}
                    placeholder="Engineer"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && roleDialog.abbr.trim() && roleDialog.name.trim() && !roleDialog.saving) {
                        setRoleDialog((d) => d ? { ...d, saving: true } : d);
                        createCustomRole.mutate({ abbr: roleDialog.abbr.trim(), name: roleDialog.name.trim(), color: roleDialog.color });
                      }
                    }}
                  />
                </div>
              </div>

              {/* Color swatches */}
              <div className="space-y-1.5">
                <Label className="text-xs">Colour</Label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.key}
                      type="button"
                      title={preset.key}
                      onClick={() => setRoleDialog((d) => d ? { ...d, color: preset.key } : d)}
                      className={cn(
                        "w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center",
                        roleDialog.color === preset.key
                          ? "border-foreground scale-110 shadow-md"
                          : "border-transparent hover:border-foreground/40 hover:scale-105"
                      )}
                      style={{ backgroundColor: preset.swatch }}
                    >
                      {roleDialog.color === preset.key && (
                        <Check className="w-3 h-3 text-white drop-shadow" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {roleDialog.error && <p className="text-[12px] text-destructive">{roleDialog.error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setRoleDialog(null)}>Cancel</Button>
              <Button
                size="sm"
                disabled={!roleDialog.abbr.trim() || !roleDialog.name.trim() || roleDialog.saving}
                onClick={() => {
                  setRoleDialog((d) => d ? { ...d, saving: true } : d);
                  createCustomRole.mutate({ abbr: roleDialog.abbr.trim(), name: roleDialog.name.trim(), color: roleDialog.color });
                }}
              >
                {roleDialog.saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                Add role
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {workerDialog && (
        <WorkerDialog
          editing={workerDialog.editing}
          knownRoles={allKnownRoles}
          onClose={() => setWorkerDialog(null)}
          onSave={(data) => workerDialog.editing
            ? updateWorker.mutate({ id: workerDialog.editing.id, data })
            : createWorker.mutate({ data })}
          saving={createWorker.isPending || updateWorker.isPending}
        />
      )}
      {teamDialog && (
        <TeamDialog editing={teamDialog.editing} onClose={() => setTeamDialog(null)}
          onSave={(name) => teamDialog.editing ? updateTeam.mutate({ id: teamDialog.editing.id, name }) : createTeam.mutate(name)}
          saving={createTeam.isPending || updateTeam.isPending} />
      )}
      {locationDialog && (
        <LocationDialog editing={locationDialog.editing} onClose={() => setLocationDialog(null)}
          onSave={(name) => locationDialog.editing ? updateLocation.mutate({ id: locationDialog.editing.id, data: { name } }) : createLocation.mutate({ data: { name } })}
          saving={createLocation.isPending || updateLocation.isPending} />
      )}
      {typeDialog && (
        <TypeDialog editing={typeDialog.editing} onClose={() => setTypeDialog(null)}
          onSave={(name) => typeDialog.editing ? updateType.mutate({ id: typeDialog.editing.id, data: { name } }) : createType.mutate({ data: { name } })}
          saving={createType.isPending || updateType.isPending} />
      )}
      {groupDialog && (
        <GroupDialog editing={groupDialog.editing} defaultTypeId={groupDialog.defaultTypeId} types={types} onClose={() => setGroupDialog(null)}
          onSave={(data) => groupDialog.editing ? updateGroup.mutate({ id: groupDialog.editing.id, data }) : createGroup.mutate({ data })}
          saving={createGroup.isPending || updateGroup.isPending} />
      )}
      {activityDialog && (
        <ActivityDialog editing={activityDialog.editing} defaultGroupId={activityDialog.defaultGroupId} groups={groups} onClose={() => setActivityDialog(null)}
          onSave={(data) => activityDialog.editing ? updateActivity.mutate({ id: activityDialog.editing.id, data }) : createActivity.mutate({ data })}
          saving={createActivity.isPending || updateActivity.isPending} />
      )}
      {jdrDialog && (
        <JdrCodeDialog editing={jdrDialog.editing} defaultActivityId={jdrDialog.defaultActivityId} activities={activities} groups={groups} allJdrCodes={jdrCodes} onClose={() => setJdrDialog(null)}
          onSave={(data) => jdrDialog.editing ? updateJdrCode.mutate({ id: jdrDialog.editing.id, data }) : createJdrCode.mutate({ data })}
          saving={createJdrCode.isPending || updateJdrCode.isPending} />
      )}
    </div>
  );
}

// ─── Config Panel (Teams / Locations) ────────────────────────────────────────

function ConfigPanel({ icon, label, count, onAdd, children }: {
  icon: React.ReactNode;
  label: string;
  count: number;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-muted/20">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          <span className="text-[11px] font-semibold uppercase tracking-widest">{label}</span>
          <span className="text-[11px] text-muted-foreground/50 font-normal">({count})</span>
        </div>
        <Button size="sm" variant="ghost"
          className="h-5 px-2 gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60"
          onClick={onAdd}>
          <Plus className="w-3 h-3" />Add
        </Button>
      </div>
      <div className="px-3 py-2.5 flex flex-wrap gap-1.5 min-h-[42px] items-start">
        {children}
      </div>
    </div>
  );
}

// ─── Chip (Team / Location item) ─────────────────────────────────────────────

function Chip({ label, onEdit, onDelete, deletePending, deleteDescription }: {
  label: string;
  onEdit: () => void;
  onDelete: () => void;
  deletePending: boolean;
  deleteDescription: string;
}) {
  return (
    <div className="group inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border/60 bg-background text-xs font-medium text-foreground/80 hover:border-border hover:bg-muted/30 transition-all">
      <span className="leading-none">{label}</span>
      <div className="hidden group-hover:flex items-center gap-0 ml-0.5">
        <button onClick={onEdit} className="w-4 h-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <Pencil className="w-2.5 h-2.5" />
        </button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="w-4 h-4 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
              <Trash2 className="w-2.5 h-2.5" />
            </button>
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

// ─── Drill column ─────────────────────────────────────────────────────────────

function DrillColumn({ step, icon, label, count, onAdd, children }: {
  step: string;
  icon: React.ReactNode;
  label: string;
  count: number;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col min-h-0 bg-card">
      <div className="flex min-w-0 items-center justify-between px-3 py-2 border-b border-border/50 bg-muted/20 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-muted-foreground/40 tracking-widest font-mono leading-none">{step}</span>
          <div className="w-px h-3 bg-border/60" />
          <div className="flex items-center gap-1.5 text-muted-foreground">
            {icon}
            <span className="truncate text-[11px] font-semibold uppercase tracking-widest">{label}</span>
          </div>
          <span className="text-[11px] text-muted-foreground/40 font-mono">({count})</span>
        </div>
        <Button size="sm" variant="ghost"
          className="h-5 px-2 gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60"
          onClick={onAdd}>
          <Plus className="w-3 h-3" />Add
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

// ─── Drill card (Category / Group / Activity) ─────────────────────────────────

function DrillCard({ title, meta, secondary, badge, selected, onClick, onEdit, onDelete, deletePending, deleteDescription }: {
  title: string;
  meta?: string;
  secondary?: string;
  badge?: string;
  selected?: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deletePending: boolean;
  deleteDescription: string;
}) {
  const isOrsted = badge?.toUpperCase() === "ORSTED";

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex flex-col gap-0.5 px-3 py-2 cursor-pointer border-b border-border/30 transition-all select-none min-h-[52px]",
        selected
          ? "bg-primary/8 border-l-2 border-l-primary pl-3"
          : "hover:bg-muted/30 border-l-2 border-l-transparent"
      )}
    >
      {badge && (
        <span className={cn(
          "absolute top-2.5 right-7 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider leading-none",
          isOrsted ? "bg-amber-500/15 text-amber-500" : "bg-primary/15 text-primary"
        )}>
          {badge}
        </span>
      )}
      <div className={cn("text-[13px] font-medium leading-snug text-foreground/90", badge ? "pr-12" : "pr-6")}>
        {title}
      </div>
      {(meta || secondary) && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
          {meta && <span>{meta}</span>}
          {meta && secondary && <span className="text-muted-foreground/30">·</span>}
          {secondary && <span>{secondary}</span>}
        </div>
      )}
      <div className="absolute top-2 right-1 hidden group-hover:flex items-center" onClick={(e) => e.stopPropagation()}>
        <Button size="icon" variant="ghost" className="h-5 w-5 text-muted-foreground hover:text-foreground" onClick={onEdit}>
          <Pencil className="w-3 h-3" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="icon" variant="ghost" className="h-5 w-5 text-muted-foreground hover:text-destructive">
              <Trash2 className="w-3 h-3" />
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

// ─── JDR Code row ─────────────────────────────────────────────────────────────

function JdrCodeRow({ jdrWorkActivity, contractualCode, onEdit, onDelete, deletePending, deleteDescription }: {
  jdrWorkActivity: string;
  contractualCode: string;
  onEdit: () => void;
  onDelete: () => void;
  deletePending: boolean;
  deleteDescription: string;
}) {
  const code = contractualCode.toUpperCase();
  const isOrsted = code.includes("ORSTED") || code === "NWT" || code.includes("NWT");
  const isWdt = code === "WDT";

  return (
    <div className="group relative flex min-h-[52px] flex-col gap-0.5 px-3 py-2 border-b border-border/30 hover:bg-muted/30 transition-colors border-l-2 border-l-transparent">
      {contractualCode && (
        <span className={cn(
          "absolute top-2.5 right-7 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider leading-none",
          isWdt ? "bg-orange-500/15 text-orange-500" :
          isOrsted ? "bg-amber-500/15 text-amber-500" :
          "bg-primary/15 text-primary"
        )}>
          {contractualCode}
        </span>
      )}
      <div className={cn("text-[13px] font-medium leading-snug text-foreground/90", contractualCode ? "pr-12" : "pr-6")}>
        {jdrWorkActivity}
      </div>
      <div className="absolute top-2 right-1 hidden group-hover:flex items-center" onClick={(e) => e.stopPropagation()}>
        <Button size="icon" variant="ghost" className="h-5 w-5 text-muted-foreground hover:text-foreground" onClick={onEdit}>
          <Pencil className="w-3 h-3" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="icon" variant="ghost" className="h-5 w-5 text-muted-foreground hover:text-destructive">
              <Trash2 className="w-3 h-3" />
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

function JdrGenericCommentRow({ comment, onEdit }: { comment: string; onEdit: () => void }) {
  return (
    <div className="group relative flex min-h-[52px] items-start border-b border-border/30 px-3 py-2 hover:bg-muted/30 transition-colors border-l-2 border-l-transparent">
      <div className={cn(
        "line-clamp-2 pr-6 text-[11px] leading-snug",
        comment ? "text-muted-foreground/80 italic" : "text-muted-foreground/35"
      )} title={comment || "No comment set"}>
        {comment || "No comment set"}
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="absolute right-1 top-2 h-5 w-5 text-muted-foreground hover:text-foreground hidden group-hover:flex"
        onClick={onEdit}
        title="Edit code comment"
        aria-label="Edit code comment"
      >
        <Pencil className="w-3 h-3" />
      </Button>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-6 text-muted-foreground/40">
      <div className="w-6 h-6 rounded border-2 border-dashed border-muted-foreground/20 flex items-center justify-center">
        <Plus className="w-3 h-3" />
      </div>
      <span className="text-[11px]">Nothing here yet</span>
    </div>
  );
}

// ─── Dialogs ──────────────────────────────────────────────────────────────────

function TypeDialog({ editing, onClose, onSave, saving }: { editing: DprActivityType | null; onClose: () => void; onSave: (name: string) => void; saving: boolean }) {
  const [name, setName] = useState(editing?.name ?? "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{editing ? "Edit Category" : "New Category"}</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          <Label className="text-xs">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Effective Working Time" autoFocus
            onKeyDown={(e) => e.key === "Enter" && name.trim() && onSave(name.trim())} />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onSave(name.trim())} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GroupDialog({ editing, defaultTypeId, types, onClose, onSave, saving }: { editing: DprActivityGroup | null; defaultTypeId: number | null; types: DprActivityType[]; onClose: () => void; onSave: (data: { name: string; activityTypeId: number | null }) => void; saving: boolean }) {
  const [name, setName] = useState(editing?.name ?? "");
  const [activityTypeId, setActivityTypeId] = useState<number | null>(editing?.activityTypeId ?? defaultTypeId);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{editing ? "Edit Activity Group" : "New Activity Group"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mobilisation" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Category</Label>
            <Select value={activityTypeId?.toString() || ""} onValueChange={(v) => setActivityTypeId(parseInt(v))}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>{types.map((t) => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onSave({ name: name.trim(), activityTypeId })} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActivityDialog({ editing, defaultGroupId, groups, onClose, onSave, saving }: { editing: DprActivity | null; defaultGroupId: number | null; groups: DprActivityGroup[]; onClose: () => void; onSave: (data: { name: string; activityGroupId: number }) => void; saving: boolean }) {
  const [name, setName] = useState(editing?.name ?? "");
  const [activityGroupId, setActivityGroupId] = useState<number | null>(editing?.activityGroupId ?? defaultGroupId);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{editing ? "Edit Activity" : "New Activity"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HV Termination" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Activity Group</Label>
            <Select value={activityGroupId?.toString() || ""} onValueChange={(v) => setActivityGroupId(parseInt(v))}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select activity group" /></SelectTrigger>
              <SelectContent>{groups.map((g) => <SelectItem key={g.id} value={g.id.toString()}>{g.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => activityGroupId != null && onSave({ name: name.trim(), activityGroupId })} disabled={!name.trim() || !activityGroupId || saving}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Combobox that lets users pick an existing value OR type a brand-new one. */
function FreeCombobox({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  const showCreate = query.trim() && !options.some((o) => o.toLowerCase() === query.toLowerCase());

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="h-9 w-full justify-between font-normal text-sm"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || placeholder || "Select or type…"}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search or type new…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {showCreate ? null : "No results."}
            </CommandEmpty>
            <CommandGroup>
              {showCreate && (
                <CommandItem
                  key="__create__"
                  value={query}
                  onSelect={() => { onChange(query); setOpen(false); setQuery(""); }}
                  className="text-primary font-medium"
                >
                  <Plus className="mr-2 h-3.5 w-3.5" />Use "{query}"
                </CommandItem>
              )}
              {filtered.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={() => { onChange(opt); setOpen(false); setQuery(""); }}
                >
                  <Check className={cn("mr-2 h-3.5 w-3.5", value === opt ? "opacity-100" : "opacity-0")} />
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function JdrCodeDialog({ editing, defaultActivityId, activities, groups, allJdrCodes, onClose, onSave, saving }: {
  editing: DprJdrCode | null;
  defaultActivityId: number | null;
  activities: DprActivity[];
  groups: DprActivityGroup[];
  allJdrCodes: DprJdrCode[];
  onClose: () => void;
  onSave: (data: { lautecActivity: string; lautecActivityGroup: string; jdrWorkActivity: string; contractualCode: string; genericComment: string; activityId: number | null }) => void;
  saving: boolean;
}) {
  const templateForActivity = (activityId: number | null) =>
    activityId == null ? undefined : allJdrCodes.find((code) => code.activityId === activityId);
  const formForActivity = (activityId: number | null) => {
    const activity = activityId == null ? undefined : activities.find((item) => item.id === activityId);
    const group = activity ? groups.find((item) => item.id === activity.activityGroupId) : undefined;
    const template = templateForActivity(activityId);
    return {
      lautecActivity: template?.lautecActivity ?? activity?.name ?? "",
      lautecActivityGroup: template?.lautecActivityGroup ?? group?.name ?? "",
      jdrWorkActivity: template?.jdrWorkActivity ?? "",
      contractualCode: template?.contractualCode ?? "",
      genericComment: template?.genericComment ?? "",
      activityId,
    };
  };
  const [form, setForm] = useState(() => ({
    ...(editing
      ? {
          lautecActivity: editing.lautecActivity,
          lautecActivityGroup: editing.lautecActivityGroup,
          jdrWorkActivity: editing.jdrWorkActivity,
          contractualCode: editing.contractualCode,
          genericComment: editing.genericComment,
          activityId: editing.activityId ?? defaultActivityId,
        }
      : formForActivity(defaultActivityId)),
  }));
  const isValid = form.lautecActivity.trim() && form.lautecActivityGroup.trim() && form.jdrWorkActivity.trim() && form.contractualCode.trim();

  // Derive unique Lautec options from existing JDR codes
  const groupOptions = useMemo(
    () => [...new Set(allJdrCodes.map((c) => c.lautecActivityGroup).filter(Boolean))].sort(),
    [allJdrCodes]
  );
  const activityOptions = useMemo(() => {
    const codes = form.lautecActivityGroup.trim()
      ? allJdrCodes.filter((c) => c.lautecActivityGroup === form.lautecActivityGroup)
      : allJdrCodes;
    return [...new Set(codes.map((c) => c.lautecActivity).filter(Boolean))].sort();
  }, [allJdrCodes, form.lautecActivityGroup]);

  const field = (key: string, label: string, placeholder?: string, hint?: string) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {hint && <p className="text-[11px] text-muted-foreground -mt-1">{hint}</p>}
      <Input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder} />
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="text-base">{editing ? "Edit JDR Code" : "New JDR Code"}</DialogTitle></DialogHeader>
        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">

          {/* Lautec fields */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Lautec Reference</p>
            <div className="space-y-1.5">
              <Label className="text-xs">Lautec Activity Group</Label>
              <FreeCombobox
                value={form.lautecActivityGroup}
                onChange={(v) => setForm({ ...form, lautecActivityGroup: v, lautecActivity: "" })}
                options={groupOptions}
                placeholder="e.g. Effective Working Time"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Lautec Activity</Label>
              <FreeCombobox
                value={form.lautecActivity}
                onChange={(v) => setForm({ ...form, lautecActivity: v })}
                options={activityOptions}
                placeholder="e.g. Electrical - Termination"
              />
            </div>
          </div>

          <div className="border-t border-border/50" />

          {/* JDR fields */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">JDR Code</p>
            <div className="grid grid-cols-2 gap-3">
              {field("contractualCode", "Contractual Code", "EWT / NWT / WDT")}
              {field("jdrWorkActivity", "JDR Work Activity", "e.g. HV Termination")}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Generic Comment <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input value={form.genericComment} onChange={(e) => setForm({ ...form, genericComment: e.target.value })} placeholder="Standard comment text shown to workers" />
            </div>
          </div>

          <div className="border-t border-border/50" />

          {/* Linked activity */}
          <div className="space-y-1.5">
            <Label className="text-xs">Linked Activity <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Select
              value={form.activityId?.toString() || ""}
              onValueChange={(v) => {
                const activityId = parseInt(v);
                if (editing) {
                  setForm((current) => ({ ...current, activityId }));
                  return;
                }
                setForm(formForActivity(activityId));
              }}
            >
              <SelectTrigger className="h-9"><SelectValue placeholder="Select activity to link" /></SelectTrigger>
              <SelectContent>{activities.map((a) => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onSave({ lautecActivity: form.lautecActivity.trim(), lautecActivityGroup: form.lautecActivityGroup.trim(), jdrWorkActivity: form.jdrWorkActivity.trim(), contractualCode: form.contractualCode.trim(), genericComment: form.genericComment.trim(), activityId: form.activityId })} disabled={!isValid || saving}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamDialog({ editing, onClose, onSave, saving }: { editing: { id: number; name: string } | null; onClose: () => void; onSave: (name: string) => void; saving: boolean }) {
  const [name, setName] = useState(editing?.name ?? "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle>{editing ? "Rename Team" : "New Team"}</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          <Label className="text-xs">Team name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Team Alpha" autoFocus
            onKeyDown={(e) => e.key === "Enter" && name.trim() && onSave(name.trim())} />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onSave(name.trim())} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Worker Dialog ────────────────────────────────────────────────────────────

function WorkerDialog({ editing, knownRoles, onClose, onSave, saving }: {
  editing: DprWorker | null;
  knownRoles: string[];
  onClose: () => void;
  onSave: (data: DprWorkerInput) => void;
  saving: boolean;
}) {
  const [firstName, setFirstName] = useState(editing?.firstName ?? "");
  const [lastName, setLastName] = useState(editing?.lastName ?? "");
  const [roles, setRoles] = useState<string[]>(editing?.roles ?? []);
  const [company, setCompany] = useState(editing?.company ?? "");
  const [roleInput, setRoleInput] = useState("");
  const [roleDropOpen, setRoleDropOpen] = useState(false);

  const suggestions = knownRoles.filter(
    (r) => !roles.includes(r) && r.toLowerCase().includes(roleInput.toLowerCase())
  );

  const addRole = (role: string) => {
    const t = role.trim();
    if (t && !roles.includes(t)) setRoles((prev) => [...prev, t]);
    setRoleInput("");
    setRoleDropOpen(false);
  };
  const removeRole = (role: string) => setRoles((prev) => prev.filter((r) => r !== role));

  const valid = firstName.trim().length > 0 || lastName.trim().length > 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{editing ? "Edit Worker" : "Add Worker"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">First Name</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First" autoFocus />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Last Name</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Roles</Label>
            {roles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {roles.map((r) => {
                  const a = roleAbbr(r);
                  return (
                    <span key={r} className={cn("inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded border text-[11px] font-medium", roleColor(a))}>
                      <span className="font-bold text-[10px]">{a}</span>
                      <span className="opacity-70">{roleLabel(a)}</span>
                      <button type="button" onClick={() => removeRole(r)} className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="relative">
              <Input
                value={roleInput}
                onChange={(e) => { setRoleInput(e.target.value); setRoleDropOpen(true); }}
                onFocus={() => setRoleDropOpen(true)}
                onBlur={() => setTimeout(() => setRoleDropOpen(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && roleInput.trim()) { e.preventDefault(); addRole(roleInput); }
                  if (e.key === "Escape") { setRoleDropOpen(false); setRoleInput(""); }
                }}
                placeholder="Type a role, press Enter to add…"
                className="h-8 text-[12px]"
              />
              {roleDropOpen && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border border-border rounded-md shadow-lg py-1 max-h-36 overflow-y-auto">
                  {suggestions.map((r) => {
                    const a = roleAbbr(r);
                    return (
                      <button key={r} type="button" onMouseDown={() => addRole(r)}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted text-[12px]">
                        <span className={cn("text-[9px] font-bold px-1 py-0.5 rounded border w-7 text-center", roleColor(a))}>{a}</span>
                        {r}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Company</Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. JDR, Allstead" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!valid || saving}
            onClick={() => onSave({
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              roles,
              company: company.trim() || null,
              active: editing?.active ?? true,
            })}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
            {editing ? "Save" : "Add worker"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LocationDialog({ editing, onClose, onSave, saving }: { editing: DprLocation | null; onClose: () => void; onSave: (name: string) => void; saving: boolean }) {
  const [name, setName] = useState(editing?.name ?? "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle>{editing ? "Edit Location" : "New Location"}</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          <Label className="text-xs">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. BLP 39, OSS East, Port of Hull" autoFocus />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onSave(name.trim())} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
