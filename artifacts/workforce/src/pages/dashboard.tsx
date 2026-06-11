import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Users, ShieldCheck, AlertTriangle, Clock, UserX, Award, Building2, Globe,
  ClipboardCheck, CheckCircle2, Activity, Mail, Upload, LogIn, KeyRound,
  Pencil, User, FileText, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────────

interface DashboardData {
  totalWorkers: number;
  readyCount: number;
  expiringCount: number;
  nonCompliantCount: number;
  unassignedCount: number;
  certificationsByStatus: { name: string; missing: number; expired: number; expiring: number }[];
  expiringInNext30Days: {
    workerId: number;
    workerName: string;
    certName: string;
    expiryDate: string;
    daysUntilExpiry: number;
  }[];
}

interface SiteWithStats {
  id: number;
  name: string;
  location: string | null;
  active: boolean;
  workerCount: number;
  readyCount: number;
  expiringCount: number;
  nonCompliantCount: number;
  noReqCount: number;
}

interface ActivityItem {
  id: number;
  source: string;
  workerId: number;
  workerName: string;
  eventType: string;
  detail: string | null;
  ipAddress: string | null;
  createdAt: string;
}

// ── Palette ────────────────────────────────────────────────────────────────────

const PALETTE = {
  ready:       "#10b981",
  expiring:    "#f59e0b",
  nonCompliant:"#ef4444",
  unassigned:  "#94a3b8",
  missing:     "#6b7280",
  expired:     "#ef4444",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const EVENT_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  login:           { label: "Logged in",         icon: LogIn,    color: "text-blue-500"   },
  cert_upload:     { label: "Uploaded cert",     icon: Upload,   color: "text-emerald-500"},
  cert_update:     { label: "Updated cert",      icon: Pencil,   color: "text-amber-500"  },
  password_change: { label: "Changed password",  icon: KeyRound, color: "text-purple-500" },
  profile_update:  { label: "Updated profile",   icon: User,     color: "text-slate-500"  },
  cv_upload:       { label: "Uploaded CV",        icon: FileText, color: "text-teal-500"   },
  passport_upload: { label: "Uploaded passport", icon: FileText, color: "text-cyan-500"   },
  email_sent:      { label: "Email sent",         icon: Mail,     color: "text-indigo-500" },
  email_opened:    { label: "Email opened",       icon: Mail,     color: "text-indigo-400" },
};

function eventMeta(type: string) {
  return EVENT_META[type] ?? { label: type.replace(/_/g, " "), icon: Activity, color: "text-muted-foreground" };
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, accentClass, href, loading,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
  href?: string;
  loading?: boolean;
}) {
  const inner = loading ? (
    <div className="border rounded-xl p-4 bg-card space-y-2">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-7 w-12" />
    </div>
  ) : (
    <div className={cn(
      "border rounded-xl p-4 bg-card flex flex-col gap-1",
      href && "hover:bg-muted/30 transition-colors cursor-pointer",
    )}>
      <div className="flex items-center gap-2">
        <div className={cn("h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0", accentClass)}>
          <Icon className="h-3.5 w-3.5 text-white" />
        </div>
        <p className="text-xs text-muted-foreground font-medium leading-tight">{label}</p>
      </div>
      <p className="text-3xl font-bold tabular-nums leading-none mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );

  if (href && !loading) return <Link href={href}><a>{inner}</a></Link>;
  return inner;
}

// ── Compliance donut ──────────────────────────────────────────────────────────

function ComplianceDonut({ data, loading }: { data: DashboardData | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-56">
        <Skeleton className="h-40 w-40 rounded-full" />
      </div>
    );
  }
  if (!data || data.totalWorkers === 0) {
    return <div className="flex-1 flex items-center justify-center h-56 text-sm text-muted-foreground">No assigned workers.</div>;
  }

  const pct = Math.round((data.readyCount / data.totalWorkers) * 100);
  const pieData = [
    { name: "Ready",        value: data.readyCount,        color: PALETTE.ready       },
    { name: "Expiring soon",value: data.expiringCount,     color: PALETTE.expiring    },
    { name: "Not compliant",value: data.nonCompliantCount, color: PALETTE.nonCompliant},
    { name: "Unassigned",   value: data.unassignedCount,   color: PALETTE.unassigned  },
  ].filter(d => d.value > 0);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
      <div className="relative" style={{ width: 180, height: 180 }}>
        <PieChart width={180} height={180}>
          <Pie data={[{ value: 1 }]} cx={90} cy={90} innerRadius={52} outerRadius={78}
            dataKey="value" stroke="none" isAnimationActive={false}>
            <Cell fill="#f1f5f9" />
          </Pie>
          <Pie data={pieData} cx={90} cy={90} innerRadius={52} outerRadius={78}
            paddingAngle={pieData.length > 1 ? 2 : 0} dataKey="value"
            startAngle={90} endAngle={-270}>
            {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
          <RechartsTooltip
            formatter={(v: number, n: string) => [`${v} workers`, n]}
            contentStyle={{ borderRadius: "8px", fontSize: "12px", padding: "6px 10px" }}
          />
        </PieChart>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold tabular-nums">{pct}<span className="text-sm font-normal text-muted-foreground">%</span></span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">compliant</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 w-full max-w-[240px]">
        {[
          { name: "Ready",       value: data.readyCount,        color: PALETTE.ready        },
          { name: "Expiring",    value: data.expiringCount,     color: PALETTE.expiring     },
          { name: "Not compliant",value: data.nonCompliantCount, color: PALETTE.nonCompliant },
          { name: "Unassigned",  value: data.unassignedCount,   color: PALETTE.unassigned   },
        ].map(item => (
          <div key={item.name} className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: item.color }} />
            <span className="text-xs text-muted-foreground truncate">{item.name}</span>
            <span className={cn("text-xs font-semibold ml-auto tabular-nums", item.value === 0 && "text-muted-foreground/40")}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Cert issues bar chart ─────────────────────────────────────────────────────

function CertIssuesChart({ items, loading }: {
  items: DashboardData["certificationsByStatus"];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex-1 p-4 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-7 w-full rounded" />)}
      </div>
    );
  }
  if (!items.length) {
    return (
      <div className="flex-1 flex items-center justify-center h-48 text-sm text-muted-foreground">
        No certification issues to report.
      </div>
    );
  }

  const sorted = [...items]
    .map(c => ({ ...c, total: c.missing + c.expired + c.expiring }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  // Truncate long names for axis
  const chartData = sorted.map(c => ({
    ...c,
    shortName: c.name.length > 22 ? c.name.slice(0, 20) + "…" : c.name,
  }));

  return (
    <div className="flex-1 p-4">
      <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 38)}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis
            type="category" dataKey="shortName" width={130}
            tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
          />
          <RechartsTooltip
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
            formatter={(v: number, n: string) => [`${v}`, n.charAt(0).toUpperCase() + n.slice(1)]}
            contentStyle={{ borderRadius: "8px", fontSize: "12px", padding: "6px 10px" }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
          <Bar dataKey="missing"  name="Missing / unverified" stackId="a" fill={PALETTE.missing}      radius={[0,0,0,0]} />
          <Bar dataKey="expired"  name="Expired"              stackId="a" fill={PALETTE.expired}      radius={[0,0,0,0]} />
          <Bar dataKey="expiring" name="Expiring soon"        stackId="a" fill={PALETTE.expiring}     radius={[2,2,2,2]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Activity feed ─────────────────────────────────────────────────────────────

function ActivityFeed({ isAdmin }: { isAdmin?: boolean }) {
  const { data, isLoading } = useQuery<{ data: ActivityItem[]; total: number }>({
    queryKey: ["activity-feed-dashboard"],
    queryFn: () => apiFetch("/api/workforce/activity-feed?pageSize=10"),
    staleTime: 30_000,
    enabled: isAdmin !== false,
  });

  const items = data?.data ?? [];

  return (
    <div className="border rounded-xl bg-card overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <h2 className="font-semibold text-sm">Recent Activity</h2>
        <Link href="/worker-activity">
          <a className="ml-auto text-xs text-muted-foreground hover:text-primary flex items-center gap-0.5">
            All <ChevronRight className="h-3 w-3" />
          </a>
        </Link>
      </div>
      {isLoading ? (
        <div className="p-4 space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : !items.length ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">No activity yet.</div>
      ) : (
        <div className="divide-y max-h-80 overflow-y-auto">
          {items.map((item) => {
            const meta = eventMeta(item.eventType);
            const Icon = meta.icon;
            return (
              <div key={`${item.source}-${item.id}`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/30">
                <div className={cn("mt-0.5 flex-shrink-0", meta.color)}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <Link href={`/workers/${item.workerId}`}>
                    <a className="text-xs font-medium hover:underline truncate block">{item.workerName}</a>
                  </Link>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {meta.label}
                    {item.detail && item.eventType === "email_sent" && ` · ${item.detail}`}
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground flex-shrink-0 mt-0.5 tabular-nums">
                  {relativeTime(item.createdAt)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Attention action row ──────────────────────────────────────────────────────

type Severity = "red" | "orange" | "amber" | "slate";

const SEVERITY_RANK: Record<Severity, number> = { red: 0, orange: 1, amber: 2, slate: 3 };

const SEVERITY_STYLES: Record<Severity, { wrap: string; iconBg: string; title: string; sub: string; cta: string }> = {
  red:    { wrap: "border-red-200 bg-red-50 hover:bg-red-100",       iconBg: "bg-red-500",    title: "text-red-800",    sub: "text-red-600",    cta: "text-red-700"    },
  orange: { wrap: "border-orange-200 bg-orange-50 hover:bg-orange-100", iconBg: "bg-orange-500", title: "text-orange-800", sub: "text-orange-600", cta: "text-orange-700" },
  amber:  { wrap: "border-amber-200 bg-amber-50 hover:bg-amber-100",  iconBg: "bg-amber-500",  title: "text-amber-800",  sub: "text-amber-600",  cta: "text-amber-700"  },
  slate:  { wrap: "border-slate-200 bg-slate-50 hover:bg-slate-100",  iconBg: "bg-slate-400",  title: "text-slate-700",  sub: "text-slate-500",  cta: "text-slate-600"  },
};

interface ActionItem {
  key: string; severity: Severity;
  icon: React.ComponentType<{ className?: string }>;
  title: string; sub: string; href: string; cta: string;
}

function ActionRow({ item }: { item: ActionItem }) {
  const s = SEVERITY_STYLES[item.severity];
  const Icon = item.icon;
  return (
    <Link href={item.href}>
      <a className={cn("flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors", s.wrap)}>
        <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0", s.iconBg)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-semibold", s.title)}>{item.title}</p>
          <p className={cn("text-xs mt-0.5", s.sub)}>{item.sub}</p>
        </div>
        <span className={cn("text-xs font-medium hover:underline flex-shrink-0 whitespace-nowrap hidden sm:block", s.cta)}>
          {item.cta} →
        </span>
      </a>
    </Link>
  );
}

// ── Sites table ───────────────────────────────────────────────────────────────

function SitesTable({ sites, onSelectSite, loading }: {
  sites: SiteWithStats[];
  onSelectSite: (id: number) => void;
  loading?: boolean;
}) {
  const sorted = [...sites]
    .filter(s => s.active)
    .sort((a, b) =>
      (b.nonCompliantCount - a.nonCompliantCount) ||
      (b.expiringCount - a.expiringCount) ||
      (b.workerCount - a.workerCount),
    );

  if (loading) {
    return (
      <div className="divide-y">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 mx-4 my-1.5 rounded-md" />)}
      </div>
    );
  }
  if (!sorted.length) {
    return <div className="px-4 py-6 text-center text-sm text-muted-foreground">No active sites.</div>;
  }

  return (
    <div className="divide-y">
      {sorted.map((site) => {
        const total = site.workerCount;
        const readyPct = total > 0 ? Math.round((site.readyCount / total) * 100) : 0;
        const statusColor =
          site.nonCompliantCount > 0 ? "bg-red-500" :
          site.expiringCount > 0 ? "bg-amber-500" :
          total > 0 ? "bg-emerald-500" : "bg-slate-300";
        const pctColor =
          site.nonCompliantCount > 0 ? "text-red-600 border-red-300" :
          site.expiringCount > 0 ? "text-amber-600 border-amber-300" :
          readyPct === 100 && total > 0 ? "text-emerald-600 border-emerald-300" : "";

        return (
          <div key={site.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 group">
            <span className={cn("h-2 w-2 rounded-full flex-shrink-0", statusColor)} />
            <div className="flex-1 min-w-0">
              <Link href={`/sites/${site.id}`}>
                <a className="font-medium text-sm hover:underline truncate block">{site.name}</a>
              </Link>
              {site.location && <p className="text-[11px] text-muted-foreground truncate">{site.location}</p>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {site.nonCompliantCount > 0 && (
                <span className="hidden sm:inline text-[10px] font-medium text-red-600">
                  {site.nonCompliantCount} non-compliant
                </span>
              )}
              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden hidden sm:block">
                <div
                  className={cn("h-full rounded-full transition-all",
                    site.nonCompliantCount > 0 ? "bg-red-500" :
                    site.expiringCount > 0 ? "bg-amber-500" : "bg-emerald-500"
                  )}
                  style={{ width: `${readyPct}%` }}
                />
              </div>
              <Badge variant="outline" className={cn("text-[10px] min-w-[36px] justify-center tabular-nums", pctColor)}>
                {readyPct}%
              </Badge>
              <span className="text-xs text-muted-foreground tabular-nums">{total}w</span>
              <button
                onClick={() => onSelectSite(site.id)}
                className="text-xs text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
              >
                Filter
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Dashboard page ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [expiryDays, setExpiryDays] = useState<30 | 60>(30);

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["workforce-dashboard", selectedSiteId, expiryDays],
    queryFn: () => {
      const p = new URLSearchParams({ expiryDays: String(expiryDays) });
      if (selectedSiteId) p.set("siteId", String(selectedSiteId));
      return apiFetch<DashboardData>(`/api/workforce/dashboard?${p}`);
    },
    refetchInterval: 60_000,
  });

  const { data: reviewItems } = useQuery<{ workerId: number }[]>({
    queryKey: ["review-queue"],
    queryFn: () => apiFetch("/api/workforce/review-queue"),
    refetchInterval: 60_000,
  });
  const reviewCount = reviewItems?.length ?? 0;

  const { data: sites, isLoading: sitesLoading } = useQuery<SiteWithStats[]>({
    queryKey: ["workforce-sites-with-stats"],
    queryFn: () => apiFetch<SiteWithStats[]>("/api/workforce/sites-with-stats"),
  });

  const selectedSite = sites?.find(s => s.id === selectedSiteId) ?? null;
  const expiringItems = data?.expiringInNext30Days ?? [];
  const expiring7Count = expiringItems.filter(i => i.daysUntilExpiry <= 7).length;

  const displayCounts = selectedSite
    ? { totalWorkers: selectedSite.workerCount, readyCount: selectedSite.readyCount,
        expiringCount: selectedSite.expiringCount, nonCompliantCount: selectedSite.nonCompliantCount,
        unassignedCount: selectedSite.noReqCount }
    : data ? { totalWorkers: data.totalWorkers, readyCount: data.readyCount,
        expiringCount: data.expiringCount, nonCompliantCount: data.nonCompliantCount,
        unassignedCount: data.unassignedCount }
    : null;

  const compliancePct = displayCounts && displayCounts.totalWorkers > 0
    ? Math.round((displayCounts.readyCount / displayCounts.totalWorkers) * 100) : 0;

  const atRisk = displayCounts ? displayCounts.nonCompliantCount + displayCounts.expiringCount : 0;

  // Action items
  const actionItems: ActionItem[] = [];
  if (displayCounts) {
    if (displayCounts.nonCompliantCount > 0)
      actionItems.push({ key: "non-compliant", severity: "red", icon: AlertTriangle,
        title: `${displayCounts.nonCompliantCount} worker${displayCounts.nonCompliantCount !== 1 ? "s" : ""} not compliant`,
        sub: "Missing or expired required certifications — resolve before deployment",
        href: "/workers", cta: "Review workers" });
    if (expiring7Count > 0)
      actionItems.push({ key: "expiring-7", severity: "red", icon: Clock,
        title: `${expiring7Count} certification${expiring7Count !== 1 ? "s" : ""} expire within 7 days`,
        sub: "Renew now to prevent a compliance lapse", href: "/workers", cta: "View workers" });
    if (reviewCount > 0)
      actionItems.push({ key: "review", severity: "orange", icon: ClipboardCheck,
        title: `${reviewCount} certification${reviewCount !== 1 ? "s" : ""} awaiting your review`,
        sub: "Workers submitted documents to verify or reject", href: "/review-queue", cta: "Go to Review Queue" });
    if (displayCounts.expiringCount > 0)
      actionItems.push({ key: "expiring-soon", severity: "amber", icon: Clock,
        title: `${displayCounts.expiringCount} worker${displayCounts.expiringCount !== 1 ? "s" : ""} with certs expiring soon`,
        sub: `Certifications lapsing within the next ${expiryDays} days`, href: "/workers", cta: "View workers" });
    if (displayCounts.unassignedCount > 0)
      actionItems.push({ key: "unassigned", severity: "slate", icon: UserX,
        title: `${displayCounts.unassignedCount} ${selectedSite ? "worker" + (displayCounts.unassignedCount !== 1 ? "s" : "") + " with no requirements" : "unassigned worker" + (displayCounts.unassignedCount !== 1 ? "s" : "")}`,
        sub: selectedSite ? "No certification requirements set for this site" : "Assign to a site to start tracking compliance",
        href: "/workers", cta: "Manage" });
  }
  actionItems.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  // Cert issues: top certs with most problems
  const certIssues = (data?.certificationsByStatus ?? [])
    .filter(c => c.missing + c.expired + c.expiring > 0);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6 text-primary flex-shrink-0" />
            Workforce Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Compliance overview · {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>

        {/* Site filter */}
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <select
            className="border rounded-md px-3 py-1.5 text-sm bg-background"
            value={selectedSiteId ?? ""}
            onChange={e => setSelectedSiteId(e.target.value ? Number(e.target.value) : null)}
            data-testid="select-site-filter"
          >
            <option value="">All Sites</option>
            {(sites ?? []).filter(s => s.active).map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {selectedSiteId && (
            <button
              onClick={() => setSelectedSiteId(null)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              data-testid="button-clear-site-filter"
            >
              <Globe className="h-3.5 w-3.5" /> All
            </button>
          )}
        </div>
      </div>

      {/* Site context banner */}
      {selectedSite && (
        <div className="border rounded-lg px-4 py-2.5 bg-primary/5 border-primary/20 flex items-center gap-2 text-sm">
          <Building2 className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="font-medium">{selectedSite.name}</span>
          {selectedSite.location && <span className="text-muted-foreground hidden sm:inline">· {selectedSite.location}</span>}
          <Link href={`/sites/${selectedSite.id}`}>
            <a className="ml-auto text-xs text-primary hover:underline">View site →</a>
          </Link>
        </div>
      )}

      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Compliance rate"  value={`${compliancePct}%`}
          sub={`${displayCounts?.readyCount ?? 0} of ${displayCounts?.totalWorkers ?? 0} ready`}
          icon={ShieldCheck}  accentClass="bg-primary"       loading={isLoading} />
        <KpiCard label="Total workers"    value={displayCounts?.totalWorkers ?? 0}
          icon={Users}         accentClass="bg-blue-500"      loading={isLoading} href="/workers" />
        <KpiCard label="At risk"          value={isLoading ? "—" : atRisk}
          sub="non-compliant + expiring"
          icon={AlertTriangle} accentClass={atRisk > 0 ? "bg-red-500" : "bg-emerald-500"}
          loading={isLoading}  href="/workers" />
        <KpiCard label="Awaiting review"  value={reviewCount}
          sub="pending verification"
          icon={ClipboardCheck} accentClass={reviewCount > 0 ? "bg-orange-500" : "bg-slate-400"}
          loading={isLoading}  href="/review-queue" />
        <KpiCard label="Expiring ≤ 7 days" value={isLoading ? "—" : expiring7Count}
          sub="critical renewals"
          icon={Clock}        accentClass={expiring7Count > 0 ? "bg-red-500" : "bg-slate-400"}
          loading={isLoading}  href="/workers" />
      </div>

      {/* ── Action required ─────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">Needs your attention</h2>
          {!isLoading && actionItems.length > 0 && (
            <Badge variant="outline" className="text-[10px]">{actionItems.length}</Badge>
          )}
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : actionItems.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3" data-testid="all-clear">
            <div className="h-9 w-9 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-800">All clear</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                No outstanding compliance actions{selectedSite ? ` for ${selectedSite.name}` : ""}.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {actionItems.map(item => <ActionRow key={item.key} item={item} />)}
          </div>
        )}
      </section>

      {/* ── Compliance health + Cert issues ─────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Donut */}
        <div className="border rounded-xl bg-card overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Workforce Health</h2>
            {selectedSite && <span className="text-xs text-muted-foreground">· {selectedSite.name}</span>}
          </div>
          <ComplianceDonut data={data} loading={isLoading} />
        </div>

        {/* Cert issues bar chart */}
        <div className="border rounded-xl bg-card overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <Award className="h-4 w-4 text-amber-500" />
            <h2 className="font-semibold text-sm">Certification Issues by Type</h2>
            {certIssues.length > 0 && (
              <Badge variant="outline" className="ml-auto text-[10px]">
                {certIssues.length} cert{certIssues.length !== 1 ? "s" : ""} affected
              </Badge>
            )}
          </div>
          <CertIssuesChart items={certIssues} loading={isLoading} />
        </div>
      </div>

      {/* ── Upcoming expirations + Recent activity ───────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Expiring soon */}
        <div className="border rounded-xl bg-card overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            <h2 className="font-semibold text-sm">Upcoming Expirations</h2>
            <div className="ml-auto flex items-center gap-1">
              {([30, 60] as const).map(d => (
                <button key={d} onClick={() => setExpiryDays(d)}
                  className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors",
                    expiryDays === d
                      ? "bg-amber-500 text-white border-amber-500"
                      : "text-muted-foreground border-border hover:border-amber-400 hover:text-amber-600",
                  )}>
                  {d}d
                </button>
              ))}
            </div>
          </div>
          {!isLoading && expiringItems.length > 0 && (
            <div className="px-4 py-1.5 border-b bg-muted/30 text-xs text-muted-foreground flex items-center gap-4">
              {expiring7Count > 0 && (
                <span className="flex items-center gap-1 font-medium text-red-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  {expiring7Count} within 7 days
                </span>
              )}
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {expiringItems.length} within {expiryDays} days
              </span>
            </div>
          )}
          {isLoading ? (
            <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : !expiringItems.length ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No certifications expiring in the next {expiryDays} days.
            </div>
          ) : (
            <div className="divide-y max-h-72 overflow-y-auto">
              {expiringItems.map((item, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20">
                  <div className="flex-1 min-w-0">
                    <Link href={`/workers/${item.workerId}`}>
                      <a className="font-medium text-sm hover:underline truncate block">{item.workerName}</a>
                    </Link>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                      <Award className="h-3 w-3 inline flex-shrink-0" />
                      {item.certName}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <Badge variant="outline"
                      className={cn("text-[10px] tabular-nums",
                        item.daysUntilExpiry <= 7 ? "border-red-400 text-red-600" : "border-amber-400 text-amber-600"
                      )}>
                      {item.daysUntilExpiry}d
                    </Badge>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(item.expiryDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activity feed */}
        <ActivityFeed />
      </div>

      {/* ── Sites overview ──────────────────────────────────────────────────── */}
      {!selectedSite && (
        <div className="border rounded-xl bg-card overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Sites</h2>
            <span className="text-xs text-muted-foreground">· ranked by risk</span>
            <Link href="/sites">
              <a className="ml-auto text-xs text-muted-foreground hover:text-primary flex items-center gap-0.5">
                All sites <ChevronRight className="h-3 w-3" />
              </a>
            </Link>
          </div>
          <SitesTable
            sites={sites ?? []}
            onSelectSite={setSelectedSiteId}
            loading={sitesLoading}
          />
        </div>
      )}

    </div>
  );
}
