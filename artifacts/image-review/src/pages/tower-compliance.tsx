import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { useListLocations, useListStrings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, Wind, AlertTriangle, Layers, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

interface PhaseCompliance {
  phase: string;
  expected: string[];
  present: string[];
  missing: string[];
}

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
  byPhase: PhaseCompliance[];
  hasPhaseData: boolean;
}

interface ComplianceResponse {
  expectedTypes: string[];
  hasPhaseData: boolean;
  towers: TowerCompliance[];
  phaseContext: string | null;
}

type SortKey = "pct" | "name" | "missing";
type SortDir = "asc" | "desc";

function statusColor(pct: number) {
  if (pct === 100) return { bar: "bg-green-500",  badge: "bg-green-100 text-green-800 border-green-200",  label: "Complete" };
  if (pct >= 50)   return { bar: "bg-amber-400",  badge: "bg-amber-100 text-amber-800 border-amber-200",   label: "Partial"  };
  if (pct > 0)     return { bar: "bg-red-500",    badge: "bg-red-100 text-red-800 border-red-200",         label: "Critical" };
  return             { bar: "bg-slate-300",  badge: "bg-slate-100 text-slate-600 border-slate-200",  label: "None"     };
}

function TypePill({ label, variant }: { label: string; variant: "missing" | "present" }) {
  const cls = variant === "missing"
    ? "bg-red-50 text-red-700 border-red-200"
    : "bg-green-50 text-green-700 border-green-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] ${cls}`}>
      {label}
    </span>
  );
}

function PhaseSection({ phase }: { phase: PhaseCompliance }) {
  if (phase.expected.length === 0) return null;
  const filteredMissing = phase.missing.filter(m => !m.startsWith("OSP"));
  const phasePct = Math.round(phase.present.length / phase.expected.length * 100);
  const { bar } = statusColor(phasePct);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Layers className="w-3 h-3 text-muted-foreground flex-shrink-0" />
        <span className="text-xs font-semibold text-foreground">{phase.phase}</span>
        <div className="flex-1 bg-primary/10 rounded-full h-1.5 overflow-hidden">
          <div className={`h-full rounded-full ${bar}`} style={{ width: `${phasePct}%` }} />
        </div>
        <span className="text-[11px] font-mono text-muted-foreground flex-shrink-0">
          {phase.present.length}/{phase.expected.length}
        </span>
      </div>
      {(filteredMissing.length > 0 || phase.present.length > 0) && (
        <div className="ml-5 space-y-1">
          {filteredMissing.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {filteredMissing.map(m => <TypePill key={m} label={m} variant="missing" />)}
            </div>
          )}
          {phase.present.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {phase.present.map(p => <TypePill key={p} label={p} variant="present" />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TowerRow({ t, onNavigate }: { t: TowerCompliance; onNavigate: (t: TowerCompliance) => void }) {
  const [expanded, setExpanded] = useState(false);
  const { bar, badge, label } = statusColor(t.pct);
  const filteredMissing = t.missing.filter(m => !m.startsWith("OSP"));

  const hasPhases = t.hasPhaseData && t.byPhase.length > 0;

  return (
    <div className="border border-border/60 rounded-lg overflow-hidden bg-card">
      {/* Row header — using div + keyboard handler (no nested <button>) */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors group cursor-pointer"
        onClick={() => setExpanded(e => !e)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(ex => !ex); } }}
      >
        <span className="text-muted-foreground flex-shrink-0" aria-hidden="true">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
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

        {/* Stop propagation so clicking View → doesn't toggle expand */}
        <span
          role="button"
          tabIndex={0}
          className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 hover:underline"
          onClick={e => { e.stopPropagation(); onNavigate(t); }}
          onKeyDown={e => { if (e.key === "Enter") { e.stopPropagation(); onNavigate(t); } }}
        >
          View →
        </span>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="border-t border-border/40 px-4 py-3 bg-muted/20 space-y-3">
          {/* Location breadcrumb */}
          {t.ospName && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">OSP:</span> {t.ospName}
              {t.stringName && <span> · <span className="font-medium">String:</span> {t.stringName}</span>}
            </p>
          )}

          {/* Phase-aware breakdown */}
          {hasPhases ? (
            <div className="space-y-3">
              {t.byPhase.map(phase => <PhaseSection key={phase.phase} phase={phase} />)}
            </div>
          ) : (
            /* Flat fallback (no phase definitions) */
            <>
              {filteredMissing.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-600 mb-1.5 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" />
                    Missing ({filteredMissing.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {filteredMissing.map(m => <TypePill key={m} label={m} variant="missing" />)}
                  </div>
                </div>
              )}

              {t.present.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-green-600 mb-1.5 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Present ({t.present.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {t.present.map(p => <TypePill key={p} label={p} variant="present" />)}
                  </div>
                </div>
              )}

              {t.present.length === 0 && filteredMissing.length === 0 && (
                <p className="text-xs text-muted-foreground italic">No required image data available for this tower.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function TowerCompliance() {
  const [, navigate] = useLocation();
  const search = useSearch();

  // Read URL-level deep-link filters (from matrix cell click or external nav)
  const urlParams = new URLSearchParams(search);
  const urlStringId = urlParams.get("stringId") ?? null;
  const urlPhase    = urlParams.get("phase")    ?? null;

  const [ospFilter, setOspFilter] = useState<string>("all");
  const [stringFilter, setStringFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("pct");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { data: locations } = useListLocations();
  const osps = locations?.filter(l => l.type === "OSP") ?? [];

  const ospId = ospFilter !== "all" ? parseInt(ospFilter) : undefined;
  const { data: strings } = useListStrings(ospId ? { locationId: ospId } : undefined, { query: { enabled: !!ospId } });

  // Effective filters: URL deep-link takes priority over dropdown selections
  const effectiveStringId = urlStringId ?? (stringFilter !== "all" ? stringFilter : null);

  const queryParams = new URLSearchParams();
  if (ospFilter !== "all") queryParams.set("ospId", ospFilter);
  if (effectiveStringId) queryParams.set("stringId", effectiveStringId);
  if (urlPhase) queryParams.set("phase", urlPhase);

  const { data, isLoading, error } = useQuery<ComplianceResponse>({
    queryKey: ["tower-compliance", ospFilter, stringFilter, urlStringId, urlPhase],
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
    return { complete, partial, none, total: data.towers.length };
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
          Per-tower required image coverage
          {data?.hasPhaseData ? ", broken down by phase and image type." : "."}
          {data?.phaseContext ? ` Showing all towers in scope — navigate from matrix cell for phase: ${data.phaseContext}.` : ""}
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
          {([["pct", "% Complete"], ["name", "Name"], ["missing", "Missing"]] as [SortKey, string][]).map(([key, lbl]) => (
            <Button
              key={key}
              size="sm"
              variant={sort === key ? "default" : "outline"}
              onClick={() => handleSort(key)}
              className="h-8 text-xs"
            >
              {lbl} {sort === key ? (sortDir === "asc" ? "↑" : "↓") : ""}
            </Button>
          ))}
        </div>
      </div>

      {/* Active deep-link filter chips */}
      {(urlStringId || urlPhase) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground text-xs">Active filters:</span>
          {urlStringId && (
            <span className="inline-flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-1 text-xs font-medium">
              String: {urlStringId}
              <button
                aria-label="Clear string filter"
                className="ml-0.5 hover:text-destructive transition-colors"
                onClick={() => {
                  const p = new URLSearchParams(search);
                  p.delete("stringId");
                  navigate(`/tower-compliance${p.toString() ? `?${p.toString()}` : ""}`);
                }}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {urlPhase && (
            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full px-2.5 py-1 text-xs font-medium">
              Phase: {urlPhase}
              <button
                aria-label="Clear phase filter"
                className="ml-0.5 hover:text-destructive transition-colors"
                onClick={() => {
                  const p = new URLSearchParams(search);
                  p.delete("phase");
                  navigate(`/tower-compliance${p.toString() ? `?${p.toString()}` : ""}`);
                }}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Towers",     value: summary.total,    color: "text-foreground" },
            { label: "Complete (100%)",  value: summary.complete, color: "text-green-600" },
            { label: "Partial (1–99%)",  value: summary.partial,  color: "text-amber-600" },
            { label: "None (0%)",        value: summary.none,     color: "text-red-600"   },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-card border border-border/60 rounded-lg p-3 text-center">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Required types info */}
      {data && data.expectedTypes.length > 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          Checking against <span className="font-semibold text-foreground">{data.expectedTypes.length}</span> required image types
          {data.hasPhaseData && " across phases"} from definitions.
        </p>
      )}
      {data && data.expectedTypes.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
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
