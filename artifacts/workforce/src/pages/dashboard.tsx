import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Users, ShieldCheck, AlertTriangle, Clock, UserX, Award,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["workforce-dashboard"],
    queryFn: () => apiFetch<DashboardData>("/api/workforce/dashboard"),
    refetchInterval: 60_000,
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Workforce Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Live compliance overview for all active workers.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="Total Workers" value={data.totalWorkers} icon={Users} color="bg-blue-500" href="/workers" />
          <StatCard label="Ready" value={data.readyCount} icon={ShieldCheck} color="bg-emerald-500" href="/workers" />
          <StatCard label="Expiring Soon" value={data.expiringCount} icon={Clock} color="bg-amber-500" href="/workers" />
          <StatCard label="Not Compliant" value={data.nonCompliantCount} icon={AlertTriangle} color="bg-red-500" href="/workers" />
          <StatCard label="Unassigned" value={data.unassignedCount} icon={UserX} color="bg-slate-400" href="/workers" />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Expiring certifications */}
        <div className="border rounded-xl bg-card overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            <h2 className="font-semibold text-sm">Expiring in Next 30 Days</h2>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : !data?.expiringInNext30Days.length ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No certifications expiring in the next 30 days.
            </div>
          ) : (
            <div className="divide-y">
              {data.expiringInNext30Days.map((item, i) => (
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

        {/* Certification breakdown */}
        <div className="border rounded-xl bg-card overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Certification Issues</h2>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : !data?.certificationsByStatus.filter(c => c.missing + c.expired + c.expiring > 0).length ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No certification issues found.
            </div>
          ) : (
            <div className="divide-y">
              {data?.certificationsByStatus
                .filter(c => c.missing + c.expired + c.expiring > 0)
                .sort((a, b) => (b.expired + b.missing) - (a.expired + a.missing))
                .map((cert) => (
                  <div key={cert.name} className="flex items-center gap-3 px-4 py-2.5">
                    <p className="flex-1 text-sm font-medium truncate">{cert.name}</p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {cert.missing > 0 && (
                        <Badge variant="outline" className="text-[10px] border-red-400 text-red-600">
                          {cert.missing} missing
                        </Badge>
                      )}
                      {cert.expired > 0 && (
                        <Badge variant="outline" className="text-[10px] border-red-400 text-red-600">
                          {cert.expired} expired
                        </Badge>
                      )}
                      {cert.expiring > 0 && (
                        <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600">
                          {cert.expiring} expiring
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
