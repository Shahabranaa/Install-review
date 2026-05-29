import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost, apiPatch, apiDelete, apiPut } from "@/lib/api";
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
import { Handshake, Plus, Pencil, Trash2, Award, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Client {
  id: number;
  name: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Cert {
  id: number;
  name: string;
  category: string | null;
  validityMonths: number | null;
}

interface ClientCertReq {
  id: number;
  clientId: number;
  certificationId: number;
  certification: Cert;
}

const emptyForm = { name: "", notes: "" };

function ClientRow({ client, onEdit, onDelete }: {
  client: Client;
  onEdit: (c: Client) => void;
  onDelete: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: reqs, isLoading: reqsLoading } = useQuery<ClientCertReq[]>({
    queryKey: ["client-cert-reqs", client.id],
    queryFn: () => apiFetch<ClientCertReq[]>(`/api/workforce/clients/${client.id}/cert-requirements`),
    enabled: open,
  });

  const { data: allCerts } = useQuery<Cert[]>({
    queryKey: ["workforce-certifications-list"],
    queryFn: () => apiFetch<Cert[]>("/api/workforce/certifications"),
    enabled: open,
  });

  const updateReqsMutation = useMutation({
    mutationFn: (certIds: number[]) =>
      apiPut(`/api/workforce/clients/${client.id}/cert-requirements`, certIds),
    onSuccess: () => {
      toast({ title: "Requirements updated" });
      void qc.invalidateQueries({ queryKey: ["client-cert-reqs", client.id] });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  function toggleCert(certId: number) {
    const current = (reqs ?? []).map(r => r.certificationId);
    const next = current.includes(certId)
      ? current.filter(id => id !== certId)
      : [...current, certId];
    updateReqsMutation.mutate(next);
  }

  const ChevronIcon = open ? ChevronDown : ChevronRight;

  return (
    <div className="border-b last:border-b-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
          onClick={() => setOpen(o => !o)}
          data-testid={`client-row-${client.id}`}
        >
          <ChevronIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <Handshake className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{client.name}</p>
            {client.notes && <p className="text-xs text-muted-foreground truncate">{client.notes}</p>}
          </div>
          <Badge variant="outline" className="text-xs text-muted-foreground">
            {reqs ? `${reqs.length} cert${reqs.length !== 1 ? "s" : ""}` : "…"}
          </Badge>
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(client)} data-testid={`button-edit-client-${client.id}`}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(client.id)}
            data-testid={`button-delete-client-${client.id}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {open && (
        <div className="bg-muted/10 border-t px-6 py-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Cert Requirements Template
          </p>
          {reqsLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : !allCerts?.length ? (
            <p className="text-xs text-muted-foreground">No cert types configured yet.</p>
          ) : (
            <div className="space-y-1">
              {allCerts.map(cert => {
                const selected = (reqs ?? []).some(r => r.certificationId === cert.id);
                return (
                  <label
                    key={cert.id}
                    className="flex items-center gap-2.5 text-sm cursor-pointer py-0.5 select-none"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={selected}
                      onChange={() => toggleCert(cert.id)}
                      disabled={updateReqsMutation.isPending}
                    />
                    <Award className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="flex-1">{cert.name}</span>
                    {cert.category && (
                      <span className="text-xs text-muted-foreground">{cert.category}</span>
                    )}
                    {cert.validityMonths && (
                      <span className="text-xs text-muted-foreground">{cert.validityMonths}m</span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ClientsPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: clients, isLoading } = useQuery<Client[]>({
    queryKey: ["workforce-clients"],
    queryFn: () => apiFetch<Client[]>("/api/workforce/clients"),
  });

  function openNew() { setEditing(null); setForm(emptyForm); setShowDialog(true); }
  function openEdit(c: Client) {
    setEditing(c);
    setForm({ name: c.name, notes: c.notes ?? "" });
    setShowDialog(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = { name: form.name.trim(), notes: form.notes || null };
      return editing
        ? apiPatch(`/api/workforce/clients/${editing.id}`, body)
        : apiPost("/api/workforce/clients", body);
    },
    onSuccess: () => {
      toast({ title: editing ? "Client updated" : "Client created" });
      void qc.invalidateQueries({ queryKey: ["workforce-clients"] });
      setShowDialog(false);
    },
    onError: (err) => toast({ title: "Save failed", description: String(err), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/workforce/clients/${id}`),
    onSuccess: () => {
      toast({ title: "Client deleted" });
      void qc.invalidateQueries({ queryKey: ["workforce-clients"] });
    },
    onError: (err) => toast({ title: "Delete failed", description: String(err), variant: "destructive" }),
  });

  function handleDelete(id: number) {
    if (!confirm("Delete this client? This will also remove all their cert requirement templates.")) return;
    deleteMutation.mutate(id);
  }

  if (!isAdmin) return null;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage client cert requirement templates and stamp them onto sites.</p>
        </div>
        <Button onClick={openNew} data-testid="button-new-client">
          <Plus className="h-4 w-4 mr-1.5" /> New Client
        </Button>
      </div>

      <div className="border rounded-xl bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !clients?.length ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            <Handshake className="h-8 w-8 mx-auto mb-2 opacity-30" />
            No clients yet. Create your first client to start building cert requirement templates.
          </div>
        ) : (
          <div className="divide-y">
            {clients.map(client => (
              <ClientRow
                key={client.id}
                client={client}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Client" : "New Client"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Client name <span className="text-destructive">*</span></Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Acme Corp"
                data-testid="input-client-name"
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!form.name.trim() || saveMutation.isPending}
              data-testid="button-save-client"
            >
              {saveMutation.isPending ? "Saving…" : editing ? "Save changes" : "Create client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
