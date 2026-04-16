import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight, ChevronDown, Plus, Pencil, Trash2, Loader2,
  DatabaseZap, Building2, Layers, Radio, Navigation, Cable,
  AlertTriangle, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options,
  });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.status === 204 ? null : res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project { id: number; name: string; description: string | null }
interface Site    { id: number; projectId: number; name: string; address: string | null }
interface Osp     { id: number; siteId: number; name: string; type: string; notes: string | null }
interface Str     { id: number; locationId: number; name: string; stringNumber: number | null; status: string }
interface Tower   { id: number; stringId: number; name: string; lat: number | null; lng: number | null; progressStatus: string; locationType: string; connectedTo: string | null; countOnString: number | null }

const STRING_STATUSES = ["pending", "in-progress", "complete", "excluded"];

// ─── Query helpers ────────────────────────────────────────────────────────────

const qk = {
  projects: () => ["projects"],
  sites: (projectId?: number) => ["sites", projectId],
  osps: (siteId?: number) => ["locations", siteId],
  strings: (locationId: number) => ["strings", locationId],
  towers: (stringId: number) => ["towers", stringId],
};

// ─── Small reusable field ─────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// ─── Confirm Delete Dialog ────────────────────────────────────────────────────

function ConfirmDeleteDialog({
  open, onOpenChange, title, description, confirmLabel, onConfirm, loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> {title}
          </DialogTitle>
          <DialogDescription className="text-sm pt-1">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {confirmLabel ?? "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tower row ────────────────────────────────────────────────────────────────

function TowerRow({ tower, onSave }: { tower: Tower; onSave: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    name: tower.name,
    lat: tower.lat != null ? String(tower.lat) : "",
    lng: tower.lng != null ? String(tower.lng) : "",
    progressStatus: tower.progressStatus,
    connectedTo: tower.connectedTo ?? "",
    locationType: tower.locationType,
  });

  const updateMut = useMutation({
    mutationFn: () => apiFetch(`/api/towers/${tower.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: form.name,
        lat: form.lat ? parseFloat(form.lat) : null,
        lng: form.lng ? parseFloat(form.lng) : null,
        progressStatus: form.progressStatus,
        connectedTo: form.connectedTo || null,
        locationType: form.locationType,
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.towers(tower.stringId) });
      toast({ title: "Tower updated" });
      setEditing(false);
    },
    onError: (e: Error) => toast({ title: "Failed to update tower", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: () => apiFetch(`/api/towers/${tower.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.towers(tower.stringId) });
      toast({ title: "Tower deleted" });
      setDeleting(false);
      onSave();
    },
    onError: (e: Error) => toast({ title: "Failed to delete tower", description: e.message, variant: "destructive" }),
  });

  return (
    <>
      <div className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 group text-sm">
        <Navigation className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
        <span className="flex-1 font-mono text-xs">{tower.name}</span>
        {tower.connectedTo && (
          <Badge variant="outline" className="text-[10px] h-4 px-1 gap-1 font-mono">
            <Cable className="h-2.5 w-2.5" />{tower.connectedTo}
          </Badge>
        )}
        {tower.progressStatus && (
          <span className="text-[10px] text-muted-foreground">{tower.progressStatus}</span>
        )}
        <div className="opacity-0 group-hover:opacity-100 flex gap-1">
          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setEditing(true)}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-5 w-5 text-destructive hover:text-destructive" onClick={() => setDeleting(true)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Tower — {tower.name}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <Field label="Name">
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Latitude">
                <Input type="number" step="any" value={form.lat} onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))} placeholder="e.g. 36.941" />
              </Field>
              <Field label="Longitude">
                <Input type="number" step="any" value={form.lng} onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))} placeholder="e.g. -75.812" />
              </Field>
            </div>
            <Field label="Cable (connected to)">
              <Input value={form.connectedTo} onChange={(e) => setForm((f) => ({ ...f, connectedTo: e.target.value }))} placeholder="e.g. E02-3" />
            </Field>
            <Field label="Progress Status">
              <Input value={form.progressStatus} onChange={(e) => setForm((f) => ({ ...f, progressStatus: e.target.value }))} placeholder="e.g. Complete" />
            </Field>
            <Field label="Location Type">
              <Input value={form.locationType} onChange={(e) => setForm((f) => ({ ...f, locationType: e.target.value }))} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button onClick={() => updateMut.mutate()} disabled={updateMut.isPending || !form.name}>
              {updateMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete Tower"
        description={`Delete tower "${tower.name}"? Any photos linked to this tower will lose their tower association.`}
        onConfirm={() => deleteMut.mutate()}
        loading={deleteMut.isPending}
      />
    </>
  );
}

// ─── Add Tower Form ───────────────────────────────────────────────────────────

function AddTowerDialog({ stringId, open, onOpenChange, onSave }: {
  stringId: number; open: boolean; onOpenChange: (v: boolean) => void; onSave: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", lat: "", lng: "", progressStatus: "", connectedTo: "" });

  const mut = useMutation({
    mutationFn: () => apiFetch("/api/towers", {
      method: "POST",
      body: JSON.stringify({
        stringId,
        name: form.name,
        lat: form.lat ? parseFloat(form.lat) : null,
        lng: form.lng ? parseFloat(form.lng) : null,
        progressStatus: form.progressStatus,
        connectedTo: form.connectedTo || null,
        locationType: "Tower",
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.towers(stringId) });
      toast({ title: "Tower added" });
      setForm({ name: "", lat: "", lng: "", progressStatus: "", connectedTo: "" });
      onOpenChange(false);
      onSave();
    },
    onError: (e: Error) => toast({ title: "Failed to add tower", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Tower</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          <Field label="Name *">
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. G2E01" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Latitude">
              <Input type="number" step="any" value={form.lat} onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))} />
            </Field>
            <Field label="Longitude">
              <Input type="number" step="any" value={form.lng} onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))} />
            </Field>
          </div>
          <Field label="Cable (connected to)">
            <Input value={form.connectedTo} onChange={(e) => setForm((f) => ({ ...f, connectedTo: e.target.value }))} placeholder="e.g. E02-3" />
          </Field>
          <Field label="Progress Status">
            <Input value={form.progressStatus} onChange={(e) => setForm((f) => ({ ...f, progressStatus: e.target.value }))} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !form.name}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Add Tower
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── String section ───────────────────────────────────────────────────────────

function StringSection({ str, onDelete }: { str: Str; onDelete: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingTower, setAddingTower] = useState(false);
  const [form, setForm] = useState({
    name: str.name,
    stringNumber: str.stringNumber != null ? String(str.stringNumber) : "",
    status: str.status,
  });

  const { data: towers, isLoading: towersLoading } = useQuery<Tower[]>({
    queryKey: qk.towers(str.id),
    queryFn: () => apiFetch(`/api/towers?stringId=${str.id}`),
    enabled: open,
  });

  const updateMut = useMutation({
    mutationFn: () => apiFetch(`/api/strings/${str.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: form.name,
        stringNumber: form.stringNumber ? parseInt(form.stringNumber) : null,
        status: form.status,
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.strings(str.locationId) });
      toast({ title: "String updated" });
      setEditing(false);
    },
    onError: (e: Error) => toast({ title: "Failed to update string", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: () => apiFetch(`/api/strings/${str.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.strings(str.locationId) });
      toast({ title: "String deleted" });
      setDeleting(false);
      onDelete();
    },
    onError: (e: Error) => toast({ title: "Failed to delete string", description: e.message, variant: "destructive" }),
  });

  const statusColor: Record<string, string> = {
    pending: "bg-slate-100 text-slate-600",
    "in-progress": "bg-blue-100 text-blue-700",
    complete: "bg-green-100 text-green-700",
    excluded: "bg-orange-100 text-orange-700",
  };

  return (
    <>
      <div>
        <div className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/40 group cursor-pointer"
          onClick={() => setOpen((o) => !o)}>
          {open
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
          }
          <Layers className="h-3.5 w-3.5 text-blue-500/70 flex-shrink-0" />
          <span className="flex-1 text-sm font-medium">{str.name}</span>
          {str.stringNumber != null && (
            <span className="text-xs text-muted-foreground">#{str.stringNumber}</span>
          )}
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", statusColor[str.status] ?? "bg-slate-100 text-slate-600")}>
            {str.status}
          </span>
          {open && towersLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/40" />}
          {open && !towersLoading && towers && (
            <span className="text-[10px] text-muted-foreground">{towers.length} towers</span>
          )}
          <div className="opacity-0 group-hover:opacity-100 flex gap-1" onClick={(e) => e.stopPropagation()}>
            <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setEditing(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button size="icon" variant="ghost" className="h-5 w-5 text-destructive hover:text-destructive"
              onClick={() => setDeleting(true)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {open && (
          <div className="ml-6 border-l border-border/50 pl-2 pb-1 space-y-0.5">
            {towers && towers.length > 0
              ? towers.map((t) => (
                  <TowerRow key={t.id} tower={t} onSave={() => qc.invalidateQueries({ queryKey: qk.towers(str.id) })} />
                ))
              : !towersLoading && (
                  <p className="text-xs text-muted-foreground/40 italic px-2 py-1">No towers</p>
                )
            }
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground mt-0.5"
              onClick={() => setAddingTower(true)}>
              <Plus className="h-3 w-3 mr-1" /> Add tower
            </Button>
          </div>
        )}
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit String — {str.name}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <Field label="Name *">
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="String Number">
              <Input type="number" value={form.stringNumber} onChange={(e) => setForm((f) => ({ ...f, stringNumber: e.target.value }))} />
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STRING_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button onClick={() => updateMut.mutate()} disabled={updateMut.isPending || !form.name}>
              {updateMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete String"
        description={`Delete string "${str.name}" and all its towers? This cannot be undone.`}
        onConfirm={() => deleteMut.mutate()}
        loading={deleteMut.isPending}
      />

      <AddTowerDialog
        stringId={str.id}
        open={addingTower}
        onOpenChange={setAddingTower}
        onSave={() => qc.invalidateQueries({ queryKey: qk.towers(str.id) })}
      />
    </>
  );
}

// ─── OSP section ──────────────────────────────────────────────────────────────

function OspSection({ osp, onDelete }: { osp: Osp; onDelete: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingString, setAddingString] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", stringNumber: "", status: "pending" });
  const [form, setForm] = useState({
    name: osp.name,
    notes: osp.notes ?? "",
  });

  const { data: strings, isLoading: stringsLoading } = useQuery<Str[]>({
    queryKey: qk.strings(osp.id),
    queryFn: () => apiFetch(`/api/strings?locationId=${osp.id}`),
    enabled: open,
  });

  const updateMut = useMutation({
    mutationFn: () => apiFetch(`/api/locations/${osp.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: form.name, notes: form.notes || null }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.osps() });
      toast({ title: "OSP updated" });
      setEditing(false);
    },
    onError: (e: Error) => toast({ title: "Failed to update OSP", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: () => apiFetch(`/api/locations/${osp.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.osps() });
      toast({ title: "OSP deleted" });
      setDeleting(false);
      onDelete();
    },
    onError: (e: Error) => toast({ title: "Failed to delete OSP", description: e.message, variant: "destructive" }),
  });

  const addStringMut = useMutation({
    mutationFn: () => apiFetch("/api/strings", {
      method: "POST",
      body: JSON.stringify({
        locationId: osp.id,
        name: addForm.name,
        stringNumber: addForm.stringNumber ? parseInt(addForm.stringNumber) : null,
        status: addForm.status,
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.strings(osp.id) });
      toast({ title: "String added" });
      setAddForm({ name: "", stringNumber: "", status: "pending" });
      setAddingString(false);
    },
    onError: (e: Error) => toast({ title: "Failed to add string", description: e.message, variant: "destructive" }),
  });

  return (
    <>
      <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
        <div
          className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-muted/30"
          onClick={() => setOpen((o) => !o)}
        >
          {open
            ? <ChevronDown className="h-4 w-4 text-muted-foreground/60" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
          }
          <Radio className="h-4 w-4 text-primary/70 flex-shrink-0" />
          <span className="flex-1 font-semibold text-sm">{osp.name}</span>
          <Badge variant="secondary" className="text-[10px]">OSP</Badge>
          {open && stringsLoading && <Loader2 className="h-3 w-3 animate-spin opacity-40" />}
          {open && !stringsLoading && strings && (
            <span className="text-xs text-muted-foreground">{strings.length} strings</span>
          )}
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive"
              onClick={() => setDeleting(true)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {open && (
          <div className="border-t border-border/40 px-3 pb-2 pt-1 space-y-0.5">
            {strings && strings.length > 0
              ? strings.map((s) => (
                  <StringSection key={s.id} str={s} onDelete={() => qc.invalidateQueries({ queryKey: qk.strings(osp.id) })} />
                ))
              : !stringsLoading && (
                  <p className="text-xs text-muted-foreground/40 italic px-2 py-2">No strings</p>
                )
            }
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground mt-1"
              onClick={() => setAddingString(true)}>
              <Plus className="h-3 w-3 mr-1" /> Add string
            </Button>
          </div>
        )}
      </div>

      {/* Edit OSP */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit OSP / Substation</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <Field label="Name *">
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Coordinates (lat, lng)">
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="e.g. 36.941,-75.812" />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button onClick={() => updateMut.mutate()} disabled={updateMut.isPending || !form.name}>
              {updateMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete OSP */}
      <ConfirmDeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete OSP"
        description={`Delete "${osp.name}" and all its strings and towers? This will also remove any photo links. This cannot be undone.`}
        onConfirm={() => deleteMut.mutate()}
        loading={deleteMut.isPending}
      />

      {/* Add String */}
      <Dialog open={addingString} onOpenChange={setAddingString}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add String to {osp.name}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <Field label="String Name *">
              <Input value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. B01" autoFocus />
            </Field>
            <Field label="String Number">
              <Input type="number" value={addForm.stringNumber} onChange={(e) => setAddForm((f) => ({ ...f, stringNumber: e.target.value }))} />
            </Field>
            <Field label="Status">
              <Select value={addForm.status} onValueChange={(v) => setAddForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STRING_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddingString(false)}>Cancel</Button>
            <Button onClick={() => addStringMut.mutate()} disabled={addStringMut.isPending || !addForm.name}>
              {addStringMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Add String
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Import Result Modal ──────────────────────────────────────────────────────

interface ImportResult {
  osps: { created: number; updated: number };
  strings: { created: number; updated: number; skipped: number };
  towers: { created: number; updated: number; skipped: number };
}

function ImportResultDialog({ result, open, onOpenChange }: {
  result: ImportResult | null; open: boolean; onOpenChange: (v: boolean) => void;
}) {
  if (!result) return null;
  const row = (label: string, v: { created: number; updated: number; skipped?: number }) => (
    <div key={label} className="flex items-center gap-3 py-2 border-b last:border-0">
      <span className="flex-1 text-sm font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">{v.created} created</span>
      <span className="text-xs text-muted-foreground">{v.updated} updated</span>
      {v.skipped != null && <span className="text-xs text-muted-foreground">{v.skipped} skipped</span>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-700">
            <Check className="h-5 w-5" /> Import Complete
          </DialogTitle>
        </DialogHeader>
        <div className="py-2">
          {row("OSPs / Substations", result.osps)}
          {row("Strings", result.strings)}
          {row("Towers", result.towers)}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Setup page ──────────────────────────────────────────────────────────

export default function SetupPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addingOsp, setAddingOsp] = useState(false);
  const [ospForm, setOspForm] = useState({ name: "", notes: "" });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [showImportResult, setShowImportResult] = useState(false);

  const { data: projects } = useQuery<Project[]>({
    queryKey: qk.projects(),
    queryFn: () => apiFetch("/api/projects"),
  });
  const project = projects?.[0];

  const { data: sites } = useQuery<Site[]>({
    queryKey: qk.sites(project?.id),
    queryFn: () => apiFetch(`/api/sites?projectId=${project!.id}`),
    enabled: !!project,
  });
  const site = sites?.[0];

  const { data: osps, isLoading: ospsLoading, refetch: refetchOsps } = useQuery<Osp[]>({
    queryKey: qk.osps(),
    queryFn: () => apiFetch("/api/locations"),
    enabled: !!site,
  });

  const addOspMut = useMutation({
    mutationFn: () => apiFetch("/api/locations", {
      method: "POST",
      body: JSON.stringify({
        siteId: site!.id,
        name: ospForm.name,
        type: "OSP",
        notes: ospForm.notes || null,
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.osps() });
      toast({ title: "OSP added" });
      setOspForm({ name: "", notes: "" });
      setAddingOsp(false);
    },
    onError: (e: Error) => toast({ title: "Failed to add OSP", description: e.message, variant: "destructive" }),
  });

  const importMut = useMutation({
    mutationFn: () => apiFetch("/api/setup/import-from-sheet", { method: "POST" }),
    onSuccess: (data: ImportResult) => {
      qc.invalidateQueries();
      setImportResult(data);
      setShowImportResult(true);
    },
    onError: (e: Error) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });

  const cableSyncMut = useMutation({
    mutationFn: () => apiFetch("/api/cables/sync", { method: "POST" }),
    onSuccess: (data: { updated: number }) => {
      qc.invalidateQueries();
      toast({ title: `Cables synced — ${data.updated} towers updated` });
    },
    onError: (e: Error) => toast({ title: "Cable sync failed", description: e.message, variant: "destructive" }),
  });

  const ospsBySite = osps?.filter((o) => o.siteId === site?.id) ?? [];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Site Setup</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage the project hierarchy — OSPs, strings, towers, and cable assignments.
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => cableSyncMut.mutate()}
            disabled={cableSyncMut.isPending}
          >
            {cableSyncMut.isPending
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Cable className="h-4 w-4 mr-2" />
            }
            Sync Cables
          </Button>
          <Button
            size="sm"
            onClick={() => importMut.mutate()}
            disabled={importMut.isPending}
          >
            {importMut.isPending
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <DatabaseZap className="h-4 w-4 mr-2" />
            }
            Import from Sheet
          </Button>
        </div>
      </div>

      {/* Project + Site summary */}
      {project && site && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/40 border border-border/50">
          <Building2 className="h-5 w-5 text-primary/60 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{project.name}</p>
            {project.description && (
              <p className="text-xs text-muted-foreground truncate">{project.description}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Site</p>
            <p className="text-sm font-medium">{site.name}</p>
          </div>
          {osps && (
            <div className="text-right pl-4 border-l border-border/50">
              <p className="text-xs text-muted-foreground">Structure</p>
              <p className="text-sm font-medium">{ospsBySite.length} OSPs</p>
            </div>
          )}
        </div>
      )}

      {/* OSP Tree */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Radio className="h-4 w-4" /> Substations / OSPs
          </h2>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAddingOsp(true)}>
            <Plus className="h-3 w-3 mr-1" /> Add OSP
          </Button>
        </div>

        {ospsLoading && (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {!ospsLoading && ospsBySite.length === 0 && (
          <div className="text-center py-10 border border-dashed border-border/60 rounded-lg">
            <Radio className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No substations yet.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Add one manually or import from the Google Sheet.
            </p>
          </div>
        )}

        {ospsBySite.map((osp) => (
          <OspSection
            key={osp.id}
            osp={osp}
            onDelete={() => qc.invalidateQueries({ queryKey: qk.osps() })}
          />
        ))}
      </div>

      {/* Add OSP Dialog */}
      <Dialog open={addingOsp} onOpenChange={setAddingOsp}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Substation / OSP</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <Field label="Name *">
              <Input value={ospForm.name} onChange={(e) => setOspForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. G1" autoFocus />
            </Field>
            <Field label="Coordinates (lat, lng)">
              <Input value={ospForm.notes} onChange={(e) => setOspForm((f) => ({ ...f, notes: e.target.value }))} placeholder="e.g. 36.941,-75.812" />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddingOsp(false)}>Cancel</Button>
            <Button onClick={() => addOspMut.mutate()} disabled={addOspMut.isPending || !ospForm.name}>
              {addOspMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Add OSP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Result */}
      <ImportResultDialog
        result={importResult}
        open={showImportResult}
        onOpenChange={setShowImportResult}
      />
    </div>
  );
}
