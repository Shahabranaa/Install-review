import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Package, Plus, Pencil, Trash2 } from "lucide-react";

interface PPEType {
  id: number;
  name: string;
  description: string | null;
}

const emptyForm = { name: "", description: "" };

export default function PPETypesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<PPEType | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: types, isLoading } = useQuery<PPEType[]>({
    queryKey: ["workforce-ppe-types"],
    queryFn: () => apiFetch<PPEType[]>("/api/workforce/ppe-types"),
  });

  function openNew() { setEditing(null); setForm(emptyForm); setShowDialog(true); }
  function openEdit(t: PPEType) {
    setEditing(t);
    setForm({ name: t.name, description: t.description ?? "" });
    setShowDialog(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = { name: form.name, description: form.description || null };
      return editing
        ? apiPatch(`/api/workforce/ppe-types/${editing.id}`, body)
        : apiPost("/api/workforce/ppe-types", body);
    },
    onSuccess: () => {
      toast({ title: editing ? "Updated" : "PPE type created" });
      void qc.invalidateQueries({ queryKey: ["workforce-ppe-types"] });
      setShowDialog(false);
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/workforce/ppe-types/${id}`),
    onSuccess: () => {
      toast({ title: "Deleted" });
      void qc.invalidateQueries({ queryKey: ["workforce-ppe-types"] });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />
            PPE Types
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define the types of Personal Protective Equipment that can be issued to workers.
          </p>
        </div>
        <Button size="sm" onClick={openNew} data-testid="button-add-ppe-type">
          <Plus className="h-4 w-4 mr-1" /> Add PPE Type
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : !types?.length ? (
        <div className="border rounded-xl p-10 text-center text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No PPE types defined yet.</p>
          <p className="text-sm mt-1">Add types like Hard Hat, Hi-Vis Vest, Safety Boots, and Harness.</p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          {types.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 hover:bg-muted/20 transition-colors">
              <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm" data-testid={`ppe-type-name-${t.id}`}>{t.name}</p>
                {t.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  size="icon" variant="ghost" className="h-7 w-7"
                  onClick={() => openEdit(t)}
                  data-testid={`button-edit-ppe-type-${t.id}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteMutation.mutate(t.id)}
                  disabled={deleteMutation.isPending}
                  data-testid={`button-delete-ppe-type-${t.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit PPE Type" : "New PPE Type"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Hard Hat, Hi-Vis Vest, Safety Boots"
                data-testid="input-ppe-type-name"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description or specification notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!form.name || saveMutation.isPending}
              data-testid="button-save-ppe-type"
            >
              {saveMutation.isPending ? "Saving…" : editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
