import { useState, useEffect } from "react";
import { useListPhases, useListLocations } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  CheckSquare, AlertTriangle, Clock, Activity, Plus, Trash2,
  Download, RefreshCw, Pencil, Building2, ChevronDown, ChevronRight,
  Image as ImageIcon, CheckCircle2, XCircle, Layers,
} from "lucide-react";
import { format } from "date-fns";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const STATUSES = ["pending", "needs_review", "complete", "incomplete"] as const;

function getStatusBadge(status: string) {
  switch (status) {
    case "complete": return <Badge className="bg-green-600 hover:bg-green-700">Complete</Badge>;
    case "needs_review": return <Badge variant="destructive">Needs Review</Badge>;
    case "pending": return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">Pending</Badge>;
    case "incomplete": return <Badge variant="secondary">Incomplete</Badge>;
    default: return <Badge variant="outline">{status.replace("_", " ")}</Badge>;
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "complete": return <CheckSquare className="w-4 h-4 text-green-600" />;
    case "needs_review": return <AlertTriangle className="w-4 h-4 text-destructive" />;
    case "pending": return <Clock className="w-4 h-4 text-amber-500" />;
    default: return <Activity className="w-4 h-4 text-muted-foreground" />;
  }
}

interface EditTarget {
  id: number;
  phaseType: string;
  status: string;
  requiredImageCount: number;
}

interface PhaseDefGroup {
  phaseType: string;
  locationType: string;
  items: { reqImgType: string; reqImgOrder: string | null; description: string | null }[];
}

interface ComplianceItem {
  reqImgType: string;
  phaseType: string;
  status: "submitted" | "missing";
}

function PhaseDefGroupCard({ group, complianceMap }: {
  group: PhaseDefGroup;
  complianceMap: Map<string, "submitted" | "missing">;
}) {
  const submitted = group.items.filter(
    (it) => complianceMap.get(`${group.phaseType}|||${it.reqImgType}`) === "submitted",
  ).length;
  const total = group.items.length;
  const complete = submitted === total && total > 0;

  // Default open; auto-collapse once compliance data confirms the group is complete,
  // but preserve any manual user toggle.
  const [open, setOpen] = useState(true);
  const [userToggled, setUserToggled] = useState(false);
  useEffect(() => {
    if (!userToggled && complete) setOpen(false);
  }, [complete, userToggled]);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => { setUserToggled(true); setOpen((o) => !o); }}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors text-left"
      >
        {open
          ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        }
        <span className="font-medium text-sm flex-1">{group.phaseType}</span>
        <span className="text-xs text-muted-foreground mr-2">{submitted}/{total}</span>
        <Badge
          variant={complete ? "default" : submitted > 0 ? "secondary" : "outline"}
          className={cn("text-[10px] min-w-[50px] justify-center", complete && "bg-emerald-500")}
        >
          {complete ? "Complete" : submitted > 0 ? `${submitted}/${total}` : "Missing"}
        </Badge>
      </button>

      {open && (
        <div className="border-t bg-muted/10">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-1.5 font-medium text-muted-foreground">Image Type</th>
                <th className="text-left px-4 py-1.5 font-medium text-muted-foreground hidden sm:table-cell">Description</th>
                <th className="text-right px-4 py-1.5 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...group.items].sort((a, b) => {
                const aStatus = complianceMap.get(`${group.phaseType}|||${a.reqImgType}`);
                const bStatus = complianceMap.get(`${group.phaseType}|||${b.reqImgType}`);
                if (aStatus === "missing" && bStatus !== "missing") return -1;
                if (aStatus !== "missing" && bStatus === "missing") return 1;
                return (a.reqImgOrder ?? "").localeCompare(b.reqImgOrder ?? "");
              }).map((item) => {
                const status = complianceMap.get(`${group.phaseType}|||${item.reqImgType}`);
                return (
                  <tr key={item.reqImgType} className="hover:bg-muted/20">
                    <td className="px-4 py-2 font-mono">{item.reqImgType}</td>
                    <td className="px-4 py-2 text-muted-foreground hidden sm:table-cell">
                      {item.description ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {status === "submitted" ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" /> Captured
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground/60">
                          <XCircle className="h-3 w-3" /> Missing
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RequiredImagesPanel({ locationId, locationType }: { locationId: number; locationType: string }) {
  const { data: groups, isLoading: defsLoading } = useQuery<PhaseDefGroup[]>({
    queryKey: ["phase-defs", locationId],
    queryFn: () => apiFetch(`/api/compliance/phase-defs?locationId=${locationId}`),
  });

  const { data: compliance } = useQuery<{ items: ComplianceItem[] }>({
    queryKey: ["compliance-location", locationId],
    queryFn: () => apiFetch(`/api/compliance?locationId=${locationId}&locationType=${locationType}`),
    enabled: !!groups && groups.length > 0,
  });

  const complianceMap = new Map<string, "submitted" | "missing">(
    (compliance?.items ?? []).map((it) => [`${it.phaseType}|||${it.reqImgType}`, it.status]),
  );

  if (defsLoading) {
    return (
      <div className="space-y-2 mt-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  if (!groups || groups.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        <Layers className="h-8 w-8 mx-auto mb-2 opacity-30" />
        No required image definitions found for {locationType === "OSP" ? "OSP" : "tower"} locations.
        {locationType !== "other" && (
          <p className="mt-1 text-xs">Use "Import Phase Definitions" to load them from the spreadsheet.</p>
        )}
      </div>
    );
  }

  const sortedGroups = [...groups].sort((a, b) => {
    const aSubmitted = a.items.filter((it) => complianceMap.get(`${a.phaseType}|||${it.reqImgType}`) === "submitted").length;
    const bSubmitted = b.items.filter((it) => complianceMap.get(`${b.phaseType}|||${it.reqImgType}`) === "submitted").length;
    const aComplete = aSubmitted === a.items.length;
    const bComplete = bSubmitted === b.items.length;
    if (!aComplete && bComplete) return -1;
    if (aComplete && !bComplete) return 1;
    return a.phaseType.localeCompare(b.phaseType);
  });

  const totalItems = groups.reduce((s, g) => s + g.items.length, 0);
  const totalSubmitted = groups.reduce(
    (s, g) => s + g.items.filter((it) => complianceMap.get(`${g.phaseType}|||${it.reqImgType}`) === "submitted").length,
    0,
  );

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <ImageIcon className="h-4 w-4" />
          Required Images by Phase
          <Badge variant="outline" className="text-[10px] font-normal ml-1">
            {locationType === "OSP" ? "OSP" : "Tower (TP)"}
          </Badge>
        </h3>
        <span className="text-xs text-muted-foreground">{totalSubmitted}/{totalItems} captured</span>
      </div>
      <div className="space-y-2">
        {sortedGroups.map((group) => (
          <PhaseDefGroupCard key={group.phaseType} group={group} complianceMap={complianceMap} />
        ))}
      </div>
    </div>
  );
}

export default function Phases() {
  const { user } = useAuth();
  const isAdmin = user?.accessLevel === "admin";
  const qc = useQueryClient();

  const [filterLocationId, setFilterLocationId] = useState<string>("all");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newLocationId, setNewLocationId] = useState("");
  const [newPhaseType, setNewPhaseType] = useState("");
  const [newPhaseTypeCustom, setNewPhaseTypeCustom] = useState("");
  const [newReqCount, setNewReqCount] = useState("0");
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editPhaseType, setEditPhaseType] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editReqCount, setEditReqCount] = useState("0");
  const [busy, setBusy] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const { data: phases, isLoading } = useListPhases(
    filterLocationId !== "all" ? { locationId: parseInt(filterLocationId) } : {}
  );
  const { data: locations } = useListLocations();
  const selectableLocations = (locations ?? []).filter((l) => l.type === "OSP" || l.type === "tower");
  const osps = (locations ?? []).filter((l) => l.type === "OSP");
  const selectedLocation = filterLocationId !== "all"
    ? locations?.find((l) => l.id === parseInt(filterLocationId))
    : undefined;

  const { data: definedPhaseTypes } = useQuery<string[]>({
    queryKey: ["compliance-phase-types"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/compliance/phase-types`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const resolvedPhaseType = newPhaseType === "__custom__" ? newPhaseTypeCustom : newPhaseType;

  function openEdit(phase: EditTarget) {
    setEditTarget(phase);
    setEditPhaseType(phase.phaseType);
    setEditStatus(phase.status);
    setEditReqCount(String(phase.requiredImageCount));
  }

  async function handleImport() {
    setBusy(true);
    setImportMsg(null);
    try {
      const res = await apiFetch("/api/setup/import-phase-definitions", { method: "POST" });
      const d = res.definitions ?? {};
      const p = res.phases ?? {};
      setImportMsg(
        `Imported ${d.definitions ?? 0} definitions (${d.phaseTypes ?? 0} phase types, ${d.created ?? 0} new, ${d.updated ?? 0} updated). ` +
        `Phases: ${p.created ?? 0} created, ${p.skipped ?? 0} already existed.`
      );
      qc.invalidateQueries({ queryKey: ["phases"] });
      qc.invalidateQueries({ queryKey: ["phase-defs"] });
    } catch (err) {
      setImportMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreatePhasesForLocations() {
    setBusy(true);
    setImportMsg(null);
    try {
      const res = await apiFetch("/api/setup/create-phases-for-locations", { method: "POST" });
      setImportMsg(`Phases created: ${res.created ?? 0} new, ${res.skipped ?? 0} already existed.`);
      qc.invalidateQueries({ queryKey: ["phases"] });
    } catch (err) {
      setImportMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    if (!newLocationId || !resolvedPhaseType) return;
    setBusy(true);
    try {
      await apiFetch("/api/phases", {
        method: "POST",
        body: JSON.stringify({
          locationId: parseInt(newLocationId),
          phaseType: resolvedPhaseType,
          requiredImageCount: parseInt(newReqCount) || 0,
        }),
      });
      setShowNewDialog(false);
      setNewLocationId("");
      setNewPhaseType("");
      setNewPhaseTypeCustom("");
      setNewReqCount("0");
      qc.invalidateQueries({ queryKey: ["phases"] });
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleEdit() {
    if (!editTarget) return;
    setBusy(true);
    try {
      await apiFetch(`/api/phases/${editTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          phaseType: editPhaseType,
          status: editStatus,
          requiredImageCount: parseInt(editReqCount) || 0,
        }),
      });
      setEditTarget(null);
      qc.invalidateQueries({ queryKey: ["phases"] });
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this phase?")) return;
    try {
      await apiFetch(`/api/phases/${id}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["phases"] });
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Installation Phases</h1>
          <p className="text-muted-foreground mt-2">Track progress and review status across all active phases.</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleImport} disabled={busy}>
              <Download className="w-4 h-4 mr-2" />
              {busy ? "Importing…" : "Import Phase Definitions"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleCreatePhasesForLocations} disabled={busy}>
              <Building2 className="w-4 h-4 mr-2" />
              Create Phases for All Locations
            </Button>
            <Button size="sm" onClick={() => setShowNewDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              New Phase
            </Button>
          </div>
        )}
      </div>

      {importMsg && (
        <div className={`text-sm px-4 py-2 rounded-md border ${importMsg.startsWith("Error") ? "bg-destructive/10 border-destructive/20 text-destructive" : "bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-300"}`}>
          {importMsg}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Label className="text-sm font-medium">Filter by location:</Label>
        <Select value={filterLocationId} onValueChange={setFilterLocationId}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All locations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All locations</SelectItem>
            {selectableLocations.map((loc) => (
              <SelectItem key={loc.id} value={String(loc.id)}>
                {loc.name}
                <span className="ml-1.5 text-xs text-muted-foreground">{loc.type}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["phases"] })}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : phases?.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center bg-muted/50 border-dashed">
          <CheckSquare className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No phases found</h3>
          <p className="text-muted-foreground mt-1">
            {isAdmin
              ? 'Use "Import Phase Definitions" or "New Phase" to get started.'
              : "Phases will appear here once created."}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {phases?.map((phase) => (
            <Card key={phase.id} className="border-l-4 border-l-primary/40">
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  {getStatusIcon(phase.status)}
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{phase.phaseType}</p>
                    <p className="text-xs text-muted-foreground">
                      ID #{phase.id} · Updated {format(new Date(phase.updatedAt), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right hidden sm:block">
                    <div className="text-xs text-muted-foreground">Required Images</div>
                    <div className="font-medium">{phase.requiredImageCount}</div>
                  </div>
                  {getStatusBadge(phase.status)}
                  {isAdmin && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit({
                          id: phase.id,
                          phaseType: phase.phaseType,
                          status: phase.status,
                          requiredImageCount: phase.requiredImageCount,
                        })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(phase.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedLocation && selectedLocation.type !== "other" && (
        <RequiredImagesPanel
          locationId={selectedLocation.id}
          locationType={selectedLocation.type}
        />
      )}

      {/* New Phase Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Phase</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>OSP / Location</Label>
              <Select value={newLocationId} onValueChange={setNewLocationId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select OSP…" />
                </SelectTrigger>
                <SelectContent>
                  {osps.map((osp) => (
                    <SelectItem key={osp.id} value={String(osp.id)}>{osp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Phase Type</Label>
              {definedPhaseTypes && definedPhaseTypes.length > 0 ? (
                <>
                  <Select value={newPhaseType} onValueChange={setNewPhaseType}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select phase type…" />
                    </SelectTrigger>
                    <SelectContent>
                      {definedPhaseTypes.map((pt) => (
                        <SelectItem key={pt} value={pt}>{pt}</SelectItem>
                      ))}
                      <SelectItem value="__custom__">Other (custom)…</SelectItem>
                    </SelectContent>
                  </Select>
                  {newPhaseType === "__custom__" && (
                    <Input
                      className="mt-2"
                      value={newPhaseTypeCustom}
                      onChange={(e) => setNewPhaseTypeCustom(e.target.value)}
                      placeholder="Enter custom phase type…"
                    />
                  )}
                </>
              ) : (
                <Input
                  className="mt-1"
                  value={newPhaseType}
                  onChange={(e) => setNewPhaseType(e.target.value)}
                  placeholder="e.g. Phase 2 - Pull In"
                />
              )}
            </div>
            <div>
              <Label>Required Image Count</Label>
              <Input
                className="mt-1"
                type="number"
                min={0}
                value={newReqCount}
                onChange={(e) => setNewReqCount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={busy || !newLocationId || !resolvedPhaseType}>
              {busy ? "Creating…" : "Create Phase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Phase Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Phase</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Phase Type</Label>
              <Input
                className="mt-1"
                value={editPhaseType}
                onChange={(e) => setEditPhaseType(e.target.value)}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Required Image Count</Label>
              <Input
                className="mt-1"
                type="number"
                min={0}
                value={editReqCount}
                onChange={(e) => setEditReqCount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={busy || !editPhaseType}>
              {busy ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
