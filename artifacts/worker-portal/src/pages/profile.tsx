import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPatch, apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
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
  portalUsername: string | null;
  windaId: string | null;
  roleName: string | null;
  cvWasabiKey: string | null;
}

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

// ── Profile page ──────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { toast } = useToast();
  const { refresh } = useAuth();
  const qc = useQueryClient();

  const profileQ = useQuery<WorkerProfile>({
    queryKey: ["worker-profile"],
    queryFn: () => apiFetch("/api/worker-portal/profile"),
  });

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    preferredAirport: [] as string[],
    qualifications: "",
  });

  const [pwForm, setPwForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const cvInputRef = useRef<HTMLInputElement>(null);
  const [cvUploading, setCvUploading] = useState(false);

  useEffect(() => {
    if (profileQ.data) {
      setForm({
        name: profileQ.data.name ?? "",
        email: profileQ.data.email ?? "",
        phone: profileQ.data.phone ?? "",
        company: profileQ.data.company ?? "",
        preferredAirport: profileQ.data.preferredAirport ?? [],
        qualifications: profileQ.data.qualifications ?? "",
      });
    }
  }, [profileQ.data]);

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

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    saveMut.mutate(form);
  }

  async function handleCvUpload(file: File) {
    if (file.type !== "application/pdf") {
      toast({ title: "Invalid file type", description: "Only PDF files are accepted.", variant: "destructive" });
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
      await qc.invalidateQueries({ queryKey: ["worker-profile"] });
      toast({ title: "CV uploaded successfully" });
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

  const profile = profileQ.data;

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

      {/* ── Profile details ── */}
      <section className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Profile details</h2>
        </div>

        <form onSubmit={handleSave} className="px-5 py-5 space-y-4">
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

          <div className="space-y-1.5">
            <Label>Preferred airports</Label>
            <AirportMultiSelect
              value={form.preferredAirport}
              onChange={(val) => setForm((f) => ({ ...f, preferredAirport: val }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prof-quals">Qualifications / notes</Label>
            <Textarea
              id="prof-quals"
              value={form.qualifications}
              onChange={(e) => setForm((f) => ({ ...f, qualifications: e.target.value }))}
              placeholder="Any relevant qualifications or additional information"
              rows={3}
            />
          </div>

          {/* Read-only identity fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Portal username</Label>
              <Input value={profile?.portalUsername ?? "—"} disabled className="bg-muted/40 text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Role</Label>
              <Input value={profile?.roleName ?? "—"} disabled className="bg-muted/40 text-muted-foreground" />
            </div>
            {profile?.windaId && (
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">WINDA ID</Label>
                <Input value={profile.windaId} disabled className="bg-muted/40 text-muted-foreground" />
              </div>
            )}
          </div>

          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={saveMut.isPending} className="gap-2">
              {saveMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save changes
            </Button>
          </div>
        </form>
      </section>

      {/* ── CV / Résumé ── */}
      <section className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">CV / Résumé</h2>
        </div>

        <div className="px-5 py-5">
          {profile?.cvWasabiKey ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <FileText className="h-8 w-8 text-primary/60 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {profile.cvWasabiKey.split("/").pop()}
                  </p>
                  <p className="text-xs text-muted-foreground">PDF on file</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  asChild
                >
                  <a
                    href={`${BASE}/api/worker-portal/profile/cv`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View CV
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={cvUploading}
                  onClick={() => cvInputRef.current?.click()}
                >
                  {cvUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  Replace
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <p className="text-sm text-muted-foreground flex-1">
                No CV uploaded yet. Upload a PDF to share with administrators.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 flex-shrink-0"
                disabled={cvUploading}
                onClick={() => cvInputRef.current?.click()}
              >
                {cvUploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                Upload CV
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3">PDF only · max 10 MB</p>
          <input
            ref={cvInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleCvUpload(file);
            }}
          />
        </div>
      </section>

      {/* ── Change password ── */}
      <section className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Change password</h2>
        </div>

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
              {pwMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              Change password
            </Button>
          </div>
        </form>
      </section>

    </div>
  );
}
