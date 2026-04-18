import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useListLocations, useListStrings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, Wind, AlertTriangle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

interface TowerCompliance {
  tower: string;
  stringId: number | null;
  stringName: string | null;
  ospId: number | null;
  ospName: string | null;
  expected: number;
  actual: number;
  missing: string[];
  present: string[];
  pct: number;
}

interface ComplianceResponse {
  expectedTypes: string[];
  towers: TowerCompliance[];
}

type SortKey = "pct" | "name" | "missing";
type SortDir = "asc" | "desc";

function statusColor(pct: number) {
  if (pct === 100) return { bar: "bg-green-500",  badge: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300",  label: "Complete" };
  if (pct >= 50)   return { bar: "bg-amber-400",  badge: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300",   label: "Partial"  };
  if (pct > 0)     return { bar: "bg-red-500",    badge: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300",             label: "Critical" };
  return             { bar: "bg-slate-300",  badge: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300",  label: "None"     };
}

function TowerRow({ t, onNavigate }: { t: TowerCompliance; onNavigate: (t: TowerCompliance) => void }) {
  const [expanded, setExpanded] = useState(false);
  const { bar, badge, label } = statusColor(t.pct);

  return (
    <div className="border border-border/60 rounded-lg overflow-hidden bg-card">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors group"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="text-muted-foreground flex-shrink-0">
          {expanded
            ? <ChevronDown className="w-4 h-4" />
            : <ChevronRight className="w-4 h-4" />}
        </span>

        <span className="font-semibold text-sm w-24 flex-shrink-0 truncate">{t.tower}</span>

        <div className="flex-1 min-w-0 bg-primary/10 rounded-full h-2 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${t.pct}%` }} />
        </div>

        <span className="text-xs font-mono text-muted-foreground w-16 text-right flex-shrink-0">
          {t.actual} / {t.expected}
        </span>

        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border flex-shrink-0 ${badge}`}>
          {label}
        </span>

        <button
          className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 hover:underline"
          onClick={e => { e.stopPropagation(); onNavigate(t); }}
        >
          View →
        </button>
      </button>

      {expanded && (
        <div className="border-t border-border/40 px-4 py-3 bg-muted/20 space-y-3">
          {t.ospName && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">OSP:</span> {t.ospName}
              {t.stringName && <span> · <span className="font-medium">String:</span> {t.stringName}</span>}
            </p>
          )}

          {t.missing.length > 0 && (
            <div>
              <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1.5 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" />
                Missing ({t.missing.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {t.missing.map(m => (
                  <span key={m} className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 text-[11px]">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {t.present.length > 0 && (
            <div>
              <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1.5 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Present ({t.present.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {t.present.map(p => (
                  <span key={p} className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-950/60 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 text-[11px]">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

          {t.present.length === 0 && t.missing.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No required image data available for this tower.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function TowerCompliance() {
  const [, navigate] = useLocation();
  const [ospFilter, setOspFilter] = useState<string>("all");
  const [stringFilter, setStringFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("pct");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { data: locations } = useListLocations();
  const osps = locations?.filter(l => l.type === "OSP") ?? [];

  const ospId = ospFilter !== "all" ? parseInt(ospFilter) : undefined;
  const { data: strings } = useListStrings(ospId ? { locationId: ospId } : undefined, { query: { enabled: !!ospId } });

  const queryParams = new URLSearchParams();
  if (ospFilter !== "all") queryParams.set("ospId", ospFilter);
  if (stringFilter !== "all") queryParams.set("stringId", stringFilter);

  const { data, isLoading, error } = useQuery<ComplianceResponse>({
    queryKey: ["tower-compliance", ospFilter, stringFilter],
    queryFn: async () => {
      const res = await fetch(`${API}/api/photos/compliance?${queryParams}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const sorted = useMemo(() => {
    if (!data?.towers) return [];
    return [...data.towers].sort((a, b) => {
      let cmp = 0;
      if (sort === "pct")     cmp = a.pct - b.pct;
      if (sort === "name")    cmp = a.tower < b.tower ? -1 : 1;
      if (sort === "missing") cmp = b.missing.length - a.missing.length;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sort, sortDir]);

  const summary = useMemo(() => {
    if (!data?.towers) return null;
    const complete  = data.towers.filter(t => t.pct === 100).length;
    const partial   = data.towers.filter(t => t.pct > 0 && t.pct < 100).length;
    const none      = data.towers.filter(t => t.pct === 0).length;
    const avgPct    = data.towers.length > 0
      ? Math.round(data.towers.reduce((s, t) => s + t.pct, 0) / data.towers.length)
      : 0;
    return { complete, partial, none, total: data.towers.length, avgPct };
  }, [data]);

  function handleSort(key: SortKey) {
    if (sort === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSort(key); setSortDir(key === "pct" ? "asc" : key === "missing" ? "desc" : "asc"); }
  }

  function handleNavigate(t: TowerCompliance) {
    const params = new URLSearchParams();
    if (t.stringId) params.set("stringId", String(t.stringId));
    params.set("tower", t.tower);
    navigate(`/towers?${params}`);
  }

  function handleOspChange(v: string) {
    setOspFilter(v);
    setStringFilter("all");
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tower Compliance</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Per-tower view of required image coverage, sorted by most critical first.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 bg-muted/30 rounded-lg p-4 border">
        <div className="space-y-1">
          <Label className="text-xs">OSP</Label>
          <Select value={ospFilter} onValueChange={handleOspChange}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All OSPs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All OSPs</SelectItem>
              {osps.map(o => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {ospId && strings && strings.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs">String</Label>
            <Select value={stringFilter} onValueChange={setStringFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All strings" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All strings</SelectItem>
                {strings.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-end gap-1.5 ml-auto flex-wrap">
          <span className="text-xs text-muted-foreground font-medium self-center">Sort:</span>
          {([["pct", "% Complete"], ["name", "Name"], ["missing", "Missing"]] as [SortKey, string][]).map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={sort === key ? "default" : "outline"}
              onClick={() => handleSort(key)}
              className="h-8 text-xs"
            >
              {label} {sort === key ? (sortDir === "asc" ? "↑" : "↓") : ""}
            </Button>
          ))}
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Towers",     value: summary.total,    color: "text-foreground" },
            { label: "Complete (100%)",  value: summary.complete, color: "text-green-600 dark:text-green-400" },
            { label: "Partial (1–99%)",  value: summary.partial,  color: "text-amber-600 dark:text-amber-400" },
            { label: "None (0%)",        value: summary.none,     color: "text-red-600 dark:text-red-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-card border border-border/60 rounded-lg p-3 text-center">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Required types count */}
      {data && data.expectedTypes.length > 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          Checking against <span className="font-semibold text-foreground">{data.expectedTypes.length}</span> required image types from definitions.
        </p>
      )}
      {data && data.expectedTypes.length === 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-200">
          No required image definitions found. Import phase definitions from the Phases page to enable compliance checking.
        </div>
      )}

      {/* Tower list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      ) : error ? (
        <div className="text-destructive text-sm p-4 rounded-md border border-destructive/20 bg-destructive/5">
          Error loading compliance data: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground space-y-3 border border-dashed rounded-xl">
          <Wind className="w-12 h-12 opacity-30" />
          <p className="text-sm">No tower data found for this selection.</p>
          <p className="text-xs opacity-60">Try adjusting the OSP or string filter.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(t => (
            <TowerRow key={t.tower} t={t} onNavigate={handleNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}
