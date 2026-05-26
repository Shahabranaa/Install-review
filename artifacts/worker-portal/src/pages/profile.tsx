import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPatch, apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Save, KeyRound, User, Lock } from "lucide-react";

interface WorkerProfile {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  preferredAirport: string | null;
  qualifications: string | null;
  portalUsername: string | null;
  windaId: string | null;
  roleName: string | null;
}

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
    preferredAirport: "",
    qualifications: "",
  });

  const [pwForm, setPwForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    if (profileQ.data) {
      setForm({
        name: profileQ.data.name ?? "",
        email: profileQ.data.email ?? "",
        phone: profileQ.data.phone ?? "",
        company: profileQ.data.company ?? "",
        preferredAirport: profileQ.data.preferredAirport ?? "",
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
            <div className="space-y-1.5">
              <Label htmlFor="prof-airport">Preferred airport</Label>
              <Input
                id="prof-airport"
                value={form.preferredAirport}
                onChange={(e) => setForm((f) => ({ ...f, preferredAirport: e.target.value }))}
                placeholder="e.g. LHR, AMS"
              />
            </div>
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
