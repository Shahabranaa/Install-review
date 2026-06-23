import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Plus, Search, ChevronRight,
  CheckCircle2, AlertTriangle, Clock, HelpCircle,
  ChevronUp, ChevronDown, ChevronsUpDown,
  UserX, RotateCcw, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ComplianceStatus = "READY" | "EXPIRING_SOON" | "NOT_COMPLIANT" | "NO_REQUIREMENTS" | "UNASSIGNED";

interface Worker {
  id: number;
  name: string;
  email: string | null;
  company: string | null;
  windaId: string | null;
  roleId: number | null;
  roleName: string | null;
  active: boolean;
  uniqueId: string | null;
  phone: string | null;
  dob: string | null;
  passportNo: string | null;
  preferredAirport: string | null;
  qualifications: string | null;
  createdAt: string | null;
}

interface WorkerCompliance {
  workerId: number;
  status: ComplianceStatus;
}

interface Role { id: number; name: string }
interface Site { id: number; name: string }

function complianceConfig(status: ComplianceStatus) {
  switch (status) {
    case "READY": return { label: "Ready", icon: CheckCircle2, cls: "border-emerald-400 text-emerald-600 bg-emerald-50" };
    case "EXPIRING_SOON": return { label: "Expiring Soon", icon: Clock, cls: "border-amber-400 text-amber-600 bg-amber-50" };
    case "NOT_COMPLIANT": return { label: "Not Compliant", icon: AlertTriangle, cls: "border-red-400 text-red-600 bg-red-50" };
    case "NO_REQUIREMENTS": return { label: "No Requirements", icon: HelpCircle, cls: "text-muted-foreground" };
    case "UNASSIGNED": return { label: "Unassigned", icon: HelpCircle, cls: "text-muted-foreground" };
  }
}

const STATUS_FILTERS: { label: string; value: ComplianceStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Ready", value: "READY" },
  { label: "Expiring Soon", value: "EXPIRING_SOON" },
  { label: "Not Compliant", value: "NOT_COMPLIANT" },
  { label: "Unassigned", value: "UNASSIGNED" },
];

type SortCol = "uniqueId" | "name" | "roleName" | "dob" | "preferredAirport" | "complianceStatus" | "createdAt";
type SortDir = "asc" | "desc";

const COMPLIANCE_ORDER: Record<ComplianceStatus, number> = {
  NOT_COMPLIANT: 0, EXPIRING_SOON: 1, READY: 2, NO_REQUIREMENTS: 3, UNASSIGNED: 4,
};

function uidNum(uid: string | null): number {
  if (!uid) return Infinity;
  const m = uid.match(/\d+$/);
  return m ? parseInt(m[0]) : Infinity;
}

function sortWorkers<T extends { uniqueId: string | null; name: string; roleName: string | null; dob: string | null; preferredAirport: string | null; complianceStatus: ComplianceStatus; createdAt: string | null }>(
  workers: T[], col: SortCol, dir: SortDir,
): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...workers].sort((a, b) => {
    let cmp = 0;
    switch (col) {
      case "uniqueId":  cmp = uidNum(a.uniqueId) - uidNum(b.uniqueId); break;
      case "name":      cmp = a.name.localeCompare(b.name); break;
      case "roleName":  cmp = (a.roleName ?? "").localeCompare(b.roleName ?? ""); break;
      case "dob":       cmp = (a.dob ?? "").localeCompare(b.dob ?? ""); break;
      case "preferredAirport": cmp = (a.preferredAirport ?? "").localeCompare(b.preferredAirport ?? ""); break;
      case "complianceStatus": cmp = COMPLIANCE_ORDER[a.complianceStatus] - COMPLIANCE_ORDER[b.complianceStatus]; break;
      case "createdAt": cmp = (a.createdAt ?? "").localeCompare(b.createdAt ?? ""); break;
    }
    return cmp !== 0 ? cmp * sign : uidNum(a.uniqueId) - uidNum(b.uniqueId);
  });
}

const cell = "px-3 py-2.5 text-sm whitespace-nowrap";
const hCell = "px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap text-left";

function SortTh({ label, col, active, onSort, className }: {
  label: string;
  col: SortCol;
  active: { col: SortCol; dir: SortDir };
  onSort: (col: SortCol) => void;
  className?: string;
}) {
  const isActive = active.col === col;
  const Icon = isActive ? (active.dir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th
      className={cn(hCell, "cursor-pointer select-none hover:text-foreground group", className)}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <Icon className={cn(
          "h-3 w-3 transition-colors",
          isActive ? "text-primary" : "text-muted-foreground/40 group-hover:text-muted-foreground",
        )} />
      </span>
    </th>
  );
}

export default function WorkersPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [workerTab, setWorkerTab] = useState<"active" | "inactive">("active");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<ComplianceStatus | "ALL">("ALL");
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: "uniqueId", dir: "asc" });
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", siteId: "" });
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const { data: complianceSummary, isLoading: compLoading } = useQuery<WorkerCompliance[]>({
    queryKey: ["workforce-compliance-summary"],
    queryFn: () => apiFetch<WorkerCompliance[]>("/api/workforce/workers-compliance-summary"),
    refetchInterval: 60_000,
  });

  const { data: roles } = useQuery<Role[]>({
    queryKey: ["workforce-roles"],
    queryFn: () => apiFetch<Role[]>("/api/workforce/roles"),
  });

  const { data: sites } = useQuery<Site[]>({
    queryKey: ["workforce-sites"],
    queryFn: () => apiFetch<Site[]>("/api/workforce/sites"),
  });

  const { data: rawWorkers, isLoading: workersLoading } = useQuery<Worker[]>({
    queryKey: ["workforce-workers-raw"],
    queryFn: () => apiFetch<Worker[]>("/api/workforce/workers"),
  });

  const { data: inactiveWorkers, isLoading: inactiveLoading } = useQuery<Worker[]>({
    queryKey: ["workforce-workers-inactive"],
    queryFn: () => apiFetch<Worker[]>("/api/workforce/workers?status=inactive"),
  });

  const isLoading = compLoading || workersLoading;

  const compMap = new Map((complianceSummary ?? []).map(c => [c.workerId, c.status]));

  function toggleSort(col: SortCol) {
    setSort(prev => prev.col === col
      ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { col, dir: "asc" },
    );
  }

  function switchTab(tab: "active" | "inactive") {
    setWorkerTab(tab);
    setSearch("");
    setRoleFilter("");
    setStatusFilter("ALL");
  }

  const displayWorkers = useMemo(() => {
    const mapped = (rawWorkers ?? []).map(w => ({
      ...w,
      complianceStatus: (compMap.get(w.id) ?? "UNASSIGNED") as ComplianceStatus,
    }));
    const filtered = mapped.filter(w => {
      if (search) {
        const q = search.toLowerCase();
        const matched =
          w.name.toLowerCase().includes(q) ||
          (w.email ?? "").toLowerCase().includes(q) ||
          (w.windaId ?? "").toLowerCase().includes(q) ||
          (w.uniqueId ?? "").toLowerCase().includes(q) ||
          (w.phone ?? "").toLowerCase().includes(q) ||
          (w.passportNo ?? "").toLowerCase().includes(q);
        if (!matched) return false;
      }
      if (roleFilter && String(w.roleId) !== roleFilter) return false;
      if (statusFilter !== "ALL" && w.complianceStatus !== statusFilter) return false;
      return true;
    });
    return sortWorkers(filtered, sort.col, sort.dir);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawWorkers, complianceSummary, search, roleFilter, statusFilter, sort]);

  const filteredInactive = useMemo(() => {
    const all = inactiveWorkers ?? [];
    if (!search) return [...all].sort((a, b) => a.name.localeCompare(b.name));
    const q = search.toLowerCase();
    return all
      .filter(w =>
        w.name.toLowerCase().includes(q) ||
        (w.email ?? "").toLowerCase().includes(q) ||
        (w.company ?? "").toLowerCase().includes(q) ||
        (w.windaId ?? "").toLowerCase().includes(q) ||
        (w.uniqueId ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [inactiveWorkers, search]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const worker = await apiPost<{ id: number; emailSent?: boolean }>("/api/workforce/workers", {
        name: form.name.trim() || undefined,
        email: form.email.trim(),
      });
      if (form.siteId) {
        await apiPost("/api/workforce/assignments", {
          workerId: worker.id,
          siteId: parseInt(form.siteId),
          status: "active",
        });
      }
      return worker;
    },
    onSuccess: (worker) => {
      toast({
        title: "Worker added",
        description: worker.emailSent
          ? "Login credentials sent to the worker's email"
          : "Worker added (email could not be sent)",
      });
      void qc.invalidateQueries({ queryKey: ["workforce-workers-raw"] });
      void qc.invalidateQueries({ queryKey: ["workforce-compliance-summary"] });
      setShowNew(false);
      setForm({ name: "", email: "", siteId: "" });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const reactivateMutation = useMutation({
    mutationFn: (workerId: number) =>
      apiPatch<Worker>(`/api/workforce/workers/${workerId}`, { active: true }),
    onSuccess: () => {
      toast({ title: "Worker reactivated" });
      void qc.invalidateQueries({ queryKey: ["workforce-workers-raw"] });
      void qc.invalidateQueries({ queryKey: ["workforce-workers-inactive"] });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const deletePermanentMutation = useMutation({
    mutationFn: (workerId: number) =>
      apiDelete<{ ok: boolean }>(`/api/workforce/workers/${workerId}/permanent`),
    onSuccess: () => {
      toast({ title: "Worker permanently deleted" });
      setDeleteConfirmId(null);
      void qc.invalidateQueries({ queryKey: ["workforce-workers-inactive"] });
    },
    onError: (err) => {
      toast({ title: "Delete failed", description: String(err), variant: "destructive" });
      setDeleteConfirmId(null);
    },
  });

  const inactiveCount = inactiveWorkers?.length ?? 0;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Workers
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {workerTab === "active"
              ? `${displayWorkers.length} of ${rawWorkers?.length ?? 0} workers shown`
              : `${filteredInactive.length}${search ? ` of ${inactiveCount}` : ""} deactivated workers`}
          </p>
        </div>
        {isAdmin && workerTab === "active" && (
          <Button size="sm" onClick={() => setShowNew(true)} data-testid="button-add-worker">
            <Plus className="h-4 w-4 mr-1" /> Add Worker
          </Button>
        )}
      </div>

      {/* Active / Deactivated tab switcher */}
      <div className="flex gap-0 border-b">
        <button
          onClick={() => switchTab("active")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
            workerTab === "active"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
          data-testid="tab-active-workers"
        >
          <Users className="h-3.5 w-3.5" />
          Active
          <span className="ml-0.5 text-xs opacity-60">{rawWorkers?.length ?? 0}</span>
        </button>
        <button
          onClick={() => switchTab("inactive")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
            workerTab === "inactive"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
          data-testid="tab-inactive-workers"
        >
          <UserX className="h-3.5 w-3.5" />
          Deactivated
          {inactiveCount > 0 && (
            <span className={cn(
              "ml-0.5 text-xs px-1.5 py-0.5 rounded-full font-medium",
              workerTab === "inactive"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}>
              {inactiveCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Active tab ── */}
      {workerTab === "active" && (
        <>
          {/* Compliance status filter pills */}
          <div className="flex gap-1.5 flex-wrap">
            {STATUS_FILTERS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                  statusFilter === value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border hover:border-primary/50",
                )}
                data-testid={`filter-status-${value.toLowerCase()}`}
              >
                {label}
                {value !== "ALL" && (
                  <span className="ml-1.5 text-[10px] opacity-70">
                    {(rawWorkers ?? []).filter(w => (compMap.get(w.id) ?? "UNASSIGNED") === value).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search + role filter */}
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-52">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name, email, WINDA ID, passport, phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
                data-testid="input-worker-search"
              />
            </div>
            {roles && roles.length > 0 && (
              <select
                className="border rounded-md px-3 py-1.5 text-sm bg-background"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                data-testid="select-role-filter"
              >
                <option value="">All roles</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
          </div>

          {/* Active workers table */}
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : !displayWorkers.length ? (
            <div className="border rounded-xl p-10 text-center text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="font-medium">No workers found</p>
              {(search || statusFilter !== "ALL") && (
                <p className="text-sm mt-1">Try adjusting your filters.</p>
              )}
            </div>
          ) : (
            <div className="border rounded-xl overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/60 border-b">
                    <SortTh label="ID"          col="uniqueId"         active={sort} onSort={toggleSort} />
                    <SortTh label="Name"        col="name"             active={sort} onSort={toggleSort} className="min-w-[160px]" />
                    <SortTh label="Role"        col="roleName"         active={sort} onSort={toggleSort} className="min-w-[160px]" />
                    <th className={hCell}>Email</th>
                    <th className={hCell}>Tel No.</th>
                    <th className={hCell}>WINDA ID</th>
                    <SortTh label="DOB"         col="dob"              active={sort} onSort={toggleSort} />
                    <th className={hCell}>Passport No.</th>
                    <SortTh label="Airport"     col="preferredAirport" active={sort} onSort={toggleSort} />
                    <th className={hCell}>Qualifications</th>
                    <SortTh label="Compliance"  col="complianceStatus" active={sort} onSort={toggleSort} />
                    <SortTh label="Created"     col="createdAt"        active={sort} onSort={toggleSort} />
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {displayWorkers.map((w) => {
                    const cfg = complianceConfig(w.complianceStatus);
                    const StatusIcon = cfg.icon;
                    return (
                      <tr key={w.id} className="hover:bg-muted/20 transition-colors">
                        <td className={cn(cell, "font-mono text-xs text-muted-foreground")}>
                          {w.uniqueId ? w.uniqueId.replace(/^[A-Za-z_]+/, "") : "—"}
                        </td>
                        <td className={cn(cell, "min-w-[160px]")}>
                          <Link href={`/workers/${w.id}`}>
                            <a className="font-medium hover:underline" data-testid={`link-worker-${w.id}`}>
                              {w.name}
                            </a>
                          </Link>
                        </td>
                        <td className={cn(cell, "min-w-[160px]")}>
                          {w.roleName
                            ? <Badge variant="secondary" className="text-xs font-normal">{w.roleName}</Badge>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className={cn(cell, "text-muted-foreground min-w-[180px]")}>
                          {w.email ?? "—"}
                        </td>
                        <td className={cn(cell, "text-muted-foreground font-mono text-xs")}>
                          {w.phone ?? "—"}
                        </td>
                        <td className={cn(cell, "font-mono text-xs text-muted-foreground")}>
                          {w.windaId ?? "—"}
                        </td>
                        <td className={cn(cell, "text-muted-foreground text-xs")}>
                          {w.dob ?? "—"}
                        </td>
                        <td className={cn(cell, "font-mono text-xs text-muted-foreground")}>
                          {w.passportNo ?? "—"}
                        </td>
                        <td className={cn(cell, "text-muted-foreground text-xs")}>
                          {w.preferredAirport ?? "—"}
                        </td>
                        <td className={cn(cell, "text-xs text-muted-foreground max-w-[180px]")}>
                          {w.qualifications
                            ? (
                              <span className="block truncate" title={w.qualifications}>
                                {w.qualifications}
                              </span>
                            )
                            : "—"}
                        </td>
                        <td className={cell}>
                          <Badge
                            variant="outline"
                            className={cn("text-[10px] flex items-center gap-1 w-fit", cfg.cls)}
                          >
                            <StatusIcon className="h-3 w-3" />
                            {cfg.label}
                          </Badge>
                        </td>
                        <td className={cn(cell, "text-muted-foreground text-xs whitespace-nowrap")}>
                          {w.createdAt
                            ? new Date(w.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                            : "—"}
                        </td>
                        <td className="px-2 py-2">
                          <Link href={`/workers/${w.id}`}>
                            <a><ChevronRight className="h-4 w-4 text-muted-foreground" /></a>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Deactivated tab ── */}
      {workerTab === "inactive" && (
        <>
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, email, company, WINDA ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
              data-testid="input-inactive-search"
            />
          </div>

          {inactiveLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : !filteredInactive.length ? (
            <div className="border rounded-xl p-10 text-center text-muted-foreground">
              <UserX className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="font-medium">
                {search ? "No deactivated workers match your search" : "No deactivated workers"}
              </p>
              {search && <p className="text-sm mt-1">Try a different search term.</p>}
            </div>
          ) : (
            <div className="border rounded-xl overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/60 border-b">
                    <th className={hCell}>ID</th>
                    <th className={cn(hCell, "min-w-[180px]")}>Name</th>
                    <th className={cn(hCell, "min-w-[140px]")}>Role</th>
                    <th className={cn(hCell, "min-w-[180px]")}>Email</th>
                    <th className={cn(hCell, "min-w-[140px]")}>Company</th>
                    <th className={hCell}>WINDA ID</th>
                    {isAdmin && <th className="w-8" />}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredInactive.map((w) => {
                    const isPending = reactivateMutation.isPending && reactivateMutation.variables === w.id;
                    return (
                      <tr key={w.id} className="hover:bg-muted/20 transition-colors opacity-75">
                        <td className={cn(cell, "font-mono text-xs text-muted-foreground")}>
                          {w.uniqueId ? w.uniqueId.replace(/^[A-Za-z_]+/, "") : "—"}
                        </td>
                        <td className={cn(cell, "min-w-[180px]")}>
                          <Link href={`/workers/${w.id}`}>
                            <a className="font-medium hover:underline text-muted-foreground" data-testid={`link-inactive-worker-${w.id}`}>
                              {w.name}
                            </a>
                          </Link>
                        </td>
                        <td className={cn(cell, "min-w-[140px]")}>
                          {w.roleName
                            ? <Badge variant="secondary" className="text-xs font-normal opacity-60">{w.roleName}</Badge>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className={cn(cell, "text-muted-foreground min-w-[180px]")}>
                          {w.email ?? "—"}
                        </td>
                        <td className={cn(cell, "text-muted-foreground min-w-[140px]")}>
                          {w.company ?? "—"}
                        </td>
                        <td className={cn(cell, "font-mono text-xs text-muted-foreground")}>
                          {w.windaId ?? "—"}
                        </td>
                        {isAdmin && (
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1.5"
                                disabled={isPending}
                                onClick={() => reactivateMutation.mutate(w.id)}
                                data-testid={`button-reactivate-${w.id}`}
                              >
                                <RotateCcw className={cn("h-3 w-3", isPending && "animate-spin")} />
                                {isPending ? "Reactivating…" : "Reactivate"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setDeleteConfirmId(w.id)}
                                data-testid={`button-delete-${w.id}`}
                              >
                                <Trash2 className="h-3 w-3" />
                                Delete
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Add worker dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Worker</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Full legal name"
                data-testid="input-worker-name"
              />
            </div>
            <div>
              <Label>Email *</Label>
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="worker@example.com"
                type="email"
                data-testid="input-worker-email"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Login credentials will be sent to this address.
              </p>
            </div>
            <div>
              <Label>Assign to Site</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={form.siteId}
                onChange={(e) => setForm({ ...form, siteId: e.target.value })}
                data-testid="select-worker-site"
              >
                <option value="">No site (assign later)</option>
                {sites?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!form.name.trim() || !form.email.trim() || createMutation.isPending}
              data-testid="button-save-worker"
            >
              {createMutation.isPending ? "Saving…" : "Add Worker"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permanent delete confirmation */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Permanently Delete Worker
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm">
              This will <span className="font-semibold">permanently remove</span> the worker and all associated records — certifications, site assignments, and history.
            </p>
            <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deletePermanentMutation.isPending}
              onClick={() => { if (deleteConfirmId !== null) deletePermanentMutation.mutate(deleteConfirmId); }}
            >
              {deletePermanentMutation.isPending ? "Deleting…" : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
