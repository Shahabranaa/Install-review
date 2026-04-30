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
import { Building2, Plus, Pencil, ShieldCheck, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface Site {
  id: number;
  name: string;
  location: string | null;
  description: string | null;
  active: boolean;
}

const emptyForm = { name: "", location: "", description: "" };

export default function SitesPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: sites, isLoading } = useQuery<Site[]>({
    queryKey: ["workforce-sites"],
    queryFn: () => apiFetch<Site[]>("/api/workforce/sites"),
  });

  function openNew() { setEditing(null); setForm(emptyForm); setShowDialog(true); }
  function openEdit(s: Site) {
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
      void qc.invalidateQueries({ queryKey: ["workforce-sites"] });
      setShowDialog(false);
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => apiPatch(`/api/workforce/sites/${id}`, { active: false }),
    onSuccess: () => {
      toast({ title: "Site deactivated" });
      void qc.invalidateQueries({ queryKey: ["workforce-sites"] });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Mob Sites
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Mobilisation sites and their workers.</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={openNew} data-testid="button-add-site">
            <Plus className="h-4 w-4 mr-1" /> Add Site
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : !sites?.length ? (
        <div className="border rounded-xl p-10 text-center text-muted-foreground">
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No sites configured yet.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sites.map((s) => (
            <div key={s.id} className={cn("border rounded-xl p-4 bg-card space-y-2", !s.active && "opacity-60")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{s.name}</p>
                  {s.location && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3" /> {s.location}
                    </p>
                  )}
                </div>
                <Badge
                  variant={s.active ? "default" : "outline"}
                  className={cn("text-[10px] flex-shrink-0", s.active && "bg-emerald-500 hover:bg-emerald-500")}
                >
                  {s.active ? "Active" : "Inactive"}
                </Badge>
              </div>
              {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
              <div className="flex items-center gap-2 pt-1">
                <Link href={`/site-compliance?siteId=${s.id}`}>
                  <a>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" data-testid={`button-site-compliance-${s.id}`}>
                      <ShieldCheck className="h-3.5 w-3.5" /> Compliance
                    </Button>
                  </a>
                </Link>
                {isAdmin && (
                  <>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEdit(s)} data-testid={`button-edit-site-${s.id}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {s.active && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground"
                        onClick={() => deactivateMutation.mutate(s.id)}
                        disabled={deactivateMutation.isPending}
                        data-testid={`button-deactivate-site-${s.id}`}
                      >
                        Deactivate
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
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
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!form.name || saveMutation.isPending}
              data-testid="button-save-site"
            >
              {saveMutation.isPending ? "Saving…" : editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
