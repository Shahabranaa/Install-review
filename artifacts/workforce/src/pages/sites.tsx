import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch, apiPost, apiPatch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Building2, Plus, Pencil, ShieldCheck, MapPin, Users, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SiteWithStats {
  id: number;
  name: string;
  location: string | null;
  description: string | null;
  active: boolean;
  workerCount: number;
  readyCount: number;
  expiringCount: number;
  nonCompliantCount: number;
  noReqCount: number;
}

const emptyForm = { name: "", location: "", description: "" };

export default function SitesPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<SiteWithStats | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: sites, isLoading } = useQuery<SiteWithStats[]>({
    queryKey: ["workforce-sites-stats"],
    queryFn: () => apiFetch<SiteWithStats[]>("/api/workforce/sites-with-stats"),
    refetchInterval: 60_000,
  });

  function openNew() { setEditing(null); setForm(emptyForm); setShowDialog(true); }
  function openEdit(s: SiteWithStats) {
    setEditing(s);
    setForm({ name: s.name, location: s.location ?? "", description: s.description ?? "" });
    setShowDialog(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = { name: form.name, location: form.location || null, description: form.description || null };
      return editing
        ? apiPatch(`/api/workforce/sites/${editing.id}`, body)
        : apiPost("/api/workforce/sites", body);
    },
    onSuccess: () => {
      toast({ title: editing ? "Updated" : "Site added" });
      void qc.invalidateQueries({ queryKey: ["workforce-sites-stats"] });
      void qc.invalidateQueries({ queryKey: ["workforce-sites"] });
      setShowDialog(false);
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => apiPatch(`/api/workforce/sites/${id}`, { active: false }),
    onSuccess: () => {
      toast({ title: "Site deactivated" });
      void qc.invalidateQueries({ queryKey: ["workforce-sites-stats"] });
      void qc.invalidateQueries({ queryKey: ["workforce-sites"] });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Mob Sites
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Mobilisation sites with live compliance stats.</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={openNew} data-testid="button-add-site">
            <Plus className="h-4 w-4 mr-1" /> Add Site
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : !sites?.length ? (
        <div className="border rounded-xl p-10 text-center text-muted-foreground">
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No sites configured yet.</p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground">Site</th>
                <th className="text-center px-3 py-2.5 font-medium text-xs text-muted-foreground">Workers</th>
                <th className="text-center px-3 py-2.5 font-medium text-xs text-muted-foreground hidden sm:table-cell">Ready</th>
                <th className="text-center px-3 py-2.5 font-medium text-xs text-muted-foreground hidden sm:table-cell">Expiring</th>
                <th className="text-center px-3 py-2.5 font-medium text-xs text-muted-foreground hidden sm:table-cell">Not Compliant</th>
                <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground hidden md:table-cell">% Ready</th>
                <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">Status</th>
                {isAdmin && <th className="w-20 px-2" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {sites.map((s) => {
                const pctReady = s.workerCount > 0 ? Math.round((s.readyCount / s.workerCount) * 100) : null;
                return (
                  <tr key={s.id} className={cn("hover:bg-muted/30 transition-colors", !s.active && "opacity-60")}>
                    <td className="px-4 py-3">
                      <Link href={`/sites/${s.id}`}>
                        <a className="font-semibold hover:underline" data-testid={`link-site-${s.id}`}>{s.name}</a>
                      </Link>
                      {s.location && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3" /> {s.location}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="flex items-center justify-center gap-1">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        {s.workerCount}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center hidden sm:table-cell">
                      <span className="text-emerald-600 font-medium">{s.readyCount}</span>
                    </td>
                    <td className="px-3 py-3 text-center hidden sm:table-cell">
                      <span className={cn("font-medium", s.expiringCount > 0 ? "text-amber-600" : "text-muted-foreground")}>
                        {s.expiringCount}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center hidden sm:table-cell">
                      <span className={cn("font-medium", s.nonCompliantCount > 0 ? "text-red-600" : "text-muted-foreground")}>
                        {s.nonCompliantCount}
                      </span>
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell">
                      {pctReady !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full", pctReady === 100 ? "bg-emerald-500" : pctReady >= 70 ? "bg-amber-500" : "bg-red-500")}
                              style={{ width: `${pctReady}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{pctReady}%</span>
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <Badge
                        variant={s.active ? "default" : "outline"}
                        className={cn("text-[10px]", s.active && "bg-emerald-500 hover:bg-emerald-500")}
                      >
                        {s.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    {isAdmin && (
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-1">
                          <Link href={`/sites/${s.id}`}>
                            <a>
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Compliance" data-testid={`button-site-view-${s.id}`}>
                                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                              </Button>
                            </a>
                          </Link>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s)} data-testid={`button-edit-site-${s.id}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {s.active && (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deactivateMutation.mutate(s.id)} disabled={deactivateMutation.isPending} data-testid={`button-deactivate-site-${s.id}`} title="Deactivate">
                              ✕
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                    {!isAdmin && (
                      <td className="px-2 py-3">
                        <Link href={`/sites/${s.id}`}>
                          <a><ChevronRight className="h-4 w-4 text-muted-foreground" /></a>
                        </Link>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Site" : "New Site"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. CVOW Offshore Platform A" data-testid="input-site-name" />
            </div>
            <div>
              <Label>Location</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Virginia Beach, VA" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name || saveMutation.isPending} data-testid="button-save-site">
              {saveMutation.isPending ? "Saving…" : editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
