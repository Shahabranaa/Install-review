import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Layers, Plus, Trash2, Pencil, GripVertical, ChevronDown, ChevronRight,
  Image as ImageIcon, CheckCircle2, XCircle, Building2, Save, X, RefreshCw,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

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

interface TemplateSlot {
  reqImgType: string;
  reqImgOrder: string;
  description: string;
}

interface PhaseTemplate {
  phaseType: string;
  locationType: string;
  slots: TemplateSlot[];
  locationCount: number;
  imageCount: number;
}

function locationTypeBadge(lt: string) {
  if (lt === "TP") return <Badge variant="outline" className="text-[10px] border-blue-400 text-blue-600">Tower (TP)</Badge>;
  if (lt === "OSP") return <Badge variant="outline" className="text-[10px] border-green-500 text-green-700">OSP</Badge>;
  return <Badge variant="outline" className="text-[10px]">Both</Badge>;
}

function locationTypeLabel(lt: string) {
  if (lt === "TP") return "Tower (TP)";
  if (lt === "OSP") return "OSP";
  return "Both (Tower + OSP)";
}

// ── Live Preview Panel ──────────────────────────────────────────────────────
function TemplatePreview({ phaseType, locationType, slots }: {
  phaseType: string;
  locationType: string;
  slots: TemplateSlot[];
}) {
  const [open, setOpen] = useState(true);
  const sorted = [...slots].sort((a, b) => (a.reqImgOrder || "").localeCompare(b.reqImgOrder || ""));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        <ImageIcon className="h-4 w-4" />
        Preview
      </div>

      <div className="border rounded-lg overflow-hidden shadow-sm">
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors text-left bg-muted/10"
        >
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
          <span className="font-medium text-sm flex-1">
            {phaseType || <span className="text-muted-foreground italic">Phase name…</span>}
          </span>
          <span className="text-xs text-muted-foreground mr-2">0/{slots.length}</span>
          <Badge variant="outline" className="text-[10px] min-w-[50px] justify-center">
            {slots.length === 0 ? "Empty" : "Missing"}
          </Badge>
        </button>

        {open && slots.length > 0 && (
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
                {sorted.map((slot, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="px-4 py-2 font-mono">{slot.reqImgType || <span className="text-muted-foreground/40 italic">type…</span>}</td>
                    <td className="px-4 py-2 text-muted-foreground hidden sm:table-cell">{slot.description || "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <span className="inline-flex items-center gap-1 text-muted-foreground/60">
                        <XCircle className="h-3 w-3" /> Missing
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {open && slots.length === 0 && (
          <div className="border-t p-4 text-center text-xs text-muted-foreground/50 italic">
            Add image slots to see them here
          </div>
        )}
      </div>

      {(phaseType || slots.length > 0) && (
        <div className="rounded-md bg-muted/30 border px-3 py-2 text-xs text-muted-foreground space-y-1">
          <div className="flex justify-between">
            <span>Phase name</span>
            <span className="font-medium text-foreground">{phaseType || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span>Applies to</span>
            <span className="font-medium text-foreground">{locationTypeLabel(locationType)}</span>
          </div>
          <div className="flex justify-between">
            <span>Required images</span>
            <span className="font-medium text-foreground">{slots.length}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Slot row in the editor ──────────────────────────────────────────────────
function SlotRow({
  slot,
  index,
  onChange,
  onRemove,
}: {
  slot: TemplateSlot;
  index: number;
  onChange: (updates: Partial<TemplateSlot>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-start gap-2 group">
      <div className="mt-2.5 text-muted-foreground/30 cursor-grab active:cursor-grabbing">
        <GripVertical className="h-4 w-4" />
      </div>
      <div className="w-10 flex-shrink-0">
        <Input
          value={slot.reqImgOrder}
          onChange={(e) => onChange({ reqImgOrder: e.target.value })}
          placeholder="#"
          className="text-center text-xs h-8 px-1"
        />
      </div>
      <div className="flex-1 min-w-0">
        <Input
          value={slot.reqImgType}
          onChange={(e) => onChange({ reqImgType: e.target.value })}
          placeholder="Image type (e.g. TP_Overview)"
          className="text-xs h-8 font-mono"
        />
      </div>
      <div className="flex-1 min-w-0">
        <Input
          value={slot.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Description (optional)"
          className="text-xs h-8"
        />
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 flex-shrink-0 text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onRemove}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ── Template editor (create / edit) ────────────────────────────────────────
function TemplateEditor({
  initial,
  onSave,
  onCancel,
  busy,
}: {
  initial?: PhaseTemplate;
  onSave: (data: { phaseType: string; newPhaseType?: string; locationType: string; slots: TemplateSlot[] }) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const [phaseType, setPhaseType] = useState(initial?.phaseType ?? "");
  const [locationType, setLocationType] = useState(initial?.locationType ?? "both");
  const [slots, setSlots] = useState<TemplateSlot[]>(
    initial?.slots.map((s) => ({ reqImgType: s.reqImgType, reqImgOrder: s.reqImgOrder ?? "", description: s.description ?? "" })) ?? []
  );

  function addSlot() {
    const nextOrder = String(slots.length + 1).padStart(2, "0");
    setSlots((prev) => [...prev, { reqImgType: "", reqImgOrder: nextOrder, description: "" }]);
  }

  function updateSlot(i: number, updates: Partial<TemplateSlot>) {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...updates } : s)));
  }

  function removeSlot(i: number) {
    setSlots((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    const payload: Parameters<typeof onSave>[0] = {
      phaseType: initial?.phaseType ?? phaseType,
      locationType,
      slots,
    };
    if (initial && phaseType !== initial.phaseType) {
      payload.newPhaseType = phaseType;
    }
    if (!initial) {
      payload.phaseType = phaseType;
    }
    await onSave(payload);
  }

  const canSave = phaseType.trim().length > 0 && slots.length > 0 &&
    slots.every((s) => s.reqImgType.trim().length > 0);

  return (
    <div className="flex gap-6 h-full">
      {/* Form */}
      <div className="flex-1 min-w-0 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <Label className="text-xs font-medium mb-1.5 block">Phase Name *</Label>
            <Input
              value={phaseType}
              onChange={(e) => setPhaseType(e.target.value)}
              placeholder="e.g. Monopile Installation"
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Applies To *</Label>
            <Select value={locationType} onValueChange={setLocationType}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TP">Tower (TP) only</SelectItem>
                <SelectItem value="OSP">OSP only</SelectItem>
                <SelectItem value="both">Both (Tower + OSP)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs font-medium">
              Required Image Slots
              <span className="ml-1.5 text-muted-foreground font-normal">({slots.length})</span>
            </Label>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addSlot}>
              <Plus className="h-3 w-3" />
              Add Slot
            </Button>
          </div>

          {slots.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <ImageIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No image slots yet.</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">Click "Add Slot" to define required images.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-6 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                <span className="w-10 flex-shrink-0 text-center">Order</span>
                <span className="flex-1">Image Type *</span>
                <span className="flex-1">Description</span>
                <span className="w-8" />
              </div>
              {slots.map((slot, i) => (
                <SlotRow
                  key={i}
                  slot={slot}
                  index={i}
                  onChange={(upd) => updateSlot(i, upd)}
                  onRemove={() => removeSlot(i)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pt-2 border-t">
          <Button
            onClick={handleSave}
            disabled={busy || !canSave}
            size="sm"
            className="gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            {busy ? "Saving…" : initial ? "Save Changes" : "Create Template"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>

      {/* Live preview */}
      <div className="w-72 flex-shrink-0 hidden lg:block">
        <TemplatePreview phaseType={phaseType} locationType={locationType} slots={slots} />
      </div>
    </div>
  );
}

// ── Main Templates page ─────────────────────────────────────────────────────
export default function TemplatesPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const isAdmin = user?.accessLevel === "admin";
  const qc = useQueryClient();

  const [editing, setEditing] = useState<PhaseTemplate | null | "new">(null);
  const [deleteTarget, setDeleteTarget] = useState<PhaseTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) navigate("/");
  }, [isAdmin, navigate]);

  const { data: templates, isLoading } = useQuery<PhaseTemplate[]>({
    queryKey: ["phase-templates"],
    queryFn: () => apiFetch("/api/phase-templates"),
  });

  async function handleSave(data: {
    phaseType: string;
    newPhaseType?: string;
    locationType: string;
    slots: TemplateSlot[];
  }) {
    setBusy(true);
    setError(null);
    try {
      if (editing === "new") {
        await apiFetch("/api/phase-templates", {
          method: "POST",
          body: JSON.stringify(data),
        });
      } else if (editing) {
        await apiFetch(`/api/phase-templates/${encodeURIComponent(editing.phaseType)}`, {
          method: "PUT",
          body: JSON.stringify(data),
        });
      }
      qc.invalidateQueries({ queryKey: ["phase-templates"] });
      qc.invalidateQueries({ queryKey: ["phase-defs"] });
      qc.invalidateQueries({ queryKey: ["compliance-phase-types"] });
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/phase-templates/${encodeURIComponent(deleteTarget.phaseType)}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["phase-templates"] });
      qc.invalidateQueries({ queryKey: ["phase-defs"] });
      qc.invalidateQueries({ queryKey: ["compliance-phase-types"] });
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) return null;

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Phase Templates</h1>
          <p className="text-muted-foreground mt-2">
            Define installation phase templates — the required images field workers must capture for each location.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={() => qc.invalidateQueries({ queryKey: ["phase-templates"] })}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {editing === null && (
            <Button size="sm" className="gap-1.5" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" />
              New Template
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 rounded-md border bg-destructive/10 border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Editor panel */}
      {editing !== null && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              {editing === "new" ? "Create New Template" : `Editing: ${editing.phaseType}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TemplateEditor
              initial={editing !== "new" ? editing : undefined}
              onSave={handleSave}
              onCancel={() => { setEditing(null); setError(null); }}
              busy={busy}
            />
          </CardContent>
        </Card>
      )}

      {/* Templates list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : !templates || templates.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center bg-muted/50 border-dashed">
          <Layers className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No phase templates yet</h3>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            Create a template to define what images field workers need to capture for each installation phase.
          </p>
          <Button size="sm" className="mt-4 gap-1.5" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            Create First Template
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-4 px-4 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide border-b">
            <span>Phase Name</span>
            <span className="text-center">Applies To</span>
            <span className="text-center hidden sm:block">Image Slots</span>
            <span className="text-center hidden md:block">Active Phases</span>
            <span />
          </div>
          {templates.map((t) => (
            <div
              key={t.phaseType}
              className={cn(
                "grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-4 px-4 py-3 rounded-lg border hover:border-primary/30 transition-colors",
                editing !== "new" && editing?.phaseType === t.phaseType ? "border-primary/50 bg-primary/5" : "bg-card"
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Layers className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="font-medium truncate">{t.phaseType}</span>
              </div>

              <div>{locationTypeBadge(t.locationType)}</div>

              <div className="text-center hidden sm:flex items-center justify-center gap-1">
                <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">{t.imageCount}</span>
              </div>

              <div className="text-center hidden md:flex items-center justify-center gap-1">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">{t.locationCount}</span>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setEditing(t);
                    setError(null);
                  }}
                  disabled={busy}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteTarget(t)}
                  disabled={busy}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deleteTarget?.phaseType}</strong> and all{" "}
              <strong>{deleteTarget?.imageCount}</strong> image slot{deleteTarget?.imageCount !== 1 ? "s" : ""}.
              {(deleteTarget?.locationCount ?? 0) > 0 && (
                <span className="block mt-2 text-amber-600 font-medium">
                  Warning: {deleteTarget?.locationCount} active phase{deleteTarget?.locationCount !== 1 ? "s" : ""} reference this template. They will lose their required image definitions.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Deleting…" : "Delete Template"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
