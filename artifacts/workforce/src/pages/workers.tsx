import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch, apiPost } from "@/lib/api";
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

type SortCol = "uniqueId" | "name" | "roleName" | "dob" | "preferredAirport" | "complianceStatus";
type SortDir = "asc" | "desc";

const COMPLIANCE_ORDER: Record<ComplianceStatus, number> = {
  NOT_COMPLIANT: 0, EXPIRING_SOON: 1, READY: 2, NO_REQUIREMENTS: 3, UNASSIGNED: 4,
};

/** Extract trailing number from "S_N" for natural sort */
function uidNum(uid: string | null): number {
  if (!uid) return Infinity;
  const m = uid.match(/\d+$/);
  return m ? parseInt(m[0]) : Infinity;
}

function sortWorkers<T extends { uniqueId: string | null; name: string; roleName: string | null; dob: string | null; preferredAirport: string | null; complianceStatus: ComplianceStatus }>(
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
      className={cn(
        hCell,
        "cursor-pointer select-none hover:text-foreground group",
        className,
      )}
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
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<ComplianceStatus | "ALL">("ALL");
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: "uniqueId", dir: "asc" });
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", company: "", windaId: "", roleId: "", siteId: "" });

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

  const isLoading = compLoading || workersLoading;

  const compMap = new Map((complianceSummary ?? []).map(c => [c.workerId, c.status]));

  function toggleSort(col: SortCol) {
    setSort(prev => prev.col === col
      ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { col, dir: "asc" },
    );
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

  const createMutation = useMutation({
    mutationFn: async () => {
      const worker = await apiPost<{ id: number }>("/api/workforce/workers", {
        name: form.name,
        email: form.email || null,
        company: form.company || null,
        windaId: form.windaId || null,
        roleId: form.roleId ? parseInt(form.roleId) : null,
      });
      if (form.siteId) {
        await apiPost("/api/workforce/assignments", {
          workerId: worker.id,
          siteId: parseInt(form.siteId),
          status: "active",
        });
      }
    },
    onSuccess: () => {
      toast({ title: "Worker added" });
      void qc.invalidateQueries({ queryKey: ["workforce-workers-raw"] });
      void qc.invalidateQueries({ queryKey: ["workforce-compliance-summary"] });
      setShowNew(false);
      setForm({ name: "", email: "", company: "", windaId: "", roleId: "", siteId: "" });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Workers
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {displayWorkers.length} of {rawWorkers?.length ?? 0} workers shown
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setShowNew(true)} data-testid="button-add-worker">
            <Plus className="h-4 w-4 mr-1" /> Add Worker
          </Button>
        )}
      </div>

      {/* Status filter tabs */}
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

      {/* Table */}
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
                      {w.uniqueId ?? "—"}
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
                    <td className={cn(cell, "text-xs text-muted-foreground")}>
                      {w.qualifications ?? "—"}
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

      {/* Add worker dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Worker</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Full name"
                data-testid="input-worker-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <Label>Company</Label>
                <Input
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  placeholder="Company name"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>WINDA ID</Label>
                <Input
                  value={form.windaId}
                  onChange={(e) => setForm({ ...form, windaId: e.target.value })}
                  placeholder="WINDA ID"
                />
              </div>
              <div>
                <Label>Role</Label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={form.roleId}
                  onChange={(e) => setForm({ ...form, roleId: e.target.value })}
                  data-testid="select-worker-role"
                >
                  <option value="">No role</option>
                  {roles?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
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
              disabled={!form.name || createMutation.isPending}
              data-testid="button-save-worker"
            >
              {createMutation.isPending ? "Saving…" : "Add Worker"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
