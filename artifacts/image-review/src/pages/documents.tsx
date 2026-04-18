import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FileText, Download, Clock, Package, Camera, BarChart2, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "") + "/";

interface HandoverPack {
  id: number;
  title: string;
  stringName: string | null;
  ospName: string | null;
  wasabiKey: string | null;
  photoCount: number | null;
  reportCount: number | null;
  generatedAt: string;
  generatedBy: string;
}

function PackCard({ pack }: { pack: HandoverPack }) {
  return (
    <Card className="flex flex-col hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-start gap-2">
          <Package className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <span className="line-clamp-2 leading-snug font-medium">{pack.title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between gap-3">
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <Camera className="w-3.5 h-3.5" />
              Photos
            </span>
            <span className="font-medium">{pack.photoCount ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <BarChart2 className="w-3.5 h-3.5" />
              Reports
            </span>
            <span className="font-medium">{pack.reportCount ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Generated
            </span>
            <span className="font-medium text-xs">{format(new Date(pack.generatedAt), "dd MMM yyyy, HH:mm")}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">By</span>
            <span className="font-medium truncate ml-2 text-xs">{pack.generatedBy}</span>
          </div>
        </div>

        {pack.wasabiKey ? (
          <a
            href={`${BASE_URL}api/reports/view?key=${encodeURIComponent(pack.wasabiKey)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" className="w-full gap-2">
              <ExternalLink className="w-3.5 h-3.5" />
              Open PDF
            </Button>
          </a>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={() => window.open(`${BASE_URL}api/documents/${pack.id}/download`, "_blank")}
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function OspSection({ ospName, packs }: { ospName: string; packs: HandoverPack[] }) {
  const [open, setOpen] = useState(true);

  // Group packs by string name within the OSP
  const byString = new Map<string, HandoverPack[]>();
  for (const pack of packs) {
    const key = pack.stringName ?? "Unknown";
    if (!byString.has(key)) byString.set(key, []);
    byString.get(key)!.push(pack);
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-base font-semibold text-foreground hover:text-primary transition-colors"
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        OSP {ospName}
        <span className="text-xs font-normal text-muted-foreground ml-1">
          ({packs.length} pack{packs.length !== 1 ? "s" : ""})
        </span>
      </button>

      {open && (
        <div className="space-y-6 pl-6 border-l border-border/50">
          {Array.from(byString.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([strName, strPacks]) => (
            <div key={strName} className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">String {strName}</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {strPacks.map(pack => <PackCard key={pack.id} pack={pack} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Documents() {
  const [packs, setPacks] = useState<HandoverPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${BASE_URL}api/documents/handover`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { packs: HandoverPack[] }) => setPacks(data.packs ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Group by OSP
  const byOsp = new Map<string, HandoverPack[]>();
  for (const pack of packs) {
    const key = pack.ospName ?? "Unknown OSP";
    if (!byOsp.has(key)) byOsp.set(key, []);
    byOsp.get(key)!.push(pack);
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Handover Packs</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          PDF handover packages generated per string — grouped by OSP. Generate new packs from the Towers page by selecting a string.
        </p>
      </div>

      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-6 w-40" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
          </div>
        </div>
      ) : error ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center border-destructive/30">
          <FileText className="h-12 w-12 text-destructive/40 mb-4" />
          <h3 className="text-lg font-semibold text-destructive">Failed to load</h3>
          <p className="text-muted-foreground text-sm mt-1">{error}</p>
        </Card>
      ) : packs.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center bg-muted/50 border-dashed">
          <Package className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No handover packs yet</h3>
          <p className="text-muted-foreground mt-1 text-sm max-w-sm">
            Navigate to the Towers page, select a string, and click "Generate Handover Pack" to create your first pack.
          </p>
        </Card>
      ) : (
        <div className="space-y-8">
          {Array.from(byOsp.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([ospName, ospPacks]) => (
            <OspSection key={ospName} ospName={ospName} packs={ospPacks} />
          ))}
        </div>
      )}
    </div>
  );
}
