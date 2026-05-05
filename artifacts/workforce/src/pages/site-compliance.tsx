import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, User, ChevronRight, CheckCircle2, AlertTriangle, Clock, HelpCircle } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { useSettings } from "@/contexts/SettingsContext";

type WorkerStatus = "READY" | "EXPIRING_SOON" | "NOT_COMPLIANT" | "NO_REQUIREMENTS";
type CertStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "NOT_VERIFIED" | "MISSING";

interface ComplianceItem {
  certId: number;
  name: string;
  category: string | null;
  status: CertStatus;
  expiryDate: string | null;
  daysUntilExpiry: number | null;
}

interface WorkerComplianceResult {
  workerId: number;
  workerName: string;
  siteId: number;
  siteName: string;
  status: WorkerStatus;
  requiredCount: number;
  validCount: number;
  expiringCount: number;
  missingCount: number;
  items: ComplianceItem[];
}

interface Site {
  id: number;
  name: string;
  location: string | null;
  active: boolean;
}

function workerStatusConfig(status: WorkerStatus) {
  switch (status) {
    case "READY": return { label: "Ready", icon: CheckCircle2, color: "text-emerald-500", badge: "border-emerald-400 text-emerald-600" };
    case "EXPIRING_SOON": return { label: "Expiring Soon", icon: Clock, color: "text-amber-500", badge: "border-amber-400 text-amber-600" };
    case "NOT_COMPLIANT": return { label: "Not Compliant", icon: AlertTriangle, color: "text-red-500", badge: "border-red-400 text-red-600" };
    case "NO_REQUIREMENTS": return { label: "No Requirements", icon: HelpCircle, color: "text-muted-foreground", badge: "text-muted-foreground" };
  }
}

function certStatusColor(status: CertStatus) {
  switch (status) {
    case "VALID": return "text-emerald-500";
    case "EXPIRING_SOON": return "text-amber-500";
    case "EXPIRED": return "text-red-500";
    case "NOT_VERIFIED": return "text-orange-500";
    case "MISSING": return "text-red-500";
  }
}

function WorkerComplianceRow({ result }: { result: WorkerComplianceResult | { workerId: number; siteId: number; error: string } }) {
  const [open, setOpen] = useState(false);
  const { durationFormat } = useSettings();

  if ("error" in result) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 border-b last:border-0">
        <User className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Worker #{result.workerId} — {result.error}</span>
      </div>
    );
  }

  const cfg = workerStatusConfig(result.status);
  const StatusIcon = cfg.icon;

  return (
    <>
      <div
        className={cn("flex items-center gap-3 px-4 py-3 border-b last:border-0 cursor-pointer hover:bg-muted/30 transition-colors")}
        onClick={() => setOpen((o) => !o)}
        data-testid={`row-worker-${result.workerId}`}
      >
        <StatusIcon className={cn("h-4 w-4 flex-shrink-0", cfg.color)} />
        <div className="flex-1 min-w-0">
          <Link href={`/workers/${result.workerId}`}>
            <a
              className="font-medium text-sm hover:underline"
              onClick={(e) => e.stopPropagation()}
              data-testid={`link-worker-${result.workerId}`}
            >
              {result.workerName}
            </a>
          </Link>
          <p className="text-xs text-muted-foreground">
            {result.validCount}/{result.requiredCount} certs valid
            {result.missingCount > 0 && ` · ${result.missingCount} missing`}
            {result.expiringCount > 0 && ` · ${result.expiringCount} expiring`}
          </p>
        </div>
        <Badge variant="outline" className={cn("text-[10px] flex-shrink-0", cfg.badge)}>{cfg.label}</Badge>
        <ChevronRight className={cn("h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform", open && "rotate-90")} />
      </div>

      {open && result.items.length > 0 && (
        <div className="bg-muted/10 border-b px-8 py-3 space-y-1.5">
          {result.items.map((item) => (
            <div key={item.certId} className="flex items-center gap-2 text-xs">
              <span className={cn("font-medium", certStatusColor(item.status))}>{item.status}</span>
              <span className="text-muted-foreground">—</span>
              <span>{item.name}</span>
              {item.expiryDate && (
                <span className="text-muted-foreground ml-auto">
                  Exp: {new Date(item.expiryDate).toLocaleDateString("en-GB")}
                  {item.daysUntilExpiry !== null && ` (${durationFormat === "verbose" ? formatDuration(item.daysUntilExpiry) : `${item.daysUntilExpiry}d`})`}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function SiteCompliancePage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const initialSiteId = params.get("siteId") ?? "";

  const [selectedSiteId, setSelectedSiteId] = useState(initialSiteId);

  useEffect(() => {
    const p = new URLSearchParams(search);
    const sid = p.get("siteId") ?? "";
    if (sid !== selectedSiteId) setSelectedSiteId(sid);
  }, [search]);

  const { data: sites } = useQuery<Site[]>({
    queryKey: ["workforce-sites"],
    queryFn: () => apiFetch<Site[]>("/api/workforce/sites"),
  });

  const { data: compliance, isLoading: compLoading } = useQuery<(WorkerComplianceResult | { workerId: number; siteId: number; error: string })[]>({
    queryKey: ["site-compliance", selectedSiteId],
    queryFn: () => apiFetch(`/api/workforce/compliance/site/${selectedSiteId}`),
    enabled: !!selectedSiteId,
  });

  const selectedSite = sites?.find((s) => String(s.id) === selectedSiteId);

  const ready = (compliance ?? []).filter((r): r is WorkerComplianceResult => "status" in r && r.status === "READY").length;
  const expiring = (compliance ?? []).filter((r): r is WorkerComplianceResult => "status" in r && r.status === "EXPIRING_SOON").length;
  const nonCompliant = (compliance ?? []).filter((r): r is WorkerComplianceResult => "status" in r && r.status === "NOT_COMPLIANT").length;
  const noReq = (compliance ?? []).filter((r): r is WorkerComplianceResult => "status" in r && r.status === "NO_REQUIREMENTS").length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Site Compliance
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          View compliance status for all workers assigned to a site.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Select Site</label>
        <select
          className="border rounded-md px-3 py-2 text-sm bg-background w-full max-w-sm"
          value={selectedSiteId}
          onChange={(e) => setSelectedSiteId(e.target.value)}
          data-testid="select-compliance-site"
        >
          <option value="">Choose a site…</option>
          {(sites ?? []).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {selectedSiteId && (
        <>
          {compLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : !compliance ? null : compliance.length === 0 ? (
            <div className="border rounded-xl p-8 text-center text-muted-foreground">
              <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="font-medium">No active/pending assignments for this site.</p>
              <p className="text-sm mt-1">Assign workers to the site to see their compliance status.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Ready", value: ready, color: "text-emerald-600" },
                  { label: "Expiring Soon", value: expiring, color: "text-amber-600" },
                  { label: "Not Compliant", value: nonCompliant, color: "text-red-600" },
                  { label: "No Requirements", value: noReq, color: "text-muted-foreground" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="border rounded-lg p-3 bg-card text-center">
                    <p className={cn("text-2xl font-bold tabular-nums", color)}>{value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              <div className="border rounded-xl bg-card overflow-hidden">
                <div className="px-4 py-3 border-b">
                  <h2 className="font-semibold text-sm">
                    {selectedSite?.name ?? `Site ${selectedSiteId}`} — {compliance.length} workers
                  </h2>
                </div>
                <div className="divide-y">
                  {compliance
                    .sort((a, b) => {
                      if ("error" in a || "error" in b) return 0;
                      const order: Record<WorkerStatus, number> = { NOT_COMPLIANT: 0, EXPIRING_SOON: 1, READY: 2, NO_REQUIREMENTS: 3 };
                      return order[(a as WorkerComplianceResult).status] - order[(b as WorkerComplianceResult).status];
                    })
                    .map((r, i) => (
                      <WorkerComplianceRow key={i} result={r} />
                    ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {!selectedSiteId && (
        <div className="border rounded-xl p-8 text-center text-muted-foreground">
          <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Select a site above to view compliance.</p>
        </div>
      )}
    </div>
  );
}
