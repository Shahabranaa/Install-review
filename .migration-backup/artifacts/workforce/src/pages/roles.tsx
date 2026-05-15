import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost, apiPatch, apiDelete, apiPut } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Briefcase, Plus, Pencil, Trash2, Award, Users, ChevronDown, ChevronRight, X } from "lucide-react";

interface RoleCertRequirement {
  id: number;
  roleId: number;
  certificationId: number;
  required: boolean;
  certification: { id: number; name: string; category: string | null };
}

interface Role {
  id: number;
  name: string;
  description: string | null;
  workerCount?: number;
}

interface Certification {
  id: number;
  name: string;
  category: string | null;
}

const emptyForm = { name: "", description: "" };

function RoleRow({
  role, isAdmin, allCerts,
}: {
  role: Role;
  isAdmin: boolean;
  allCerts: Certification[];
  onEdit: (r: Role) => void;
  onDelete: (id: number) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [addCertIds, setAddCertIds] = useState<Set<number>>(new Set());

  function toggleAddCertId(id: number) {
    setAddCertIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const { data: requirements, isLoading: reqLoading } = useQuery<RoleCertRequirement[]>({
    queryKey: ["role-requirements", role.id],
    queryFn: () => apiFetch<RoleCertRequirement[]>(`/api/workforce/roles/${role.id}/requirements`),
    enabled: open,
  });

  const updateReqsMutation = useMutation({
    mutationFn: (items: { certificationId: number; required: boolean }[]) =>
      apiPut(`/api/workforce/roles/${role.id}/requirements`, items),
    onSuccess: () => {
      toast({ title: "Requirements updated" });
      void qc.invalidateQueries({ queryKey: ["role-requirements", role.id] });
      setAddCertIds(new Set());
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  function addRequirement() {
    if (addCertIds.size === 0) return;
    const existing = (requirements ?? []).map(r => ({ certificationId: r.certificationId, required: r.required }));
    const toAdd = [...addCertIds].filter(id => !existing.find(e => e.certificationId === id));
    if (toAdd.length === 0) { toast({ title: "Already added" }); return; }
    updateReqsMutation.mutate([...existing, ...toAdd.map(id => ({ certificationId: id, required: true }))]);
  }

  function removeRequirement(certId: number) {
    const remaining = (requirements ?? [])
      .filter(r => r.certificationId !== certId)
      .map(r => ({ certificationId: r.certificationId, required: r.required }));
    updateReqsMutation.mutate(remaining);
  }

  function toggleRequired(certId: number, required: boolean) {
    const updated = (requirements ?? []).map(r =>
      r.certificationId === certId ? { certificationId: r.certificationId, required } : { certificationId: r.certificationId, required: r.required },
    );
    updateReqsMutation.mutate(updated);
  }

  const availableCerts = allCerts.filter(c => !(requirements ?? []).find(r => r.certificationId === c.id));

  return (
    <div className="border-b last:border-b-0">
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors cursor-pointer"
        onClick={() => setOpen((o) => !o)}
        data-testid={`row-role-${role.id}`}
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
        <Briefcase className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{role.name}</p>
          {role.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{role.description}</p>}
        </div>
        {role.workerCount !== undefined && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0" title={`${role.workerCount} workers`}>
            <Users className="h-3.5 w-3.5" /> {role.workerCount}
          </span>
        )}
      </div>

      {open && (
        <div className="bg-muted/10 px-6 py-4 border-t">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Award className="h-3.5 w-3.5" /> Required Certifications
            </h3>
          </div>

          {reqLoading ? (
            <Skeleton className="h-8 w-48" />
          ) : (requirements ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground mb-3">No certifications required for this role.</p>
          ) : (
            <ul className="space-y-1.5 mb-3">
              {(requirements ?? []).map((r) => (
                <li key={r.certificationId} className="flex items-center gap-2 text-sm">
                  <Award className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="flex-1">{r.certification.name}</span>
                  {r.certification.category && (
                    <span className="text-xs text-muted-foreground">{r.certification.category}</span>
                  )}
                  {isAdmin && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleRequired(r.certificationId, !r.required); }}
                        className={`text-[10px] px-1.5 py-0.5 rounded border font-medium transition-colors ${
                          r.required ? "border-emerald-400 text-emerald-600 bg-emerald-50" : "border-muted text-muted-foreground"
                        }`}
                        data-testid={`toggle-required-${r.certificationId}`}
                        title="Toggle required"
                      >
                        {r.required ? "Required" : "Optional"}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeRequirement(r.certificationId); }}
                        className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-destructive"
                        data-testid={`button-remove-req-${r.certificationId}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {isAdmin && availableCerts.length > 0 && (
            <div className="mt-3" onClick={(e) => e.stopPropagation()}>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Add Certifications</p>
              <div className="max-h-40 overflow-y-auto border rounded-md divide-y">
                {availableCerts.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/30 select-none"
                    data-testid={`checkbox-add-cert-role-${role.id}-${c.id}`}
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-primary"
                      checked={addCertIds.has(c.id)}
                      onChange={() => toggleAddCertId(c.id)}
                    />
                    <span className="flex-1 text-xs">{c.name}</span>
                    {c.category && <span className="text-[10px] text-muted-foreground">{c.category}</span>}
                  </label>
                ))}
              </div>
              <div className="flex justify-end mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={addCertIds.size === 0 || updateReqsMutation.isPending}
                  onClick={(e) => { e.stopPropagation(); addRequirement(); }}
                  data-testid={`button-add-cert-role-${role.id}`}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {addCertIds.size > 0 ? `Add (${addCertIds.size})` : "Add Selected"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RolesPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: roles, isLoading } = useQuery<Role[]>({
    queryKey: ["workforce-roles"],
    queryFn: () => apiFetch<Role[]>("/api/workforce/roles"),
  });

  const { data: allCerts } = useQuery<Certification[]>({
    queryKey: ["workforce-certifications-list"],
    queryFn: () => apiFetch<Certification[]>("/api/workforce/certifications"),
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
          <p className="text-sm text-muted-foreground mt-1">Define roles and manage required certifications per role.</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={openNew} data-testid="button-add-role">
            <Plus className="h-4 w-4 mr-1" /> Add Role
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : !roles?.length ? (
        <div className="border rounded-xl p-10 text-center text-muted-foreground">
          <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No roles defined yet.</p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          {roles.map((r) => (
            <RoleRow
              key={r.id}
              role={r}
              isAdmin={isAdmin}
              allCerts={allCerts ?? []}
              onEdit={openEdit}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>
      )}

      {/* Edit/create role buttons row */}
      {roles && roles.length > 0 && isAdmin && (
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => (
            <div key={r.id} className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => openEdit(r)} data-testid={`button-edit-role-${r.id}`}>
                <Pencil className="h-3.5 w-3.5" /> {r.name}
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteMutation.mutate(r.id)} disabled={deleteMutation.isPending} data-testid={`button-delete-role-${r.id}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
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
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Wind Turbine Technician" data-testid="input-role-name" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name || saveMutation.isPending} data-testid="button-save-role">
              {saveMutation.isPending ? "Saving…" : editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
