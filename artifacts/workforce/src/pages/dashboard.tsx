import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Users, ShieldCheck, AlertTriangle, Clock, UserX, Award, Building2, Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from "recharts";

interface CertIssueWorker {
  workerId: number;
  workerName: string;
  expiryDate: string | null;
}

function CertWorkerPopover({
  certName, status, count, siteId, expiryDays, className,
}: {
  certName: string;
  status: "expired" | "expiring" | "missing";
  count: number;
  siteId: number | null;
  expiryDays: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const params = new URLSearchParams({ certName, status, expiryDays: String(expiryDays) });
  if (siteId) params.set("siteId", String(siteId));

  const { data, isLoading } = useQuery<CertIssueWorker[]>({
    queryKey: ["cert-issue-workers", certName, status, siteId, expiryDays],
    queryFn: () => apiFetch<CertIssueWorker[]>(`/api/workforce/cert-issue-workers?${params}`),
    enabled: open,
    staleTime: 60_000,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={cn("cursor-pointer", className)}>
          <Badge variant="outline" className={cn(
            "text-[10px] hover:opacity-80 transition-opacity",
            status === "expiring"
              ? "border-amber-400 text-amber-600"
              : "border-red-400 text-red-600",
          )}>
            {count} {status}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        <div className="px-3 py-2 border-b">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{certName}</p>
          <p className="text-xs text-muted-foreground capitalize">{status}</p>
        </div>
        <div className="max-h-56 overflow-y-auto divide-y">
          {isLoading ? (
            <div className="p-3 space-y-1.5">
              {Array.from({ length: Math.min(count, 4) }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          ) : !data?.length ? (
            <p className="text-xs text-muted-foreground p-3">No workers found.</p>
          ) : (
            data.map((w) => (
              <div key={w.workerId} className="flex items-center justify-between px-3 py-1.5 hover:bg-muted/40">
                <Link href={`/workers/${w.workerId}`}>
                  <a className="text-xs font-medium hover:underline truncate max-w-[140px] block">{w.workerName}</a>
                </Link>
                {w.expiryDate && (
                  <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-2">
                    {new Date(w.expiryDate).toLocaleDateString("en-GB")}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

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

const CHART_COLORS = {
  READY: "#10b981",
  EXPIRING_SOON: "#f59e0b",
  NOT_COMPLIANT: "#ef4444",
  UNASSIGNED: "#94a3b8",
};

function StatCard({
  label, value, icon: Icon, color, href,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  href?: string;
}) {
  const inner = (
    <div className={cn(
      "border rounded-xl p-4 bg-card flex items-center gap-4",
      href && "hover:bg-muted/30 transition-colors cursor-pointer",
    )}>
      <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0", color)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
  if (href) return <Link href={href}><a>{inner}</a></Link>;
  return inner;
}

export default function DashboardPage() {
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [expiryDays, setExpiryDays] = useState<30 | 60>(30);

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["workforce-dashboard", selectedSiteId, expiryDays],
    queryFn: () => {
      const params = new URLSearchParams({ expiryDays: String(expiryDays) });
      if (selectedSiteId) params.set("siteId", String(selectedSiteId));
      return apiFetch<DashboardData>(`/api/workforce/dashboard?${params}`);
    },
    refetchInterval: 60_000,
  });

  const { data: sites } = useQuery<SiteWithStats[]>({
    queryKey: ["workforce-sites-with-stats"],
    queryFn: () => apiFetch<SiteWithStats[]>("/api/workforce/sites-with-stats"),
  });

  const selectedSite = sites?.find(s => s.id === selectedSiteId) ?? null;

  const expiringItems = data?.expiringInNext30Days ?? [];

  const displayCounts = selectedSite
    ? {
        totalWorkers: selectedSite.workerCount,
        readyCount: selectedSite.readyCount,
        expiringCount: selectedSite.expiringCount,
        nonCompliantCount: selectedSite.nonCompliantCount,
        unassignedCount: selectedSite.noReqCount,
      }
    : data
    ? {
        totalWorkers: data.totalWorkers,
        readyCount: data.readyCount,
        expiringCount: data.expiringCount,
        nonCompliantCount: data.nonCompliantCount,
        unassignedCount: data.unassignedCount,
      }
    : null;

  const complianceChartData = displayCounts ? [
    { name: "Ready", value: displayCounts.readyCount, color: CHART_COLORS.READY },
    { name: "Expiring Soon", value: displayCounts.expiringCount, color: CHART_COLORS.EXPIRING_SOON },
    { name: "Not Compliant", value: displayCounts.nonCompliantCount, color: CHART_COLORS.NOT_COMPLIANT },
    { name: selectedSite ? "No Requirements" : "Unassigned", value: displayCounts.unassignedCount, color: CHART_COLORS.UNASSIGNED },
  ] : [];
  const compliancePieData = complianceChartData.filter(d => d.value > 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Workforce Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live compliance overview for all active workers.
          </p>
        </div>

        {/* Site filter */}
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <select
            className="border rounded-md px-3 py-1.5 text-sm bg-background"
            value={selectedSiteId ?? ""}
            onChange={(e) => setSelectedSiteId(e.target.value ? Number(e.target.value) : null)}
            data-testid="select-site-filter"
          >
            <option value="">
              All Sites
            </option>
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
              <Globe className="h-3.5 w-3.5" />
              All
            </button>
          )}
        </div>
      </div>

      {selectedSite && (
        <div className="border rounded-lg px-4 py-2.5 bg-primary/5 border-primary/20 flex items-center gap-2 text-sm">
          <Building2 className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="font-medium">{selectedSite.name}</span>
          {selectedSite.location && (
            <span className="text-muted-foreground">· {selectedSite.location}</span>
          )}
          <Link href={`/sites/${selectedSite.id}`}>
            <a className="ml-auto text-xs text-primary hover:underline">View site</a>
          </Link>
        </div>
      )}

      {/* Stat cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : displayCounts ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="Total Workers" value={displayCounts.totalWorkers} icon={Users} color="bg-blue-500" href="/workers" />
          <StatCard label="Ready" value={displayCounts.readyCount} icon={ShieldCheck} color="bg-emerald-500" href="/workers" />
          <StatCard label="Expiring Soon" value={displayCounts.expiringCount} icon={Clock} color="bg-amber-500" href="/workers" />
          <StatCard label="Not Compliant" value={displayCounts.nonCompliantCount} icon={AlertTriangle} color="bg-red-500" href="/workers" />
          <StatCard label={selectedSite ? "No Requirements" : "Unassigned"} value={displayCounts.unassignedCount} icon={UserX} color="bg-slate-400" href="/workers" />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Compliance donut chart */}
        <div className="border rounded-xl bg-card overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Compliance Breakdown</h2>
            {selectedSite && <span className="text-xs text-muted-foreground">· {selectedSite.name}</span>}
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Skeleton className="h-36 w-36 rounded-full" />
            </div>
          ) : !displayCounts ? (
            <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
              No assigned workers.
            </div>
          ) : (
            <div className="p-4 flex flex-col items-center gap-4">
              <div className="relative" style={{ width: 200, height: 200 }}>
                <PieChart width={200} height={200}>
                  <Pie
                    data={[{ value: 1 }]}
                    cx={100} cy={100}
                    innerRadius={56} outerRadius={84}
                    dataKey="value"
                    stroke="none"
                    isAnimationActive={false}
                  >
                    <Cell fill="#f1f5f9" />
                  </Pie>
                  <Pie
                    data={compliancePieData}
                    cx={100} cy={100}
                    innerRadius={56} outerRadius={84}
                    paddingAngle={compliancePieData.length > 1 ? 2 : 0}
                    dataKey="value"
                    startAngle={90}
                    endAngle={-270}
                  >
                    {compliancePieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [`${value} workers`, name]}
                    contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
                  />
                </PieChart>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold tabular-nums">{displayCounts.totalWorkers}</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">workers</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 w-full max-w-[280px]">
                {complianceChartData.map((item) => (
                  <div key={item.name} className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: item.color }} />
                    <span className="text-xs text-muted-foreground truncate">{item.name}</span>
                    <span className={cn("text-xs font-semibold ml-auto tabular-nums", item.value === 0 && "text-muted-foreground/50")}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Expiring certifications */}
        <div className="border rounded-xl bg-card overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            <h2 className="font-semibold text-sm">Expiring in Next {expiryDays} Days</h2>
            <div className="ml-auto flex items-center gap-1">
              {selectedSite && (
                <span className="text-xs text-muted-foreground mr-2">{selectedSite.name}</span>
              )}
              {([30, 60] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setExpiryDays(d)}
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors",
                    expiryDays === d
                      ? "bg-amber-500 text-white border-amber-500"
                      : "text-muted-foreground border-border hover:border-amber-400 hover:text-amber-600",
                  )}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : !expiringItems.length ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No certifications expiring in the next {expiryDays} days.
            </div>
          ) : (
            <div className="divide-y">
              {expiringItems.map((item, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <Link href={`/workers/${item.workerId}`}>
                      <a className="font-medium text-sm hover:underline truncate block" data-testid={`link-worker-${item.workerId}`}>
                        {item.workerName}
                      </a>
                    </Link>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Award className="h-3 w-3 inline" />
                      {item.certName}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        item.daysUntilExpiry <= 7 ? "border-red-400 text-red-600" : "border-amber-400 text-amber-600",
                      )}
                    >
                      {item.daysUntilExpiry}d
                    </Badge>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(item.expiryDate).toLocaleDateString("en-GB")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sites overview (when no specific site is selected) */}
      {!selectedSite && sites && sites.length > 0 && (
        <div className="border rounded-xl bg-card overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Sites Overview</h2>
          </div>
          <div className="divide-y">
            {sites.filter(s => s.active).map((site) => {
              const total = site.workerCount;
              const readyPct = total > 0 ? Math.round((site.readyCount / total) * 100) : 0;
              return (
                <div key={site.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <Link href={`/sites/${site.id}`}>
                      <a className="font-medium text-sm hover:underline truncate block">{site.name}</a>
                    </Link>
                    {site.location && <p className="text-xs text-muted-foreground">{site.location}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-muted-foreground">{total} workers</span>
                    <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden hidden sm:block">
                      <div
                        className={cn("h-full rounded-full", readyPct === 100 ? "bg-emerald-500" : readyPct > 0 ? "bg-blue-500" : "bg-muted-foreground/20")}
                        style={{ width: `${readyPct}%` }}
                      />
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] min-w-[36px] justify-center",
                        site.nonCompliantCount > 0 ? "border-red-400 text-red-600" :
                        site.expiringCount > 0 ? "border-amber-400 text-amber-600" :
                        readyPct === 100 && total > 0 ? "border-emerald-400 text-emerald-600" : "",
                      )}
                    >
                      {readyPct}%
                    </Badge>
                    <button
                      onClick={() => setSelectedSiteId(site.id)}
                      className="text-xs text-muted-foreground hover:text-primary"
                    >
                      Filter
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Certification issues */}
      {data && data.certificationsByStatus.some(c => c.missing + c.expired + c.expiring > 0) && (
        <div className="border rounded-xl bg-card overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Certification Issues by Type</h2>
          </div>
          <div className="divide-y">
            {data.certificationsByStatus
              .filter(c => c.missing + c.expired + c.expiring > 0)
              .sort((a, b) => (b.expired + b.missing) - (a.expired + a.missing))
              .map((cert) => (
                <div key={cert.name} className="flex items-center gap-3 px-4 py-2.5">
                  <p className="flex-1 text-sm font-medium truncate">{cert.name}</p>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {cert.missing > 0 && (
                      <CertWorkerPopover certName={cert.name} status="missing" count={cert.missing} siteId={selectedSiteId} expiryDays={expiryDays} />
                    )}
                    {cert.expired > 0 && (
                      <CertWorkerPopover certName={cert.name} status="expired" count={cert.expired} siteId={selectedSiteId} expiryDays={expiryDays} />
                    )}
                    {cert.expiring > 0 && (
                      <CertWorkerPopover certName={cert.name} status="expiring" count={cert.expiring} siteId={selectedSiteId} expiryDays={expiryDays} />
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
