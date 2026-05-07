import { useState, useRef } from "react";
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
  Paperclip, X as XIcon, Loader2, KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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
  portalUsername: string | null;
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
  const [editForm, setEditForm] = useState({ name: "", email: "", company: "", windaId: "", notes: "", roleId: "", newSiteId: "" });
  const [fileUploading, setFileUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cardUploadingCertId, setCardUploadingCertId] = useState<number | null>(null);
  const [verifyingCertIds, setVerifyingCertIds] = useState<Set<number>>(new Set());
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

  const { data: roles } = useQuery<Role[]>({
    queryKey: ["workforce-roles"],
    queryFn: () => apiFetch<Role[]>("/api/workforce/roles"),
  });

  const { data: allSites } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["workforce-sites"],
    queryFn: () => apiFetch<{ id: number; name: string }[]>("/api/workforce/sites"),
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

      {/* Site Assignments */}
      {worker.assignments.length > 0 && (
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
                {worker.role && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    {worker.role.name}
                  </Badge>
                )}
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
    </div>
  );
}
