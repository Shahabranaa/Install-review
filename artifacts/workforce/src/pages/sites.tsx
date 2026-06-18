import { useState, Fragment } from "react";
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
import { Building2, Plus, Pencil, ShieldCheck, MapPin, Users, ChevronRight, UserPlus, CalendarDays, ChevronDown, ChevronUp, AlertTriangle, Handshake, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

interface SiteWithStats {
  id: number;
  name: string;
  location: string | null;
  description: string | null;
  active: boolean;
  expectedCompletionDate: string | null;
  mobilisationDate: string | null;
  clientId: number | null;
  clientName: string | null;
  workerCount: number;
  readyCount: number;
  expiringCount: number;
  nonCompliantCount: number;
  noReqCount: number;
}

interface MobReadinessIssue { certName: string; status: string; expiryDate: string | null }
interface MobReadinessWorker { workerId: number; name: string; status: "ready" | "expiring" | "non_compliant" | "no_req"; issues: MobReadinessIssue[] }
interface MobReadinessResult {
  mobilisationDate: string;
  readyCount: number;
  expiringCount: number;
  nonCompliantCount: number;
  noReqCount: number;
  workers: MobReadinessWorker[];
}

interface Worker { id: number; name: string; company: string | null }
interface Client { id: number; name: string }

interface ForecastIssue { certName: string; status: string; expiryDate: string | null }
interface ForecastWorker { workerId: number; name: string; issues: ForecastIssue[] }
interface ForecastMonth {
  month: string;
  readyCount: number;
  expiringCount: number;
  nonCompliantCount: number;
  noReqCount: number;
  details: ForecastWorker[];
}

const emptyForm = { name: "", location: "", description: "", expectedCompletionDate: "", mobilisationDate: "", clientId: "" };

function formatMonth(monthKey: string) {
  const [year, month] = monthKey.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function statusLabel(status: string) {
  switch (status) {
    case "EXPIRED": return "Expired";
    case "EXPIRING": return "Expires soon";
    case "MISSING": return "Missing";
    case "NOT_VERIFIED": return "Not verified";
    default: return status;
  }
}

export default function SitesPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<SiteWithStats | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [assignSite, setAssignSite] = useState<SiteWithStats | null>(null);
  const [assignWorkerId, setAssignWorkerId] = useState("");

  const [forecastSite, setForecastSite] = useState<SiteWithStats | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const [mobCheckSite, setMobCheckSite] = useState<SiteWithStats | null>(null);

  const { data: sites, isLoading } = useQuery<SiteWithStats[]>({
    queryKey: ["workforce-sites-stats"],
    queryFn: () => apiFetch<SiteWithStats[]>("/api/workforce/sites-with-stats"),
    refetchInterval: 60_000,
  });

  const { data: workers } = useQuery<Worker[]>({
    queryKey: ["workforce-workers-raw"],
    queryFn: () => apiFetch<Worker[]>("/api/workforce/workers"),
    enabled: !!assignSite,
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["workforce-clients"],
    queryFn: () => apiFetch<Client[]>("/api/workforce/clients"),
    enabled: isAdmin,
  });

  const { data: forecast, isLoading: forecastLoading } = useQuery<ForecastMonth[]>({
    queryKey: ["site-forecast", forecastSite?.id],
    queryFn: () => apiFetch<ForecastMonth[]>(`/api/workforce/sites/${forecastSite!.id}/readiness-forecast`),
    enabled: !!forecastSite,
  });

  const { data: mobReadiness, isLoading: mobReadinessLoading } = useQuery<MobReadinessResult>({
    queryKey: ["site-mob-readiness", mobCheckSite?.id],
    queryFn: () => apiFetch<MobReadinessResult>(`/api/workforce/sites/${mobCheckSite!.id}/mob-readiness`),
    enabled: !!mobCheckSite && !!mobCheckSite.mobilisationDate,
  });

  const assignMutation = useMutation({
    mutationFn: () => apiPost("/api/workforce/assignments", {
      workerId: parseInt(assignWorkerId),
      siteId: assignSite!.id,
      status: "active",
    }),
    onSuccess: () => {
      toast({ title: "Worker assigned" });
      void qc.invalidateQueries({ queryKey: ["workforce-sites-stats"] });
      setAssignSite(null);
      setAssignWorkerId("");
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  function openNew() { setEditing(null); setForm(emptyForm); setShowDialog(true); }
  function openEdit(s: SiteWithStats) {
    setEditing(s);
    setForm({
      name: s.name,
      location: s.location ?? "",
      description: s.description ?? "",
      expectedCompletionDate: s.expectedCompletionDate ?? "",
      mobilisationDate: s.mobilisationDate ?? "",
      clientId: s.clientId ? String(s.clientId) : "",
    });
    setShowDialog(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        location: form.location || null,
        description: form.description || null,
        expectedCompletionDate: form.expectedCompletionDate || null,
        mobilisationDate: form.mobilisationDate || null,
        clientId: form.clientId || null,
      };
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

  const worstForecastStatus = (f: ForecastMonth[]) => {
    if (f.some(m => m.nonCompliantCount > 0)) return "red";
    if (f.some(m => m.expiringCount > 0)) return "amber";
    return "green";
  };

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
                {isAdmin && <th className="w-28 px-2" />}
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
                      {s.expectedCompletionDate && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <CalendarDays className="h-3 w-3" />
                          Ends {new Date(`${s.expectedCompletionDate}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      )}
                      {s.mobilisationDate && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Rocket className="h-3 w-3 text-violet-500" />
                          Mob {new Date(`${s.mobilisationDate}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      )}
                      {s.clientName && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Handshake className="h-3 w-3" /> {s.clientName}
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
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7"
                            title="Readiness forecast"
                            onClick={() => { setForecastSite(s); setExpandedMonth(null); }}
                            data-testid={`button-forecast-${s.id}`}
                          >
                            <CalendarDays className="h-3.5 w-3.5 text-blue-500" />
                          </Button>
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7"
                            title={s.mobilisationDate ? "Mob-day readiness check" : "Mob-day readiness check (no mob date set)"}
                            onClick={() => setMobCheckSite(s)}
                            data-testid={`button-mob-check-${s.id}`}
                          >
                            <Rocket className={cn("h-3.5 w-3.5", s.mobilisationDate ? "text-violet-500" : "text-muted-foreground")} />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Assign worker" onClick={() => { setAssignSite(s); setAssignWorkerId(""); }} data-testid={`button-assign-worker-${s.id}`}>
                            <UserPlus className="h-3.5 w-3.5" />
                          </Button>
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
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7"
                            title="Readiness forecast"
                            onClick={() => { setForecastSite(s); setExpandedMonth(null); }}
                            data-testid={`button-forecast-${s.id}`}
                          >
                            <CalendarDays className="h-3.5 w-3.5 text-blue-500" />
                          </Button>
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7"
                            title={s.mobilisationDate ? "Mob-day readiness check" : "Mob-day readiness check (no mob date set)"}
                            onClick={() => setMobCheckSite(s)}
                            data-testid={`button-mob-check-${s.id}`}
                          >
                            <Rocket className={cn("h-3.5 w-3.5", s.mobilisationDate ? "text-violet-500" : "text-muted-foreground")} />
                          </Button>
                          <Link href={`/sites/${s.id}`}>
                            <a><ChevronRight className="h-4 w-4 text-muted-foreground" /></a>
                          </Link>
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

      {/* Create / Edit Site dialog */}
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
            <div>
              <Label>Expected completion date</Label>
              <Input
                type="date"
                value={form.expectedCompletionDate}
                onChange={(e) => setForm({ ...form, expectedCompletionDate: e.target.value })}
                data-testid="input-site-completion-date"
              />
              <p className="text-xs text-muted-foreground mt-1">Used to generate the readiness forecast across the project lifecycle.</p>
            </div>
            <div>
              <Label>Mobilisation date</Label>
              <Input
                type="date"
                value={form.mobilisationDate}
                onChange={(e) => setForm({ ...form, mobilisationDate: e.target.value })}
                data-testid="input-site-mob-date"
              />
              <p className="text-xs text-muted-foreground mt-1">Used for the mob-day readiness check — shows each worker's cert compliance status on this date.</p>
            </div>
            {clients && clients.length > 0 && (
              <div>
                <Label>Client</Label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                  value={form.clientId}
                  onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                  data-testid="select-site-client"
                >
                  <option value="">No client linked</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  {form.clientId
                    ? editing
                      ? "Changing the client will additively apply its cert template to this site."
                      : "The selected client's cert requirements will be automatically applied."
                    : "Optionally link a client to auto-apply its cert requirement template."}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name || saveMutation.isPending} data-testid="button-save-site">
              {saveMutation.isPending ? "Saving…" : editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Worker dialog */}
      <Dialog open={!!assignSite} onOpenChange={(open) => { if (!open) { setAssignSite(null); setAssignWorkerId(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Worker — {assignSite?.name}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label>Select Worker</Label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
              value={assignWorkerId}
              onChange={(e) => setAssignWorkerId(e.target.value)}
              data-testid="select-assign-worker"
            >
              <option value="">Choose a worker…</option>
              {workers?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}{w.company ? ` — ${w.company}` : ""}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAssignSite(null); setAssignWorkerId(""); }}>Cancel</Button>
            <Button
              onClick={() => assignMutation.mutate()}
              disabled={!assignWorkerId || assignMutation.isPending}
              data-testid="button-confirm-assign-worker"
            >
              {assignMutation.isPending ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mob-Day Readiness Check dialog */}
      <Dialog open={!!mobCheckSite} onOpenChange={(open) => { if (!open) setMobCheckSite(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-violet-500" />
              Mob-Day Check — {mobCheckSite?.name}
            </DialogTitle>
          </DialogHeader>

          {!mobCheckSite?.mobilisationDate ? (
            <div className="py-8 text-center text-muted-foreground space-y-2">
              <Rocket className="h-10 w-10 mx-auto opacity-20" />
              <p className="font-medium">No mobilisation date set</p>
              <p className="text-sm">Edit this site and add a mobilisation date to run the mob-day readiness check.</p>
            </div>
          ) : mobReadinessLoading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
            </div>
          ) : !mobReadiness ? (
            <div className="py-8 text-center text-muted-foreground">
              <p className="font-medium">No data available</p>
              <p className="text-sm mt-1">No workers assigned or mob-readiness data could not be loaded.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Date banner */}
              <p className="text-sm text-muted-foreground">
                Compliance status as of{" "}
                <span className="font-semibold text-foreground">
                  {new Date(`${mobReadiness.mobilisationDate}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </span>
              </p>

              {/* Summary banner */}
              {(() => {
                const colour = mobReadiness.nonCompliantCount > 0 ? "red" : mobReadiness.expiringCount > 0 ? "amber" : "green";
                return (
                  <div className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
                    colour === "red" ? "bg-red-50 text-red-700 border border-red-200" :
                    colour === "amber" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                    "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  )}>
                    {colour !== "green" && <AlertTriangle className="h-4 w-4 shrink-0" />}
                    {colour === "red" && `${mobReadiness.nonCompliantCount} worker${mobReadiness.nonCompliantCount !== 1 ? "s" : ""} will be non-compliant on mob day — action required.`}
                    {colour === "amber" && `${mobReadiness.expiringCount} worker${mobReadiness.expiringCount !== 1 ? "s" : ""} have certs expiring within 30 days of mob day.`}
                    {colour === "green" && "All workers are compliant on mob day."}
                  </div>
                );
              })()}

              {/* Summary counts */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded-lg border p-2">
                  <p className="text-emerald-600 font-bold text-lg">{mobReadiness.readyCount}</p>
                  <p className="text-muted-foreground">Ready</p>
                </div>
                <div className="rounded-lg border p-2">
                  <p className={cn("font-bold text-lg", mobReadiness.expiringCount > 0 ? "text-amber-600" : "text-muted-foreground")}>{mobReadiness.expiringCount}</p>
                  <p className="text-muted-foreground">Expiring</p>
                </div>
                <div className="rounded-lg border p-2">
                  <p className={cn("font-bold text-lg", mobReadiness.nonCompliantCount > 0 ? "text-red-600" : "text-muted-foreground")}>{mobReadiness.nonCompliantCount}</p>
                  <p className="text-muted-foreground">Non-Compliant</p>
                </div>
                <div className="rounded-lg border p-2">
                  <p className="text-muted-foreground font-bold text-lg">{mobReadiness.noReqCount}</p>
                  <p className="text-muted-foreground">No Reqs</p>
                </div>
              </div>

              {/* Worker table */}
              {mobReadiness.workers.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Worker</th>
                        <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Status</th>
                        <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Issues on Mob Day</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {mobReadiness.workers.map((w) => (
                        <tr key={w.workerId} className="hover:bg-muted/20 transition-colors">
                          <td className="px-3 py-2.5 font-medium">{w.name}</td>
                          <td className="px-3 py-2.5">
                            {w.status === "ready" && <Badge className="bg-emerald-500 hover:bg-emerald-500 text-[10px]">Ready</Badge>}
                            {w.status === "expiring" && <Badge className="bg-amber-500 hover:bg-amber-500 text-[10px]">Expiring</Badge>}
                            {w.status === "non_compliant" && <Badge variant="destructive" className="text-[10px]">Non-Compliant</Badge>}
                            {w.status === "no_req" && <Badge variant="outline" className="text-[10px]">No Reqs</Badge>}
                          </td>
                          <td className="px-3 py-2.5">
                            {w.issues.length === 0 ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              <ul className="space-y-0.5">
                                {w.issues.map((issue, idx) => (
                                  <li key={idx} className="text-xs">
                                    <span className={cn(
                                      "font-medium",
                                      issue.status === "EXPIRED" || issue.status === "MISSING" || issue.status === "NOT_VERIFIED"
                                        ? "text-red-600" : "text-amber-600"
                                    )}>
                                      {statusLabel(issue.status)}
                                    </span>
                                    {" — "}{issue.certName}
                                    {issue.expiryDate && (
                                      <span className="text-muted-foreground"> ({new Date(`${issue.expiryDate}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })})</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setMobCheckSite(null)}>Close</Button>
            {mobCheckSite && isAdmin && (
              <Button variant="outline" onClick={() => { openEdit(mobCheckSite); setMobCheckSite(null); }}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit Site
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Readiness Forecast dialog */}
      <Dialog open={!!forecastSite} onOpenChange={(open) => { if (!open) setForecastSite(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-blue-500" />
              Readiness Forecast — {forecastSite?.name}
            </DialogTitle>
          </DialogHeader>

          {!forecastSite?.expectedCompletionDate ? (
            <div className="py-8 text-center text-muted-foreground space-y-2">
              <CalendarDays className="h-10 w-10 mx-auto opacity-20" />
              <p className="font-medium">No completion date set</p>
              <p className="text-sm">Edit this site and add an expected completion date to enable the lifecycle forecast.</p>
            </div>
          ) : forecastLoading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
            </div>
          ) : !forecast?.length ? (
            <div className="py-8 text-center text-muted-foreground">
              <p className="font-medium">No forecast data</p>
              <p className="text-sm mt-1">The completion date may be in the past, or no workers are assigned.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {/* Summary badge */}
              {(() => {
                const colour = worstForecastStatus(forecast);
                return (
                  <div className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm mb-3",
                    colour === "red" ? "bg-red-50 text-red-700 border border-red-200" :
                    colour === "amber" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                    "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  )}>
                    {colour !== "green" && <AlertTriangle className="h-4 w-4 shrink-0" />}
                    {colour === "red" && "Workers will become non-compliant during this project — action required."}
                    {colour === "amber" && "Some certifications will expire during this project — plan renewals ahead of time."}
                    {colour === "green" && "All workers remain compliant through the project completion date."}
                  </div>
                );
              })()}

              {/* Month-by-month table */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Month</th>
                      <th className="text-center px-3 py-2 font-medium text-xs text-emerald-600">Ready</th>
                      <th className="text-center px-3 py-2 font-medium text-xs text-amber-600">Expiring</th>
                      <th className="text-center px-3 py-2 font-medium text-xs text-red-600">Non-Compliant</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {forecast.map((m) => {
                      const isExpanded = expandedMonth === m.month;
                      const hasIssues = m.expiringCount > 0 || m.nonCompliantCount > 0;
                      return (
                        <Fragment key={m.month}>
                          <tr
                            className={cn(
                              "transition-colors",
                              hasIssues ? "cursor-pointer hover:bg-muted/30" : "",
                              isExpanded ? "bg-muted/20" : "",
                            )}
                            onClick={() => hasIssues && setExpandedMonth(isExpanded ? null : m.month)}
                          >
                            <td className="px-3 py-2.5 font-medium">{formatMonth(m.month)}</td>
                            <td className="px-3 py-2.5 text-center">
                              <span className="text-emerald-600 font-medium">{m.readyCount}</span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={cn("font-medium", m.expiringCount > 0 ? "text-amber-600" : "text-muted-foreground")}>
                                {m.expiringCount}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={cn("font-medium", m.nonCompliantCount > 0 ? "text-red-600" : "text-muted-foreground")}>
                                {m.nonCompliantCount}
                              </span>
                            </td>
                            <td className="px-2 py-2.5 text-center text-muted-foreground">
                              {hasIssues && (isExpanded ? <ChevronUp className="h-3.5 w-3.5 inline" /> : <ChevronDown className="h-3.5 w-3.5 inline" />)}
                            </td>
                          </tr>
                          {isExpanded && m.details.length > 0 && (
                            <tr key={`${m.month}-detail`} className="bg-muted/10">
                              <td colSpan={5} className="px-4 py-3">
                                <div className="space-y-2">
                                  {m.details.map((w) => (
                                    <div key={w.workerId} className="flex items-start gap-2">
                                      <span className={cn(
                                        "mt-0.5 h-2 w-2 rounded-full shrink-0",
                                        w.issues.some(i => i.status === "EXPIRED" || i.status === "MISSING" || i.status === "NOT_VERIFIED")
                                          ? "bg-red-500" : "bg-amber-400"
                                      )} />
                                      <div>
                                        <p className="font-medium text-sm">{w.name}</p>
                                        <ul className="text-xs text-muted-foreground space-y-0.5 mt-0.5">
                                          {w.issues.map((issue, idx) => (
                                            <li key={idx}>
                                              <span className={cn(
                                                "font-medium",
                                                issue.status === "EXPIRED" || issue.status === "MISSING" || issue.status === "NOT_VERIFIED"
                                                  ? "text-red-600" : "text-amber-600"
                                              )}>
                                                {statusLabel(issue.status)}
                                              </span>
                                              {" — "}{issue.certName}
                                              {issue.expiryDate && (
                                                <span> ({new Date(issue.expiryDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })})</span>
                                              )}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setForecastSite(null)}>Close</Button>
            {forecastSite && isAdmin && (
              <Button variant="outline" onClick={() => { openEdit(forecastSite); setForecastSite(null); }}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit Site
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
