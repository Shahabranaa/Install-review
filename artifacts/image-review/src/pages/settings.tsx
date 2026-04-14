import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Building2, Info, Users, Plus, Pencil, UserX, UserCheck, ShieldCheck,
  Eye, EyeOff, ClipboardCheck, Lock, Loader2, HardDrive, CheckCircle2, AlertCircle,
  KeyRound, Save, ChevronDown, ChevronUp, RefreshCw, FolderSync, Trash2, ImageOff,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface UserRecord {
  id: number;
  username: string;
  displayName: string;
  email?: string | null;
  title?: string | null;
  accessLevel: "admin" | "reviewer" | "viewer";
  active: boolean;
  createdAt: string;
}

const ACCESS_LEVELS = [
  {
    value: "admin",
    label: "Admin",
    description: "Full access: manage users, review & approve images",
    icon: ShieldCheck,
    color: "bg-red-100 text-red-700 border-red-200",
  },
  {
    value: "reviewer",
    label: "Reviewer",
    description: "Can review and approve/reject images",
    icon: ClipboardCheck,
    color: "bg-blue-100 text-blue-700 border-blue-200",
  },
  {
    value: "viewer",
    label: "Viewer",
    description: "View-only access — cannot submit reviews",
    icon: Eye,
    color: "bg-slate-100 text-slate-600 border-slate-200",
  },
];

function accessBadge(level: string) {
  const config = ACCESS_LEVELS.find((l) => l.value === level);
  if (!config) return <Badge variant="outline">{level}</Badge>;
  return <Badge className={`${config.color} border font-normal text-xs`}>{config.label}</Badge>;
}

function useUsers(enabled: boolean) {
  return useQuery<UserRecord[]>({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/users`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load users");
      return res.json();
    },
    enabled,
    staleTime: 30000,
  });
}

function UserDialog({
  open,
  onClose,
  editUser,
}: {
  open: boolean;
  onClose: () => void;
  editUser?: UserRecord | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!editUser;

  const [form, setForm] = useState({
    username: editUser?.username ?? "",
    displayName: editUser?.displayName ?? "",
    email: editUser?.email ?? "",
    title: editUser?.title ?? "",
    accessLevel: editUser?.accessLevel ?? "viewer",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setField = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        displayName: form.displayName,
        email: form.email || null,
        title: form.title || null,
        accessLevel: form.accessLevel,
      };
      if (!isEdit) {
        body.username = form.username;
        body.password = form.password;
      } else if (form.password) {
        body.password = form.password;
      }
      const url = isEdit ? `${API_BASE}/api/users/${editUser!.id}` : `${API_BASE}/api/users`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error ?? "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({
        title: isEdit ? "User updated" : "User created",
        description: isEdit
          ? `${form.displayName}'s profile has been updated.`
          : `${form.displayName} can now sign in.`,
      });
      onClose();
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.displayName.trim()) errs.displayName = "Full name is required";
    if (!isEdit && !form.username.trim()) errs.username = "Username is required";
    if (!isEdit && !form.password) errs.password = "Password is required";
    if (form.password && form.password.length < 6)
      errs.password = "Password must be at least 6 characters";
    if (form.password && form.password !== form.confirmPassword)
      errs.confirmPassword = "Passwords do not match";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit User" : "Create New User"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this user's profile and access level."
              : "Create a login account for a new reviewer."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Full Name <span className="text-red-500">*</span></Label>
            <Input value={form.displayName} onChange={(e) => setField("displayName", e.target.value)} placeholder="Jane Smith" />
            {errors.displayName && <p className="text-xs text-destructive">{errors.displayName}</p>}
          </div>

          {!isEdit && (
            <div className="space-y-1.5">
              <Label>Username <span className="text-red-500">*</span></Label>
              <Input
                value={form.username}
                onChange={(e) => setField("username", e.target.value.toLowerCase().replace(/\s/g, ""))}
                placeholder="jane.smith"
              />
              <p className="text-xs text-muted-foreground">Used to sign in. Cannot be changed later.</p>
              {errors.username && <p className="text-xs text-destructive">{errors.username}</p>}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} placeholder="jane@company.com" />
          </div>

          <div className="space-y-1.5">
            <Label>Job Title / Role</Label>
            <Input value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="e.g. QA Inspector, Project Manager" />
          </div>

          <div className="space-y-1.5">
            <Label>Access Level <span className="text-red-500">*</span></Label>
            <Select value={form.accessLevel} onValueChange={(v) => setField("accessLevel", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCESS_LEVELS.map((l) => {
                  const Icon = l.icon;
                  return (
                    <SelectItem key={l.value} value={l.value}>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <div>
                          <div className="font-medium">{l.label}</div>
                          <div className="text-xs text-muted-foreground">{l.description}</div>
                        </div>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>
              {isEdit ? "New Password" : "Password"}{" "}
              {!isEdit && <span className="text-red-500">*</span>}
            </Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setField("password", e.target.value)}
              placeholder={isEdit ? "Leave blank to keep current password" : "Min. 6 characters"}
            />
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
          </div>

          {(form.password || !isEdit) && (
            <div className="space-y-1.5">
              <Label>Confirm Password {!isEdit && <span className="text-red-500">*</span>}</Label>
              <Input
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setField("confirmPassword", e.target.value)}
                placeholder="Re-enter password"
              />
              {errors.confirmPassword && (
                <p className="text-xs text-destructive">{errors.confirmPassword}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => validate() && mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? "Save Changes" : "Create User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserRow({
  user,
  currentUserId,
  onEdit,
  onToggle,
}: {
  user: UserRecord;
  currentUserId: number;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const isSelf = user.id === currentUserId;
  return (
    <div
      className={`flex items-center gap-3 py-3 px-4 rounded-lg border ${
        user.active ? "bg-card" : "bg-muted/30 opacity-60"
      }`}
    >
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${
          user.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        }`}
      >
        {user.displayName.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{user.displayName}</span>
          {isSelf && <Badge variant="outline" className="text-xs h-4 px-1.5">You</Badge>}
          {!user.active && (
            <Badge variant="outline" className="text-xs h-4 px-1.5 text-muted-foreground">Inactive</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          @{user.username}
          {user.title ? ` · ${user.title}` : ""}
          {user.email ? ` · ${user.email}` : ""}
        </p>
      </div>
      <div className="flex-shrink-0">{accessBadge(user.accessLevel)}</div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} title="Edit">
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        {!isSelf && (
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${user.active ? "hover:text-destructive" : "hover:text-green-600"}`}
            onClick={onToggle}
            title={user.active ? "Deactivate" : "Reactivate"}
          >
            {user.active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
          </Button>
        )}
      </div>
    </div>
  );
}

function UserManagement() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useUsers(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);

  const toggleMutation = useMutation({
    mutationFn: async (u: UserRecord) => {
      const res = await fetch(`${API_BASE}/api/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ active: !u.active }),
      });
      if (!res.ok) throw new Error("Update failed");
      return res.json();
    },
    onSuccess: (_data, u) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({
        title: u.active ? "User deactivated" : "User reactivated",
        description: `${u.displayName}'s access has been ${u.active ? "revoked" : "restored"}.`,
      });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const activeUsers = users?.filter((u) => u.active) ?? [];
  const inactiveUsers = users?.filter((u) => !u.active) ?? [];

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                User Management
              </CardTitle>
              <CardDescription className="mt-1">
                Create and manage reviewer accounts. Control access levels and job titles.
              </CardDescription>
            </div>
            <Button size="sm" className="flex-shrink-0" onClick={() => { setEditUser(null); setDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-1.5" /> Add User
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Access level summary */}
          <div className="grid grid-cols-3 gap-2">
            {ACCESS_LEVELS.map((level) => {
              const Icon = level.icon;
              const count = users?.filter((u) => u.accessLevel === level.value && u.active).length ?? 0;
              return (
                <div key={level.value} className={`rounded-lg border p-3 ${level.color}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className="w-3.5 h-3.5" />
                    <span className="text-xs font-semibold">{level.label}</span>
                    <span className="ml-auto text-sm font-bold">{count}</span>
                  </div>
                  <p className="text-xs opacity-75 leading-tight">{level.description}</p>
                </div>
              );
            })}
          </div>

          {/* User list */}
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {activeUsers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No active users yet.</p>
              )}
              {activeUsers.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  currentUserId={currentUser!.id}
                  onEdit={() => { setEditUser(u); setDialogOpen(true); }}
                  onToggle={() => toggleMutation.mutate(u)}
                />
              ))}
              {inactiveUsers.length > 0 && (
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">
                    Inactive ({inactiveUsers.length})
                  </p>
                  {inactiveUsers.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      currentUserId={currentUser!.id}
                      onEdit={() => { setEditUser(u); setDialogOpen(true); }}
                      onToggle={() => toggleMutation.mutate(u)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <UserDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editUser={editUser}
      />
    </>
  );
}

interface WasabiBreakdown {
  migratedViaDrive: number;
  linked:           number;
  pendingDrive:     number;
  pendingLink:      number;
  unmigrateable:    number;
}

interface MirrorStats {
  total:  number;
  done:   number;
  linked: number;
}

interface WasabiStatus {
  configured: boolean;
  connection: { ok: boolean; error?: string };
  migrated:   number;
  total:      number;
  remaining:  number;
  noSource?:  number;
  breakdown?: WasabiBreakdown;
  mirrorStats?: MirrorStats;
}

interface WasabiCreds {
  accessKeyId:  string;
  secretMasked: string;
  bucket:       string;
  region:       string;
  source:       "db" | "env";
}

interface ScanResult {
  total: number;
  newlyDiscovered: number;
  alreadyKnown: number;
  skippedConflicts?: number;
  partial?: boolean;
}

function StoragePanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [migrating, setMigrating] = useState(false);
  const [scanning, setScanning]   = useState(false);
  const [linking, setLinking]     = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [confirmResetMigration, setConfirmResetMigration] = useState(false);

  // ── Credentials form state ──────────────────────────────────────────────
  const [credExpanded, setCredExpanded] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [credForm, setCredForm] = useState({
    accessKeyId:     "",
    secretAccessKey: "",
    bucket:          "",
    region:          "eu-west-1",
  });

  const { data: savedCreds } = useQuery<WasabiCreds>({
    queryKey: ["wasabi-creds"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/api/settings/wasabi`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch Wasabi credentials");
      return r.json();
    },
  });

  // Pre-fill non-secret fields once when creds load
  useEffect(() => {
    if (!savedCreds) return;
    setCredForm((f) => ({
      ...f,
      accessKeyId: savedCreds.accessKeyId || f.accessKeyId,
      bucket:      savedCreds.bucket      || f.bucket,
      region:      savedCreds.region      || f.region,
    }));
    if (!savedCreds.accessKeyId) setCredExpanded(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedCreds?.accessKeyId]);

  const saveCreds = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = {};
      if (credForm.accessKeyId.trim())     body.accessKeyId     = credForm.accessKeyId.trim();
      if (credForm.secretAccessKey.trim()) body.secretAccessKey = credForm.secretAccessKey.trim();
      if (credForm.bucket.trim())          body.bucket          = credForm.bucket.trim();
      if (credForm.region.trim())          body.region          = credForm.region.trim();

      const r = await fetch(`${API_BASE}/api/settings/wasabi`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Failed" }));
        throw new Error((err as { error?: string }).error ?? "Failed to save");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wasabi-status"] });
      queryClient.invalidateQueries({ queryKey: ["wasabi-creds"] });
      setCredForm((f) => ({ ...f, secretAccessKey: "" }));
      toast({ title: "Credentials saved", description: "Wasabi credentials updated successfully." });
    },
    onError: (err: Error) =>
      toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  // ── Migration status ────────────────────────────────────────────────────
  const { data: status, isLoading } = useQuery<WasabiStatus>({
    queryKey: ["wasabi-status"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/api/wasabi/status`);
      if (!r.ok) throw new Error("Failed to fetch Wasabi status");
      return r.json();
    },
    refetchInterval: migrating ? 4000 : false,
  });

  const runBatch = async () => {
    setMigrating(true);
    try {
      let remaining     = status?.remaining ?? 1;
      let totalLinked   = 0;
      let totalMigrated = 0;
      let totalFailed   = 0;

      while (remaining > 0) {
        const r = await fetch(`${API_BASE}/api/wasabi/migrate`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchSize: 20 }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({ error: "Unknown error" }));
          throw new Error((err as { error?: string }).error ?? "Migration request failed");
        }
        const result = await r.json() as { linked: number; migrated: number; failed: number; remaining: number };
        totalLinked   += result.linked   ?? 0;
        totalMigrated += result.migrated ?? 0;
        totalFailed   += result.failed   ?? 0;
        remaining      = result.remaining;
        await queryClient.invalidateQueries({ queryKey: ["wasabi-status"] });

        if ((result.linked ?? 0) === 0 && result.migrated === 0 && result.failed === 0) break;
      }

      const parts: string[] = [];
      if (totalLinked   > 0) parts.push(`${totalLinked} linked from existing storage`);
      if (totalMigrated > 0) parts.push(`${totalMigrated} downloaded from Drive`);
      if (totalFailed   > 0) parts.push(`${totalFailed} failed`);

      toast({
        title: "Migration complete",
        description: parts.length > 0 ? parts.join(", ") + "." : "Nothing left to migrate.",
        variant: totalFailed > 0 ? "destructive" : "default",
      });
    } catch (err: unknown) {
      toast({
        title: "Migration error",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setMigrating(false);
      await queryClient.invalidateQueries({ queryKey: ["wasabi-status"] });
    }
  };

  const runScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const r = await fetch(`${API_BASE}/api/wasabi/scan-drive`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Unknown error" }));
        throw new Error((err as { error?: string }).error ?? "Scan request failed");
      }
      const result = await r.json() as ScanResult;
      setScanResult(result);
      await queryClient.invalidateQueries({ queryKey: ["wasabi-status"] });
      const partialNote = result.partial ? " (partial — some Drive pages could not be fetched)" : "";
      const conflictNote = (result.skippedConflicts ?? 0) > 0
        ? ` ${result.skippedConflicts} skipped (ID conflict).`
        : "";
      const isUpToDate = result.newlyDiscovered === 0 && (result.skippedConflicts ?? 0) === 0;
      toast({
        title: result.newlyDiscovered > 0 ? "New photos found" : isUpToDate ? "Drive is up to date" : "Scan complete",
        description: result.newlyDiscovered > 0
          ? `${result.newlyDiscovered} new photo${result.newlyDiscovered !== 1 ? "s" : ""} discovered and queued for migration.${conflictNote}${partialNote}`
          : isUpToDate
            ? `All ${result.total} Drive photos are already tracked.${partialNote}`
            : `No new photos inserted.${conflictNote}${partialNote}`,
        variant: result.partial ? "destructive" : "default",
      });
    } catch (err: unknown) {
      toast({
        title: "Scan error",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  };

  const totalWithNoSource = (status?.total ?? 0) + (status?.noSource ?? 0);
  const pct = status && totalWithNoSource > 0 ? Math.round((status.migrated / totalWithNoSource) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="w-5 h-5" />
          Object Storage (Wasabi)
        </CardTitle>
        <CardDescription>
          Migrate photos from Google Drive to Wasabi S3-compatible storage for faster, cheaper serving.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* ── Credentials sub-section ──────────────────────────────────── */}
        <div className="rounded-lg border bg-muted/30 overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/50 transition-colors"
            onClick={() => setCredExpanded((v) => !v)}
          >
            <span className="flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              Credentials
              {savedCreds?.accessKeyId && (
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  ({savedCreds.source === "db" ? "stored in database" : "from environment"})
                </span>
              )}
            </span>
            {credExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {credExpanded && (
            <div className="px-4 pb-4 space-y-3 border-t pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Access Key ID</Label>
                  <Input
                    value={credForm.accessKeyId}
                    onChange={(e) => setCredForm((f) => ({ ...f, accessKeyId: e.target.value }))}
                    placeholder="Access key ID"
                    className="font-mono text-xs h-8"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Secret Access Key</Label>
                    {savedCreds?.secretMasked && !credForm.secretAccessKey && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                        onClick={async () => {
                          try {
                            const r = await fetch(`${API_BASE}/api/settings/wasabi/reveal`, { credentials: "include" });
                            if (!r.ok) throw new Error("Failed");
                            const data = await r.json() as { secretAccessKey: string | null };
                            if (data.secretAccessKey) {
                              setCredForm((f) => ({ ...f, secretAccessKey: data.secretAccessKey! }));
                              setShowSecret(true);
                            }
                          } catch { /* ignore */ }
                        }}
                      >
                        <Eye className="w-3 h-3" /> Reveal
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      type={showSecret ? "text" : "password"}
                      value={credForm.secretAccessKey}
                      onChange={(e) => setCredForm((f) => ({ ...f, secretAccessKey: e.target.value }))}
                      placeholder={savedCreds?.secretMasked || "Secret access key"}
                      className="font-mono text-xs h-8 pr-8"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowSecret((s) => !s)}
                    >
                      {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {savedCreds?.secretMasked && !credForm.secretAccessKey && (
                    <p className="text-xs text-muted-foreground">Leave blank to keep existing secret.</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Bucket Name</Label>
                  <Input
                    value={credForm.bucket}
                    onChange={(e) => setCredForm((f) => ({ ...f, bucket: e.target.value }))}
                    placeholder="my-wasabi-bucket"
                    className="font-mono text-xs h-8"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Region</Label>
                  <Input
                    value={credForm.region}
                    onChange={(e) => setCredForm((f) => ({ ...f, region: e.target.value }))}
                    placeholder="eu-west-1"
                    className="font-mono text-xs h-8"
                  />
                </div>
              </div>

              <Button
                size="sm"
                onClick={() => saveCreds.mutate()}
                disabled={saveCreds.isPending}
                className="w-full"
              >
                {saveCreds.isPending ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Saving…</>
                ) : (
                  <><Save className="w-3.5 h-3.5 mr-1.5" /> Save credentials</>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* ── Connection status + migration ─────────────────────────────── */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading status…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Credentials</p>
                {status?.configured ? (
                  <span className="flex items-center gap-1 text-green-600 font-medium">
                    <CheckCircle2 className="w-4 h-4" /> Configured
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-600 font-medium">
                    <AlertCircle className="w-4 h-4" /> Not configured
                  </span>
                )}
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Bucket connection</p>
                {status?.connection.ok ? (
                  <span className="flex items-center gap-1 text-green-600 font-medium">
                    <CheckCircle2 className="w-4 h-4" /> Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-600 font-medium">
                    <AlertCircle className="w-4 h-4" /> {status?.connection.error ?? "Not connected"}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {/* ── Photo coverage summary ─────────────────────────────── */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Photos in Wasabi</span>
                  <span className="font-medium">{status?.migrated ?? 0} / {(status?.total ?? 0) + (status?.noSource ?? 0)} ({pct}%)</span>
                </div>
                <Progress value={pct} className="h-2" />
              </div>

              {/* ── Three-row breakdown ────────────────────────────────── */}
              <div className="rounded-md border divide-y text-sm">
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="flex items-center gap-2 text-green-700 dark:text-green-400">
                    <CheckCircle2 className="w-4 h-4" />
                    In Wasabi (mapped)
                  </span>
                  <span className="font-semibold tabular-nums">{status?.migrated ?? 0}</span>
                </div>
                {(status?.remaining ?? 0) > 0 && (
                  <div className="px-3 py-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                        <HardDrive className="w-4 h-4" />
                        Pending Wasabi upload
                      </span>
                      <span className="font-semibold tabular-nums text-amber-600">{status?.remaining}</span>
                    </div>
                    <p className="text-xs text-muted-foreground pl-6">
                      These photos are in Google Drive but not yet uploaded to Wasabi.
                      Use "Migrate photos to Wasabi" below to upload them.
                    </p>
                  </div>
                )}
                {(status?.noSource ?? 0) > 0 && (
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="flex items-center gap-2 text-muted-foreground/60">
                      <ImageOff className="w-4 h-4" />
                      No source available
                    </span>
                    <span className="font-semibold tabular-nums text-muted-foreground/60">{status?.noSource}</span>
                  </div>
                )}
              </div>

              {/* ── Mirror stats ───────────────────────────────────────── */}
              {status?.mirrorStats && status.mirrorStats.total > 0 && (
                <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
                  <p className="font-medium text-foreground/70">Drive → Wasabi mirror</p>
                  <div className="flex justify-between">
                    <span>Files mirrored</span>
                    <span className="tabular-nums">{status.mirrorStats.done.toLocaleString()} / {status.mirrorStats.total.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Linked to photos</span>
                    <span className="tabular-nums">{status.mirrorStats.linked.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>

            {/* ── Check Drive for new photos ─────────────────────────── */}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={runScan}
                disabled={scanning || migrating}
                className="flex-1"
              >
                {scanning ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Scanning Drive…</>
                ) : (
                  <><RefreshCw className="w-4 h-4 mr-2" /> Check Drive for new photos</>
                )}
              </Button>
              {scanResult !== null && (
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                  scanResult.newlyDiscovered > 0
                    ? "bg-amber-100 text-amber-700"
                    : "bg-green-100 text-green-700"
                }`}>
                  {scanResult.newlyDiscovered > 0
                    ? `+${scanResult.newlyDiscovered} new`
                    : "Up to date"}
                </span>
              )}
            </div>

            <Button
              onClick={runBatch}
              disabled={migrating || !status?.configured || !status?.connection.ok || (status?.remaining ?? 0) === 0}
              className="w-full"
            >
              {migrating ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Migrating…</>
              ) : (status?.remaining ?? 0) === 0 ? (
                <><CheckCircle2 className="w-4 h-4 mr-2" /> All photos migrated</>
              ) : (
                <><HardDrive className="w-4 h-4 mr-2" /> Migrate photos to Wasabi</>
              )}
            </Button>

            {status?.configured && status?.connection.ok && (
              <Button
                variant="outline"
                onClick={async () => {
                  setLinking(true);
                  try {
                    const r = await fetch(`${API_BASE}/api/wasabi/link-mirror`, {
                      method: "POST",
                      credentials: "include",
                    });
                    if (!r.ok) {
                      const err = await r.json().catch(() => ({ error: "Unknown error" }));
                      throw new Error((err as { error?: string }).error ?? "Link failed");
                    }
                    const data = await r.json() as { linked: number };
                    await queryClient.invalidateQueries({ queryKey: ["wasabi-status"] });
                    toast({
                      title: data.linked > 0 ? `Linked ${data.linked} photos` : "Already up to date",
                      description: data.linked > 0
                        ? `${data.linked} photo${data.linked !== 1 ? "s" : ""} are now served from Wasabi.`
                        : "All matching photos are already linked to Wasabi.",
                    });
                  } catch (err: unknown) {
                    toast({
                      title: "Link failed",
                      description: err instanceof Error ? err.message : String(err),
                      variant: "destructive",
                    });
                  } finally {
                    setLinking(false);
                  }
                }}
                disabled={linking || migrating || scanning}
                className="w-full"
              >
                {linking ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Linking…</>
                ) : (
                  <><HardDrive className="w-4 h-4 mr-2" /> Link photos from Wasabi mirror</>
                )}
              </Button>
            )}

            {!status?.configured && (
              <p className="text-xs text-muted-foreground">
                Enter your Wasabi credentials above and save them to enable migration.
              </p>
            )}

            {/* ── Reset migration state ─────────────────────────────── */}
            {(status?.migrated ?? 0) > 0 && (
              <div className="pt-1 border-t">
                {confirmResetMigration ? (
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground flex-1">
                      This will clear the Wasabi key from {status?.migrated} photo records. Are you sure?
                    </p>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={async () => {
                        try {
                          const r = await fetch(`${API_BASE}/api/wasabi/reset-migration`, {
                            method: "DELETE",
                            credentials: "include",
                          });
                          if (!r.ok) throw new Error("Reset failed");
                          const data = await r.json() as { reset: number };
                          await queryClient.invalidateQueries({ queryKey: ["wasabi-status"] });
                          toast({ title: "Migration status reset", description: `${data.reset} photo records cleared.` });
                        } catch (err: unknown) {
                          toast({
                            title: "Reset failed",
                            description: err instanceof Error ? err.message : String(err),
                            variant: "destructive",
                          });
                        } finally {
                          setConfirmResetMigration(false);
                        }
                      }}
                    >
                      Yes, reset
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setConfirmResetMigration(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive w-full"
                    disabled={migrating || scanning}
                    onClick={() => setConfirmResetMigration(true)}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Reset migration status
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

const DEFAULT_MIRROR_FOLDER = "1Fe5rOXrcgw1lJnYUC4c9jlZe2j5Ukp52";

interface MirrorStatus {
  total:        number;
  pending:      number;
  done:         number;
  failed:       number;
  rootFolderId: string;
}

function MirrorPanel() {
  const { toast }      = useToast();
  const queryClient    = useQueryClient();
  const [folderId, setFolderId]         = useState(DEFAULT_MIRROR_FOLDER);
  const [prefix,   setPrefix]           = useState("");
  const [scanning, setScanning]         = useState(false);
  const [running,  setRunning]          = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const { data: mirrorStatus, isLoading } = useQuery<MirrorStatus>({
    queryKey: ["mirror-status"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/api/wasabi/mirror/status`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load mirror status");
      return r.json();
    },
    refetchInterval: running ? 3000 : 10000,
  });

  const total   = mirrorStatus?.total   ?? 0;
  const done    = mirrorStatus?.done    ?? 0;
  const pending = mirrorStatus?.pending ?? 0;
  const failed  = mirrorStatus?.failed  ?? 0;
  const pct     = total > 0 ? Math.round((done / total) * 100) : 0;

  const handleScan = async () => {
    if (!folderId.trim()) {
      toast({ title: "Folder ID required", variant: "destructive" });
      return;
    }
    setScanning(true);
    try {
      const r = await fetch(`${API_BASE}/api/wasabi/mirror/scan`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: folderId.trim(), prefix: prefix.trim() }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Unknown error" }));
        throw new Error((err as { error?: string }).error ?? "Scan failed");
      }
      const result = await r.json() as { scanned: number; inserted: number; alreadyKnown: number; depthLimitHit?: boolean };
      await queryClient.invalidateQueries({ queryKey: ["mirror-status"] });
      const depthNote = result.depthLimitHit ? " Note: some deeply nested folders were skipped (depth > 15)." : "";
      toast({
        title: result.inserted > 0 ? `Found ${result.inserted} new file${result.inserted !== 1 ? "s" : ""}` : "Scan complete",
        description: result.inserted > 0
          ? `${result.inserted} files queued for upload${result.alreadyKnown > 0 ? `, ${result.alreadyKnown} already known` : ""}.${depthNote}`
          : `All ${result.scanned} files already tracked.${depthNote}`,
        variant: result.depthLimitHit ? "destructive" : "default",
      });
    } catch (err: unknown) {
      toast({
        title: "Scan error",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  };

  const handleRun = async () => {
    setRunning(true);
    try {
      let remaining = pending > 0 ? pending : 1;
      let totalUploaded = 0;
      let totalFailed   = 0;

      while (remaining > 0) {
        const r = await fetch(`${API_BASE}/api/wasabi/mirror/batch`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchSize: 50 }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({ error: "Unknown error" }));
          throw new Error((err as { error?: string }).error ?? "Batch failed");
        }
        const result = await r.json() as { uploaded: number; failed: number; remaining: number };
        totalUploaded += result.uploaded ?? 0;
        totalFailed   += result.failed   ?? 0;
        remaining      = result.remaining;
        await queryClient.invalidateQueries({ queryKey: ["mirror-status"] });
        if (result.uploaded === 0 && result.failed === 0) break;
      }

      toast({
        title: "Upload complete",
        description: `${totalUploaded} file${totalUploaded !== 1 ? "s" : ""} uploaded to Wasabi${totalFailed > 0 ? `, ${totalFailed} failed` : ""}.`,
        variant: totalFailed > 0 ? "destructive" : "default",
      });
    } catch (err: unknown) {
      toast({
        title: "Upload error",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setRunning(false);
      await queryClient.invalidateQueries({ queryKey: ["mirror-status"] });
    }
  };

  const handleReset = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/wasabi/mirror/reset`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Reset failed");
      const result = await r.json() as { deleted: number };
      await queryClient.invalidateQueries({ queryKey: ["mirror-status"] });
      toast({ title: "Reset complete", description: `${result.deleted} tasks cleared.` });
    } catch (err: unknown) {
      toast({
        title: "Reset error",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setConfirmReset(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderSync className="w-5 h-5" />
          Mirror Drive Folder to Wasabi
        </CardTitle>
        <CardDescription>
          Copy an entire Google Drive folder to Wasabi, preserving the original folder path as the object key.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Folder ID + prefix inputs */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Drive Folder ID</Label>
            <Input
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              placeholder="Google Drive folder ID"
              className="font-mono text-xs h-8"
              disabled={scanning || running}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Wasabi key prefix <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="e.g. raw/ or leave empty"
              className="font-mono text-xs h-8"
              disabled={scanning || running}
            />
          </div>
        </div>

        {/* Scan button */}
        <Button
          variant="outline"
          onClick={handleScan}
          disabled={scanning || running}
          className="w-full"
        >
          {scanning ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Scanning Drive…</>
          ) : (
            <><RefreshCw className="w-4 h-4 mr-2" /> Scan folder for files</>
          )}
        </Button>

        {/* Progress */}
        {!isLoading && total > 0 && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Upload progress</span>
                <span className="font-medium">{done} / {total} ({pct}%)</span>
              </div>
              <Progress value={pct} className="h-2" />
            </div>
            <div className="grid grid-cols-4 gap-2 text-xs text-center">
              <div className="rounded-md border bg-slate-50 py-2">
                <p className="font-semibold text-sm">{total}</p>
                <p className="text-muted-foreground">Total</p>
              </div>
              <div className="rounded-md border bg-muted/30 py-2">
                <p className="font-semibold text-sm">{pending}</p>
                <p className="text-muted-foreground">Pending</p>
              </div>
              <div className="rounded-md border bg-green-50 py-2">
                <p className="font-semibold text-sm text-green-700">{done}</p>
                <p className="text-muted-foreground">Done</p>
              </div>
              <div className="rounded-md border bg-red-50 py-2">
                <p className="font-semibold text-sm text-red-600">{failed}</p>
                <p className="text-muted-foreground">Failed</p>
              </div>
            </div>
          </div>
        )}

        {/* Upload button */}
        <Button
          onClick={handleRun}
          disabled={running || scanning || pending === 0}
          className="w-full"
        >
          {running ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Uploading to Wasabi…</>
          ) : done > 0 && pending === 0 ? (
            <><CheckCircle2 className="w-4 h-4 mr-2" /> All files uploaded</>
          ) : (
            <><HardDrive className="w-4 h-4 mr-2" /> Upload to Wasabi</>
          )}
        </Button>

        {/* Reset */}
        {total > 0 && (
          <div className="pt-1 border-t">
            {confirmReset ? (
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground flex-1">This will clear all {total} tasks. Are you sure?</p>
                <Button size="sm" variant="destructive" onClick={handleReset}>Yes, reset</Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmReset(false)}>Cancel</Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive w-full"
                onClick={() => setConfirmReset(true)}
                disabled={running || scanning}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Reset mirror tasks
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { isAdmin } = useAuth();

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">Application configuration and administration.</p>
      </div>

      {isAdmin && <UserManagement />}
      {isAdmin && <StoragePanel />}
      {isAdmin && <MirrorPanel />}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5" />
            About InstallReview
          </CardTitle>
          <CardDescription>System information and version details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-3 gap-4 border-b pb-4">
            <div className="text-muted-foreground">Version</div>
            <div className="col-span-2 font-medium">1.0.0</div>
          </div>
          <div className="grid grid-cols-3 gap-4 border-b pb-4">
            <div className="text-muted-foreground">Environment</div>
            <div className="col-span-2 font-medium">Production</div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-muted-foreground">Organization</div>
            <div className="col-span-2 font-medium flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              Acme Operations
            </div>
          </div>
        </CardContent>
      </Card>

      {!isAdmin && (
        <Card className="bg-muted/50 border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-muted-foreground">
              <Lock className="w-5 h-5" />
              Access Control
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              User management is restricted to administrators. Contact your admin to request access changes.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
