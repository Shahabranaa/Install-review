import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { apiFetch, apiPatch, apiPost, apiDelete } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, User, Award, Building2, Calendar, CheckCircle2,
  AlertTriangle, Clock, HelpCircle, XCircle, Plus, Trash2, Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";

type CertStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "NOT_VERIFIED" | "MISSING";
type WorkerSiteStatus = "READY" | "EXPIRING_SOON" | "NOT_COMPLIANT" | "NO_REQUIREMENTS";

interface Certification {
  id: number;
  name: string;
  category: string | null;
  validityMonths: number | null;
}

interface WorkerCert {
  id: number;
  workerId: number;
  certificationId: number;
  dateAchieved: string | null;
  expiryDate: string | null;
  verified: boolean;
  fileUrl: string | null;
  notes: string | null;
  certification: Certification;
}

interface SiteAssignment {
  id: number;
  workerId: number;
  siteId: number;
  status: string;
  assignedDate: string | null;
  mobilisationDate: string | null;
  notes: string | null;
  site: { id: number; name: string; location: string | null };
}

interface WorkerDetail {
  id: number;
  name: string;
  email: string | null;
  company: string | null;
  windaId: string | null;
  active: boolean;
  notes: string | null;
  roleId: number | null;
  role: { id: number; name: string } | null;
  certifications: WorkerCert[];
  assignments: SiteAssignment[];
}

interface SiteComplianceResult {
  workerId: number;
  workerName: string;
  siteId: number;
  siteName: string;
  status: WorkerSiteStatus;
  requiredCount: number;
  validCount: number;
  expiringCount: number;
  missingCount: number;
  items: { certId: number; name: string; status: CertStatus; expiryDate: string | null; daysUntilExpiry: number | null }[];
}

interface Role { id: number; name: string }

function certStatusInfo(wc: WorkerCert): { status: CertStatus; label: string; icon: React.ComponentType<{ className?: string }>; color: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in30 = new Date(today);
  in30.setDate(in30.getDate() + 30);

  if (!wc.expiryDate) {
    return wc.verified
      ? { status: "VALID", label: "Valid", icon: CheckCircle2, color: "text-emerald-500" }
      : { status: "NOT_VERIFIED", label: "Not Verified", icon: HelpCircle, color: "text-orange-500" };
  }
  const exp = new Date(wc.expiryDate);
  exp.setHours(0, 0, 0, 0);
  if (exp < today) return { status: "EXPIRED", label: "Expired", icon: XCircle, color: "text-red-500" };
  if (exp <= in30) return { status: "EXPIRING_SOON", label: "Expiring Soon", icon: Clock, color: "text-amber-500" };
  return wc.verified
    ? { status: "VALID", label: "Valid", icon: CheckCircle2, color: "text-emerald-500" }
    : { status: "NOT_VERIFIED", label: "Not Verified", icon: HelpCircle, color: "text-orange-500" };
}

function siteStatusConfig(status: WorkerSiteStatus) {
  switch (status) {
    case "READY": return { label: "Ready", icon: CheckCircle2, color: "text-emerald-500", badge: "border-emerald-400 text-emerald-600" };
    case "EXPIRING_SOON": return { label: "Expiring Soon", icon: Clock, color: "text-amber-500", badge: "border-amber-400 text-amber-600" };
    case "NOT_COMPLIANT": return { label: "Not Compliant", icon: AlertTriangle, color: "text-red-500", badge: "border-red-400 text-red-600" };
    case "NO_REQUIREMENTS": return { label: "No Requirements", icon: HelpCircle, color: "text-muted-foreground", badge: "text-muted-foreground" };
  }
}

export default function WorkerProfilePage() {
  const [, params] = useRoute("/workers/:id");
  const workerId = params ? parseInt(params.id) : NaN;
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAddCert, setShowAddCert] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [certForm, setCertForm] = useState({ certificationId: "", dateAchieved: "", expiryDate: "", verified: false });
  const [editForm, setEditForm] = useState({ name: "", email: "", company: "", windaId: "", notes: "", roleId: "" });

  const { data: worker, isLoading } = useQuery<WorkerDetail>({
    queryKey: ["worker", workerId],
    queryFn: () => apiFetch<WorkerDetail>(`/api/workforce/workers/${workerId}`),
    enabled: !isNaN(workerId),
  });

  const { data: siteCompliance } = useQuery<(SiteComplianceResult | { workerId: number; siteId: number; error: string })[]>({
    queryKey: ["worker-compliance", workerId],
    queryFn: () => apiFetch(`/api/workforce/compliance/worker/${workerId}`),
    enabled: !isNaN(workerId),
  });

  const { data: allCerts } = useQuery<Certification[]>({
    queryKey: ["workforce-certifications-list"],
    queryFn: () => apiFetch<Certification[]>("/api/workforce/certifications"),
  });

  const { data: roles } = useQuery<Role[]>({
    queryKey: ["workforce-roles"],
    queryFn: () => apiFetch<Role[]>("/api/workforce/roles"),
  });

  function openEdit() {
    if (!worker) return;
    setEditForm({
      name: worker.name,
      email: worker.email ?? "",
      company: worker.company ?? "",
      windaId: worker.windaId ?? "",
      notes: worker.notes ?? "",
      roleId: worker.roleId ? String(worker.roleId) : "",
    });
    setShowEdit(true);
  }

  const updateMutation = useMutation({
    mutationFn: () => apiPatch(`/api/workforce/workers/${workerId}`, {
      name: editForm.name,
      email: editForm.email || null,
      company: editForm.company || null,
      windaId: editForm.windaId || null,
      notes: editForm.notes || null,
      roleId: editForm.roleId ? parseInt(editForm.roleId) : null,
    }),
    onSuccess: () => {
      toast({ title: "Worker updated" });
      void qc.invalidateQueries({ queryKey: ["worker", workerId] });
      void qc.invalidateQueries({ queryKey: ["workforce-workers-raw"] });
      void qc.invalidateQueries({ queryKey: ["workforce-compliance-summary"] });
      setShowEdit(false);
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const deactivateMutation = useMutation({
    mutationFn: () => apiPatch(`/api/workforce/workers/${workerId}`, { active: false }),
    onSuccess: () => {
      toast({ title: "Worker deactivated" });
      void qc.invalidateQueries({ queryKey: ["worker", workerId] });
      void qc.invalidateQueries({ queryKey: ["workforce-workers-raw"] });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const addCertMutation = useMutation({
    mutationFn: () => apiPost(`/api/workforce/workers/${workerId}/certifications`, {
      certificationId: parseInt(certForm.certificationId),
      dateAchieved: certForm.dateAchieved || null,
      expiryDate: certForm.expiryDate || null,
      verified: certForm.verified,
    }),
    onSuccess: () => {
      toast({ title: "Certification added" });
      void qc.invalidateQueries({ queryKey: ["worker", workerId] });
      void qc.invalidateQueries({ queryKey: ["worker-compliance", workerId] });
      setShowAddCert(false);
      setCertForm({ certificationId: "", dateAchieved: "", expiryDate: "", verified: false });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const removeCertMutation = useMutation({
    mutationFn: (certId: number) => apiDelete(`/api/workforce/workers/${workerId}/certifications/${certId}`),
    onSuccess: () => {
      toast({ title: "Certification removed" });
      void qc.invalidateQueries({ queryKey: ["worker", workerId] });
      void qc.invalidateQueries({ queryKey: ["worker-compliance", workerId] });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!worker) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Worker not found. <Link href="/workers"><a className="underline">Back to workers</a></Link>
      </div>
    );
  }

  const validSiteCompliance = (siteCompliance ?? []).filter(
    (r): r is SiteComplianceResult => "status" in r,
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Link href="/workers">
        <a className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back-workers">
          <ChevronLeft className="h-4 w-4" /> Workers
        </a>
      </Link>

      {/* Worker header */}
      <div className="border rounded-xl bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">{worker.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {worker.role && <Badge variant="secondary" className="text-xs">{worker.role.name}</Badge>}
                <Badge
                  className={cn("text-xs", worker.active ? "bg-emerald-500 hover:bg-emerald-500" : "")}
                  variant={worker.active ? "default" : "outline"}
                >
                  {worker.active ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={openEdit} data-testid="button-edit-worker">
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
              {worker.active && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => deactivateMutation.mutate()}
                  disabled={deactivateMutation.isPending}
                  data-testid="button-deactivate-worker"
                >
                  Deactivate
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-4 border-t text-sm">
          {worker.email && (
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="font-medium truncate">{worker.email}</p>
            </div>
          )}
          {worker.company && (
            <div>
              <p className="text-xs text-muted-foreground">Company</p>
              <p className="font-medium">{worker.company}</p>
            </div>
          )}
          {worker.windaId && (
            <div>
              <p className="text-xs text-muted-foreground">WINDA ID</p>
              <p className="font-medium font-mono">{worker.windaId}</p>
            </div>
          )}
          {worker.notes && (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="text-sm">{worker.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Certifications */}
      <div className="border rounded-xl bg-card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Certifications ({worker.certifications.length})</h2>
          </div>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setShowAddCert(true)} data-testid="button-add-cert">
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          )}
        </div>
        {worker.certifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">No certifications recorded.</div>
        ) : (
          <div className="divide-y">
            {worker.certifications.map((wc) => {
              const { label, icon: StatusIcon, color } = certStatusInfo(wc);
              return (
                <div key={wc.id} className="flex items-center gap-3 px-4 py-3">
                  <StatusIcon className={cn("h-4 w-4 flex-shrink-0", color)} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{wc.certification.name}</p>
                    <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground mt-0.5">
                      {wc.certification.category && <span>{wc.certification.category}</span>}
                      {wc.dateAchieved && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> Achieved {new Date(wc.dateAchieved).toLocaleDateString("en-GB")}
                        </span>
                      )}
                      {wc.expiryDate && (
                        <span className={cn("flex items-center gap-1", new Date(wc.expiryDate) < new Date() ? "text-red-500" : "")}>
                          <Clock className="h-3 w-3" /> Expires {new Date(wc.expiryDate).toLocaleDateString("en-GB")}
                        </span>
                      )}
                      {wc.fileUrl && (
                        <a href={wc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-0.5">
                          View file
                        </a>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className={cn("text-[10px] flex-shrink-0", color.replace("text-", "border-").replace("-500", "-400"))}>
                    {label}
                  </Badge>
                  {isAdmin && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                      onClick={() => removeCertMutation.mutate(wc.certificationId)}
                      data-testid={`button-remove-cert-${wc.certificationId}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Per-site compliance */}
      {validSiteCompliance.length > 0 && (
        <div className="border rounded-xl bg-card overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Site Compliance ({validSiteCompliance.length})</h2>
          </div>
          <div className="divide-y">
            {validSiteCompliance.map((r) => {
              const cfg = siteStatusConfig(r.status);
              const StatusIcon = cfg.icon;
              return (
                <div key={r.siteId} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusIcon className={cn("h-4 w-4 flex-shrink-0", cfg.color)} />
                      <Link href={`/sites/${r.siteId}`}>
                        <a className="font-medium text-sm hover:underline">{r.siteName}</a>
                      </Link>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {r.validCount}/{r.requiredCount} certs
                      </span>
                      <Badge variant="outline" className={cn("text-[10px]", cfg.badge)}>{cfg.label}</Badge>
                    </div>
                  </div>
                  {r.items.length > 0 && (
                    <div className="ml-6 space-y-0.5">
                      {r.items.map((item) => (
                        <div key={item.certId} className="flex items-center gap-2 text-xs">
                          <span className={cn("w-20 font-medium flex-shrink-0",
                            item.status === "VALID" ? "text-emerald-600" :
                            item.status === "EXPIRING_SOON" ? "text-amber-600" :
                            "text-red-600",
                          )}>{item.status}</span>
                          <span className="text-muted-foreground">{item.name}</span>
                          {item.expiryDate && (
                            <span className="text-muted-foreground ml-auto">
                              {new Date(item.expiryDate).toLocaleDateString("en-GB")}
                              {item.daysUntilExpiry !== null && ` (${item.daysUntilExpiry}d)`}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Site Assignments */}
      {worker.assignments.length > 0 && validSiteCompliance.length === 0 && (
        <div className="border rounded-xl bg-card overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Site Assignments ({worker.assignments.length})</h2>
          </div>
          <div className="divide-y">
            {worker.assignments.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{a.site.name}</p>
                  {a.site.location && <p className="text-xs text-muted-foreground">{a.site.location}</p>}
                </div>
                <Badge
                  variant="outline"
                  className={cn("text-[10px]",
                    a.status === "active" ? "border-emerald-400 text-emerald-600" :
                    a.status === "pending" ? "border-amber-400 text-amber-600" : "text-muted-foreground",
                  )}
                >
                  {a.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit worker dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Worker</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Name *</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} data-testid="input-edit-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </div>
              <div>
                <Label>Company</Label>
                <Input value={editForm.company} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>WINDA ID</Label>
                <Input value={editForm.windaId} onChange={(e) => setEditForm({ ...editForm, windaId: e.target.value })} />
              </div>
              <div>
                <Label>Role</Label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={editForm.roleId}
                  onChange={(e) => setEditForm({ ...editForm, roleId: e.target.value })}
                  data-testid="select-edit-role"
                >
                  <option value="">No role</option>
                  {roles?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button
              onClick={() => updateMutation.mutate()}
              disabled={!editForm.name || updateMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add cert dialog */}
      <Dialog open={showAddCert} onOpenChange={setShowAddCert}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Certification</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Certification *</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                value={certForm.certificationId}
                onChange={(e) => setCertForm({ ...certForm, certificationId: e.target.value })}
                data-testid="select-certification"
              >
                <option value="">Select…</option>
                {allCerts?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date Achieved</Label>
                <Input type="date" value={certForm.dateAchieved} onChange={(e) => setCertForm({ ...certForm, dateAchieved: e.target.value })} />
              </div>
              <div>
                <Label>Expiry Date</Label>
                <Input type="date" value={certForm.expiryDate} onChange={(e) => setCertForm({ ...certForm, expiryDate: e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={certForm.verified}
                onChange={(e) => setCertForm({ ...certForm, verified: e.target.checked })}
                data-testid="checkbox-cert-verified"
              />
              Verified
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCert(false)}>Cancel</Button>
            <Button
              onClick={() => addCertMutation.mutate()}
              disabled={!certForm.certificationId || addCertMutation.isPending}
              data-testid="button-save-cert"
            >
              {addCertMutation.isPending ? "Saving…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
