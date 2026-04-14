import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  Search,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Wind,
  FolderOpen,
  Folder,
  MapPin,
} from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "") + "/";

interface Report {
  id: number;
  driveFileId: string;
  fileName: string;
  drivePath: string;
  wasabiKey: string;
  site: string;
  string: string;
  cable: string | null;
  name: string;
  reportType: string;
}

interface ReportsResponse {
  reports: Report[];
  total: number;
}

// ─── Hierarchy types ─────────────────────────────────────────────────────────

interface CableGroup {
  cable: string;
  reports: Report[];
}

interface StringGroup {
  string: string;
  cables: CableGroup[];
  topLevelReports: Report[];
}

interface SiteGroup {
  site: string;
  strings: StringGroup[];
}

function buildHierarchy(reports: Report[]): SiteGroup[] {
  const siteMap = new Map<string, Map<string, { cables: Map<string, Report[]>; top: Report[] }>>();

  for (const r of reports) {
    if (!siteMap.has(r.site)) siteMap.set(r.site, new Map());
    const stringMap = siteMap.get(r.site)!;
    const strKey = r.string || "(Site-level)";
    if (!stringMap.has(strKey)) stringMap.set(strKey, { cables: new Map(), top: [] });
    const strEntry = stringMap.get(strKey)!;
    if (r.cable) {
      if (!strEntry.cables.has(r.cable)) strEntry.cables.set(r.cable, []);
      strEntry.cables.get(r.cable)!.push(r);
    } else {
      strEntry.top.push(r);
    }
  }

  const sites: SiteGroup[] = [];
  for (const [site, stringMap] of siteMap) {
    const strings: StringGroup[] = [];
    for (const [str, strEntry] of stringMap) {
      const cables: CableGroup[] = [];
      for (const [cable, cReports] of strEntry.cables) {
        cables.push({ cable, reports: cReports });
      }
      cables.sort((a, b) => a.cable.localeCompare(b.cable));
      strings.push({ string: str, cables, topLevelReports: strEntry.top });
    }
    strings.sort((a, b) => a.string.localeCompare(b.string));
    sites.push({ site, strings });
  }
  sites.sort((a, b) => a.site.localeCompare(b.site));
  return sites;
}

function reportTypeColor(type: string): string {
  switch (type) {
    case "As-Found":              return "bg-blue-100 text-blue-700 border-blue-200";
    case "As-Left":               return "bg-green-100 text-green-700 border-green-200";
    case "Completion Check":      return "bg-purple-100 text-purple-700 border-purple-200";
    case "FO Termination":        return "bg-orange-100 text-orange-700 border-orange-200";
    case "ICCP":                  return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "Pull-in Preparation":   return "bg-cyan-100 text-cyan-700 border-cyan-200";
    case "Temporary Hang Off":    return "bg-rose-100 text-rose-700 border-rose-200";
    case "Permanent Hang Off":    return "bg-red-100 text-red-700 border-red-200";
    case "Cable Pull-in":         return "bg-teal-100 text-teal-700 border-teal-200";
    case "Termination Completion":return "bg-indigo-100 text-indigo-700 border-indigo-200";
    default:                      return "bg-muted text-muted-foreground border-border";
  }
}

// ─── Report row ──────────────────────────────────────────────────────────────

function ReportRow({ report }: { report: Report }) {
  const viewUrl = `${BASE_URL}api/reports/view?key=${encodeURIComponent(report.wasabiKey)}`;

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-muted/50 group transition-colors">
      <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-sm text-foreground truncate block" title={report.name}>
          {report.name}
        </span>
      </div>
      <Badge
        variant="outline"
        className={`text-xs flex-shrink-0 border ${reportTypeColor(report.reportType)}`}
      >
        {report.reportType}
      </Badge>
      <a
        href={viewUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-xs text-primary hover:underline flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={e => e.stopPropagation()}
      >
        <ExternalLink className="w-3 h-3" />
        Open
      </a>
    </div>
  );
}

// ─── Cable section ────────────────────────────────────────────────────────────

function CableSection({ cable, reports, defaultOpen }: { cable: string; reports: Report[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="ml-4 border-l border-border/50 pl-3">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />}
        <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground/70" />
        <span className="font-medium truncate">{cable}</span>
        <span className="ml-auto text-xs text-muted-foreground/70 flex-shrink-0 pr-1">{reports.length}</span>
      </button>
      {open && (
        <div className="space-y-0.5 mb-1">
          {reports.map(r => <ReportRow key={r.id} report={r} />)}
        </div>
      )}
    </div>
  );
}

// ─── String section ───────────────────────────────────────────────────────────

function StringSection({ group, defaultOpen }: { group: StringGroup; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const count = group.topLevelReports.length + group.cables.reduce((s, c) => s + c.reports.length, 0);

  return (
    <div className="ml-4 border-l border-border/50 pl-3">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />}
        {open ? (
          <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 text-amber-500" />
        ) : (
          <Folder className="w-3.5 h-3.5 flex-shrink-0 text-amber-500" />
        )}
        <span className="font-medium truncate">{group.string}</span>
        <span className="ml-auto text-xs text-muted-foreground/70 flex-shrink-0 pr-1">{count}</span>
      </button>
      {open && (
        <div className="space-y-0.5 mb-1">
          {group.topLevelReports.map(r => <ReportRow key={r.id} report={r} />)}
          {group.cables.map(c => (
            <CableSection key={c.cable} cable={c.cable} reports={c.reports} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Site section ─────────────────────────────────────────────────────────────

function SiteSection({ group, defaultOpen }: { group: SiteGroup; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  const count = group.strings.reduce((s, str) => {
    return s + str.topLevelReports.length + str.cables.reduce((sc, c) => sc + c.reports.length, 0);
  }, 0);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-3 px-4 py-3 w-full text-left bg-muted/30 hover:bg-muted/60 transition-colors"
      >
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
        <Wind className="w-4 h-4 text-blue-500 flex-shrink-0" />
        <span className="font-semibold text-sm truncate">{group.site}</span>
        <Badge variant="secondary" className="ml-auto flex-shrink-0 text-xs">{count} reports</Badge>
      </button>
      {open && (
        <div className="py-2 space-y-0.5 bg-background">
          {group.strings.map(str => (
            <StringSection key={str.string} group={str} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Reports() {
  const [search, setSearch] = useState("");

  const { data, isLoading, isError } = useQuery<ReportsResponse>({
    queryKey: ["reports"],
    queryFn: async () => {
      const r = await fetch(`${BASE_URL}api/reports`);
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const hierarchy = useMemo(() => {
    if (!data?.reports) return [];
    const filtered = search.trim()
      ? data.reports.filter(r =>
          r.name.toLowerCase().includes(search.toLowerCase()) ||
          r.site.toLowerCase().includes(search.toLowerCase()) ||
          r.string.toLowerCase().includes(search.toLowerCase()) ||
          (r.cable ?? "").toLowerCase().includes(search.toLowerCase()) ||
          r.reportType.toLowerCase().includes(search.toLowerCase())
        )
      : data.reports;
    return buildHierarchy(filtered);
  }, [data, search]);

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Field Reports</h1>
          <p className="text-muted-foreground mt-2">
            Installation field reports stored in Wasabi.
            {data && (
              <span className="ml-1 text-sm">{data.total.toLocaleString()} PDFs across {hierarchy.length} sites.</span>
            )}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search reports, sites, strings…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed rounded-lg bg-muted/30">
          <FileText className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-semibold">Failed to load reports</p>
          <p className="text-sm text-muted-foreground mt-1">Check that the API server is running and Wasabi is connected.</p>
        </div>
      ) : hierarchy.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed rounded-lg bg-muted/30">
          <FileText className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-semibold">{search ? "No reports match your search" : "No field reports found"}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {search ? "Try a different search term." : "Field reports will appear here once the Wasabi mirror contains PDFs in the [Output] Field Reports/ folder."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {hierarchy.map(site => (
            <SiteSection key={site.site} group={site} defaultOpen={hierarchy.length <= 3} />
          ))}
        </div>
      )}
    </div>
  );
}
