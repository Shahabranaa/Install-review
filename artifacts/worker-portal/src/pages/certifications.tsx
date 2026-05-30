import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiUpload, apiUploadPatch, apiDelete } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  rejected: boolean;
  rejectionComment: string | null;
  fileUrl: string | null;
  notes: string | null;
  certification: CertType;
}

type CertStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "NOT_VERIFIED" | "MISSING" | "REQUIRES_ACTION";
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
  const red = { status: "REQUIRES_ACTION" as CertStatus, color: "text-red-500", badgeClass: "bg-red-50 text-red-700 border-red-200" };

  if (wc.rejected)
    return { ...red, label: "Rejected", icon: XCircle };
  if (!wc.fileUrl)
    return { ...red, label: "Upload required", icon: AlertTriangle };
  if (!wc.dateAchieved)
    return { ...red, label: "Date required", icon: AlertTriangle };
  if (!wc.expiryDate && wc.certification.validityMonths)
    return { ...red, label: "Expiry date required", icon: AlertTriangle };

  if (wc.expiryDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30 = new Date(today);
    in30.setDate(in30.getDate() + 30);
    const exp = new Date(wc.expiryDate);
    exp.setHours(0, 0, 0, 0);
    if (exp < today)
      return { status: "EXPIRED", label: "Expired", icon: XCircle, color: "text-red-500", badgeClass: "bg-red-50 text-red-700 border-red-200" };
    if (exp <= in30)
      return { status: "EXPIRING_SOON", label: "Expiring soon", icon: Clock, color: "text-amber-500", badgeClass: "bg-amber-50 text-amber-700 border-amber-200" };
  }

  if (!wc.verified)
    return { status: "NOT_VERIFIED", label: "Pending verification", icon: HelpCircle, color: "text-orange-500", badgeClass: "bg-orange-50 text-orange-700 border-orange-200" };
  return { status: "VALID", label: "Valid", icon: CheckCircle2, color: "text-emerald-500", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

const STATUS_SORT_ORDER: Record<CertStatus, number> = {
  REQUIRES_ACTION: 0,
  EXPIRED: 1,
  EXPIRING_SOON: 2,
  NOT_VERIFIED: 3,
  MISSING: 4,
  VALID: 5,
};

function complianceItemBadge(status: CertStatus): { label: string; cls: string } {
  switch (status) {
    case "REQUIRES_ACTION": return { label: "Requires action", cls: "bg-red-50 text-red-700 border-red-200" };
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
  noExpiry: boolean;
  notes: string;
  file: File | null;
}

const EMPTY_FORM: CertFormState = {
  certificationId: "",
  dateAchieved: "",
  expiryDate: "",
  noExpiry: false,
  notes: "",
  file: null,
};

export default function CertificationsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const inlineFileRef = useRef<HTMLInputElement>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [form, setForm] = useState<CertFormState>(EMPTY_FORM);
  const [editTarget, setEditTarget] = useState<WorkerCert | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkerCert | null>(null);
  const [inlineAddKey, setInlineAddKey] = useState<string | null>(null);
  const [inlineForm, setInlineForm] = useState({ dateAchieved: "", expiryDate: "", noExpiry: false, notes: "", file: null as File | null });

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
      setInlineAddKey(null);
      setInlineForm({ dateAchieved: "", expiryDate: "", noExpiry: false, notes: "", file: null });
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
      noExpiry: !wc.expiryDate,
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

  function toggleInlineForm(rowKey: string) {
    if (inlineAddKey === rowKey) {
      setInlineAddKey(null);
    } else {
      setInlineAddKey(rowKey);
      setInlineForm({ dateAchieved: "", expiryDate: "", noExpiry: false, notes: "", file: null });
    }
  }

  function submitInline(certId: number) {
    addMut.mutate({
      certificationId: String(certId),
      dateAchieved: inlineForm.dateAchieved,
      expiryDate: inlineForm.noExpiry ? "" : inlineForm.expiryDate,
      noExpiry: inlineForm.noExpiry,
      notes: inlineForm.notes,
      file: inlineForm.file,
    });
  }

  const certs = [...(certsQ.data ?? [])].sort(
    (a, b) => STATUS_SORT_ORDER[certStatusInfo(a).status] - STATUS_SORT_ORDER[certStatusInfo(b).status],
  );
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
                  const isNotCompliant = site.overallStatus === "NOT_COMPLIANT";
                  // Show all items that aren't fully valid — MISSING, EXPIRED, NOT_VERIFIED, EXPIRING_SOON
                  const visibleItems = site.items.filter((i) => i.status !== "VALID");

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
                      {/* Site header — non-interactive, always visible */}
                      <div className="px-4 py-3 flex items-center gap-3">
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

                      {/* Cert items — always visible, no expand needed */}
                      {visibleItems.length > 0 && (
                        <div className="border-t border-inherit divide-y divide-inherit">
                          {visibleItems.map((item) => {
                            const badge = complianceItemBadge(item.status);
                            const needsAction =
                              item.status === "MISSING" || item.status === "EXPIRED";
                            const rowKey = `${site.siteId}:${item.certId}`;
                            const isOpen = inlineAddKey === rowKey;
                            return (
                              <div key={rowKey}>
                                {/* Row header */}
                                <div className="px-4 py-2.5 flex items-center justify-between gap-3 bg-white/60">
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
                                      <button
                                        type="button"
                                        onClick={() => toggleInlineForm(rowKey)}
                                        className={cn(
                                          "h-7 w-7 flex items-center justify-center rounded border transition-colors",
                                          isOpen
                                            ? "border-blue-300 bg-blue-50 text-blue-600 hover:bg-blue-100"
                                            : "border-red-300 text-red-600 hover:bg-red-50",
                                        )}
                                        aria-label={isOpen ? "Collapse form" : "Add certification"}
                                      >
                                        <ChevronDown
                                          className={cn("h-4 w-4 transition-transform duration-200", isOpen && "rotate-180")}
                                        />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Inline form */}
                                {isOpen && (
                                  <form
                                    onSubmit={(e) => { e.preventDefault(); submitInline(item.certId); }}
                                    className="px-4 pt-3 pb-4 bg-slate-50 border-t border-slate-200 space-y-3"
                                  >
                                    {/* Dates row — side by side */}
                                    <div className="grid grid-cols-2 gap-3">
                                      <div className="space-y-1">
                                        <Label className="text-xs">Date achieved *</Label>
                                        <Input
                                          type="date"
                                          className="h-8 text-sm"
                                          value={inlineForm.dateAchieved}
                                          onChange={(e) => setInlineForm((f) => ({ ...f, dateAchieved: e.target.value }))}
                                          required
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <div className="flex items-center justify-between gap-1">
                                          <Label className="text-xs">Expiry date</Label>
                                          <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer select-none">
                                            <input
                                              type="checkbox"
                                              className="h-3 w-3 rounded"
                                              checked={inlineForm.noExpiry}
                                              onChange={(e) =>
                                                setInlineForm((f) => ({ ...f, noExpiry: e.target.checked, expiryDate: e.target.checked ? "" : f.expiryDate }))
                                              }
                                            />
                                            No expiry
                                          </label>
                                        </div>
                                        {!inlineForm.noExpiry && (
                                          <Input
                                            type="date"
                                            className="h-8 text-sm"
                                            value={inlineForm.expiryDate}
                                            onChange={(e) => setInlineForm((f) => ({ ...f, expiryDate: e.target.value }))}
                                          />
                                        )}
                                      </div>
                                    </div>
                                    {/* File — full width */}
                                    <div className="space-y-1">
                                      <Label className="text-xs">Supporting document</Label>
                                      <button
                                        type="button"
                                        onClick={() => inlineFileRef.current?.click()}
                                        className="w-full h-8 flex items-center gap-2 px-3 rounded-md border border-dashed border-slate-300 bg-white text-xs text-muted-foreground hover:border-slate-400 hover:bg-slate-50 transition-colors"
                                      >
                                        <Paperclip className="h-3.5 w-3.5 flex-shrink-0" />
                                        <span className="truncate flex-1 text-left">
                                          {inlineForm.file ? inlineForm.file.name : "Click to attach a file"}
                                        </span>
                                        {inlineForm.file && (
                                          <span
                                            className="text-muted-foreground hover:text-destructive flex-shrink-0"
                                            onClick={(e) => { e.stopPropagation(); setInlineForm((f) => ({ ...f, file: null })); if (inlineFileRef.current) inlineFileRef.current.value = ""; }}
                                          >
                                            ×
                                          </span>
                                        )}
                                      </button>
                                      <input
                                        ref={inlineFileRef}
                                        type="file"
                                        className="hidden"
                                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                                        onChange={(e) => setInlineForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))}
                                      />
                                    </div>
                                    {/* Notes — full width */}
                                    <div className="space-y-1">
                                      <Label className="text-xs">Notes <span className="text-muted-foreground">(optional)</span></Label>
                                      <Textarea
                                        className="text-sm resize-none"
                                        rows={2}
                                        placeholder="Any relevant notes…"
                                        value={inlineForm.notes}
                                        onChange={(e) => setInlineForm((f) => ({ ...f, notes: e.target.value }))}
                                      />
                                    </div>
                                    <div className="flex items-center justify-end gap-3">
                                      <button
                                        type="button"
                                        className="text-sm text-muted-foreground hover:text-foreground"
                                        onClick={() => setInlineAddKey(null)}
                                      >
                                        Cancel
                                      </button>
                                      <Button type="submit" size="sm" disabled={addMut.isPending} className="gap-1.5">
                                        {addMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                        Submit
                                      </Button>
                                    </div>
                                  </form>
                                )}
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
          ) : (() => {
            const actionRequired = certs.filter(wc => certStatusInfo(wc).status === "REQUIRES_ACTION");
            const awaitingVerification = certs.filter(wc => certStatusInfo(wc).status === "NOT_VERIFIED");
            const approved = certs.filter(wc => {
              const s = certStatusInfo(wc).status;
              return s === "VALID" || s === "EXPIRING_SOON" || s === "EXPIRED";
            });

            function CertCard({ wc }: { wc: WorkerCert }) {
              const { label, icon: Icon, color, badgeClass } = certStatusInfo(wc);
              return (
                <div className="rounded-xl border bg-card p-4 flex items-start justify-between gap-3">
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
                      {wc.dateAchieved && <span>Achieved: {formatDate(wc.dateAchieved)}</span>}
                      {wc.expiryDate ? (
                        <span>Expires: {formatDate(wc.expiryDate)}</span>
                      ) : !wc.certification.validityMonths ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                          No expiry
                        </span>
                      ) : null}
                    </div>

                    {wc.notes && (
                      <p className="text-xs text-muted-foreground mt-1.5 truncate">{wc.notes}</p>
                    )}

                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={cn("inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border", badgeClass)}>
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

                    {wc.rejected && wc.rejectionComment && (
                      <p className="text-xs text-red-600 mt-1.5 flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        {wc.rejectionComment}
                      </p>
                    )}
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
            }

            return (
              <div className="space-y-6">
                {actionRequired.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <h2 className="text-sm font-semibold text-red-600 uppercase tracking-wide">Action Required</h2>
                      <span className="text-xs text-red-400 font-medium">({actionRequired.length})</span>
                    </div>
                    <div className="space-y-2">
                      {actionRequired.map(wc => <CertCard key={wc.certificationId} wc={wc} />)}
                    </div>
                  </div>
                )}

                {awaitingVerification.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-4 w-4 text-orange-500" />
                      <h2 className="text-sm font-semibold text-orange-600 uppercase tracking-wide">Awaiting Verification</h2>
                      <span className="text-xs text-orange-400 font-medium">({awaitingVerification.length})</span>
                    </div>
                    <div className="space-y-2">
                      {awaitingVerification.map(wc => <CertCard key={wc.certificationId} wc={wc} />)}
                    </div>
                  </div>
                )}

                {approved.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <h2 className="text-sm font-semibold text-emerald-700 uppercase tracking-wide">Approved Certifications</h2>
                      <span className="text-xs text-emerald-500 font-medium">({approved.length})</span>
                    </div>
                    <div className="space-y-2">
                      {approved.map(wc => <CertCard key={wc.certificationId} wc={wc} />)}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
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
          <div className="flex items-center justify-between gap-2">
            <Label className="flex items-center gap-1">
              Expiry date
              {isAutoExpiry && <span className="text-[10px] font-normal text-amber-600 bg-amber-50 border border-amber-200 rounded px-1">auto</span>}
            </Label>
            {!isAutoExpiry && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded"
                  checked={form.noExpiry}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, noExpiry: e.target.checked, expiryDate: e.target.checked ? "" : f.expiryDate }))
                  }
                />
                No expiry date
              </label>
            )}
          </div>
          {!form.noExpiry && (
            <Input
              type="date"
              value={form.expiryDate}
              onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
              readOnly={!!isAutoExpiry}
              className={isAutoExpiry ? "bg-muted/40" : ""}
            />
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Supporting document</Label>
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

      <div className="space-y-1.5">
        <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Input
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Any relevant notes…"
        />
      </div>
    </div>
  );
}
