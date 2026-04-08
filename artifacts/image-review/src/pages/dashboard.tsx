import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Camera,
  CheckCircle2,
  XCircle,
  Clock,
  CalendarDays,
  Calendar,
} from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "") + "/";

interface PhotoStats {
  total: number;
  approved: number;
  rejected: number;
  pending: number;
  thisWeek: number;
  thisMonth: number;
}

const STATS_CONFIG = [
  {
    key: "total" as const,
    label: "Total Images",
    desc: "All images on record",
    icon: Camera,
    color: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/30",
  },
  {
    key: "approved" as const,
    label: "Approved",
    desc: "Verified & accepted",
    icon: CheckCircle2,
    color: "text-green-600",
    bg: "bg-green-50 dark:bg-green-950/30",
  },
  {
    key: "rejected" as const,
    label: "Rejected",
    desc: "Flagged for rework",
    icon: XCircle,
    color: "text-red-500",
    bg: "bg-red-50 dark:bg-red-950/30",
  },
  {
    key: "pending" as const,
    label: "Pending Review",
    desc: "Awaiting approval",
    icon: Clock,
    color: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/30",
  },
  {
    key: "thisWeek" as const,
    label: "Added This Week",
    desc: "Last 7 days",
    icon: CalendarDays,
    color: "text-violet-500",
    bg: "bg-violet-50 dark:bg-violet-950/30",
  },
  {
    key: "thisMonth" as const,
    label: "Added This Month",
    desc: "Current calendar month",
    icon: Calendar,
    color: "text-sky-500",
    bg: "bg-sky-50 dark:bg-sky-950/30",
  },
];

export default function Dashboard() {
  const { data, isLoading } = useQuery<PhotoStats>({
    queryKey: ["photo-stats"],
    queryFn: async () => {
      const r = await fetch(`${BASE_URL}api/photos/stats`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    staleTime: 60 * 1000,
  });

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Overview of installation image status.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STATS_CONFIG.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.key} className="overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <div className={`rounded-lg p-2 ${stat.bg}`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-9 w-24" />
                ) : (
                  <div className={`text-3xl font-bold ${stat.color}`}>
                    {(data?.[stat.key] ?? 0).toLocaleString()}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">{stat.desc}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
