import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Briefcase, Plus, Pencil, Trash2, Award, Users } from "lucide-react";

interface RoleCert {
  certificationId: number;
  certificationName: string;
  required: boolean;
}

interface Role {
  id: number;
  name: string;
  description: string | null;
  workerCount: number;
  certifications: RoleCert[];
}

const emptyForm = { name: "", description: "" };

export default function RolesPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data: roles, isLoading } = useQuery<Role[]>({
    queryKey: ["workforce-roles"],
    queryFn: () => apiFetch<Role[]>("/api/workforce/roles"),
  });

  function openNew() { setEditing(null); setForm(emptyForm); setShowDialog(true); }
  function openEdit(r: Role) {
    setEditing(r);
    setForm({ name: r.name, description: r.description ?? "" });
    setShowDialog(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = { name: form.name, description: form.description || null };
      return editing
        ? apiPatch(`/api/workforce/roles/${editing.id}`, body)
        : apiPost("/api/workforce/roles", body);
    },
    onSuccess: () => {
      toast({ title: editing ? "Updated" : "Role created" });
      void qc.invalidateQueries({ queryKey: ["workforce-roles"] });
      setShowDialog(false);
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/workforce/roles/${id}`),
    onSuccess: () => {
      toast({ title: "Deleted" });
      void qc.invalidateQueries({ queryKey: ["workforce-roles"] });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" />
            Roles
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Define roles and their required certifications.</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={openNew} data-testid="button-add-role">
            <Plus className="h-4 w-4 mr-1" /> Add Role
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : !roles?.length ? (
        <div className="border rounded-xl p-10 text-center text-muted-foreground">
          <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No roles defined yet.</p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          {roles.map((r, idx) => (
            <div key={r.id} className={idx < roles.length - 1 ? "border-b" : ""}>
              <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                <Briefcase className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{r.name}</p>
                  {r.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.description}</p>}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {r.workerCount}
                  </span>
                  <button
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                    data-testid={`button-expand-role-${r.id}`}
                  >
                    <Award className="h-3.5 w-3.5" />
                    {r.certifications.length} certs
                  </button>
                  {isAdmin && (
                    <>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)} data-testid={`button-edit-role-${r.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMutation.mutate(r.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-role-${r.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {expanded === r.id && (
                <div className="bg-muted/10 px-8 py-3 border-t">
                  {r.certifications.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No certifications required for this role.</p>
                  ) : (
                    <ul className="space-y-1">
                      {r.certifications.map((c) => (
                        <li key={c.certificationId} className="flex items-center gap-2 text-xs">
                          <Award className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{c.certificationName}</span>
                          {c.required && (
                            <span className="text-[10px] text-emerald-600 font-medium">Required</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Role" : "New Role"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Wind Turbine Technician"
                data-testid="input-role-name"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!form.name || saveMutation.isPending}
              data-testid="button-save-role"
            >
              {saveMutation.isPending ? "Saving…" : editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
