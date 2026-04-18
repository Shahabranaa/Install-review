import { useState } from "react";
import { useListPhases, useListLocations } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CheckSquare, AlertTriangle, Clock, Activity, Plus, Trash2, Download, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiPost(path: string) {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiDelete(path: string) {
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiCreatePhase(body: { locationId: number; phaseType: string; requiredImageCount: number }) {
  const res = await fetch(`${API_BASE}/api/phases`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function getStatusBadge(status: string) {
  switch (status) {
    case "complete": return <Badge className="bg-green-600 hover:bg-green-700">Complete</Badge>;
    case "needs_review": return <Badge variant="destructive">Needs Review</Badge>;
    case "pending": return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">Pending</Badge>;
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

export default function Phases() {
  const { user } = useAuth();
  const isAdmin = user?.accessLevel === "admin";
  const qc = useQueryClient();

  const [filterLocationId, setFilterLocationId] = useState<string>("all");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newLocationId, setNewLocationId] = useState("");
  const [newPhaseType, setNewPhaseType] = useState("");
  const [newReqCount, setNewReqCount] = useState("0");
  const [busy, setBusy] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const { data: phases, isLoading } = useListPhases(
    filterLocationId !== "all" ? { locationId: parseInt(filterLocationId) } : {}
  );
  const { data: locations } = useListLocations();
  const osps = locations?.filter((l) => l.type === "OSP") ?? [];

  async function handleImport() {
    setBusy(true);
    setImportMsg(null);
    try {
      const res = await apiPost("/api/setup/import-phase-definitions");
      const d = res.definitions ?? {};
      const p = res.phases ?? {};
      setImportMsg(
        `Imported ${d.definitions ?? 0} definitions (${d.phaseTypes ?? 0} phase types, ${d.created ?? 0} new, ${d.updated ?? 0} updated). ` +
        `Phases: ${p.created ?? 0} created, ${p.skipped ?? 0} already existed.`
      );
      qc.invalidateQueries({ queryKey: ["phases"] });
    } catch (err) {
      setImportMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    if (!newLocationId || !newPhaseType) return;
    setBusy(true);
    try {
      await apiCreatePhase({
        locationId: parseInt(newLocationId),
        phaseType: newPhaseType,
        requiredImageCount: parseInt(newReqCount) || 0,
      });
      setShowNewDialog(false);
      setNewLocationId("");
      setNewPhaseType("");
      setNewReqCount("0");
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
      await apiDelete(`/api/phases/${id}`);
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
        <Label className="text-sm font-medium">Filter by OSP:</Label>
        <Select value={filterLocationId} onValueChange={setFilterLocationId}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All OSPs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All OSPs</SelectItem>
            {osps.map((osp) => (
              <SelectItem key={osp.id} value={String(osp.id)}>{osp.name}</SelectItem>
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
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-right hidden sm:block">
                    <div className="text-xs text-muted-foreground">Required Images</div>
                    <div className="font-medium">{phase.requiredImageCount}</div>
                  </div>
                  {getStatusBadge(phase.status)}
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(phase.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
              <Input
                className="mt-1"
                value={newPhaseType}
                onChange={(e) => setNewPhaseType(e.target.value)}
                placeholder="e.g. Phase 2 - Pull In"
              />
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
            <Button onClick={handleCreate} disabled={busy || !newLocationId || !newPhaseType}>
              {busy ? "Creating…" : "Create Phase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
