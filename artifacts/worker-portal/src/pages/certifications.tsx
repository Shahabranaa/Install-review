import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiUpload, apiUploadPatch, apiDelete } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Award,
  Plus,
  Pencil,
  Trash2,
  Paperclip,
  CheckCircle2,
  XCircle,
  Clock,
  HelpCircle,
  Loader2,
  AlertTriangle,
  CheckCheck,
  Building2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface CertType {
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
  fileUrl: string | null;
  notes: string | null;
  certification: CertType;
}

type CertStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "NOT_VERIFIED" | "MISSING";
type SiteOverallStatus = "READY" | "EXPIRING_SOON" | "NOT_COMPLIANT" | "NO_REQUIREMENTS" | "AWAITING_REVIEW";

interface ComplianceItem {
  certId: number;
  certName: string;
  category: string | null;
  status: CertStatus;
  expiryDate: string | null;
  daysUntilExpiry: number | null;
  verified: boolean;
}

interface SiteCompliance {
  siteId: number;
  siteName: string;
  overallStatus: SiteOverallStatus;
  requiredCount: number;
  validCount: number;
  expiringCount: number;
  missingCount: number;
  awaitingReviewCount: number;
  items: ComplianceItem[];
}

interface ComplianceResponse {
  sites: SiteCompliance[];
}

function certStatusInfo(wc: WorkerCert): {
  status: CertStatus;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  badgeClass: string;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in30 = new Date(today);
  in30.setDate(in30.getDate() + 30);

  if (!wc.expiryDate) {
    return wc.verified
      ? { status: "VALID", label: "Valid", icon: CheckCircle2, color: "text-emerald-500", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" }
      : { status: "NOT_VERIFIED", label: "Pending verification", icon: HelpCircle, color: "text-orange-500", badgeClass: "bg-orange-50 text-orange-700 border-orange-200" };
  }
  const exp = new Date(wc.expiryDate);
  exp.setHours(0, 0, 0, 0);
  if (exp < today)
    return { status: "EXPIRED", label: "Expired", icon: XCircle, color: "text-red-500", badgeClass: "bg-red-50 text-red-700 border-red-200" };
  if (exp <= in30)
    return { status: "EXPIRING_SOON", label: "Expiring soon", icon: Clock, color: "text-amber-500", badgeClass: "bg-amber-50 text-amber-700 border-amber-200" };
  return { status: "VALID", label: "Valid", icon: CheckCircle2, color: "text-emerald-500", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

function complianceItemBadge(status: CertStatus): { label: string; cls: string } {
  switch (status) {
    case "MISSING":    return { label: "Missing",          cls: "bg-red-50 text-red-700 border-red-200" };
    case "EXPIRED":    return { label: "Expired",          cls: "bg-red-50 text-red-700 border-red-200" };
    case "NOT_VERIFIED": return { label: "Awaiting review", cls: "bg-orange-50 text-orange-700 border-orange-200" };
    case "EXPIRING_SOON": return { label: "Expiring soon", cls: "bg-amber-50 text-amber-700 border-amber-200" };
    case "VALID":      return { label: "Valid",            cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  }
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

interface CertFormState {
  certificationId: string;
  dateAchieved: string;
  expiryDate: string;
  notes: string;
  file: File | null;
}

const EMPTY_FORM: CertFormState = {
  certificationId: "",
  dateAchieved: "",
  expiryDate: "",
  notes: "",
  file: null,
};

export default function CertificationsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [form, setForm] = useState<CertFormState>(EMPTY_FORM);
  const [editTarget, setEditTarget] = useState<WorkerCert | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkerCert | null>(null);
  const [expandedSites, setExpandedSites] = useState<Set<number>>(new Set<number>());

  const certsQ = useQuery<WorkerCert[]>({
    queryKey: ["worker-certs"],
    queryFn: () => apiFetch("/api/worker-portal/certifications"),
  });

  const typesQ = useQuery<CertType[]>({
    queryKey: ["cert-types"],
    queryFn: () => apiFetch("/api/worker-portal/cert-types"),
    staleTime: 5 * 60 * 1000,
  });

  const complianceQ = useQuery<ComplianceResponse>({
    queryKey: ["worker-compliance"],
    queryFn: () => apiFetch("/api/worker-portal/compliance"),
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (!complianceQ.data) return;
    const issueIds = complianceQ.data.sites
      .filter((s) => s.overallStatus === "NOT_COMPLIANT" || s.overallStatus === "EXPIRING_SOON")
      .map((s) => s.siteId);
    if (issueIds.length > 0) {
      setExpandedSites(new Set(issueIds));
    }
  }, [complianceQ.data]);

  function buildFormData(f: CertFormState) {
    const fd = new FormData();
    fd.append("certificationId", f.certificationId);
    if (f.dateAchieved) fd.append("dateAchieved", f.dateAchieved);
    if (f.expiryDate) fd.append("expiryDate", f.expiryDate);
    if (f.notes) fd.append("notes", f.notes);
    if (f.file) fd.append("file", f.file);
    return fd;
  }

  const addMut = useMutation({
    mutationFn: (f: CertFormState) => apiUpload("/api/worker-portal/certifications", buildFormData(f)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker-certs"] });
      qc.invalidateQueries({ queryKey: ["worker-compliance"] });
      setAddOpen(false);
      setForm(EMPTY_FORM);
      toast({ title: "Certification added" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const editMut = useMutation({
    mutationFn: ({ id, f }: { id: number; f: CertFormState }) =>
      apiUploadPatch(`/api/worker-portal/certifications/${id}`, buildFormData(f)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker-certs"] });
      qc.invalidateQueries({ queryKey: ["worker-compliance"] });
      setEditOpen(false);
      setEditTarget(null);
      setForm(EMPTY_FORM);
      toast({ title: "Certification updated" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (certId: number) => apiDelete(`/api/worker-portal/certifications/${certId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker-certs"] });
      qc.invalidateQueries({ queryKey: ["worker-compliance"] });
      setDeleteOpen(false);
      setDeleteTarget(null);
      toast({ title: "Certification removed" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  function openEdit(wc: WorkerCert) {
    setEditTarget(wc);
    setForm({
      certificationId: String(wc.certificationId),
      dateAchieved: wc.dateAchieved ?? "",
      expiryDate: wc.expiryDate ?? "",
      notes: wc.notes ?? "",
      file: null,
    });
    setEditOpen(true);
  }

  function openDelete(wc: WorkerCert) {
    setDeleteTarget(wc);
    setDeleteOpen(true);
  }

  function openAddForCert(certId: number) {
    setForm({ ...EMPTY_FORM, certificationId: String(certId) });
    setAddOpen(true);
  }

  function toggleSite(siteId: number) {
    setExpandedSites((prev) => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId);
      else next.add(siteId);
      return next;
    });
  }

  const certs = certsQ.data ?? [];
  const certTypes = typesQ.data ?? [];
  const complianceSites = complianceQ.data?.sites ?? [];

  const grouped = certTypes.reduce<Record<string, CertType[]>>((acc, ct) => {
    const cat = ct.category ?? "Other";
    (acc[cat] ??= []).push(ct);
    return acc;
  }, {});

  const sitesWithIssues = complianceSites.filter(
    (s) => s.overallStatus === "NOT_COMPLIANT" || s.overallStatus === "EXPIRING_SOON",
  );
  const allReady =
    complianceSites.length > 0 &&
    complianceSites.every(
      (s) => s.overallStatus === "READY" || s.overallStatus === "NO_REQUIREMENTS",
    );
  // Worker has submitted everything but some certs are awaiting admin review
  const allSubmitted =
    !allReady &&
    complianceSites.length > 0 &&
    complianceSites.every(
      (s) =>
        s.overallStatus === "READY" ||
        s.overallStatus === "NO_REQUIREMENTS" ||
        s.overallStatus === "AWAITING_REVIEW",
    );

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* ── Compliance requirements section ── */}
        {complianceQ.isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : complianceSites.length > 0 ? (
          <section>
            <div className="flex items-center gap-2 mb-3">
              {sitesWithIssues.length > 0 ? (
                <AlertTriangle className="h-4 w-4 text-red-500" />
              ) : (
                <Building2 className="h-4 w-4 text-muted-foreground" />
              )}
              <h2 className={cn(
                "text-sm font-semibold uppercase tracking-wide",
                sitesWithIssues.length > 0
                  ? "text-red-600"
                  : "text-muted-foreground",
              )}>
                {sitesWithIssues.length > 0 ? "Action Required" : "Site Requirements"}
              </h2>
              {sitesWithIssues.length > 0 && (
                <span className="text-xs font-medium text-red-500">
                  — upload the certifications below to become compliant
                </span>
              )}
            </div>

            {allReady ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-3">
                <CheckCheck className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-emerald-800">All certifications up to date</p>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    You meet all requirements for your current site assignment{complianceSites.length > 1 ? "s" : ""}.
                  </p>
                </div>
              </div>
            ) : allSubmitted ? (
              <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 flex items-center gap-3">
                <Clock className="h-5 w-5 text-orange-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-orange-800">All certifications submitted</p>
                  <p className="text-xs text-orange-600 mt-0.5">
                    Your documents are awaiting review by an administrator.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {sitesWithIssues.map((site) => {
                  const isExpanded = expandedSites.has(site.siteId);
                  const isNotCompliant = site.overallStatus === "NOT_COMPLIANT";

                  return (
                    <div
                      key={site.siteId}
                      className={cn(
                        "rounded-xl border overflow-hidden",
                        isNotCompliant
                          ? "border-red-200 bg-red-50/40"
                          : "border-amber-200 bg-amber-50/40",
                      )}
                    >
                      {/* Site header */}
                      <button
                        type="button"
                        className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-black/[0.02] transition-colors"
                        onClick={() => toggleSite(site.siteId)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <AlertTriangle
                            className={cn(
                              "h-4 w-4 flex-shrink-0",
                              isNotCompliant ? "text-red-500" : "text-amber-500",
                            )}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{site.siteName}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {site.missingCount > 0 && (
                                <span className="text-red-600 font-medium">
                                  {site.missingCount} action{site.missingCount !== 1 ? "s" : ""} required
                                  {(site.expiringCount > 0 || site.awaitingReviewCount > 0) ? " · " : ""}
                                </span>
                              )}
                              {site.expiringCount > 0 && (
                                <span className="text-amber-600 font-medium">
                                  {site.expiringCount} expiring soon
                                  {site.awaitingReviewCount > 0 ? " · " : ""}
                                </span>
                              )}
                              {site.awaitingReviewCount > 0 && (
                                <span className="text-orange-600 font-medium">
                                  {site.awaitingReviewCount} awaiting review
                                </span>
                              )}
                              {" · "}
                              {site.validCount}/{site.requiredCount} complete
                            </p>
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-muted-foreground">
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </div>
                      </button>

                      {/* Cert item list */}
                      {isExpanded && (
                        <div className="border-t border-inherit divide-y divide-inherit">
                          {site.items.map((item) => {
                            const badge = complianceItemBadge(item.status);
                            const needsAction =
                              item.status === "MISSING" || item.status === "EXPIRED";
                            return (
                              <div
                                key={item.certId}
                                className="px-4 py-2.5 flex items-center justify-between gap-3 bg-white/60"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-medium">{item.certName}</span>
                                    {item.category && (
                                      <span className="text-[10px] text-muted-foreground bg-muted/70 rounded px-1.5 py-0.5">
                                        {item.category}
                                      </span>
                                    )}
                                  </div>
                                  {item.expiryDate && item.status !== "MISSING" && (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {item.status === "EXPIRED"
                                        ? `Expired ${formatDate(item.expiryDate)}`
                                        : item.daysUntilExpiry !== null
                                        ? `Expires in ${item.daysUntilExpiry} day${item.daysUntilExpiry !== 1 ? "s" : ""}`
                                        : `Expires ${formatDate(item.expiryDate)}`}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span
                                    className={cn(
                                      "text-xs font-medium px-2 py-0.5 rounded-full border",
                                      badge.cls,
                                    )}
                                  >
                                    {badge.label}
                                  </span>
                                  {needsAction && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs px-2.5 border-red-300 text-red-700 hover:bg-red-50 hover:border-red-400"
                                      onClick={() => openAddForCert(item.certId)}
                                    >
                                      <Plus className="h-3 w-3 mr-1" />
                                      Add
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Sites that are READY (collapsed summary) */}
                {complianceSites
                  .filter((s) => s.overallStatus === "READY")
                  .map((site) => (
                    <div
                      key={site.siteId}
                      className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-2.5 flex items-center gap-3"
                    >
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{site.siteName}</p>
                        <p className="text-xs text-emerald-600">All {site.requiredCount} certifications valid</p>
                      </div>
                    </div>
                  ))}
                {/* Sites where all certs submitted but awaiting admin review */}
                {complianceSites
                  .filter((s) => s.overallStatus === "AWAITING_REVIEW")
                  .map((site) => (
                    <div
                      key={site.siteId}
                      className="rounded-xl border border-orange-200 bg-orange-50/50 px-4 py-2.5 flex items-center gap-3"
                    >
                      <Clock className="h-4 w-4 text-orange-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{site.siteName}</p>
                        <p className="text-xs text-orange-600">
                          {site.awaitingReviewCount} cert{site.awaitingReviewCount !== 1 ? "s" : ""} awaiting admin review
                          {" · "}{site.validCount}/{site.requiredCount} complete
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </section>
        ) : null}

        {/* ── My Certifications ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">My Certifications</h1>
              {certsQ.data && (
                <span className="text-sm text-muted-foreground">({certs.length})</span>
              )}
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => { setForm(EMPTY_FORM); setAddOpen(true); }}>
              <Plus className="h-4 w-4" />
              Add certification
            </Button>
          </div>

          {certsQ.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : certs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Award className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No certifications yet</p>
              <p className="text-sm mt-1">Add your first certification to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {certs.map((wc) => {
                const { label, icon: Icon, color, badgeClass } = certStatusInfo(wc);
                return (
                  <div
                    key={wc.certificationId}
                    className="rounded-xl border bg-card p-4 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="font-medium text-sm">{wc.certification.name}</span>
                        {wc.certification.category && (
                          <span className="text-[11px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                            {wc.certification.category}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                        {wc.dateAchieved && (
                          <span>Achieved: {formatDate(wc.dateAchieved)}</span>
                        )}
                        {wc.expiryDate && (
                          <span>Expires: {formatDate(wc.expiryDate)}</span>
                        )}
                      </div>

                      {wc.notes && (
                        <p className="text-xs text-muted-foreground mt-1.5 truncate">{wc.notes}</p>
                      )}

                      <div className="flex items-center gap-2 mt-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border",
                            badgeClass,
                          )}
                        >
                          <Icon className={cn("h-3 w-3", color)} />
                          {label}
                        </span>

                        {wc.fileUrl && (
                          <a
                            href={`${BASE}/api/worker-portal/certifications/${wc.certificationId}/file`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <Paperclip className="h-3 w-3" />
                            View document
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(wc)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => openDelete(wc)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add certification</DialogTitle>
          </DialogHeader>
          <CertForm
            form={form}
            setForm={setForm}
            grouped={grouped}
            fileRef={fileRef}
            lockType={false}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              disabled={!form.certificationId || addMut.isPending}
              onClick={() => addMut.mutate(form)}
            >
              {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit certification</DialogTitle>
          </DialogHeader>
          <CertForm
            form={form}
            setForm={setForm}
            grouped={grouped}
            fileRef={fileRef}
            lockType
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              disabled={editMut.isPending}
              onClick={() => {
                if (editTarget) editMut.mutate({ id: editTarget.certificationId, f: form });
              }}
            >
              {editMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove certification</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to remove{" "}
            <span className="font-medium text-foreground">
              {deleteTarget?.certification.name}
            </span>
            ? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => {
                if (deleteTarget) deleteMut.mutate(deleteTarget.certificationId);
              }}
            >
              {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface CertFormProps {
  form: CertFormState;
  setForm: React.Dispatch<React.SetStateAction<CertFormState>>;
  grouped: Record<string, CertType[]>;
  fileRef: React.RefObject<HTMLInputElement | null>;
  lockType: boolean;
}

function CertForm({ form, setForm, grouped, fileRef, lockType }: CertFormProps) {
  const allCertTypes = Object.values(grouped).flat();
  const selectedCert = allCertTypes.find(ct => String(ct.id) === form.certificationId);
  const isAutoExpiry = selectedCert?.autoCalculateExpiry && !!selectedCert.validityMonths && !!form.dateAchieved;

  useEffect(() => {
    if (!isAutoExpiry || !selectedCert?.validityMonths || !form.dateAchieved) return;
    const achieved = new Date(form.dateAchieved);
    if (isNaN(achieved.getTime())) return;
    achieved.setMonth(achieved.getMonth() + selectedCert.validityMonths);
    const newExpiry = achieved.toISOString().split("T")[0];
    setForm(f => ({ ...f, expiryDate: newExpiry }));
  }, [form.certificationId, form.dateAchieved]);

  return (
    <div className="space-y-3 py-1">
      <div className="space-y-1.5">
        <Label>Certification type</Label>
        {lockType ? (
          <Input
            disabled
            value={
              Object.values(grouped)
                .flat()
                .find((ct) => String(ct.id) === form.certificationId)?.name ?? form.certificationId
            }
          />
        ) : (
          <Select
            value={form.certificationId}
            onValueChange={(v) => setForm((f) => ({ ...f, certificationId: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a certification…" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(grouped).map(([cat, items]) => (
                <div key={cat}>
                  <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    {cat}
                  </div>
                  {items.map((ct) => (
                    <SelectItem key={ct.id} value={String(ct.id)}>
                      {ct.name}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Date achieved</Label>
          <Input
            type="date"
            value={form.dateAchieved}
            onChange={(e) => setForm((f) => ({ ...f, dateAchieved: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1">
            Expiry date
            {isAutoExpiry && <span className="text-[10px] font-normal text-amber-600 bg-amber-50 border border-amber-200 rounded px-1">auto</span>}
          </Label>
          <Input
            type="date"
            value={form.expiryDate}
            onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
            readOnly={!!isAutoExpiry}
            className={isAutoExpiry ? "bg-muted/40" : ""}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Input
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Any relevant notes…"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Supporting document <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <div
          className="border border-dashed rounded-lg px-4 py-3 text-sm text-muted-foreground cursor-pointer hover:border-primary/50 transition-colors text-center"
          onClick={() => fileRef.current?.click()}
        >
          {form.file ? (
            <span className="text-foreground font-medium">{form.file.name}</span>
          ) : (
            <span className="flex items-center justify-center gap-1.5">
              <Paperclip className="h-4 w-4" />
              Click to attach a file
            </span>
          )}
        </div>
        <input
          ref={fileRef as React.RefObject<HTMLInputElement>}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setForm((prev) => ({ ...prev, file: f }));
          }}
        />
      </div>
    </div>
  );
}
