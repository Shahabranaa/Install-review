import { useState } from "react";
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
  Eye, ClipboardCheck, Lock, Loader2,
} from "lucide-react";
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

export default function Settings() {
  const { isAdmin } = useAuth();

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">Application configuration and administration.</p>
      </div>

      {isAdmin && <UserManagement />}

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
