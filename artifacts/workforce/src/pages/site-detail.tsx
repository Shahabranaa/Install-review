import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { apiFetch, apiPut } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, Building2, ShieldCheck, CheckCircle2, AlertTriangle,
  Clock, HelpCircle, ChevronRight, ChevronDown, Award, Plus, Trash2, MapPin, Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

type WorkerStatus = "READY" | "EXPIRING_SOON" | "NOT_COMPLIANT" | "NO_REQUIREMENTS";
type CertStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "NOT_VERIFIED" | "MISSING";
type StatusFilter = "ALL" | WorkerStatus;

interface ComplianceItem {
  certId: number;
  name: string;
  category: string | null;
  status: CertStatus;
  expiryDate: string | null;
  daysUntilExpiry: number | null;
  verified: boolean;
}

interface WorkerCompliance {
  workerId: number;
  workerName: string;
  siteId: number;
  siteName: string;
  status: WorkerStatus;
  requiredCount: number;
  validCount: number;
  expiringCount: number;
  missingCount: number;
  items: ComplianceItem[];
}

interface SiteCertRequirement {
  id: number;
  siteId: number;
  certificationId: number;
  required: boolean;
  certification: { id: number; name: string; category: string | null };
}

interface RoleRequirement {
  roleId: number;
  roleName: string;
  certifications: {
    certificationId: number;
    required: boolean;
    certification: { id: number; name: string; category: string | null };
  }[];
}

interface Site {
  id: number;
  name: string;
  location: string | null;
  description: string | null;
  active: boolean;
}

interface Certification {
  id: number;
  name: string;
  category: string | null;
}

interface WorkerMeta {
  company: string;
  roleName: string | null;
}

function workerStatusConfig(status: WorkerStatus) {
  switch (status) {
    case "READY": return { label: "Ready", icon: CheckCircle2, color: "text-emerald-500", badge: "border-emerald-400 text-emerald-600" };
    case "EXPIRING_SOON": return { label: "Expiring Soon", icon: Clock, color: "text-amber-500", badge: "border-amber-400 text-amber-600" };
    case "NOT_COMPLIANT": return { label: "Not Compliant", icon: AlertTriangle, color: "text-red-500", badge: "border-red-400 text-red-600" };
    case "NO_REQUIREMENTS": return { label: "No Requirements", icon: HelpCircle, color: "text-muted-foreground", badge: "text-muted-foreground" };
  }
}

function certStatusColor(status: CertStatus) {
  switch (status) {
    case "VALID": return "text-emerald-600";
    case "EXPIRING_SOON": return "text-amber-600";
    case "EXPIRED": return "text-red-600";
    case "NOT_VERIFIED": return "text-orange-500";
    case "MISSING": return "text-red-600";
  }
}

const STATUS_ORDER: Record<WorkerStatus, number> = { NOT_COMPLIANT: 0, EXPIRING_SOON: 1, READY: 2, NO_REQUIREMENTS: 3 };

function WorkerRow({ result, meta }: { result: WorkerCompliance; meta?: WorkerMeta }) {
  const [open, setOpen] = useState(false);
  const cfg = workerStatusConfig(result.status);
  const StatusIcon = cfg.icon;

  return (
    <>
      <tr
        className="hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={() => setOpen((o) => !o)}
        data-testid={`row-worker-${result.workerId}`}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <StatusIcon className={cn("h-4 w-4 flex-shrink-0", cfg.color)} />
            <div>
              <Link href={`/workers/${result.workerId}`}>
                <a
                  className="font-medium text-sm hover:underline"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`link-worker-${result.workerId}`}
                >
                  {result.workerName}
                </a>
              </Link>
              {meta?.roleName && (
                <p className="text-xs text-muted-foreground">{meta.roleName}</p>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">
          {meta?.company ?? "—"}
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">
          {result.validCount}/{result.requiredCount} valid
          {result.missingCount > 0 && (
            <span className="text-red-500 ml-1">· {result.missingCount} issue{result.missingCount > 1 ? "s" : ""}</span>
          )}
        </td>
        <td className="px-4 py-3">
          <Badge variant="outline" className={cn("text-[10px]", cfg.badge)}>
            {cfg.label}
          </Badge>
        </td>
        <td className="px-2 py-3">
          <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-90")} />
        </td>
      </tr>
      {open && result.items.length > 0 && (
        <tr>
          <td colSpan={5} className="bg-muted/10 px-8 py-3 border-b">
            <div className="space-y-1">
              {result.items.map((item) => (
                <div key={item.certId} className="flex items-center gap-2 text-xs">
                  <span className={cn("font-semibold w-20 flex-shrink-0", certStatusColor(item.status))}>{item.status}</span>
                  <span>{item.name}</span>
                  {item.expiryDate && (
                    <span className="text-muted-foreground ml-auto">
                      Exp: {new Date(item.expiryDate).toLocaleDateString("en-GB")}
                      {item.daysUntilExpiry !== null && ` (${item.daysUntilExpiry}d)`}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function RoleRequirementRow({ role }: { role: RoleRequirement }) {
  const [open, setOpen] = useState(false);
  const ChevronIcon = open ? ChevronDown : ChevronRight;
  return (
    <div className="border-b last:border-b-0">
      <button
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
        data-testid={`row-role-req-${role.roleId}`}
      >
        <ChevronIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <Briefcase className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="flex-1 text-sm font-medium">{role.roleName}</span>
        <span className="text-xs text-muted-foreground">{role.certifications.length} cert{role.certifications.length !== 1 ? "s" : ""}</span>
      </button>
      {open && (
        <div className="bg-muted/10 px-10 py-2 pb-3 border-t space-y-1.5">
          {role.certifications.length === 0 ? (
            <p className="text-xs text-muted-foreground">No certifications required for this role.</p>
          ) : (
            role.certifications.map((c) => (
              <div key={c.certificationId} className="flex items-center gap-2 text-sm">
                <Award className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <span className="flex-1">{c.certification.name}</span>
                {c.certification.category && (
                  <span className="text-xs text-muted-foreground">{c.certification.category}</span>
                )}
                <Badge variant="outline" className="text-[10px] border-emerald-400 text-emerald-600">
                  {c.required ? "Required" : "Optional"}
                </Badge>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function SiteDetailPage() {
  const [, params] = useRoute("/sites/:id");
  const siteId = params ? parseInt(params.id) : NaN;
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [showAddReq, setShowAddReq] = useState(false);
  const [selectedCertIds, setSelectedCertIds] = useState<Set<number>>(new Set());

  function toggleSelectedCertId(id: number) {
    setSelectedCertIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const { data: site, isLoading: siteLoading } = useQuery<Site>({
    queryKey: ["site", siteId],
    queryFn: () => apiFetch<Site>(`/api/workforce/sites/${siteId}`),
    enabled: !isNaN(siteId),
  });

  const { data: compliance, isLoading: compLoading } = useQuery<WorkerCompliance[]>({
    queryKey: ["site-compliance", siteId],
    queryFn: () => apiFetch<WorkerCompliance[]>(`/api/workforce/compliance/site/${siteId}`),
    enabled: !isNaN(siteId),
    refetchInterval: 60_000,
  });

  const { data: requirements, isLoading: reqLoading } = useQuery<SiteCertRequirement[]>({
    queryKey: ["site-requirements", siteId],
    queryFn: () => apiFetch<SiteCertRequirement[]>(`/api/workforce/sites/${siteId}/requirements`),
    enabled: !isNaN(siteId),
  });

  const { data: allCerts } = useQuery<Certification[]>({
    queryKey: ["workforce-certifications-list"],
    queryFn: () => apiFetch<Certification[]>("/api/workforce/certifications"),
    enabled: isAdmin,
  });

  const { data: roleRequirements, isLoading: roleReqLoading } = useQuery<RoleRequirement[]>({
    queryKey: ["site-role-requirements", siteId],
    queryFn: () => apiFetch<RoleRequirement[]>(`/api/workforce/sites/${siteId}/role-requirements`),
    enabled: !isNaN(siteId),
  });

  const { data: workers } = useQuery<{ id: number; company: string; roleName: string | null }[]>({
    queryKey: ["workforce-workers-meta"],
    queryFn: () => apiFetch<{ id: number; company: string; roleName: string | null }[]>("/api/workforce/workers"),
    enabled: !isNaN(siteId),
    staleTime: 5 * 60_000,
  });

  const workerMetaMap = new Map<number, WorkerMeta>(
    (workers ?? []).map((w) => [w.id, { company: w.company, roleName: w.roleName }]),
  );

  const updateReqsMutation = useMutation({
    mutationFn: (items: { certificationId: number; required: boolean }[]) =>
      apiPut(`/api/workforce/sites/${siteId}/requirements`, items),
    onSuccess: () => {
      toast({ title: "Requirements updated" });
      void qc.invalidateQueries({ queryKey: ["site-requirements", siteId] });
      void qc.invalidateQueries({ queryKey: ["site-compliance", siteId] });
      setShowAddReq(false);
      setSelectedCertIds(new Set());
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  function addRequirement() {
    if (selectedCertIds.size === 0) return;
    const existing = (requirements ?? []).map(r => ({
      certificationId: r.certificationId, required: r.required,
    }));
    const toAdd = [...selectedCertIds].filter(id => !existing.find(e => e.certificationId === id));
    if (toAdd.length === 0) { toast({ title: "Already added" }); return; }
    updateReqsMutation.mutate([
      ...existing,
      ...toAdd.map(id => ({ certificationId: id, required: true })),
    ]);
  }

  function removeRequirement(certId: number) {
    const remaining = (requirements ?? [])
      .filter(r => r.certificationId !== certId)
      .map(r => ({ certificationId: r.certificationId, required: r.required }));
    updateReqsMutation.mutate(remaining);
  }

  const validCompliance = (compliance ?? []).filter(
    (r): r is WorkerCompliance => "status" in r,
  );
  const filtered = statusFilter === "ALL"
    ? validCompliance
    : validCompliance.filter(r => r.status === statusFilter);
  const sorted = [...filtered].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  const ready = validCompliance.filter(r => r.status === "READY").length;
  const expiring = validCompliance.filter(r => r.status === "EXPIRING_SOON").length;
  const nonCompliant = validCompliance.filter(r => r.status === "NOT_COMPLIANT").length;
  const noReq = validCompliance.filter(r => r.status === "NO_REQUIREMENTS").length;

  const STATUS_FILTERS: { label: string; value: StatusFilter; count: number }[] = [
    { label: "All", value: "ALL", count: validCompliance.length },
    { label: "Ready", value: "READY", count: ready },
    { label: "Expiring", value: "EXPIRING_SOON", count: expiring },
    { label: "Not Compliant", value: "NOT_COMPLIANT", count: nonCompliant },
    { label: "No Requirements", value: "NO_REQUIREMENTS", count: noReq },
  ];

  const availableCerts = (allCerts ?? []).filter(
    c => !(requirements ?? []).find(r => r.certificationId === c.id),
  );

  if (siteLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Link href="/sites">
        <a className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back-sites">
          <ChevronLeft className="h-4 w-4" /> Sites
        </a>
      </Link>

      {/* Site header */}
      <div className="border rounded-xl bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">{site?.name ?? `Site ${siteId}`}</h1>
              {site?.location && (
                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3.5 w-3.5" /> {site.location}
                </p>
              )}
              <Badge
                className={cn("mt-1 text-xs", site?.active ? "bg-emerald-500 hover:bg-emerald-500" : "")}
                variant={site?.active ? "default" : "outline"}
              >
                {site?.active ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
        </div>
        {site?.description && <p className="text-sm text-muted-foreground mt-3 pt-3 border-t">{site.description}</p>}

        {/* Stats */}
        {!compLoading && validCompliance.length > 0 && (
          <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t">
            {[
              { label: "Ready", value: ready, color: "text-emerald-600" },
              { label: "Expiring", value: expiring, color: "text-amber-600" },
              { label: "Not Compliant", value: nonCompliant, color: "text-red-600" },
              { label: "No Requirements", value: noReq, color: "text-muted-foreground" },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <p className={cn("text-xl font-bold tabular-nums", color)}>{value}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cert requirements */}
      <div className="border rounded-xl bg-card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">
              Required Certifications {reqLoading ? "" : `(${requirements?.length ?? 0})`}
            </h2>
          </div>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setShowAddReq(true)} data-testid="button-add-requirement">
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          )}
        </div>
        {reqLoading ? (
          <div className="p-4"><Skeleton className="h-10 w-full" /></div>
        ) : !requirements?.length ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            No cert requirements configured for this site.
            {isAdmin && <span className="block mt-1">Add requirements to enable compliance checking.</span>}
          </div>
        ) : (
          <div className="divide-y">
            {requirements.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <Award className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{r.certification.name}</p>
                  {r.certification.category && (
                    <p className="text-xs text-muted-foreground">{r.certification.category}</p>
                  )}
                </div>
                <Badge variant="outline" className="text-[10px] border-emerald-400 text-emerald-600">
                  {r.required ? "Required" : "Optional"}
                </Badge>
                {isAdmin && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                    onClick={() => removeRequirement(r.certificationId)}
                    disabled={updateReqsMutation.isPending}
                    data-testid={`button-remove-req-${r.certificationId}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Role required certifications */}
      <div className="border rounded-xl bg-card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">
            Role Required Certifications {roleReqLoading ? "" : `(${roleRequirements?.length ?? 0})`}
          </h2>
        </div>
        {roleReqLoading ? (
          <div className="p-4"><Skeleton className="h-10 w-full" /></div>
        ) : !roleRequirements?.length ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            No roles with certification requirements are assigned to this site.
          </div>
        ) : (
          <div className="divide-y">
            {roleRequirements.map((role) => (
              <RoleRequirementRow key={role.roleId} role={role} />
            ))}
          </div>
        )}
      </div>

      {/* Worker compliance */}
      <div className="border rounded-xl bg-card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">Worker Compliance ({validCompliance.length})</h2>
        </div>

        {/* Status filter tabs */}
        <div className="px-4 pt-2 pb-1 flex gap-1.5 flex-wrap border-b">
          {STATUS_FILTERS.map(({ label, value, count }) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                statusFilter === value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border hover:border-primary/50",
              )}
              data-testid={`filter-${value.toLowerCase()}`}
            >
              {label} <span className="opacity-70">{count}</span>
            </button>
          ))}
        </div>

        {compLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : sorted.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {validCompliance.length === 0
              ? "No active or pending worker assignments for this site."
              : "No workers match the selected filter."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b">
                <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground">Worker</th>
                <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground hidden md:table-cell">Company</th>
                <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground hidden sm:table-cell">Certs</th>
                <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground">Status</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map((r) => (
                <WorkerRow key={r.workerId} result={r} meta={workerMetaMap.get(r.workerId)} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add requirement dialog */}
      <Dialog open={showAddReq} onOpenChange={(open) => { setShowAddReq(open); if (!open) setSelectedCertIds(new Set()); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Required Certifications</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {availableCerts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">All certifications are already required for this site.</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-2">
                  Select one or more certifications to add as requirements.
                </p>
                <div className="max-h-72 overflow-y-auto border rounded-md divide-y">
                  {availableCerts.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30 select-none"
                      data-testid={`checkbox-req-cert-${c.id}`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={selectedCertIds.has(c.id)}
                        onChange={() => toggleSelectedCertId(c.id)}
                      />
                      <span className="flex-1 text-sm font-medium">{c.name}</span>
                      {c.category && <span className="text-xs text-muted-foreground">{c.category}</span>}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddReq(false); setSelectedCertIds(new Set()); }}>Cancel</Button>
            <Button
              onClick={addRequirement}
              disabled={selectedCertIds.size === 0 || updateReqsMutation.isPending}
              data-testid="button-confirm-add-requirement"
            >
              {updateReqsMutation.isPending
                ? "Saving…"
                : selectedCertIds.size > 0
                  ? `Add ${selectedCertIds.size} Requirement${selectedCertIds.size !== 1 ? "s" : ""}`
                  : "Add Requirements"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
