import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Award, Plus, Pencil, Trash2, Users, Zap } from "lucide-react";

interface Cert {
  id: number;
  name: string;
  description: string | null;
  validityMonths: number | null;
  category: string | null;
  autoCalculateExpiry: boolean;
  holderCount: number;
}

const emptyForm = { name: "", description: "", validityMonths: "", category: "", autoCalculateExpiry: false };

export default function CertificationsPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Cert | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: certs, isLoading } = useQuery<Cert[]>({
    queryKey: ["workforce-certifications"],
    queryFn: () => apiFetch<Cert[]>("/api/workforce/certifications"),
  });

  function openNew() { setEditing(null); setForm(emptyForm); setShowDialog(true); }
  function openEdit(c: Cert) {
    setEditing(c);
    setForm({
      name: c.name,
      description: c.description ?? "",
      validityMonths: c.validityMonths != null ? String(c.validityMonths) : "",
      category: c.category ?? "",
      autoCalculateExpiry: c.autoCalculateExpiry,
    });
    setShowDialog(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        description: form.description || null,
        validityMonths: form.validityMonths ? parseInt(form.validityMonths) : null,
        category: form.category || null,
        autoCalculateExpiry: form.autoCalculateExpiry && !!form.validityMonths,
      };
      return editing
        ? apiPatch(`/api/workforce/certifications/${editing.id}`, body)
        : apiPost("/api/workforce/certifications", body);
    },
    onSuccess: () => {
      toast({ title: editing ? "Updated" : "Certification added" });
      void qc.invalidateQueries({ queryKey: ["workforce-certifications"] });
      setShowDialog(false);
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/workforce/certifications/${id}`),
    onSuccess: () => {
      toast({ title: "Deleted" });
      void qc.invalidateQueries({ queryKey: ["workforce-certifications"] });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const categories = [...new Set((certs ?? []).map(c => c.category).filter(Boolean))] as string[];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Award className="h-6 w-6 text-primary" />
            Certifications
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Required and available certification types.</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={openNew} data-testid="button-add-cert">
            <Plus className="h-4 w-4 mr-1" /> Add Certification
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : !certs?.length ? (
        <div className="border rounded-xl p-10 text-center text-muted-foreground">
          <Award className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No certifications defined yet.</p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground">Certification</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground hidden sm:table-cell">Category</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground hidden md:table-cell">Validity</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground">Holders</th>
                {isAdmin && <th className="w-16" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {certs.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.name}</p>
                    {c.description && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{c.description}</p>}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {c.category ? <Badge variant="outline" className="text-xs">{c.category}</Badge> : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                    <span className="flex items-center gap-1">
                      {c.validityMonths ? `${c.validityMonths} months` : "No expiry"}
                      {c.autoCalculateExpiry && c.validityMonths && (
                        <Zap className="h-3 w-3 text-amber-500" title="Auto-calculates expiry date" />
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-sm">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      {c.holderCount}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)} data-testid={`button-edit-cert-${c.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteMutation.mutate(c.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-cert-${c.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Certification" : "New Certification"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. GWO Basic Safety Training" data-testid="input-cert-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="e.g. Safety"
                  list="cert-categories"
                />
                <datalist id="cert-categories">
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <Label>Validity (months)</Label>
                <Input type="number" min={1} value={form.validityMonths} onChange={(e) => setForm({ ...form, validityMonths: e.target.value })} placeholder="e.g. 24" />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" />
            </div>
            {form.validityMonths && (
              <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={form.autoCalculateExpiry}
                  onChange={(e) => setForm({ ...form, autoCalculateExpiry: e.target.checked })}
                />
                <span>
                  Auto-calculate expiry date from achievement date
                  <span className="text-muted-foreground ml-1 text-xs">(fills in expiry = achieved + {form.validityMonths} months)</span>
                </span>
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!form.name || saveMutation.isPending}
              data-testid="button-save-cert-dialog"
            >
              {saveMutation.isPending ? "Saving…" : editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
