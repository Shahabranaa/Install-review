import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Mail, Send, Clock, CheckCircle2, AlertTriangle, Eye, EyeOff,
  Users, Bell, KeyRound, MessageSquare, RefreshCw, ChevronDown, ChevronRight,
  Smartphone, MessageCircle, Lock,
} from "lucide-react";
import { Redirect } from "wouter";

// ── Types ────────────────────────────────────────────────────────────────────

interface Worker {
  id: number;
  name: string;
  email: string | null;
  active: boolean;
  roleName: string | null;
}

type Channel = "email" | "push";

interface ChannelResult {
  channel: Channel;
  status: string;
  error: string | null;
  seenAt?: string | null;
  seenIp?: string | null;
}

interface MessageLog {
  id: string;
  workerId: number | null;
  workerName: string | null;
  toEmail: string | null;
  subject: string;
  messageType: string;
  sentAt: string;
  channels: ChannelResult[];
}

interface ExpiringPreviewWorker {
  workerId: number;
  workerName: string;
  email: string | null;
  certifications: { name: string; expiryDate: string }[];
}

type TabId = "compose" | "logs";
type EmailType = "custom" | "expiry_notification" | "login_info";

// ── Channel config ────────────────────────────────────────────────────────────

const CHANNEL_OPTIONS: { id: Channel | "sms" | "whatsapp"; label: string; icon: React.ComponentType<{ className?: string }>; enabled: boolean }[] = [
  { id: "email", label: "Email", icon: Mail, enabled: true },
  { id: "push", label: "Push Notification", icon: Smartphone, enabled: true },
  { id: "sms", label: "SMS", icon: MessageCircle, enabled: false },
  { id: "whatsapp", label: "WhatsApp", icon: MessageSquare, enabled: false },
];

function channelLabel(c: Channel) {
  return c === "email" ? "Email" : "Push";
}

function channelIcon(c: Channel) {
  return c === "email" ? Mail : Smartphone;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emailTypeLabel(t: string) {
  switch (t) {
    case "expiry_notification": return "Expiry Notice";
    case "login_info": return "Login Info";
    case "custom": return "Custom";
    default: return t;
  }
}

function emailTypeBadgeClass(t: string) {
  switch (t) {
    case "expiry_notification": return "border-amber-400 text-amber-600";
    case "login_info": return "border-blue-400 text-blue-600";
    case "custom": return "border-purple-400 text-purple-600";
    default: return "text-muted-foreground";
  }
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "sent": return "border-emerald-400 text-emerald-600";
    case "failed": return "border-red-400 text-red-600";
    case "skipped": return "border-muted-foreground/40 text-muted-foreground";
    default: return "text-muted-foreground";
  }
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

// ── Log row ───────────────────────────────────────────────────────────────────

function LogRow({ log }: { log: MessageLog }) {
  const [open, setOpen] = useState(false);
  const emailChannel = log.channels.find(c => c.channel === "email");
  const seen = !!emailChannel?.seenAt;

  return (
    <>
      <tr
        className="hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={() => setOpen(o => !o)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
            <div>
              <p className="text-sm font-medium">{log.workerName ?? "Unknown"}</p>
              {log.toEmail && <p className="text-xs text-muted-foreground">{log.toEmail}</p>}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-sm hidden md:table-cell truncate max-w-[200px]">{log.subject}</td>
        <td className="px-4 py-3">
          <Badge variant="outline" className={cn("text-[10px]", emailTypeBadgeClass(log.messageType))}>
            {emailTypeLabel(log.messageType)}
          </Badge>
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-1">
            {log.channels.map(c => {
              const Icon = channelIcon(c.channel);
              return (
                <Badge key={c.channel} variant="outline" className={cn("text-[10px] gap-1", statusBadgeClass(c.status))}>
                  <Icon className="h-3 w-3" />
                  {channelLabel(c.channel)}
                </Badge>
              );
            })}
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs">
            {seen
              ? <><Eye className="h-3.5 w-3.5 text-emerald-500" /><span className="text-emerald-600 hidden sm:inline">{fmtDate(emailChannel?.seenAt ?? null)}</span></>
              : <><EyeOff className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-muted-foreground hidden sm:inline">Not seen</span></>}
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">{fmtDate(log.sentAt)}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="bg-muted/10 px-8 py-3 border-b text-xs space-y-2">
            <p><span className="font-semibold">Sent:</span> {fmtDate(log.sentAt)}</p>
            {log.channels.map(c => (
              <div key={c.channel} className="flex items-start gap-1.5">
                <Badge variant="outline" className={cn("text-[10px]", statusBadgeClass(c.status))}>
                  {channelLabel(c.channel)}: {c.status}
                </Badge>
                {c.channel === "email" && c.seenAt && (
                  <span className="text-muted-foreground">Opened {fmtDate(c.seenAt)}{c.seenIp ? ` (IP: ${c.seenIp})` : ""}</span>
                )}
                {c.error && <span className="text-red-600">{c.error}</span>}
              </div>
            ))}
          </td>
        </tr>
      )}
    </>
  );
}

// ── Worker selector ───────────────────────────────────────────────────────────

function WorkerSelector({
  workers, selected, onChange,
}: {
  workers: Worker[];
  selected: Set<number>;
  onChange: (s: Set<number>) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = workers.filter(
    w => w.active && (!search || w.name.toLowerCase().includes(search.toLowerCase())),
  );

  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  }

  function toggleAll() {
    if (selected.size === filtered.length) onChange(new Set());
    else onChange(new Set(filtered.map(w => w.id)));
  }

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        <Input
          placeholder="Search workers…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-7 text-xs border-0 bg-transparent focus-visible:ring-0 p-0"
        />
        <button
          type="button"
          className="text-[10px] text-primary hover:underline flex-shrink-0"
          onClick={toggleAll}
        >
          {selected.size === filtered.length ? "Deselect all" : "Select all"}
        </button>
      </div>
      <div className="max-h-52 overflow-y-auto divide-y">
        {filtered.map(w => (
          <label
            key={w.id}
            className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/30 select-none"
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={selected.has(w.id)}
              onChange={() => toggle(w.id)}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{w.name}</p>
              {w.roleName && <p className="text-xs text-muted-foreground">{w.roleName}</p>}
            </div>
            {!w.email && <span className="text-[10px] text-red-500 flex-shrink-0">No email</span>}
          </label>
        ))}
        {filtered.length === 0 && (
          <p className="px-3 py-4 text-center text-sm text-muted-foreground">No workers found.</p>
        )}
      </div>
      {selected.size > 0 && (
        <div className="px-3 py-1.5 border-t bg-muted/20 text-xs text-muted-foreground">
          {selected.size} worker{selected.size !== 1 ? "s" : ""} selected
        </div>
      )}
    </div>
  );
}

// ── Channel selector ──────────────────────────────────────────────────────────

function ChannelSelector({
  selected, onChange,
}: {
  selected: Set<Channel>;
  onChange: (s: Set<Channel>) => void;
}) {
  function toggle(id: Channel) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {CHANNEL_OPTIONS.map(({ id, label, icon: Icon, enabled }) => {
        const isSelected = enabled && selected.has(id as Channel);
        return (
          <label
            key={id}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm select-none",
              !enabled && "opacity-50 cursor-not-allowed bg-muted/20",
              enabled && "cursor-pointer",
              isSelected && "border-primary bg-primary/5",
            )}
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={isSelected}
              disabled={!enabled}
              onChange={() => enabled && toggle(id as Channel)}
            />
            <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="flex-1 truncate">{label}</span>
            {!enabled && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground flex-shrink-0">
                <Lock className="h-2.5 w-2.5" /> Soon
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}

// ── Expiring preview ──────────────────────────────────────────────────────────

function ExpiryPreviewPanel({
  days, onSelectWorkers,
}: {
  days: number;
  onSelectWorkers: (ids: number[]) => void;
}) {
  const { data, isLoading } = useQuery<ExpiringPreviewWorker[]>({
    queryKey: ["emails-expiring-preview", days],
    queryFn: () => apiFetch<ExpiringPreviewWorker[]>(`/api/workforce/emails/expiring-preview?days=${days}`),
    staleTime: 60_000,
  });

  if (isLoading) return <Skeleton className="h-20 w-full" />;
  if (!data?.length) return (
    <p className="text-sm text-muted-foreground text-center py-4">
      No workers have certifications expiring within {days} days.
    </p>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{data.length} worker{data.length !== 1 ? "s" : ""} with expiring certs</p>
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={() => onSelectWorkers(data.map(w => w.workerId))}
        >
          Select all
        </button>
      </div>
      <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
        {data.map(w => (
          <div key={w.workerId} className="px-3 py-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{w.workerName}</p>
              {!w.email && <span className="text-[10px] text-red-500">No email</span>}
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {w.certifications.map(c => (
                <span key={c.name} className="text-[10px] bg-amber-50 border border-amber-200 text-amber-700 rounded px-1.5 py-0.5">
                  {c.name} · {c.expiryDate}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EmailsPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabId>("compose");
  const [emailType, setEmailType] = useState<EmailType>("custom");
  const [selectedWorkers, setSelectedWorkers] = useState<Set<number>>(new Set());
  const [selectedChannels, setSelectedChannels] = useState<Set<Channel>>(new Set(["email", "push"]));
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [expiryDays, setExpiryDays] = useState(60);
  const [logTypeFilter, setLogTypeFilter] = useState("all");

  if (!isAdmin) return <Redirect to="/" />;

  const { data: workers, isLoading: workersLoading } = useQuery<Worker[]>({
    queryKey: ["workforce-workers-meta"],
    queryFn: () => apiFetch<Worker[]>("/api/workforce/workers"),
    staleTime: 5 * 60_000,
  });

  const { data: logs, isLoading: logsLoading, refetch: refetchLogs } = useQuery<MessageLog[]>({
    queryKey: ["email-logs", logTypeFilter],
    queryFn: () => apiFetch<MessageLog[]>(
      `/api/workforce/emails/logs${logTypeFilter !== "all" ? `?emailType=${logTypeFilter}` : ""}`,
    ),
    enabled: activeTab === "logs",
    staleTime: 30_000,
  });

  const sendMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost<{ results: { workerId: number; workerName: string; channel: Channel; status: string; error?: string }[] }>(
        "/api/workforce/emails/send",
        body,
      ),
    onSuccess: (data) => {
      const sent = data.results.filter(r => r.status === "sent").length;
      const failed = data.results.filter(r => r.status === "failed").length;
      const skipped = data.results.filter(r => r.status === "skipped").length;
      toast({
        title: "Message job complete",
        description: `${sent} sent${failed ? `, ${failed} failed` : ""}${skipped ? `, ${skipped} skipped` : ""}`,
      });
      void qc.invalidateQueries({ queryKey: ["email-logs"] });
      setSelectedWorkers(new Set());
    },
    onError: (err) => toast({ title: "Send failed", description: String(err), variant: "destructive" }),
  });

  function handleSend() {
    if (selectedWorkers.size === 0) { toast({ title: "Select at least one worker" }); return; }
    if (selectedChannels.size === 0) { toast({ title: "Select at least one channel" }); return; }
    const workerIds = [...selectedWorkers];
    const channels = [...selectedChannels];

    const base = { emailType, workerIds, channels };
    if (emailType === "custom") {
      if (!subject.trim() || !bodyHtml.trim()) { toast({ title: "Subject and body are required" }); return; }
      sendMutation.mutate({ ...base, subject, bodyHtml });
    } else if (emailType === "expiry_notification") {
      sendMutation.mutate({ ...base, daysThreshold: expiryDays });
    } else if (emailType === "login_info") {
      if (!loginUrl.trim() || !loginUsername.trim() || !loginPassword.trim()) {
        toast({ title: "All login fields are required" }); return;
      }
      sendMutation.mutate({ ...base, loginUrl, username: loginUsername, temporaryPassword: loginPassword });
    }
  }

  const EMAIL_TYPES: { id: EmailType; label: string; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
    { id: "custom", label: "Custom Message", icon: MessageSquare, description: "Write a free-form message to selected workers" },
    { id: "expiry_notification", label: "Expiry Notification", icon: Bell, description: "Notify workers of certifications expiring soon" },
    { id: "login_info", label: "Login Information", icon: KeyRound, description: "Send account credentials to workers" },
  ];

  const LOG_FILTERS = [
    { value: "all", label: "All" },
    { value: "custom", label: "Custom" },
    { value: "expiry_notification", label: "Expiry Notices" },
    { value: "login_info", label: "Login Info" },
  ];

  const emailResults = (logs ?? []).flatMap(l => l.channels.filter(c => c.channel === "email"));
  const seenCount = emailResults.filter(c => c.seenAt).length;
  const sentCount = emailResults.filter(c => c.status === "sent").length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Mail className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Messages</h1>
          <p className="text-sm text-muted-foreground">Send notifications and track delivery across channels</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {([
          { id: "compose" as TabId, label: "Compose & Send", icon: Send },
          { id: "logs" as TabId, label: "Message Logs", icon: Clock },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeTab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Compose tab ── */}
      {activeTab === "compose" && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* Left: email type + form */}
          <div className="space-y-5">
            {/* Email type selector */}
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Message Type</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {EMAIL_TYPES.map(({ id, label, icon: Icon, description }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setEmailType(id)}
                    className={cn(
                      "flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-colors",
                      emailType === id
                        ? "border-primary bg-primary/5"
                        : "border hover:border-primary/40",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={cn("h-4 w-4", emailType === id ? "text-primary" : "text-muted-foreground")} />
                      <span className="text-sm font-medium">{label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Channel selector */}
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Send Via</Label>
              <ChannelSelector selected={selectedChannels} onChange={setSelectedChannels} />
              {emailType === "login_info" && selectedChannels.has("push") && (
                <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Push notifications for login info will only alert the worker to check their email — the password is never sent via push.
                </p>
              )}
            </div>

            {/* Form fields by type */}
            {emailType === "custom" && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="email-subject">Subject</Label>
                  <Input
                    id="email-subject"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="Message subject…"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="email-body">Message (HTML supported for email)</Label>
                  <Textarea
                    id="email-body"
                    value={bodyHtml}
                    onChange={e => setBodyHtml(e.target.value)}
                    placeholder="<p>Dear worker,</p><p>Your message here…</p>"
                    className="mt-1 font-mono text-xs min-h-[180px]"
                  />
                </div>
              </div>
            )}

            {emailType === "expiry_notification" && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="expiry-days">Notify workers expiring within (days)</Label>
                  <Input
                    id="expiry-days"
                    type="number"
                    min={1}
                    max={365}
                    value={expiryDays}
                    onChange={e => setExpiryDays(parseInt(e.target.value) || 60)}
                    className="mt-1 w-32"
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Preview: workers with expiring certs</Label>
                  <ExpiryPreviewPanel
                    days={expiryDays}
                    onSelectWorkers={ids => setSelectedWorkers(new Set(ids))}
                  />
                </div>
              </div>
            )}

            {emailType === "login_info" && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="login-url">Login URL</Label>
                  <Input
                    id="login-url"
                    value={loginUrl}
                    onChange={e => setLoginUrl(e.target.value)}
                    placeholder="https://yourapp.com/login"
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="login-username">Username</Label>
                    <Input
                      id="login-username"
                      value={loginUsername}
                      onChange={e => setLoginUsername(e.target.value)}
                      placeholder="username"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="login-password">Temporary Password</Label>
                    <Input
                      id="login-password"
                      value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                      placeholder="temp-password"
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            )}

            <Button
              onClick={handleSend}
              disabled={sendMutation.isPending || selectedWorkers.size === 0 || selectedChannels.size === 0}
              className="w-full sm:w-auto"
              data-testid="button-send-email"
            >
              <Send className="h-4 w-4 mr-2" />
              {sendMutation.isPending
                ? "Sending…"
                : `Send to ${selectedWorkers.size} worker${selectedWorkers.size !== 1 ? "s" : ""}`}
            </Button>
          </div>

          {/* Right: worker selector */}
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Recipients
            </Label>
            {workersLoading ? (
              <Skeleton className="h-64 w-full rounded-md" />
            ) : (
              <WorkerSelector
                workers={workers ?? []}
                selected={selectedWorkers}
                onChange={setSelectedWorkers}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Logs tab ── */}
      {activeTab === "logs" && (
        <div className="space-y-4">
          {/* Stats */}
          {!logsLoading && logs && logs.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Emails Sent", value: sentCount, color: "text-foreground", icon: Send },
                { label: "Opened", value: seenCount, color: "text-emerald-600", icon: Eye },
                { label: "Open Rate", value: sentCount > 0 ? `${Math.round((seenCount / sentCount) * 100)}%` : "—", color: "text-blue-600", icon: CheckCircle2 },
              ].map(({ label, value, color, icon: Icon }) => (
                <div key={label} className="border rounded-xl p-4 bg-card text-center">
                  <Icon className={cn("h-4 w-4 mx-auto mb-1", color)} />
                  <p className={cn("text-xl font-bold tabular-nums", color)}>{value}</p>
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Filters + refresh */}
          <div className="flex items-center gap-2 flex-wrap">
            {LOG_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setLogTypeFilter(f.value)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                  logTypeFilter === f.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border hover:border-primary/50",
                )}
              >
                {f.label}
              </button>
            ))}
            <button
              onClick={() => void refetchLogs()}
              className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>

          {/* Table */}
          <div className="border rounded-xl bg-card overflow-hidden">
            {logsLoading ? (
              <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : !logs?.length ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                <Mail className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                No messages sent yet.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b">
                    <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground">Recipient</th>
                    <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground hidden md:table-cell">Subject</th>
                    <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground">Type</th>
                    <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground">Channels</th>
                    <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground">Opened</th>
                    <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground hidden lg:table-cell">Sent At</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.map(log => <LogRow key={log.id} log={log} />)}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
