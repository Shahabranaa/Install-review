// @ts-nocheck
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Pencil, UserX, Loader2, KeyRound, ShieldCheck, User, MailIcon, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ManagedUser {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  title: string | null;
  accessLevel: "admin" | "reviewer" | "viewer";
  active: boolean;
  invitePending: boolean;
  createdAt: string;
}

async function fetchUsers(): Promise<ManagedUser[]> {
  const res = await fetch(`${API_BASE}/api/users`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load users");
  return res.json();
}

async function createUser(data: {
  username: string;
  displayName: string;
  email: string;
}): Promise<{ user: ManagedUser; emailSent: boolean; emailError: string | null }> {
  const res = await fetch(`${API_BASE}/api/users`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, accessLevel: "reviewer" }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Failed to create user");
  return json;
}

async function updateUser(id: number, data: {
  displayName?: string;
  email?: string;
  password?: string;
  active?: boolean;
}): Promise<ManagedUser> {
  const res = await fetch(`${API_BASE}/api/users/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Failed to update user");
  return json;
}

async function resendInvite(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/users/${id}/resend-invite`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? "Failed to resend invite");
  }
}

async function deactivateUser(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/users/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? "Failed to deactivate user");
  }
}

// ── User row ──────────────────────────────────────────────────────────────────
function UserRow({ u, selfId, onEdit, onResetPassword, onResendInvite, onDeactivate, resendingId }: {
  u: ManagedUser;
  selfId: number | undefined;
  onEdit: () => void;
  onResetPassword: () => void;
  onResendInvite: () => void;
  onDeactivate: () => void;
  resendingId: number | null;
}) {
  const isSelf = u.id === selfId;
  const isSeeded = u.username === "admin";

  return (
    <div className={cn(
      "group flex items-center gap-3 px-4 py-3 border-b border-border/40 last:border-0 transition-colors",
      !u.active && !u.invitePending && "opacity-50"
    )}>
      {/* Avatar */}
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold uppercase shrink-0",
        u.invitePending ? "bg-amber-500/15 text-amber-600" :
        u.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
      )}>
        {u.invitePending ? <MailIcon className="w-3.5 h-3.5" /> : (u.displayName?.[0] || "?")}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{u.displayName}</span>
          {isSelf && <Badge variant="outline" className="text-[10px] px-1.5 py-0">you</Badge>}
          {u.invitePending && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-400/50 bg-amber-50 dark:bg-amber-950/20">
              invite sent
            </Badge>
          )}
          {!u.active && !u.invitePending && <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">inactive</Badge>}
        </div>
        <p className="text-xs text-muted-foreground truncate">@{u.username}{u.email ? ` · ${u.email}` : ""}</p>
      </div>

      {/* Access badge */}
      <Badge variant="secondary" className={cn(
        "text-[10px] shrink-0 hidden sm:flex",
        u.accessLevel === "admin" ? "bg-amber-500/15 text-amber-600 border-amber-500/30" : "bg-primary/10 text-primary border-primary/20"
      )}>
        {u.accessLevel === "admin" ? <ShieldCheck className="w-3 h-3 mr-1" /> : <User className="w-3 h-3 mr-1" />}
        {u.accessLevel}
      </Badge>

      {/* Actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {u.invitePending ? (
          <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
            onClick={onResendInvite} title="Resend invite email" disabled={resendingId === u.id}>
            {resendingId === u.id
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        ) : (
          <>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={onEdit} title="Edit name / email">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={onResetPassword} title="Reset password">
              <KeyRound className="w-3.5 h-3.5" />
            </Button>
          </>
        )}
        {!isSelf && !isSeeded && u.active && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Deactivate user">
                <UserX className="w-3.5 h-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Deactivate {u.displayName}?</AlertDialogTitle>
                <AlertDialogDescription>
                  {u.invitePending
                    ? "This will cancel the invite. They won't be able to use the invite link."
                    : "This will immediately revoke their access. They won't be able to sign in until reactivated."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDeactivate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {u.invitePending ? "Cancel Invite" : "Deactivate"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}

// ── Edit dialog ───────────────────────────────────────────────────────────────
function EditUserDialog({ user, onClose, onSave, saving }: {
  user: ManagedUser;
  onClose: () => void;
  onSave: (data: { displayName: string; email: string }) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({ displayName: user.displayName, email: user.email ?? "" });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-base">Edit User</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Display Name</Label>
            <Input value={form.displayName} onChange={(e) => setForm(f => ({ ...f, displayName: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Email <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} placeholder="user@example.com" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onSave({ displayName: form.displayName.trim(), email: form.email.trim() })}
            disabled={!form.displayName.trim() || saving}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Reset password dialog ─────────────────────────────────────────────────────
function ResetPasswordDialog({ user, onClose, onSave, saving }: {
  user: ManagedUser;
  onClose: () => void;
  onSave: (password: string) => void;
  saving: boolean;
}) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && pw !== confirm;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-base">Reset Password — {user.displayName}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">New Password</Label>
            <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Min 6 characters" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Confirm Password</Label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              className={mismatch ? "border-destructive" : undefined} />
            {mismatch && <p className="text-[11px] text-destructive">Passwords don't match</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onSave(pw)}
            disabled={!pw.trim() || pw.length < 6 || pw !== confirm || saving}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}Reset Password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── New user dialog ───────────────────────────────────────────────────────────
function NewUserDialog({ onClose, onSave, saving }: {
  onClose: () => void;
  onSave: (data: { username: string; displayName: string; email: string }) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({ username: "", displayName: "", email: "" });
  const valid = form.username.trim() && form.displayName.trim() && form.email.trim();

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-base">Invite New User</DialogTitle></DialogHeader>
        <p className="text-[12px] text-muted-foreground -mt-1">
          An invite email will be sent so they can set their own password. They'll have access to Capture, Clarify, and Lautec CSV output. Administration stays restricted to admins.
        </p>
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Display Name</Label>
            <Input value={form.displayName} onChange={(e) => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="e.g. Jane Smith" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Username</Label>
            <Input value={form.username} onChange={(e) => setForm(f => ({ ...f, username: e.target.value.replace(/\s/g, "") }))}
              placeholder="e.g. jsmith" autoCapitalize="none" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Email <span className="text-destructive">*</span></Label>
            <Input value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="user@example.com" type="email" />
            <p className="text-[11px] text-muted-foreground">The invite link will be sent here.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onSave({ username: form.username.trim(), displayName: form.displayName.trim(), email: form.email.trim() })}
            disabled={!valid || saving}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
            <MailIcon className="w-3.5 h-3.5 mr-1.5" />
            Send Invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main sheet ────────────────────────────────────────────────────────────────
export function UserManagementSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user: self } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [newDialog, setNewDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<ManagedUser | null>(null);
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null);
  const [resendingId, setResendingId] = useState<number | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
    enabled: open,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["users"] });

  const createMut = useMutation({
    mutationFn: createUser,
    onSuccess: (result) => {
      invalidate();
      setNewDialog(false);
      if (result.emailSent) {
        toast({ title: "Invite sent", description: `An email was sent to ${result.user.email}` });
      } else {
        toast({
          title: "User created — email not sent",
          description: result.emailError ?? "Check that SENDGRID_API_KEY and EMAIL_FROM_ADDRESS are configured.",
          variant: "destructive",
        });
      }
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateUser>[1] }) => updateUser(id, data),
    onSuccess: () => { invalidate(); setEditTarget(null); setResetTarget(null); toast({ title: "User updated" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deactivateMut = useMutation({
    mutationFn: deactivateUser,
    onSuccess: () => { invalidate(); toast({ title: "User deactivated" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  async function handleResend(userId: number) {
    setResendingId(userId);
    try {
      await resendInvite(userId);
      invalidate();
      toast({ title: "Invite resent" });
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to resend", variant: "destructive" });
    } finally {
      setResendingId(null);
    }
  }

  const active = users.filter(u => u.active || u.invitePending);
  const inactive = users.filter(u => !u.active && !u.invitePending);

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="left" className="w-[400px] sm:max-w-[400px] flex flex-col p-0">
          <SheetHeader className="px-5 pt-5 pb-4 border-b border-border/50">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-base">User Management</SheetTitle>
              <Button size="sm" onClick={() => setNewDialog(true)} className="h-8 gap-1.5 text-xs">
                <Plus className="w-3.5 h-3.5" />Invite User
              </Button>
            </div>
            <p className="text-[12px] text-muted-foreground">
              Invited users receive an email to set their own password. They can access the main DPR workspace; administration stays restricted to admins.
            </p>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-24 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : (
              <>
                {active.length > 0 && (
                  <div>
                    <p className="px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Active / Pending · {active.length}
                    </p>
                    {active.map(u => (
                      <UserRow key={u.id} u={u} selfId={self?.id}
                        onEdit={() => setEditTarget(u)}
                        onResetPassword={() => setResetTarget(u)}
                        onResendInvite={() => handleResend(u.id)}
                        onDeactivate={() => deactivateMut.mutate(u.id)}
                        resendingId={resendingId}
                      />
                    ))}
                  </div>
                )}
                {inactive.length > 0 && (
                  <div>
                    <p className="px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Inactive · {inactive.length}
                    </p>
                    {inactive.map(u => (
                      <UserRow key={u.id} u={u} selfId={self?.id}
                        onEdit={() => setEditTarget(u)}
                        onResetPassword={() => setResetTarget(u)}
                        onResendInvite={() => handleResend(u.id)}
                        onDeactivate={() => {}}
                        resendingId={resendingId}
                      />
                    ))}
                  </div>
                )}
                {users.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-12">No users yet.</p>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {newDialog && (
        <NewUserDialog
          onClose={() => setNewDialog(false)}
          onSave={(data) => createMut.mutate(data)}
          saving={createMut.isPending}
        />
      )}
      {editTarget && (
        <EditUserDialog
          user={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={(data) => updateMut.mutate({ id: editTarget.id, data })}
          saving={updateMut.isPending}
        />
      )}
      {resetTarget && (
        <ResetPasswordDialog
          user={resetTarget}
          onClose={() => setResetTarget(null)}
          onSave={(password) => updateMut.mutate({ id: resetTarget.id, data: { password } })}
          saving={updateMut.isPending}
        />
      )}
    </>
  );
}
