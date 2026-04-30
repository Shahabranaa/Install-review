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
import { Users, Plus, Search, ChevronRight, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Worker {
  id: number;
  name: string;
  email: string | null;
  company: string | null;
  windaId: string | null;
  roleId: number | null;
  roleName: string | null;
  active: boolean;
  notes: string | null;
}

interface Role {
  id: number;
  name: string;
}

function WorkerStatusDot({ active }: { active: boolean }) {
  return (
    <span className={cn(
      "inline-block h-2 w-2 rounded-full flex-shrink-0",
      active ? "bg-emerald-500" : "bg-muted-foreground/40",
    )} />
  );
}

export default function WorkersPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", company: "", windaId: "", roleId: "" });

  const { data: workers, isLoading } = useQuery<Worker[]>({
    queryKey: ["workforce-workers", search, roleFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (roleFilter) params.set("roleId", roleFilter);
      return apiFetch<Worker[]>(`/api/workforce/workers?${params}`);
    },
  });

  const { data: roles } = useQuery<Role[]>({
    queryKey: ["workforce-roles"],
    queryFn: () => apiFetch<Role[]>("/api/workforce/roles"),
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
      void qc.invalidateQueries({ queryKey: ["workforce-workers"] });
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
          <p className="text-sm text-muted-foreground mt-1">All registered workforce members.</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setShowNew(true)} data-testid="button-add-worker">
            <Plus className="h-4 w-4 mr-1" /> Add Worker
          </Button>
        )}
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
      ) : !workers?.length ? (
        <div className="border rounded-xl p-10 text-center text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No workers found</p>
          {search && <p className="text-sm mt-1">Try adjusting your search.</p>}
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground hidden sm:table-cell">Company</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground hidden md:table-cell">Role</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground hidden lg:table-cell">WINDA ID</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground">Status</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {workers.map((w) => (
                <tr key={w.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <WorkerStatusDot active={w.active} />
                      <Link href={`/workers/${w.id}`}>
                        <a className="font-medium hover:underline" data-testid={`link-worker-${w.id}`}>
                          {w.name}
                        </a>
                      </Link>
                    </div>
                    {w.email && <p className="text-xs text-muted-foreground ml-4 mt-0.5">{w.email}</p>}
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
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono hidden lg:table-cell">
                    {w.windaId ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={w.active ? "default" : "outline"}
                      className={cn("text-[10px]", w.active && "bg-emerald-500 hover:bg-emerald-500")}
                    >
                      {w.active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-2 py-3">
                    <Link href={`/workers/${w.id}`}>
                      <a><ChevronRight className="h-4 w-4 text-muted-foreground" /></a>
                    </Link>
                  </td>
                </tr>
              ))}
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
