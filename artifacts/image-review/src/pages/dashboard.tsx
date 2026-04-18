import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Camera, CheckCircle2, XCircle, Clock, CalendarDays, Calendar,
  Wind, AlertTriangle, BarChart2,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "") + "/";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PhotoStats {
  total: number;
  approved: number;
  rejected: number;
  pending: number;
  thisWeek: number;
  thisMonth: number;
}

interface MatrixCell {
  phase: string;
  towersWithPhotos: number;
  pct: number;
}

interface MatrixRow {
  string: string;
  stringId: number | null;
  totalTowers: number;
  cells: MatrixCell[];
}

interface PhaseMatrixData {
  phases: string[];
  matrix: MatrixRow[];
  summary: { total: number; zeroPhotos: number; withGaps: number; fullyDocumented: number };
}

interface VelocityData {
  velocity: { date: string; count: number }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function abbrevPhase(phase: string): string {
  const m = phase.match(/^([A-Z]+)_(\d+)/);
  if (m) return `${m[1]}-${m[2]}`;
  return phase.slice(0, 8);
}

function cellColor(pct: number): string {
  if (pct >= 90) return "bg-green-100 text-green-800 dark:bg-green-950/70 dark:text-green-300";
  if (pct >= 50) return "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300";
  return "bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300";
}

function cellBorderColor(pct: number): string {
  if (pct === 0) return "border-red-200 dark:border-red-800";
  if (pct >= 90) return "border-green-200 dark:border-green-800";
  if (pct >= 50) return "border-amber-200 dark:border-amber-800";
  return "border-red-200 dark:border-red-800";
}

const STATS_CONFIG = [
  { key: "total" as const, label: "Total Images", desc: "All images on record", icon: Camera, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30" },
  { key: "approved" as const, label: "Approved", desc: "Verified & accepted", icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30" },
  { key: "rejected" as const, label: "Rejected", desc: "Flagged for rework", icon: XCircle, color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30" },
  { key: "pending" as const, label: "Pending Review", desc: "Awaiting approval", icon: Clock, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30" },
  { key: "thisWeek" as const, label: "Added This Week", desc: "Last 7 days", icon: CalendarDays, color: "text-violet-500", bg: "bg-violet-50 dark:bg-violet-950/30" },
  { key: "thisMonth" as const, label: "Added This Month", desc: "Current calendar month", icon: Calendar, color: "text-sky-500", bg: "bg-sky-50 dark:bg-sky-950/30" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryBar({ summary, isLoading }: { summary: PhaseMatrixData["summary"] | undefined; isLoading: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        { label: "Fully Documented", value: summary?.fullyDocumented, color: "text-green-600", sub: "all phases covered" },
        { label: "With Gaps", value: summary?.withGaps, color: "text-amber-600", sub: "some phases missing" },
        { label: "Zero Photos", value: summary?.zeroPhotos, color: "text-red-600", sub: "no images yet" },
      ].map(({ label, value, color, sub }) => (
        <div key={label} className="bg-card border border-border/60 rounded-xl p-4 text-center shadow-sm">
          {isLoading
            ? <Skeleton className="h-10 w-16 mx-auto mb-1" />
            : <p className={`text-4xl font-bold ${color}`}>{value ?? 0}</p>
          }
          <p className="text-sm font-medium text-foreground mt-0.5">{label}</p>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </div>
      ))}
    </div>
  );
}

function MatrixLegend() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
      <span>Coverage:</span>
      {[
        { label: "≥ 90%", cls: "bg-green-100 border-green-200 text-green-800" },
        { label: "50–89%", cls: "bg-amber-100 border-amber-200 text-amber-800" },
        { label: "< 50%", cls: "bg-red-100 border-red-200 text-red-800" },
      ].map(({ label, cls }) => (
        <span key={label} className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${cls}`}>
          {label}
        </span>
      ))}
    </div>
  );
}

function CompletionMatrix({
  data, isLoading, onCellClick,
}: {
  data: PhaseMatrixData | undefined;
  isLoading: boolean;
  onCellClick: (stringId: number | null, stringName: string, phase: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    );
  }

  if (!data || data.matrix.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-muted-foreground gap-2">
        <Wind className="w-10 h-10 opacity-30" />
        <p className="text-sm">No photo data available yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border/60 shadow-sm">
      <table className="text-xs w-max min-w-full border-collapse">
        <thead>
          <tr className="bg-muted/60">
            <th className="sticky left-0 z-20 bg-muted/80 px-3 py-2 text-left font-semibold border-b border-r border-border/60 whitespace-nowrap min-w-[80px]">
              String
            </th>
            <th className="px-2 py-2 text-left font-semibold border-b border-r border-border/40 whitespace-nowrap min-w-[56px]">
              Towers
            </th>
            {data.phases.map(ph => (
              <th
                key={ph}
                className="px-1.5 py-2 text-center font-medium border-b border-r border-border/40 whitespace-nowrap min-w-[44px]"
                title={ph}
              >
                {abbrevPhase(ph)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.matrix.map((row, ri) => (
            <tr key={row.string} className={ri % 2 === 0 ? "bg-background" : "bg-muted/20"}>
              <td className="sticky left-0 z-10 bg-inherit px-3 py-1.5 font-semibold border-r border-border/60 whitespace-nowrap">
                {row.string}
              </td>
              <td className="px-2 py-1.5 text-center text-muted-foreground border-r border-border/40">
                {row.totalTowers}
              </td>
              {row.cells.map(cell => (
                <td
                  key={cell.phase}
                  className={[
                    "px-1 py-1.5 text-center border-r border-border/30",
                    cellColor(cell.pct),
                    row.stringId
                      ? "cursor-pointer hover:opacity-70 transition-opacity"
                      : "cursor-default opacity-60",
                  ].join(" ")}
                  title={`${row.string} × ${cell.phase}: ${cell.towersWithPhotos}/${row.totalTowers} towers (${cell.pct}%)`}
                  onClick={() => onCellClick(row.stringId, row.string, cell.phase)}
                >
                  <span className={`inline-block px-1 py-0.5 rounded border text-[11px] font-mono font-medium ${cellBorderColor(cell.pct)}`}>
                    {`${cell.pct}%`}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VelocityChart({ data, isLoading }: { data: VelocityData | undefined; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-48 w-full" />;

  const points = data?.velocity ?? [];
  const hasData = points.some(p => p.count > 0);
  if (!hasData) {
    return (
      <div className="flex flex-col items-center py-10 text-muted-foreground gap-2">
        <BarChart2 className="w-8 h-8 opacity-30" />
        <p className="text-sm">No photo submissions in the last 60 days.</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={points} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="velocityGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={d => d.slice(5)}
          interval="preserveStartEnd"
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
            color: "hsl(var(--popover-foreground))",
          }}
          labelStyle={{ fontWeight: 600 }}
          formatter={(v: number) => [v.toLocaleString(), "Photos"]}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fill="url(#velocityGrad)"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [, navigate] = useLocation();

  const { data: statsData, isLoading: statsLoading } = useQuery<PhotoStats>({
    queryKey: ["photo-stats"],
    queryFn: async () => {
      const r = await fetch(`${BASE_URL}api/photos/stats`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    staleTime: 60 * 1000,
  });

  const { data: matrixData, isLoading: matrixLoading } = useQuery<PhaseMatrixData>({
    queryKey: ["phase-matrix"],
    queryFn: async () => {
      const r = await fetch(`${BASE_URL}api/photos/phase-matrix`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: velocityData, isLoading: velocityLoading } = useQuery<VelocityData>({
    queryKey: ["photo-velocity"],
    queryFn: async () => {
      const r = await fetch(`${BASE_URL}api/photos/velocity`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  function handleCellClick(stringId: number | null, _stringName: string, phase: string) {
    if (!stringId) return; // photo-only strings not in DB have no compliance scope
    const p = new URLSearchParams();
    p.set("stringId", String(stringId));
    if (phase) p.set("phase", phase);
    navigate(`/tower-compliance?${p.toString()}`);
  }

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">Project-wide installation documentation status.</p>
      </div>

      {/* ── Summary bar ── */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Tower Status</h2>
        <SummaryBar summary={matrixData?.summary} isLoading={matrixLoading} />
      </section>

      {/* ── Completion matrix ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Completion Matrix
            <span className="ml-2 text-xs font-normal normal-case text-muted-foreground/70">
              strings × phases — % of towers with photos
            </span>
          </h2>
          <MatrixLegend />
        </div>
        <CompletionMatrix
          data={matrixData}
          isLoading={matrixLoading}
          onCellClick={handleCellClick}
        />
        {matrixData && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
            Click a colored cell to see tower-level compliance for that string.
          </p>
        )}
      </section>

      {/* ── Velocity chart ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Photo Submission Velocity
          <span className="ml-2 text-xs font-normal normal-case text-muted-foreground/70">
            last 60 days
          </span>
        </h2>
        <div className="bg-card border border-border/60 rounded-xl p-4 shadow-sm">
          <VelocityChart data={velocityData} isLoading={velocityLoading} />
        </div>
      </section>

      {/* ── Existing stat cards ── */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Image Statistics</h2>
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
                  {statsLoading ? (
                    <Skeleton className="h-9 w-24" />
                  ) : (
                    <div className={`text-3xl font-bold ${stat.color}`}>
                      {(statsData?.[stat.key] ?? 0).toLocaleString()}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{stat.desc}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
