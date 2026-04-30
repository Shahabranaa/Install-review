import { useState } from "react";
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
  Users, Plus, Search, ChevronRight, Building2,
  CheckCircle2, AlertTriangle, Clock, HelpCircle,
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
}

interface WorkerCompliance {
  workerId: number;
  name: string;
  email: string | null;
  company: string | null;
  roleName: string | null;
  active: boolean;
  status: ComplianceStatus;
}

interface Role { id: number; name: string }

function complianceConfig(status: ComplianceStatus) {
  switch (status) {
    case "READY": return { label: "Ready", icon: CheckCircle2, cls: "border-emerald-400 text-emerald-600" };
    case "EXPIRING_SOON": return { label: "Expiring Soon", icon: Clock, cls: "border-amber-400 text-amber-600" };
    case "NOT_COMPLIANT": return { label: "Not Compliant", icon: AlertTriangle, cls: "border-red-400 text-red-600" };
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

export default function WorkersPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<ComplianceStatus | "ALL">("ALL");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", company: "", windaId: "", roleId: "" });

  const { data: complianceSummary, isLoading: compLoading } = useQuery<WorkerCompliance[]>({
    queryKey: ["workforce-compliance-summary"],
    queryFn: () => apiFetch<WorkerCompliance[]>("/api/workforce/workers-compliance-summary"),
    refetchInterval: 60_000,
  });

  const { data: roles } = useQuery<Role[]>({
    queryKey: ["workforce-roles"],
    queryFn: () => apiFetch<Role[]>("/api/workforce/roles"),
  });

  const { data: rawWorkers } = useQuery<Worker[]>({
    queryKey: ["workforce-workers-raw"],
    queryFn: () => apiFetch<Worker[]>("/api/workforce/workers"),
  });

  const isLoading = compLoading;

  const compMap = new Map((complianceSummary ?? []).map(c => [c.workerId, c]));

  const displayWorkers: (Worker & { complianceStatus: ComplianceStatus })[] = (rawWorkers ?? []).map(w => ({
    ...w,
    complianceStatus: compMap.get(w.id)?.status ?? "UNASSIGNED",
  })).filter(w => {
    if (search && !w.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (roleFilter && String(w.roleId) !== roleFilter) return false;
    if (statusFilter !== "ALL" && w.complianceStatus !== statusFilter) return false;
    return true;
  });

  const createMutation = useMutation({
    mutationFn: () => apiPost("/api/workforce/workers", {
      name: form.name,
      email: form.email || null,
      company: form.company || null,
      windaId: form.windaId || null,
      roleId: form.roleId ? parseInt(form.roleId) : null,
    }),
    onSuccess: () => {
      toast({ title: "Worker added" });
      void qc.invalidateQueries({ queryKey: ["workforce-workers-raw"] });
      void qc.invalidateQueries({ queryKey: ["workforce-compliance-summary"] });
      setShowNew(false);
      setForm({ name: "", email: "", company: "", windaId: "", roleId: "" });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Workers
          </h1>
          <p className="text-sm text-muted-foreground mt-1">All registered workforce members with compliance status.</p>
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
                {(rawWorkers ?? []).filter(w =>
                  (compMap.get(w.id)?.status ?? "UNASSIGNED") === value,
                ).length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name…"
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

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : !displayWorkers.length ? (
        <div className="border rounded-xl p-10 text-center text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No workers found</p>
          {(search || statusFilter !== "ALL") && <p className="text-sm mt-1">Try adjusting your filters.</p>}
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground hidden sm:table-cell">Company</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground hidden md:table-cell">Role</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground">Compliance</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayWorkers.map((w) => {
                const cfg = complianceConfig(w.complianceStatus);
                const StatusIcon = cfg.icon;
                return (
                  <tr key={w.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/workers/${w.id}`}>
                        <a className="font-medium hover:underline" data-testid={`link-worker-${w.id}`}>
                          {w.name}
                        </a>
                      </Link>
                      {w.email && <p className="text-xs text-muted-foreground mt-0.5">{w.email}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                      {w.company ? (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                          {w.company}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {w.roleName ? (
                        <Badge variant="secondary" className="text-xs">{w.roleName}</Badge>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={cn("text-[10px] flex items-center gap-1", cfg.cls)}>
                        <StatusIcon className="h-3 w-3" />
                        {cfg.label}
                      </Badge>
                    </td>
                    <td className="px-2 py-3">
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

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Worker</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" data-testid="input-worker-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
              </div>
              <div>
                <Label>Company</Label>
                <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Company name" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>WINDA ID</Label>
                <Input value={form.windaId} onChange={(e) => setForm({ ...form, windaId: e.target.value })} placeholder="WINDA ID" />
              </div>
              <div>
                <Label>Role</Label>
                <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} data-testid="select-worker-role">
                  <option value="">No role</option>
                  {roles?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.name || createMutation.isPending} data-testid="button-save-worker">
              {createMutation.isPending ? "Saving…" : "Add Worker"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
