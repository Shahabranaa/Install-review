import { useState, useRef, useEffect, useMemo } from "react";
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
  Paperclip, X as XIcon, Loader2, KeyRound, Package, RotateCcw, CalendarRange,
  Briefcase, AlertCircle, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type CertStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "NOT_VERIFIED" | "MISSING" | "REQUIRES_ACTION";
type WorkerSiteStatus = "READY" | "EXPIRING_SOON" | "NOT_COMPLIANT" | "NO_REQUIREMENTS";

interface Certification {
  id: number;
  name: string;
  category: string | null;
  validityMonths: number | null;
  autoCalculateExpiry: boolean;
}

interface WorkerCert {
  id: number;
  workerId: number;
  certificationId: number;
  dateAchieved: string | null;
  expiryDate: string | null;
  verified: boolean;
  rejected: boolean;
  rejectionComment: string | null;
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
  portalUsername: string | null;
  passportNo: string | null;
  passportIssueDate: string | null;
  passportExpiryDate: string | null;
  passportPlaceOfBirth: string | null;
  passportWasabiKey: string | null;
  nokName: string | null;
  nokRelationship: string | null;
  nokPhone: string | null;
  cvWasabiKey: string | null;
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

interface RoleHistoryEntry {
  id: number;
  workerId: number;
  roleId: number | null;
  roleNameSnapshot: string;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  source: string | null;
}

interface PPEType { id: number; name: string; description: string | null }
interface PPEAllocation {
  id: number;
  workerId: number;
  ppeTypeId: number;
  ppeType: { id: number; name: string; description: string | null };
  siteId: number | null;
  site: { id: number; name: string } | null;
  issuedAt: string;
  issuedByUserId: number | null;
  issuedByUser: { displayName: string } | null;
  sizeSpec: string | null;
  returnedAt: string | null;
  notes: string | null;
}

function certStatusInfo(wc: WorkerCert): { status: CertStatus; label: string; icon: React.ComponentType<{ className?: string }>; color: string } {
  if (wc.rejected) {
    return { status: "REQUIRES_ACTION", label: "Rejected", icon: AlertCircle, color: "text-red-500" };
  }
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

interface RotationPeriod {
  id: number;
  assignmentId: number;
  plannedStart: string;
  plannedEnd: string | null;
  status: string;
  notes: string | null;
}

const ROTATION_STATUSES = ["planned", "on-site", "completed", "cancelled"] as const;

function rotationStatusBadge(status: string) {
  switch (status) {
    case "on-site": return "border-emerald-400 text-emerald-600";
    case "completed": return "text-muted-foreground";
    case "cancelled": return "border-red-300 text-red-500";
    default: return "border-amber-400 text-amber-600";
  }
}

function AssignmentWithRotations({
  assignment,
  workerRole,
  isAdmin,
}: {
  assignment: SiteAssignment;
  workerRole: { id: number; name: string } | null;
  isAdmin: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingRotation, setEditingRotation] = useState<RotationPeriod | null>(null);
  const blankForm = { plannedStart: "", plannedEnd: "", status: "planned", notes: "" };
  const [form, setForm] = useState(blankForm);

  const blankGenForm = { startDate: "", onDays: "21", offDays: "21", count: "6" };
  const [showGenerate, setShowGenerate] = useState(false);
  const [genForm, setGenForm] = useState(blankGenForm);

  const genPreview = useMemo(() => {
    const { startDate, onDays, offDays, count } = genForm;
    if (!startDate) return [];
    const on = parseInt(onDays), off = parseInt(offDays), n = parseInt(count);
    if (isNaN(on) || isNaN(off) || isNaN(n) || on < 1 || off < 0 || n < 1 || n > 52) return [];
    const result: { start: string; end: string }[] = [];
    let cur = startDate;
    for (let i = 0; i < n; i++) {
      const d = new Date(`${cur}T00:00:00`);
      const endD = new Date(d);
      endD.setDate(endD.getDate() + on - 1);
      const fmt = (dt: Date) => dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      result.push({ start: fmt(d), end: fmt(endD) });
      endD.setDate(endD.getDate() + off + 1);
      cur = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, "0")}-${String(endD.getDate()).padStart(2, "0")}`;
    }
    return result;
  }, [genForm]);

  const { data: rotations, isLoading } = useQuery<RotationPeriod[]>({
    queryKey: ["rotations", assignment.id],
    queryFn: () => apiFetch<RotationPeriod[]>(`/api/workforce/assignments/${assignment.id}/rotations`),
    enabled: open,
  });

  const addMutation = useMutation({
    mutationFn: () => apiPost(`/api/workforce/assignments/${assignment.id}/rotations`, {
      plannedStart: form.plannedStart,
      plannedEnd: form.plannedEnd || null,
      status: form.status,
      notes: form.notes || null,
    }),
    onSuccess: () => {
      toast({ title: "Rotation added" });
      void qc.invalidateQueries({ queryKey: ["rotations", assignment.id] });
      setShowAdd(false);
      setForm(blankForm);
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: (id: number) => apiPatch(`/api/workforce/rotations/${id}`, {
      plannedStart: form.plannedStart,
      plannedEnd: form.plannedEnd || null,
      status: form.status,
      notes: form.notes || null,
    }),
    onSuccess: () => {
      toast({ title: "Rotation updated" });
      void qc.invalidateQueries({ queryKey: ["rotations", assignment.id] });
      setEditingRotation(null);
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/workforce/rotations/${id}`),
    onSuccess: () => {
      toast({ title: "Rotation deleted" });
      void qc.invalidateQueries({ queryKey: ["rotations", assignment.id] });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const generateMutation = useMutation({
    mutationFn: () => apiPost(`/api/workforce/assignments/${assignment.id}/rotations/generate`, {
      startDate: genForm.startDate,
      onDays: parseInt(genForm.onDays),
      offDays: parseInt(genForm.offDays),
      count: parseInt(genForm.count),
    }),
    onSuccess: () => {
      toast({ title: `${genPreview.length} rotation periods generated` });
      void qc.invalidateQueries({ queryKey: ["rotations", assignment.id] });
      setShowGenerate(false);
      setGenForm(blankGenForm);
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  function openAdd() {
    setForm(blankForm);
    setShowAdd(true);
  }

  function openEdit(r: RotationPeriod) {
    setForm({ plannedStart: r.plannedStart, plannedEnd: r.plannedEnd ?? "", status: r.status, notes: r.notes ?? "" });
    setEditingRotation(r);
  }

  const upcomingCount = (rotations ?? []).filter(
    r => r.plannedStart >= new Date().toISOString().split("T")[0] && r.status !== "cancelled" && r.status !== "completed"
  ).length;

  const RotationFormFields = (
    <div className="space-y-3 py-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Start Date *</Label>
          <Input type="date" value={form.plannedStart} onChange={e => setForm(f => ({ ...f, plannedStart: e.target.value }))} />
        </div>
        <div>
          <Label>End Date</Label>
          <Input type="date" value={form.plannedEnd} onChange={e => setForm(f => ({ ...f, plannedEnd: e.target.value }))} />
        </div>
      </div>
      <div>
        <Label>Status</Label>
        <select
          className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
          value={form.status}
          onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
        >
          {ROTATION_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>
      <div>
        <Label>Notes</Label>
        <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
      </div>
    </div>
  );

  return (
    <>
      <div className="px-4 py-3">
        <button
          className="w-full text-left flex items-center gap-3"
          onClick={() => setOpen(o => !o)}
        >
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{assignment.site.name}</p>
            {assignment.site.location && <p className="text-xs text-muted-foreground">{assignment.site.location}</p>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {upcomingCount > 0 && open && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <CalendarRange className="h-3 w-3" /> {upcomingCount} upcoming
              </span>
            )}
            {workerRole && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">{workerRole.name}</Badge>
            )}
            <Badge
              variant="outline"
              className={cn("text-[10px]",
                assignment.status === "active" ? "border-emerald-400 text-emerald-600" :
                assignment.status === "pending" ? "border-amber-400 text-amber-600" : "text-muted-foreground",
              )}
            >
              {assignment.status}
            </Badge>
            <CalendarRange className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "text-primary")} />
          </div>
        </button>

        {open && (
          <div className="mt-3 ml-0 border rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b bg-muted/20 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <CalendarRange className="h-3 w-3" /> Rotation Periods
              </span>
              {isAdmin && (
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => { setGenForm(blankGenForm); setShowGenerate(true); }} data-testid={`button-generate-rotations-${assignment.id}`}>
                    <RotateCcw className="h-3 w-3 mr-1" /> Generate
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={openAdd} data-testid={`button-add-rotation-${assignment.id}`}>
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>
              )}
            </div>
            {isLoading ? (
              <div className="px-3 py-4 text-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />
              </div>
            ) : !rotations?.length ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                No rotation periods recorded.{isAdmin && " Click Add to create one."}
              </div>
            ) : (
              <div className="divide-y">
                {rotations.map(r => (
                  <div key={r.id} className="flex items-center gap-2 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Calendar className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium">{new Date(`${r.plannedStart}T00:00:00`).toLocaleDateString("en-GB")}</span>
                        {r.plannedEnd && (
                          <>
                            <span className="text-muted-foreground">→</span>
                            <span>{new Date(`${r.plannedEnd}T00:00:00`).toLocaleDateString("en-GB")}</span>
                          </>
                        )}
                      </div>
                      {r.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.notes}</p>}
                    </div>
                    <Badge variant="outline" className={cn("text-[10px] flex-shrink-0", rotationStatusBadge(r.status))}>
                      {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                    </Badge>
                    {isAdmin && (
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={() => openEdit(r)} data-testid={`button-edit-rotation-${r.id}`}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => deleteMutation.mutate(r.id)} disabled={deleteMutation.isPending} data-testid={`button-delete-rotation-${r.id}`}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={showAdd} onOpenChange={o => { setShowAdd(o); if (!o) setForm(blankForm); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Rotation Period — {assignment.site.name}</DialogTitle></DialogHeader>
          {RotationFormFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={!form.plannedStart || addMutation.isPending} data-testid="button-save-rotation">
              {addMutation.isPending ? "Saving…" : "Add Rotation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingRotation} onOpenChange={o => { if (!o) setEditingRotation(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Rotation — {assignment.site.name}</DialogTitle></DialogHeader>
          {RotationFormFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRotation(null)}>Cancel</Button>
            <Button onClick={() => editingRotation && editMutation.mutate(editingRotation.id)} disabled={!form.plannedStart || editMutation.isPending} data-testid="button-save-rotation-edit">
              {editMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showGenerate} onOpenChange={o => { setShowGenerate(o); if (!o) setGenForm(blankGenForm); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Generate Rotation Schedule — {assignment.site.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <Label>First on-site start date *</Label>
              <Input type="date" className="mt-1" value={genForm.startDate} onChange={e => setGenForm(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Days on site</Label>
                <Input type="number" min="1" max="365" className="mt-1" value={genForm.onDays} onChange={e => setGenForm(f => ({ ...f, onDays: e.target.value }))} />
              </div>
              <div>
                <Label>Days off</Label>
                <Input type="number" min="0" max="365" className="mt-1" value={genForm.offDays} onChange={e => setGenForm(f => ({ ...f, offDays: e.target.value }))} />
              </div>
              <div>
                <Label>No. of rotations</Label>
                <Input type="number" min="1" max="52" className="mt-1" value={genForm.count} onChange={e => setGenForm(f => ({ ...f, count: e.target.value }))} />
              </div>
            </div>
            {genPreview.length > 0 && (
              <div className="border rounded-md overflow-hidden">
                <div className="px-3 py-1.5 bg-muted/30 border-b text-xs font-medium text-muted-foreground">
                  Preview — {genPreview.length} rotation{genPreview.length !== 1 ? "s" : ""}
                </div>
                <div className="divide-y max-h-52 overflow-y-auto">
                  {genPreview.slice(0, 8).map((p, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                      <span className="text-muted-foreground w-5 flex-shrink-0">{i + 1}.</span>
                      <span className="font-medium">{p.start}</span>
                      <span className="text-muted-foreground">→</span>
                      <span>{p.end}</span>
                    </div>
                  ))}
                  {genPreview.length > 8 && (
                    <div className="px-3 py-1.5 text-xs text-muted-foreground">
                      …and {genPreview.length - 8} more
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerate(false)}>Cancel</Button>
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={!genForm.startDate || genPreview.length === 0 || generateMutation.isPending}
              data-testid="button-confirm-generate-rotations"
            >
              {generateMutation.isPending ? "Generating…" : `Generate ${genPreview.length > 0 ? genPreview.length : ""} Rotations`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function WorkerProfilePage() {
  const [, params] = useRoute("/workers/:id");
  const workerId = params ? parseInt(params.id) : NaN;
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAddCert, setShowAddCert] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingCert, setEditingCert] = useState<WorkerCert | null>(null);
  const [showPortalCreds, setShowPortalCreds] = useState(false);
  const [portalCredsForm, setPortalCredsForm] = useState({ portalUsername: "", password: "", confirm: "" });
  const [certForm, setCertForm] = useState({ certificationIds: [] as number[], dateAchieved: "", expiryDate: "", verified: false });

  function toggleCertFormId(id: number) {
    setCertForm((prev) => ({
      ...prev,
      certificationIds: prev.certificationIds.includes(id)
        ? prev.certificationIds.filter((x) => x !== id)
        : [...prev.certificationIds, id],
    }));
  }

  const [certEditForm, setCertEditForm] = useState({ dateAchieved: "", expiryDate: "", verified: false, fileUrl: "", notes: "" });
  const [rejectTarget, setRejectTarget] = useState<WorkerCert | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [editForm, setEditForm] = useState({ name: "", email: "", company: "", windaId: "", notes: "", roleId: "", newSiteId: "" });
  const [fileUploading, setFileUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cardUploadingCertId, setCardUploadingCertId] = useState<number | null>(null);
  const [verifyingCertIds, setVerifyingCertIds] = useState<Set<number>>(new Set());
  const [showIssuePPE, setShowIssuePPE] = useState(false);
  const [showAddRole, setShowAddRole] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleHistoryEntry | null>(null);
  const blankRoleForm = { roleId: "", startDate: "", endDate: "", notes: "", closeOpenEntry: true };
  const [roleHistoryForm, setRoleHistoryForm] = useState(blankRoleForm);
  const today = new Date().toISOString().split("T")[0];
  const [issueForm, setIssueForm] = useState({ ppeTypeId: "", siteId: "", issuedAt: today, sizeSpec: "", notes: "" });
  const cardFileInputRef = useRef<HTMLInputElement>(null);
  const cardUploadTargetRef = useRef<WorkerCert | null>(null);

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

  useEffect(() => {
    if (certForm.certificationIds.length !== 1) return;
    const certId = certForm.certificationIds[0];
    const cert = (allCerts ?? []).find(c => c.id === certId);
    if (!cert?.autoCalculateExpiry || !cert.validityMonths || !certForm.dateAchieved) return;
    const achieved = new Date(certForm.dateAchieved);
    if (isNaN(achieved.getTime())) return;
    achieved.setMonth(achieved.getMonth() + cert.validityMonths);
    setCertForm(prev => ({ ...prev, expiryDate: achieved.toISOString().split("T")[0] }));
  }, [certForm.certificationIds, certForm.dateAchieved, allCerts]);

  const { data: roles } = useQuery<Role[]>({
    queryKey: ["workforce-roles"],
    queryFn: () => apiFetch<Role[]>("/api/workforce/roles"),
  });

  const { data: allSites } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["workforce-sites"],
    queryFn: () => apiFetch<{ id: number; name: string }[]>("/api/workforce/sites"),
  });

  const { data: ppeAllocations } = useQuery<PPEAllocation[]>({
    queryKey: ["worker-ppe", workerId],
    queryFn: () => apiFetch<PPEAllocation[]>(`/api/workforce/workers/${workerId}/ppe`),
    enabled: !isNaN(workerId),
  });

  const { data: ppeTypes } = useQuery<PPEType[]>({
    queryKey: ["workforce-ppe-types"],
    queryFn: () => apiFetch<PPEType[]>("/api/workforce/ppe-types"),
    enabled: isAdmin,
  });

  const { data: roleHistory } = useQuery<RoleHistoryEntry[]>({
    queryKey: ["worker-role-history", workerId],
    queryFn: () => apiFetch<RoleHistoryEntry[]>(`/api/workforce/workers/${workerId}/role-history`),
    enabled: !isNaN(workerId) && isAdmin,
  });

  const addRoleMutation = useMutation({
    mutationFn: () =>
      apiPost(`/api/workforce/workers/${workerId}/role-history`, {
        roleId: roleHistoryForm.roleId ? parseInt(roleHistoryForm.roleId) : null,
        startDate: roleHistoryForm.startDate,
        endDate: roleHistoryForm.endDate || null,
        notes: roleHistoryForm.notes || null,
        closeOpenEntry: roleHistoryForm.closeOpenEntry,
      }),
    onSuccess: () => {
      toast({ title: "Role entry added" });
      void qc.invalidateQueries({ queryKey: ["worker-role-history", workerId] });
      void qc.invalidateQueries({ queryKey: ["worker", workerId] });
      setShowAddRole(false);
      setRoleHistoryForm(blankRoleForm);
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const editRoleMutation = useMutation({
    mutationFn: (id: number) =>
      apiPatch(`/api/workforce/workers/${workerId}/role-history/${id}`, {
        startDate: roleHistoryForm.startDate,
        endDate: roleHistoryForm.endDate || null,
        notes: roleHistoryForm.notes || null,
      }),
    onSuccess: () => {
      toast({ title: "Role entry updated" });
      void qc.invalidateQueries({ queryKey: ["worker-role-history", workerId] });
      setEditingRole(null);
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/workforce/workers/${workerId}/role-history/${id}`),
    onSuccess: () => {
      toast({ title: "Role entry deleted" });
      void qc.invalidateQueries({ queryKey: ["worker-role-history", workerId] });
      void qc.invalidateQueries({ queryKey: ["worker", workerId] });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
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
      newSiteId: "",
    });
    setShowEdit(true);
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      await apiPatch(`/api/workforce/workers/${workerId}`, {
        name: editForm.name,
        email: editForm.email || null,
        company: editForm.company || null,
        windaId: editForm.windaId || null,
        notes: editForm.notes || null,
        roleId: editForm.roleId ? parseInt(editForm.roleId) : null,
      });
      if (editForm.newSiteId) {
        await apiPost("/api/workforce/assignments", {
          workerId,
          siteId: parseInt(editForm.newSiteId),
          status: "active",
        });
      }
    },
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

  const setPortalCredsMutation = useMutation({
    mutationFn: () =>
      apiPost(`/api/workforce/workers/${workerId}/set-portal-credentials`, {
        portalUsername: portalCredsForm.portalUsername.trim() || undefined,
        password: portalCredsForm.password,
      }),
    onSuccess: () => {
      toast({ title: "Portal access updated" });
      void qc.invalidateQueries({ queryKey: ["worker", workerId] });
      setShowPortalCreds(false);
      setPortalCredsForm({ portalUsername: "", password: "", confirm: "" });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const addCertMutation = useMutation({
    mutationFn: () => Promise.all(
      certForm.certificationIds.map((certificationId) =>
        apiPost(`/api/workforce/workers/${workerId}/certifications`, {
          certificationId,
          dateAchieved: certForm.dateAchieved || null,
          expiryDate: certForm.expiryDate || null,
          verified: certForm.verified,
        }),
      ),
    ),
    onSuccess: (results) => {
      toast({ title: results.length === 1 ? "Certification added" : `${results.length} certifications added` });
      void qc.invalidateQueries({ queryKey: ["worker", workerId] });
      void qc.invalidateQueries({ queryKey: ["worker-compliance", workerId] });
      setShowAddCert(false);
      setCertForm({ certificationIds: [], dateAchieved: "", expiryDate: "", verified: false });
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

  const updateCertMutation = useMutation({
    mutationFn: (certId: number) => apiPatch(
      `/api/workforce/workers/${workerId}/certifications/${certId}`,
      {
        dateAchieved: certEditForm.dateAchieved || null,
        expiryDate: certEditForm.expiryDate || null,
        verified: certEditForm.verified,
        fileUrl: certEditForm.fileUrl || null,
        notes: certEditForm.notes || null,
      },
    ),
    onSuccess: () => {
      toast({ title: "Certification updated" });
      void qc.invalidateQueries({ queryKey: ["worker", workerId] });
      void qc.invalidateQueries({ queryKey: ["worker-compliance", workerId] });
      setEditingCert(null);
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const toggleVerifyMutation = useMutation({
    mutationFn: ({ certId, newVerified }: { certId: number; newVerified: boolean }) =>
      apiPatch(`/api/workforce/workers/${workerId}/certifications/${certId}`, { verified: newVerified }),
    onMutate: ({ certId }) => setVerifyingCertIds((prev) => new Set(prev).add(certId)),
    onSettled: (_, __, { certId }) => setVerifyingCertIds((prev) => { const next = new Set(prev); next.delete(certId); return next; }),
    onSuccess: (_, { newVerified }) => {
      toast({ title: newVerified ? "Certification verified" : "Verification removed" });
      void qc.invalidateQueries({ queryKey: ["worker", workerId] });
      void qc.invalidateQueries({ queryKey: ["worker-compliance", workerId] });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const rejectCertMutation = useMutation({
    mutationFn: ({ certId, comment }: { certId: number; comment: string }) =>
      apiPatch(`/api/workforce/workers/${workerId}/certifications/${certId}/reject`, {
        rejected: true,
        rejectionComment: comment.trim() || null,
      }),
    onSuccess: () => {
      toast({ title: "Certification rejected" });
      void qc.invalidateQueries({ queryKey: ["worker", workerId] });
      void qc.invalidateQueries({ queryKey: ["worker-compliance", workerId] });
      setRejectTarget(null);
      setRejectComment("");
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const issuePPEMutation = useMutation({
    mutationFn: () => apiPost(`/api/workforce/workers/${workerId}/ppe`, {
      ppeTypeId: parseInt(issueForm.ppeTypeId),
      siteId: issueForm.siteId ? parseInt(issueForm.siteId) : null,
      issuedAt: issueForm.issuedAt,
      sizeSpec: issueForm.sizeSpec || null,
      notes: issueForm.notes || null,
    }),
    onSuccess: () => {
      toast({ title: "PPE issued" });
      void qc.invalidateQueries({ queryKey: ["worker-ppe", workerId] });
      setShowIssuePPE(false);
      setIssueForm({ ppeTypeId: "", siteId: "", issuedAt: today, sizeSpec: "", notes: "" });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const returnPPEMutation = useMutation({
    mutationFn: (allocationId: number) =>
      apiPatch(`/api/workforce/ppe-allocations/${allocationId}`, {
        returnedAt: today,
      }),
    onSuccess: () => {
      toast({ title: "PPE marked as returned" });
      void qc.invalidateQueries({ queryKey: ["worker-ppe", workerId] });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  function openEditCert(wc: WorkerCert) {
    setCertEditForm({
      dateAchieved: wc.dateAchieved ?? "",
      expiryDate: wc.expiryDate ?? "",
      verified: wc.verified,
      fileUrl: wc.fileUrl ?? "",
      notes: wc.notes ?? "",
    });
    setEditingCert(wc);
  }

  async function handleCertFileUpload(file: File) {
    if (!editingCert) return;
    setFileUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `${BASE}/api/workforce/workers/${workerId}/certifications/${editingCert.certificationId}/file`,
        { method: "POST", credentials: "include", body: form },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? `Upload failed: ${res.status}`);
      }
      const data = (await res.json()) as { fileUrl: string };
      setCertEditForm((f) => ({ ...f, fileUrl: data.fileUrl }));
      toast({ title: "File uploaded" });
      void qc.invalidateQueries({ queryKey: ["worker", workerId] });
    } catch (err) {
      toast({ title: "Upload failed", description: String(err), variant: "destructive" });
    } finally {
      setFileUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function certFileHref(wc: WorkerCert): string {
    if (!wc.fileUrl) return "#";
    if (wc.fileUrl.startsWith("http")) return wc.fileUrl;
    return `${BASE}/api/workforce/workers/${wc.workerId}/certifications/${wc.certificationId}/file`;
  }

  async function handleCardFileUpload(wc: WorkerCert, file: File) {
    setCardUploadingCertId(wc.certificationId);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `${BASE}/api/workforce/workers/${workerId}/certifications/${wc.certificationId}/file`,
        { method: "POST", credentials: "include", body: form },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? `Upload failed: ${res.status}`);
      }
      toast({ title: "File attached" });
      void qc.invalidateQueries({ queryKey: ["worker", workerId] });
    } catch (err) {
      toast({ title: "Upload failed", description: String(err), variant: "destructive" });
    } finally {
      setCardUploadingCertId(null);
      cardUploadTargetRef.current = null;
      if (cardFileInputRef.current) cardFileInputRef.current.value = "";
    }
  }

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

  const isSelf =
    !isAdmin &&
    !!user?.email &&
    !!worker?.email &&
    user.email.toLowerCase() === worker.email.toLowerCase();

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

      {/* Passport */}
      {(worker.passportNo || worker.passportPlaceOfBirth || worker.passportIssueDate || worker.passportExpiryDate || worker.passportWasabiKey) && (
        <div className="border rounded-xl bg-card overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Passport</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-4 py-4 text-sm">
            {worker.passportNo && (
              <div>
                <p className="text-xs text-muted-foreground">Passport no.</p>
                <p className="font-medium font-mono">{worker.passportNo}</p>
              </div>
            )}
            {worker.passportPlaceOfBirth && (
              <div>
                <p className="text-xs text-muted-foreground">Place of birth</p>
                <p className="font-medium">{worker.passportPlaceOfBirth}</p>
              </div>
            )}
            {worker.passportIssueDate && (
              <div>
                <p className="text-xs text-muted-foreground">Issue date</p>
                <p className="font-medium">{worker.passportIssueDate}</p>
              </div>
            )}
            {worker.passportExpiryDate && (
              <div>
                <p className="text-xs text-muted-foreground">Expiry date</p>
                <p className="font-medium">{worker.passportExpiryDate}</p>
              </div>
            )}
            {worker.passportWasabiKey && (
              <div>
                <p className="text-xs text-muted-foreground">Passport scan</p>
                <a
                  href={`${BASE}/api/workforce/workers/${worker.id}/passport`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  <Paperclip className="h-3 w-3" /> Download
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Next of Kin */}
      {worker.nokName && (
        <div className="border rounded-xl bg-card overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Next of Kin</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 px-4 py-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Name</p>
              <p className="font-medium">{worker.nokName}</p>
            </div>
            {worker.nokRelationship && (
              <div>
                <p className="text-xs text-muted-foreground">Relationship</p>
                <p className="font-medium">{worker.nokRelationship}</p>
              </div>
            )}
            {worker.nokPhone && (
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <p className="font-medium font-mono">{worker.nokPhone}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Portal Access (admin only) */}
      {isAdmin && (
        <div className="border rounded-xl bg-card p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <KeyRound className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Worker Portal Access</p>
              <p className="text-xs text-muted-foreground">
                {worker.portalUsername
                  ? <>Username: <span className="font-mono">{worker.portalUsername}</span></>
                  : "No portal credentials set"}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPortalCredsForm({ portalUsername: worker.portalUsername ?? "", password: "", confirm: "" });
              setShowPortalCreds(true);
            }}
            data-testid="button-set-portal-creds"
          >
            <KeyRound className="h-3.5 w-3.5 mr-1" />
            {worker.portalUsername ? "Update credentials" : "Set credentials"}
          </Button>
        </div>
      )}

      {/* Hidden file input for card-level uploads (non-admin & admin quick upload) */}
      <input
        ref={cardFileInputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const target = cardUploadTargetRef.current;
          if (file && target) void handleCardFileUpload(target, file);
        }}
      />

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
                        <a
                          href={certFileHref(wc)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-0.5"
                        >
                          <Paperclip className="h-3 w-3" /> View file
                        </a>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className={cn("text-[10px] flex-shrink-0", color.replace("text-", "border-").replace("-500", "-400"))}>
                    {label}
                  </Badge>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isSelf && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-primary"
                        title="Attach file"
                        disabled={cardUploadingCertId === wc.certificationId}
                        onClick={() => {
                          cardUploadTargetRef.current = wc;
                          cardFileInputRef.current?.click();
                        }}
                        data-testid={`button-upload-cert-${wc.certificationId}`}
                      >
                        {cardUploadingCertId === wc.certificationId
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Paperclip className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                    {isAdmin && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className={cn(
                            "h-7 w-7 transition-colors",
                            wc.verified
                              ? "text-emerald-500 hover:text-emerald-600"
                              : "text-muted-foreground hover:text-emerald-500",
                          )}
                          title={wc.verified ? "Mark as unverified" : "Mark as verified"}
                          disabled={verifyingCertIds.has(wc.certificationId)}
                          onClick={() => toggleVerifyMutation.mutate({ certId: wc.certificationId, newVerified: !wc.verified })}
                          data-testid={`button-verify-cert-${wc.certificationId}`}
                        >
                          {verifyingCertIds.has(wc.certificationId)
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <CheckCircle2 className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className={cn(
                            "h-7 w-7 transition-colors",
                            wc.rejected
                              ? "text-red-500 hover:text-red-600"
                              : "text-muted-foreground hover:text-red-500",
                          )}
                          title={wc.rejected ? "Rejection sent" : "Reject certification"}
                          onClick={() => {
                            setRejectTarget(wc);
                            setRejectComment(wc.rejectionComment ?? "");
                          }}
                          data-testid={`button-reject-cert-${wc.certificationId}`}
                        >
                          <AlertCircle className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                          onClick={() => openEditCert(wc)}
                          data-testid={`button-edit-cert-${wc.certificationId}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeCertMutation.mutate(wc.certificationId)}
                          data-testid={`button-remove-cert-${wc.certificationId}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
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

      {/* Site Assignments with Rotation Periods */}
      {worker.assignments.length > 0 && (
        <div className="border rounded-xl bg-card overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Site Assignments ({worker.assignments.length})</h2>
          </div>
          <div className="divide-y">
            {worker.assignments.map((a) => (
              <AssignmentWithRotations key={a.id} assignment={a} workerRole={worker.role} isAdmin={isAdmin} />
            ))}
          </div>
        </div>
      )}

      {/* PPE Allocations */}
      {(isAdmin || (ppeAllocations && ppeAllocations.length > 0)) && (
        <div className="border rounded-xl bg-card overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-sm">
                PPE Allocation ({(ppeAllocations ?? []).filter(a => !a.returnedAt).length} active)
              </h2>
            </div>
            {isAdmin && (
              <Button
                size="sm" variant="outline"
                onClick={() => { setIssueForm({ ppeTypeId: "", siteId: "", issuedAt: today, sizeSpec: "", notes: "" }); setShowIssuePPE(true); }}
                data-testid="button-issue-ppe"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Issue PPE
              </Button>
            )}
          </div>

          {!ppeAllocations || ppeAllocations.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">No PPE issued to this worker yet.</div>
          ) : (
            <div className="divide-y">
              {/* Active items first */}
              {ppeAllocations.filter(a => !a.returnedAt).map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{a.ppeType.name}</p>
                    <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Issued {new Date(`${a.issuedAt}T00:00:00`).toLocaleDateString("en-GB")}
                      </span>
                      {a.site && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{a.site.name}</span>}
                      {a.sizeSpec && <span>Size/Spec: {a.sizeSpec}</span>}
                      {a.issuedByUser && <span>By {a.issuedByUser.displayName}</span>}
                      {a.notes && <span className="italic">{a.notes}</span>}
                    </div>
                  </div>
                  <span className="text-[10px] border border-emerald-400 text-emerald-600 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">Active</span>
                  {isAdmin && (
                    <Button
                      size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-foreground flex-shrink-0"
                      title="Mark as returned"
                      onClick={() => returnPPEMutation.mutate(a.id)}
                      disabled={returnPPEMutation.isPending}
                      data-testid={`button-return-ppe-${a.id}`}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" /> Return
                    </Button>
                  )}
                </div>
              ))}
              {/* Returned items */}
              {ppeAllocations.filter(a => !!a.returnedAt).map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-3 opacity-60">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm line-through">{a.ppeType.name}</p>
                    <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Issued {new Date(`${a.issuedAt}T00:00:00`).toLocaleDateString("en-GB")}
                      </span>
                      {a.returnedAt && (
                        <span className="flex items-center gap-1">
                          <RotateCcw className="h-3 w-3" /> Returned {new Date(`${a.returnedAt}T00:00:00`).toLocaleDateString("en-GB")}
                        </span>
                      )}
                      {a.site && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{a.site.name}</span>}
                      {a.sizeSpec && <span>Size/Spec: {a.sizeSpec}</span>}
                    </div>
                  </div>
                  <span className="text-[10px] border text-muted-foreground px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">Returned</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Role History */}
      {isAdmin && (
        <div className="border rounded-xl bg-card overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-sm">Role History ({(roleHistory ?? []).length})</h2>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setRoleHistoryForm(blankRoleForm); setShowAddRole(true); }}
              data-testid="button-add-role-history"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add role
            </Button>
          </div>

          {!roleHistory || roleHistory.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No role history recorded. Click "Add role" to start tracking this worker's career progression.
            </div>
          ) : (
            <div className="divide-y">
              {roleHistory.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{entry.roleNameSnapshot}</p>
                    <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(`${entry.startDate}T00:00:00`).toLocaleDateString("en-GB")}
                        {entry.endDate
                          ? <> → {new Date(`${entry.endDate}T00:00:00`).toLocaleDateString("en-GB")}</>
                          : <> → <span className="text-emerald-600 font-medium">Current</span></>
                        }
                      </span>
                      {entry.notes && <span className="italic">{entry.notes}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {entry.source === "manual" && (
                      <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-600 bg-blue-50">
                        Manual
                      </Badge>
                    )}
                    {entry.source === "cv_ai" && (
                      <Badge variant="outline" className="text-[10px] border-violet-300 text-violet-600 bg-violet-50">
                        CV
                      </Badge>
                    )}
                    {!entry.endDate && (
                      <Badge variant="outline" className="text-[10px] border-emerald-400 text-emerald-600">
                        Current
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-primary"
                      onClick={() => {
                        setRoleHistoryForm({
                          roleId: entry.roleId ? String(entry.roleId) : "",
                          startDate: entry.startDate,
                          endDate: entry.endDate ?? "",
                          notes: entry.notes ?? "",
                          closeOpenEntry: false,
                        });
                        setEditingRole(entry);
                      }}
                      data-testid={`button-edit-role-${entry.id}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteRoleMutation.mutate(entry.id)}
                      disabled={deleteRoleMutation.isPending}
                      data-testid={`button-delete-role-${entry.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Role History Dialog */}
      <Dialog open={showAddRole} onOpenChange={(o) => { setShowAddRole(o); if (!o) setRoleHistoryForm(blankRoleForm); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Role Entry</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Role *</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                value={roleHistoryForm.roleId}
                onChange={(e) => setRoleHistoryForm((f) => ({ ...f, roleId: e.target.value }))}
              >
                <option value="">— Select role —</option>
                {(roles ?? []).map((r) => (
                  <option key={r.id} value={String(r.id)}>{r.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start date *</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={roleHistoryForm.startDate}
                  onChange={(e) => setRoleHistoryForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div>
                <Label>End date <span className="text-muted-foreground text-xs">(blank = current)</span></Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={roleHistoryForm.endDate}
                  onChange={(e) => setRoleHistoryForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Input
                className="mt-1"
                value={roleHistoryForm.notes}
                onChange={(e) => setRoleHistoryForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={roleHistoryForm.closeOpenEntry}
                onChange={(e) => setRoleHistoryForm((f) => ({ ...f, closeOpenEntry: e.target.checked }))}
              />
              Automatically close current open role entry
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddRole(false)}>Cancel</Button>
            <Button
              onClick={() => addRoleMutation.mutate()}
              disabled={!roleHistoryForm.roleId || !roleHistoryForm.startDate || addRoleMutation.isPending}
              data-testid="button-save-role-history"
            >
              {addRoleMutation.isPending ? "Saving…" : "Add Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Role History Dialog */}
      <Dialog open={!!editingRole} onOpenChange={(o) => { if (!o) setEditingRole(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Role Entry</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start date *</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={roleHistoryForm.startDate}
                  onChange={(e) => setRoleHistoryForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div>
                <Label>End date <span className="text-muted-foreground text-xs">(blank = current)</span></Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={roleHistoryForm.endDate}
                  onChange={(e) => setRoleHistoryForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Input
                className="mt-1"
                value={roleHistoryForm.notes}
                onChange={(e) => setRoleHistoryForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRole(null)}>Cancel</Button>
            <Button
              onClick={() => editingRole && editRoleMutation.mutate(editingRole.id)}
              disabled={!roleHistoryForm.startDate || editRoleMutation.isPending}
              data-testid="button-save-role-history-edit"
            >
              {editRoleMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <div>
              <Label>Site Assignments</Label>
              {worker?.assignments && worker.assignments.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
                  {worker.assignments.filter(a => a.status === "active" || a.status === "pending").map((a) => (
                    <span key={a.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                      <Building2 className="h-3 w-3" /> {a.site.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-1 mb-2">No site assignments yet.</p>
              )}
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={editForm.newSiteId}
                onChange={(e) => setEditForm({ ...editForm, newSiteId: e.target.value })}
                data-testid="select-edit-site"
              >
                <option value="">Add to a site… (optional)</option>
                {allSites
                  ?.filter(s => !worker?.assignments.some(a => a.site.id === s.id && (a.status === "active" || a.status === "pending")))
                  .map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
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
      <Dialog open={showAddCert} onOpenChange={(open) => { setShowAddCert(open); if (!open) setCertForm({ certificationIds: [], dateAchieved: "", expiryDate: "", verified: false }); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Certifications</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="mb-1 block">Certifications *</Label>
              {(() => {
                const existingIds = new Set((worker?.certifications ?? []).map((wc) => wc.certificationId));
                const available = (allCerts ?? []).filter((c) => !existingIds.has(c.id));
                return available.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">All certifications have already been added.</p>
                ) : (
                  <div className="max-h-52 overflow-y-auto border rounded-md divide-y">
                    {available.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30 select-none"
                        data-testid={`checkbox-add-cert-worker-${c.id}`}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary"
                          checked={certForm.certificationIds.includes(c.id)}
                          onChange={() => toggleCertFormId(c.id)}
                          data-testid={`select-certification`}
                        />
                        <span className="flex-1 text-sm font-medium">{c.name}</span>
                        {c.category && <span className="text-xs text-muted-foreground">{c.category}</span>}
                      </label>
                    ))}
                  </div>
                );
              })()}
            </div>
            <p className="text-xs text-muted-foreground -mt-1">These dates and status apply to all selected certifications.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date Achieved</Label>
                <Input type="date" value={certForm.dateAchieved} onChange={(e) => setCertForm({ ...certForm, dateAchieved: e.target.value })} />
              </div>
              <div>
                {(() => {
                  const singleCert = certForm.certificationIds.length === 1
                    ? (allCerts ?? []).find(c => c.id === certForm.certificationIds[0])
                    : undefined;
                  const isAuto = singleCert?.autoCalculateExpiry && !!singleCert.validityMonths && !!certForm.dateAchieved;
                  return (
                    <>
                      <Label className="flex items-center gap-1">
                        Expiry Date
                        {isAuto && <span className="text-[10px] font-normal text-amber-600 bg-amber-50 border border-amber-200 rounded px-1">auto</span>}
                      </Label>
                      <Input type="date" value={certForm.expiryDate} onChange={(e) => setCertForm({ ...certForm, expiryDate: e.target.value })} readOnly={!!isAuto} className={isAuto ? "bg-muted/40" : ""} />
                    </>
                  );
                })()}
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
              disabled={certForm.certificationIds.length === 0 || addCertMutation.isPending}
              data-testid="button-save-cert"
            >
              {addCertMutation.isPending
                ? "Saving…"
                : certForm.certificationIds.length > 0
                  ? `Add ${certForm.certificationIds.length} Cert${certForm.certificationIds.length !== 1 ? "s" : ""}`
                  : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Issue PPE dialog */}
      <Dialog open={showIssuePPE} onOpenChange={(open) => { if (!open) setShowIssuePPE(false); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Issue PPE — {worker.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>PPE Type *</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                value={issueForm.ppeTypeId}
                onChange={(e) => setIssueForm({ ...issueForm, ppeTypeId: e.target.value })}
                data-testid="select-ppe-type"
              >
                <option value="">Choose a PPE type…</option>
                {(ppeTypes ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {!ppeTypes?.length && (
                <p className="text-xs text-amber-600 mt-1">No PPE types defined. Add them in the PPE Types settings page first.</p>
              )}
            </div>
            <div>
              <Label>Issue Date *</Label>
              <input
                type="date"
                className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                value={issueForm.issuedAt}
                onChange={(e) => setIssueForm({ ...issueForm, issuedAt: e.target.value })}
                data-testid="input-ppe-issued-at"
              />
            </div>
            <div>
              <Label>Site (optional)</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                value={issueForm.siteId}
                onChange={(e) => setIssueForm({ ...issueForm, siteId: e.target.value })}
              >
                <option value="">No site linked</option>
                {(worker.assignments ?? [])
                  .filter(a => a.status === "active" || a.status === "pending")
                  .map((a) => (
                    <option key={a.site.id} value={a.site.id}>{a.site.name}</option>
                  ))}
              </select>
            </div>
            <div>
              <Label>Size / Spec</Label>
              <input
                type="text"
                className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                value={issueForm.sizeSpec}
                onChange={(e) => setIssueForm({ ...issueForm, sizeSpec: e.target.value })}
                placeholder="e.g. Large, Size 10, 42cm"
                data-testid="input-ppe-size-spec"
              />
            </div>
            <div>
              <Label>Notes</Label>
              <input
                type="text"
                className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                value={issueForm.notes}
                onChange={(e) => setIssueForm({ ...issueForm, notes: e.target.value })}
                placeholder="Optional notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowIssuePPE(false)}>Cancel</Button>
            <Button
              onClick={() => issuePPEMutation.mutate()}
              disabled={!issueForm.ppeTypeId || !issueForm.issuedAt || issuePPEMutation.isPending}
              data-testid="button-confirm-issue-ppe"
            >
              {issuePPEMutation.isPending ? "Issuing…" : "Issue PPE"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit cert dialog */}
      <Dialog open={!!editingCert} onOpenChange={(open) => { if (!open) setEditingCert(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Certification — {editingCert?.certification.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date Achieved</Label>
                <Input
                  type="date"
                  value={certEditForm.dateAchieved}
                  onChange={(e) => setCertEditForm({ ...certEditForm, dateAchieved: e.target.value })}
                />
              </div>
              <div>
                <Label>Expiry Date</Label>
                <Input
                  type="date"
                  value={certEditForm.expiryDate}
                  onChange={(e) => setCertEditForm({ ...certEditForm, expiryDate: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Certificate File</Label>
              {certEditForm.fileUrl ? (
                <div className="mt-1 flex items-center gap-2 rounded-md border px-3 py-2 text-sm bg-muted/40">
                  <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="flex-1 truncate text-muted-foreground">
                    {certEditForm.fileUrl.startsWith("http")
                      ? certEditForm.fileUrl
                      : certEditForm.fileUrl.split("/").pop()}
                  </span>
                  <a
                    href={
                      certEditForm.fileUrl.startsWith("http")
                        ? certEditForm.fileUrl
                        : editingCert
                          ? `${BASE}/api/workforce/workers/${workerId}/certifications/${editingCert.certificationId}/file`
                          : "#"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary text-xs hover:underline flex-shrink-0"
                  >
                    View
                  </a>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive flex-shrink-0"
                    onClick={() => setCertEditForm((f) => ({ ...f, fileUrl: "" }))}
                    title="Remove file"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="mt-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleCertFileUpload(file);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={fileUploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {fileUploading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…</>
                    ) : (
                      <><Paperclip className="h-4 w-4 mr-2" /> Attach file</>
                    )}
                  </Button>
                </div>
              )}
            </div>
            <div>
              <Label>Notes</Label>
              <Input
                value={certEditForm.notes}
                onChange={(e) => setCertEditForm({ ...certEditForm, notes: e.target.value })}
                placeholder="Optional notes"
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={certEditForm.verified}
                onChange={(e) => setCertEditForm({ ...certEditForm, verified: e.target.checked })}
              />
              Verified
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCert(null)}>Cancel</Button>
            <Button
              onClick={() => editingCert && updateCertMutation.mutate(editingCert.certificationId)}
              disabled={updateCertMutation.isPending}
              data-testid="button-save-cert-edit"
            >
              {updateCertMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Portal Credentials Dialog */}
      <Dialog open={showPortalCreds} onOpenChange={setShowPortalCreds}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Portal Access</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Username <span className="text-muted-foreground font-normal">(optional — can use email to log in)</span></Label>
              <Input
                value={portalCredsForm.portalUsername}
                onChange={(e) => setPortalCredsForm((f) => ({ ...f, portalUsername: e.target.value }))}
                placeholder="e.g. john.smith"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label>New password</Label>
              <Input
                type="password"
                value={portalCredsForm.password}
                onChange={(e) => setPortalCredsForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Minimum 8 characters"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm password</Label>
              <Input
                type="password"
                value={portalCredsForm.confirm}
                onChange={(e) => setPortalCredsForm((f) => ({ ...f, confirm: e.target.value }))}
                placeholder="Re-enter password"
                autoComplete="new-password"
              />
            </div>
            {portalCredsForm.password && portalCredsForm.confirm && portalCredsForm.password !== portalCredsForm.confirm && (
              <p className="text-xs text-destructive">Passwords do not match</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPortalCreds(false)}>Cancel</Button>
            <Button
              disabled={
                !portalCredsForm.password ||
                portalCredsForm.password.length < 8 ||
                portalCredsForm.password !== portalCredsForm.confirm ||
                setPortalCredsMutation.isPending
              }
              onClick={() => setPortalCredsMutation.mutate()}
              data-testid="button-save-portal-creds"
            >
              {setPortalCredsMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving…</> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject certification dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => { if (!open) { setRejectTarget(null); setRejectComment(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject certification</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              Rejecting <span className="font-medium text-foreground">{rejectTarget?.certification.name}</span> will
              notify the worker that action is required. A reason is required.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="reject-comment">
                Reason <span className="text-red-500">*</span>
              </Label>
              <textarea
                id="reject-comment"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                rows={3}
                placeholder="e.g. Document is unreadable, please re-upload"
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectComment(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={rejectCertMutation.isPending || !rejectComment.trim()}
              onClick={() => rejectTarget && rejectCertMutation.mutate({ certId: rejectTarget.certificationId, comment: rejectComment })}
            >
              {rejectCertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
