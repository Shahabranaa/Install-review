import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPatch, apiPost, apiDelete } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Loader2,
  Save,
  KeyRound,
  User,
  Lock,
  FileText,
  Upload,
  ExternalLink,
  ChevronsUpDown,
  Check,
  X,
  Briefcase,
  Calendar,
  Sparkles,
  ShieldCheck,
  Phone,
  Clock,
  AlertCircle,
  Trash2,
  Pencil,
  Plus,
} from "lucide-react";
import { AIRPORTS, type Airport } from "@/data/airports";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface WorkerProfile {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  preferredAirport: string[] | null;
  qualifications: string | null;
  notes: string | null;
  passportNo: string | null;
  passportIssueDate: string | null;
  passportExpiryDate: string | null;
  passportPlaceOfBirth: string | null;
  passportWasabiKey: string | null;
  nokName: string | null;
  nokRelationship: string | null;
  nokPhone: string | null;
  portalUsername: string | null;
  windaId: string | null;
  roleName: string | null;
  cvWasabiKey: string | null;
  cvUploadedAt: string | null;
}

interface RoleHistoryEntry {
  id: number;
  roleNameSnapshot: string;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  source: string;
}

const EMPTY_ROLE_FORM = { roleNameSnapshot: "", startDate: "", endDate: "", notes: "" };
type RoleFormFields = typeof EMPTY_ROLE_FORM;

// ── Airport multi-select ──────────────────────────────────────────────────────

interface AirportMultiSelectProps {
  value: string[];
  onChange: (val: string[]) => void;
}

function AirportMultiSelect({ value, onChange }: AirportMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query) return AIRPORTS.slice(0, 100);
    const q = query.toLowerCase();
    return AIRPORTS.filter(
      (a) =>
        a.iata.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.city.toLowerCase().includes(q) ||
        a.country.toLowerCase().includes(q)
    ).slice(0, 100);
  }, [query]);

  function toggle(iata: string) {
    if (value.includes(iata)) {
      onChange(value.filter((v) => v !== iata));
    } else {
      onChange([...value, iata]);
    }
  }

  function remove(iata: string) {
    onChange(value.filter((v) => v !== iata));
  }

  function airportLabel(iata: string): string {
    const a = AIRPORTS.find((ap) => ap.iata === iata);
    return a ? `${iata} – ${a.city}` : iata;
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal text-sm h-9 px-3"
          >
            <span className="text-muted-foreground">
              {value.length === 0
                ? "Search airports…"
                : `${value.length} airport${value.length > 1 ? "s" : ""} selected`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0 w-[var(--radix-popover-trigger-width)]"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search by IATA, name, city or country…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>No airports found.</CommandEmpty>
              <CommandGroup>
                {filtered.map((airport: Airport) => {
                  const selected = value.includes(airport.iata);
                  return (
                    <CommandItem
                      key={airport.iata}
                      value={airport.iata}
                      onSelect={() => toggle(airport.iata)}
                      className="cursor-pointer"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 flex-shrink-0",
                          selected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="font-mono text-xs font-semibold w-9 flex-shrink-0 text-primary">
                        {airport.iata}
                      </span>
                      <span className="truncate text-sm">
                        {airport.city}
                        <span className="text-muted-foreground ml-1">
                          · {airport.country}
                        </span>
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((iata) => (
            <Badge
              key={iata}
              variant="secondary"
              className="gap-1 pr-1 text-xs"
            >
              {airportLabel(iata)}
              <button
                type="button"
                className="ml-0.5 rounded-sm hover:bg-muted p-0.5"
                onClick={() => remove(iata)}
                aria-label={`Remove ${iata}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-5 py-4 border-b flex items-start justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-snug">{title}</h2>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

// ── Profile page ──────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { toast } = useToast();
  const { refresh } = useAuth();
  const qc = useQueryClient();

  const profileQ = useQuery<WorkerProfile>({
    queryKey: ["worker-profile"],
    queryFn: () => apiFetch("/api/worker-portal/profile"),
  });

  const roleHistoryQ = useQuery<RoleHistoryEntry[]>({
    queryKey: ["worker-portal-role-history"],
    queryFn: () => apiFetch<RoleHistoryEntry[]>("/api/worker-portal/role-history"),
  });

  // ── Form state ──────────────────────────────────────────────────────────────

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    preferredAirport: [] as string[],
  });

  const [passportForm, setPassportForm] = useState({
    passportNo: "",
    passportPlaceOfBirth: "",
    passportIssueDate: "",
    passportExpiryDate: "",
  });

  const [cvForm, setCvForm] = useState({
    qualifications: "",
    notes: "",
  });

  const [nokForm, setNokForm] = useState({
    nokName: "",
    nokRelationship: "",
    nokPhone: "",
  });

  const [roleForm, setRoleForm] = useState<RoleFormFields>(EMPTY_ROLE_FORM);
  const [roleFormMode, setRoleFormMode] = useState<{ mode: "add" } | { mode: "edit"; id: number } | null>(null);
  const [deleteRoleId, setDeleteRoleId] = useState<number | null>(null);

  const [pwForm, setPwForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  // ── File upload state ───────────────────────────────────────────────────────

  const cvInputRef = useRef<HTMLInputElement>(null);
  const [cvUploading, setCvUploading] = useState(false);

  const passportInputRef = useRef<HTMLInputElement>(null);
  const [passportUploading, setPassportUploading] = useState(false);

  // No separate extract state needed — extraction runs inside upload

  // ── Populate forms from profile data ───────────────────────────────────────

  useEffect(() => {
    if (profileQ.data) {
      const p = profileQ.data;
      setForm({
        name: p.name ?? "",
        email: p.email ?? "",
        phone: p.phone ?? "",
        company: p.company ?? "",
        preferredAirport: p.preferredAirport ?? [],
      });
      setPassportForm({
        passportNo: p.passportNo ?? "",
        passportPlaceOfBirth: p.passportPlaceOfBirth ?? "",
        passportIssueDate: p.passportIssueDate ?? "",
        passportExpiryDate: p.passportExpiryDate ?? "",
      });
      setCvForm({
        qualifications: p.qualifications ?? "",
        notes: p.notes ?? "",
      });
      setNokForm({
        nokName: p.nokName ?? "",
        nokRelationship: p.nokRelationship ?? "",
        nokPhone: p.nokPhone ?? "",
      });
    }
  }, [profileQ.data]);

  // ── Mutations ───────────────────────────────────────────────────────────────

  const saveMut = useMutation({
    mutationFn: (data: typeof form) =>
      apiPatch<WorkerProfile>("/api/worker-portal/profile", data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["worker-profile"] });
      await refresh();
      toast({ title: "Profile saved" });
    },
    onError: (err: Error) =>
      toast({ title: "Failed to save", description: err.message, variant: "destructive" }),
  });

  const savePassportMut = useMutation({
    mutationFn: (data: typeof passportForm) =>
      apiPatch<WorkerProfile>("/api/worker-portal/profile", data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["worker-profile"] });
      toast({ title: "Passport details saved" });
    },
    onError: (err: Error) =>
      toast({ title: "Failed to save", description: err.message, variant: "destructive" }),
  });

  const saveCvMut = useMutation({
    mutationFn: (data: typeof cvForm) =>
      apiPatch<WorkerProfile>("/api/worker-portal/profile", data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["worker-profile"] });
      toast({ title: "CV details saved" });
    },
    onError: (err: Error) =>
      toast({ title: "Failed to save", description: err.message, variant: "destructive" }),
  });

  const saveNokMut = useMutation({
    mutationFn: (data: typeof nokForm) =>
      apiPatch<WorkerProfile>("/api/worker-portal/profile", data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["worker-profile"] });
      toast({ title: "Next of kin saved" });
    },
    onError: (err: Error) =>
      toast({ title: "Failed to save", description: err.message, variant: "destructive" }),
  });

  const pwMut = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      apiPost<{ ok: boolean }>("/api/worker-portal/change-password", data),
    onSuccess: () => {
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast({ title: "Password changed successfully" });
    },
    onError: (err: Error) =>
      toast({ title: "Failed to change password", description: err.message, variant: "destructive" }),
  });

  const removeCvMut = useMutation({
    mutationFn: () =>
      fetch(`${BASE}/api/worker-portal/profile/cv`, { method: "DELETE", credentials: "include" }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `Error ${r.status}`);
        return r.json() as Promise<{ ok: boolean }>;
      }),
    onSuccess: () => {
      toast({ title: "CV removed", description: "Your CV and extracted data have been deleted." });
      void qc.invalidateQueries({ queryKey: ["worker-profile"] });
      void qc.invalidateQueries({ queryKey: ["worker-portal-role-history"] });
    },
    onError: (err: Error) =>
      toast({ title: "Failed to remove CV", description: err.message, variant: "destructive" }),
  });

  // ── Role history mutations ──────────────────────────────────────────────────

  const addRoleMut = useMutation({
    mutationFn: (fields: RoleFormFields) =>
      apiPost("/api/worker-portal/role-history", {
        roleNameSnapshot: fields.roleNameSnapshot,
        startDate: fields.startDate,
        endDate: fields.endDate || null,
        notes: fields.notes || null,
      }),
    onSuccess: () => {
      toast({ title: "Role added" });
      void qc.invalidateQueries({ queryKey: ["worker-portal-role-history"] });
      setRoleFormMode(null);
    },
    onError: (err: Error) =>
      toast({ title: "Failed to add role", description: err.message, variant: "destructive" }),
  });

  const editRoleMut = useMutation({
    mutationFn: ({ id, fields }: { id: number; fields: RoleFormFields }) =>
      apiPatch(`/api/worker-portal/role-history/${id}`, {
        roleNameSnapshot: fields.roleNameSnapshot,
        startDate: fields.startDate,
        endDate: fields.endDate || null,
        notes: fields.notes || null,
      }),
    onSuccess: () => {
      toast({ title: "Role updated" });
      void qc.invalidateQueries({ queryKey: ["worker-portal-role-history"] });
      setRoleFormMode(null);
    },
    onError: (err: Error) =>
      toast({ title: "Failed to update role", description: err.message, variant: "destructive" }),
  });

  const deleteRoleMut = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/worker-portal/role-history/${id}`),
    onSuccess: () => {
      toast({ title: "Role removed" });
      void qc.invalidateQueries({ queryKey: ["worker-portal-role-history"] });
      setDeleteRoleId(null);
    },
    onError: (err: Error) =>
      toast({ title: "Failed to remove role", description: err.message, variant: "destructive" }),
  });

  function openAddRole() {
    setRoleForm(EMPTY_ROLE_FORM);
    setRoleFormMode({ mode: "add" });
  }

  function openEditRole(entry: RoleHistoryEntry) {
    setRoleForm({
      roleNameSnapshot: entry.roleNameSnapshot,
      startDate: entry.startDate,
      endDate: entry.endDate ?? "",
      notes: entry.notes ?? "",
    });
    setRoleFormMode({ mode: "edit", id: entry.id });
  }

  function submitRoleForm(e: React.FormEvent) {
    e.preventDefault();
    if (!roleFormMode) return;
    if (roleFormMode.mode === "add") {
      addRoleMut.mutate(roleForm);
    } else {
      editRoleMut.mutate({ id: roleFormMode.id, fields: roleForm });
    }
  }

  // ── File handlers ───────────────────────────────────────────────────────────

  async function handlePassportUpload(file: File) {
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Accepted: PDF, JPEG, PNG, WebP.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Passport scan must be under 10 MB.", variant: "destructive" });
      return;
    }
    setPassportUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${BASE}/api/worker-portal/passport-upload`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((err as { error?: string }).error ?? `Upload failed: ${res.status}`);
      }
      const data = await res.json() as {
        passportWasabiKey: string;
        filename: string;
        extracted: {
          passportNo?: string;
          passportPlaceOfBirth?: string;
          passportIssueDate?: string;
          passportExpiryDate?: string;
          name?: string;
        } | null;
      };

      // Auto-fill passport fields from AI extraction result BEFORE invalidating
      // the profile query — this prevents the useEffect re-render from wiping them.
      // The server now also persists these to DB so a page refresh keeps them.
      if (data.extracted) {
        const ext = data.extracted;
        setPassportForm((f) => ({
          passportNo: ext.passportNo ?? f.passportNo,
          passportPlaceOfBirth: ext.passportPlaceOfBirth ?? f.passportPlaceOfBirth,
          passportIssueDate: ext.passportIssueDate ?? f.passportIssueDate,
          passportExpiryDate: ext.passportExpiryDate ?? f.passportExpiryDate,
        }));
        const filled = [ext.passportNo, ext.passportPlaceOfBirth, ext.passportIssueDate, ext.passportExpiryDate].filter(Boolean).length;
        toast({
          title: "Passport uploaded & scanned",
          description: filled > 0
            ? `${filled} field${filled > 1 ? "s" : ""} auto-filled — review and save.`
            : "Couldn't read details — please fill in manually.",
        });
      } else {
        toast({ title: "Passport uploaded", description: "Fill in the details below and save." });
      }

      await qc.invalidateQueries({ queryKey: ["worker-profile"] });
    } catch (err) {
      toast({ title: "Upload failed", description: String(err), variant: "destructive" });
    } finally {
      setPassportUploading(false);
      if (passportInputRef.current) passportInputRef.current.value = "";
    }
  }

  async function handleCvUpload(file: File) {
    const allowedCvTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "text/csv",
      "text/plain",
      "application/rtf",
      "text/rtf",
    ];
    if (!allowedCvTypes.includes(file.type) && !file.name.match(/\.(pdf|docx|doc|csv|txt|rtf)$/i)) {
      toast({ title: "Invalid file type", description: "Accepted: PDF, Word (DOCX/DOC), CSV, TXT, RTF.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "CV must be under 10 MB.", variant: "destructive" });
      return;
    }
    setCvUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${BASE}/api/worker-portal/profile/cv`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((err as { error?: string }).error ?? `Upload failed: ${res.status}`);
      }
      const data = await res.json() as {
        cvWasabiKey: string;
        filename: string;
        extracted: {
          roles: { project: string; role: string; dateFrom: string; dateTo: string }[];
          qualifications: string | null;
          notes: string | null;
        } | null;
      };

      // Auto-fill qualifications/notes BEFORE invalidating the profile query —
      // prevents the useEffect re-render from wiping the extracted values.
      // The server persists these to DB so a page refresh also shows them.
      if (data.extracted) {
        const ext = data.extracted;
        setCvForm((f) => ({
          ...f,
          qualifications: ext.qualifications ?? f.qualifications,
          notes: ext.notes ?? f.notes,
        }));
        const roleCount = ext.roles?.length ?? 0;
        toast({
          title: "CV uploaded & processed",
          description: roleCount > 0
            ? `Found ${roleCount} role${roleCount > 1 ? "s" : ""} in work history — qualifications and notes auto-filled.`
            : "Uploaded. No work history found — you can fill in the details below.",
        });
      } else {
        toast({ title: "CV uploaded" });
      }

      await qc.invalidateQueries({ queryKey: ["worker-profile"] });
      await qc.invalidateQueries({ queryKey: ["worker-portal-role-history"] });
    } catch (err) {
      toast({ title: "Upload failed", description: String(err), variant: "destructive" });
    } finally {
      setCvUploading(false);
      if (cvInputRef.current) cvInputRef.current.value = "";
    }
  }

  function handlePwChange(e: React.FormEvent) {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      toast({ title: "Passwords don't match", description: "New password and confirmation must match.", variant: "destructive" });
      return;
    }
    if (pwForm.newPassword.length < 8) {
      toast({ title: "Password too short", description: "New password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    pwMut.mutate({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
  }

  // ── CV staleness check ──────────────────────────────────────────────────────

  const profile = profileQ.data;

  const cvIsStale = useMemo(() => {
    if (!profile?.cvUploadedAt) return false;
    const uploaded = new Date(profile.cvUploadedAt);
    const now = new Date();
    const monthsOld = (now.getFullYear() - uploaded.getFullYear()) * 12 + (now.getMonth() - uploaded.getMonth());
    return monthsOld >= 6;
  }, [profile?.cvUploadedAt]);

  // ── Loading / error states ──────────────────────────────────────────────────

  if (profileQ.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (profileQ.isError) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <p className="text-sm text-destructive">Failed to load profile. Please refresh.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

      {/* ── Section 1: Personal details ── */}
      <section className="rounded-xl border bg-card overflow-hidden">
        <SectionHeader
          icon={User}
          title="Personal details"
          description="Your basic contact information"
        />
        <form
          onSubmit={(e) => { e.preventDefault(); saveMut.mutate(form); }}
          className="px-5 py-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="prof-name">Full name <span className="text-destructive">*</span></Label>
              <Input
                id="prof-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Your full name"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prof-email">Email</Label>
              <Input
                id="prof-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="your@email.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prof-phone">Phone</Label>
              <Input
                id="prof-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+44 7700 000000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prof-company">Company</Label>
              <Input
                id="prof-company"
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                placeholder="Employer / contractor"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Portal username</Label>
              <Input value={profile?.portalUsername ?? "—"} disabled className="bg-muted/40 text-muted-foreground" />
            </div>
            {profile?.windaId && (
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">WINDA ID</Label>
                <Input value={profile.windaId} disabled className="bg-muted/40 text-muted-foreground" />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Preferred departure airports</Label>
            <AirportMultiSelect
              value={form.preferredAirport}
              onChange={(val) => setForm((f) => ({ ...f, preferredAirport: val }))}
            />
          </div>

          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={saveMut.isPending} className="gap-2">
              {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save changes
            </Button>
          </div>
        </form>
      </section>

      {/* ── Section 2: Passport ── */}
      <section className="rounded-xl border bg-card overflow-hidden">
        <SectionHeader
          icon={ShieldCheck}
          title="Passport"
          description="Travel document details and scan"
        />

        {/* Passport scan upload */}
        <div className="px-5 pt-5 pb-4 border-b">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Document scan</p>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Details auto-fill on upload
            </span>
          </div>

          {profile?.passportWasabiKey ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <FileText className="h-8 w-8 text-primary/60 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {profile.passportWasabiKey.split("/").pop()}
                  </p>
                  <p className="text-xs text-muted-foreground">Passport scan on file</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button size="sm" variant="outline" className="gap-1.5" asChild>
                  <a href={`${BASE}/api/worker-portal/passport`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                    View
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={passportUploading}
                  onClick={() => passportInputRef.current?.click()}
                >
                  {passportUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  Replace
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <p className="text-sm text-muted-foreground flex-1">
                No passport scan uploaded yet. Upload a scan and we can auto-fill the details below.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 flex-shrink-0"
                disabled={passportUploading}
                onClick={() => passportInputRef.current?.click()}
              >
                {passportUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Upload passport
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3">PDF, JPEG, PNG or WebP · max 10 MB</p>
          <input
            ref={passportInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handlePassportUpload(file);
            }}
          />
        </div>

        {/* Passport details form */}
        <form
          onSubmit={(e) => { e.preventDefault(); savePassportMut.mutate(passportForm); }}
          className="px-5 py-5 space-y-4"
        >
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Passport details</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="prof-passport-no">Passport number</Label>
              <Input
                id="prof-passport-no"
                value={passportForm.passportNo}
                onChange={(e) => setPassportForm((f) => ({ ...f, passportNo: e.target.value }))}
                placeholder="e.g. 123456789"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prof-passport-pob">Place of birth</Label>
              <Input
                id="prof-passport-pob"
                value={passportForm.passportPlaceOfBirth}
                onChange={(e) => setPassportForm((f) => ({ ...f, passportPlaceOfBirth: e.target.value }))}
                placeholder="e.g. Dublin"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prof-passport-issue">Issue date</Label>
              <Input
                id="prof-passport-issue"
                type="date"
                value={passportForm.passportIssueDate}
                onChange={(e) => setPassportForm((f) => ({ ...f, passportIssueDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prof-passport-expiry">Expiry date</Label>
              <Input
                id="prof-passport-expiry"
                type="date"
                value={passportForm.passportExpiryDate}
                onChange={(e) => setPassportForm((f) => ({ ...f, passportExpiryDate: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={savePassportMut.isPending} className="gap-2">
              {savePassportMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save passport details
            </Button>
          </div>
        </form>
      </section>

      {/* ── Section 3: Next of kin ── */}
      <section className="rounded-xl border bg-card overflow-hidden">
        <SectionHeader
          icon={Phone}
          title="Next of kin"
          description="Emergency contact information"
        />
        <form
          onSubmit={(e) => { e.preventDefault(); saveNokMut.mutate(nokForm); }}
          className="px-5 py-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="prof-nok-name">Full name</Label>
              <Input
                id="prof-nok-name"
                value={nokForm.nokName}
                onChange={(e) => setNokForm((f) => ({ ...f, nokName: e.target.value }))}
                placeholder="e.g. Jane Smith"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prof-nok-rel">Relationship</Label>
              <Input
                id="prof-nok-rel"
                value={nokForm.nokRelationship}
                onChange={(e) => setNokForm((f) => ({ ...f, nokRelationship: e.target.value }))}
                placeholder="e.g. Spouse, Parent"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prof-nok-phone">Phone number</Label>
              <Input
                id="prof-nok-phone"
                type="tel"
                value={nokForm.nokPhone}
                onChange={(e) => setNokForm((f) => ({ ...f, nokPhone: e.target.value }))}
                placeholder="+44 7700 000000"
              />
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={saveNokMut.isPending} className="gap-2">
              {saveNokMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save next of kin
            </Button>
          </div>
        </form>
      </section>

      {/* ── Section 4: CV & role history ── */}
      <section className="rounded-xl border bg-card overflow-hidden">
        <SectionHeader
          icon={Briefcase}
          title="CV & work history"
          description="Upload your CV and review extracted roles"
        />

        {/* CV upload row */}
        <div className="px-5 pt-5 pb-4 border-b">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">CV document</p>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Roles &amp; qualifications extracted on upload
            </span>
          </div>

          {cvIsStale && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2.5 mb-3">
              <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Your CV was uploaded more than 6 months ago. Consider replacing it with an up-to-date version.
              </p>
            </div>
          )}

          {profile?.cvWasabiKey ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <FileText className="h-8 w-8 text-primary/60 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {profile.cvWasabiKey.split("/").pop()}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    {profile.cvUploadedAt ? (
                      <>
                        <Clock className="h-3 w-3" />
                        Uploaded {new Date(profile.cvUploadedAt).toLocaleDateString("en-GB")}
                      </>
                    ) : (
                      "Document on file"
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button size="sm" variant="outline" className="gap-1.5" asChild>
                  <a href={`${BASE}/api/worker-portal/profile/cv`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                    View CV
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={cvUploading || removeCvMut.isPending}
                  onClick={() => cvInputRef.current?.click()}
                >
                  {cvUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  Replace
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-destructive hover:text-destructive"
                      disabled={cvUploading || removeCvMut.isPending}
                    >
                      {removeCvMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Remove
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove CV?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete your CV file and all data extracted from it — including extracted roles, qualifications, and notes. Manually added roles will not be affected.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => removeCvMut.mutate()}
                      >
                        Remove CV
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <p className="text-sm text-muted-foreground flex-1">
                No CV uploaded yet. Upload a PDF, Word doc, CSV or TXT file and we can automatically extract your role history.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 flex-shrink-0"
                disabled={cvUploading}
                onClick={() => cvInputRef.current?.click()}
              >
                {cvUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Upload CV
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3">PDF, Word, CSV or TXT · max 10 MB</p>
          <input
            ref={cvInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.csv,.txt,.rtf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/csv,text/plain,application/rtf,text/rtf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleCvUpload(file);
            }}
          />
        </div>

        {/* Role history list */}
        <div>
          <div className="px-5 py-3 border-b bg-muted/30 flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Role history</p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={openAddRole}
            >
              <Plus className="h-3.5 w-3.5" />
              Add role
            </Button>
          </div>
          {!roleHistoryQ.data || roleHistoryQ.data.length === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-muted-foreground">
              {roleHistoryQ.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
              ) : (
                <span>No roles on record. Upload a CV or add a role manually.</span>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {roleHistoryQ.data.map((entry) => {
                const isCurrent = !entry.endDate;
                const isManual = entry.source === "manual";
                return (
                  <div
                    key={entry.id}
                    className={cn(
                      "px-5 py-3.5 flex items-center gap-3 group",
                      isCurrent ? "bg-emerald-50/50 dark:bg-emerald-950/20" : "",
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`font-semibold ${isCurrent ? "text-base" : "text-sm"}`}>
                          {entry.roleNameSnapshot}
                        </p>
                        {isManual && (
                          <span className="text-[10px] border border-blue-300 text-blue-500 px-1.5 py-0.5 rounded-full leading-none flex-shrink-0">
                            manual
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Calendar className="h-3 w-3 flex-shrink-0" />
                        {new Date(`${entry.startDate}T00:00:00`).toLocaleDateString("en-GB")}
                        {entry.endDate
                          ? <> {"\u2014"} {new Date(`${entry.endDate}T00:00:00`).toLocaleDateString("en-GB")}</>
                          : <> {"\u2014"} <span className="text-emerald-600 font-medium">Present</span></>
                        }
                      </p>
                      {entry.notes && (
                        <p className="text-xs text-muted-foreground italic mt-0.5">{entry.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isCurrent && (
                        <span className="text-[10px] border border-emerald-400 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full font-semibold">
                          Current
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditRole(entry)}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Edit role"
                        aria-label="Edit role"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteRoleId(entry.id)}
                        className="p-1.5 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove role"
                        aria-label="Remove role"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add / edit role dialog */}
        <Dialog open={roleFormMode !== null} onOpenChange={(open) => { if (!open) setRoleFormMode(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{roleFormMode?.mode === "edit" ? "Edit role" : "Add role"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={submitRoleForm} className="space-y-4 py-1">
              <div className="space-y-1.5">
                <Label htmlFor="role-title">Role / position *</Label>
                <Input
                  id="role-title"
                  value={roleForm.roleNameSnapshot}
                  onChange={(e) => setRoleForm((f) => ({ ...f, roleNameSnapshot: e.target.value }))}
                  placeholder="e.g. Senior Electrician @ Hornsea Project"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="role-start">Start date *</Label>
                  <Input
                    id="role-start"
                    type="date"
                    value={roleForm.startDate}
                    onChange={(e) => setRoleForm((f) => ({ ...f, startDate: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="role-end">End date</Label>
                  <Input
                    id="role-end"
                    type="date"
                    value={roleForm.endDate}
                    onChange={(e) => setRoleForm((f) => ({ ...f, endDate: e.target.value }))}
                    placeholder="Leave blank if current"
                  />
                  <p className="text-[11px] text-muted-foreground">Leave blank if current role</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role-notes">Notes</Label>
                <Textarea
                  id="role-notes"
                  value={roleForm.notes}
                  onChange={(e) => setRoleForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Project details, responsibilities…"
                  rows={2}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRoleFormMode(null)}>Cancel</Button>
                <Button
                  type="submit"
                  disabled={addRoleMut.isPending || editRoleMut.isPending}
                  className="gap-2"
                >
                  {(addRoleMut.isPending || editRoleMut.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
                  {roleFormMode?.mode === "edit" ? "Save changes" : "Add role"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete role confirmation */}
        <AlertDialog open={deleteRoleId !== null} onOpenChange={(open) => { if (!open) setDeleteRoleId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove this role?</AlertDialogTitle>
              <AlertDialogDescription>
                This role entry will be permanently removed from your history. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => { if (deleteRoleId !== null) deleteRoleMut.mutate(deleteRoleId); }}
                disabled={deleteRoleMut.isPending}
              >
                {deleteRoleMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Qualifications, notes, preferred airports */}
        <form
          onSubmit={(e) => { e.preventDefault(); saveCvMut.mutate(cvForm); }}
          className="px-5 py-5 space-y-4 border-t"
        >
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Qualifications &amp; other details</p>
          <div className="space-y-1.5">
            <Label htmlFor="cv-quals">Qualifications</Label>
            <Textarea
              id="cv-quals"
              value={cvForm.qualifications}
              onChange={(e) => setCvForm((f) => ({ ...f, qualifications: e.target.value }))}
              placeholder="Academic qualifications, certifications, training courses…"
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cv-notes">Additional notes</Label>
            <Textarea
              id="cv-notes"
              value={cvForm.notes}
              onChange={(e) => setCvForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Skills summary, languages, memberships, other relevant information…"
              rows={3}
            />
          </div>
          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={saveCvMut.isPending} className="gap-2">
              {saveCvMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save CV details
            </Button>
          </div>
        </form>
      </section>

      {/* ── Section 5: Change password ── */}
      <section className="rounded-xl border bg-card overflow-hidden">
        <SectionHeader
          icon={Lock}
          title="Change password"
          description="Update your portal login password"
        />
        <form onSubmit={handlePwChange} className="px-5 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pw-current">Current password</Label>
            <Input
              id="pw-current"
              type="password"
              value={pwForm.currentPassword}
              onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))}
              placeholder="Enter your current password"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pw-new">New password</Label>
              <Input
                id="pw-new"
                type="password"
                value={pwForm.newPassword}
                onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-confirm">Confirm new password</Label>
              <Input
                id="pw-confirm"
                type="password"
                value={pwForm.confirmPassword}
                onChange={(e) => setPwForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                placeholder="Repeat new password"
                autoComplete="new-password"
                required
              />
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={pwMut.isPending} variant="outline" className="gap-2">
              {pwMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Change password
            </Button>
          </div>
        </form>
      </section>

    </div>
  );
}
