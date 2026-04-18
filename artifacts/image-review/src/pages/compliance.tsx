import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CheckCircle2, XCircle, ExternalLink, RefreshCw, ShieldAlert } from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

interface CompliancePhoto {
  photoId: string | null;
  wasabiKey: string | null;
  imageUrl: string | null;
  imageAvailable: boolean | null;
  locationLink: string | null;
  approval: string | null;
  cableLink: string | null;
}

interface ComplianceItem {
  reqImgType: string;
  reqImgOrder: string | null;
  phaseType: string;
  status: "submitted" | "missing";
  photos: CompliancePhoto[];
}

interface ComplianceResponse {
  summary: { total: number; submitted: number; missing: number };
  items: ComplianceItem[];
}

function ApprovalBadge({ approval }: { approval: string | null }) {
  if (!approval) return null;
  const color =
    approval === "Approved" ? "bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300" :
    approval === "Rejected" ? "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300" :
    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${color}`}>
      {approval}
    </span>
  );
}

function ComplianceCard({ item }: { item: ComplianceItem }) {
  const submitted = item.status === "submitted";
  const firstPhoto = item.photos[0];

  return (
    <Card className={`overflow-hidden border-2 ${submitted ? "border-green-400 dark:border-green-700" : "border-red-300 dark:border-red-800"}`}>
      <div className={`h-1.5 ${submitted ? "bg-green-400 dark:bg-green-600" : "bg-red-400 dark:bg-red-700"}`} />
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold leading-snug line-clamp-2">{item.reqImgType}</p>
            {item.reqImgOrder && (
              <p className="text-xs text-muted-foreground mt-0.5">#{item.reqImgOrder}</p>
            )}
          </div>
          {submitted
            ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
            : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          }
        </div>

        {submitted && firstPhoto ? (
          <div className="space-y-1">
            {firstPhoto.imageUrl && firstPhoto.imageAvailable && (
              <div className="aspect-video bg-muted rounded overflow-hidden">
                <img
                  src={firstPhoto.imageUrl}
                  alt={item.reqImgType}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>
            )}
            <div className="flex items-center justify-between gap-1">
              <div className="text-xs text-muted-foreground truncate">
                {firstPhoto.locationLink ?? firstPhoto.cableLink ?? "—"}
              </div>
              <ApprovalBadge approval={firstPhoto.approval} />
            </div>
            {item.photos.length > 1 && (
              <p className="text-xs text-muted-foreground">+{item.photos.length - 1} more</p>
            )}
            {firstPhoto.imageUrl && (
              <a
                href={firstPhoto.imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Open Image <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">(Missing)</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Compliance() {
  const [cableLink, setCableLink] = useState<string>("none");
  const [phaseType, setPhaseType] = useState<string>("all");

  const { data: cables, isLoading: cablesLoading } = useQuery<string[]>({
    queryKey: ["compliance-cables"],
    queryFn: () => apiFetch("/api/compliance/cables"),
  });

  const { data: phaseTypes, isLoading: phaseTypesLoading } = useQuery<string[]>({
    queryKey: ["compliance-phase-types"],
    queryFn: () => apiFetch("/api/compliance/phase-types"),
  });

  const params = new URLSearchParams();
  if (cableLink && cableLink !== "none") params.set("cableLink", cableLink);
  if (phaseType && phaseType !== "all") params.set("phaseType", phaseType);
  const queryString = params.toString();

  const cableSelected = cableLink !== "none";
  const { data, isLoading, error, refetch } = useQuery<ComplianceResponse>({
    queryKey: ["compliance", cableLink, phaseType],
    queryFn: () => apiFetch(`/api/compliance?${queryString}`),
    enabled: cableSelected,
  });

  const grouped = data?.items
    ? Object.entries(
        data.items.reduce<Record<string, ComplianceItem[]>>((acc, item) => {
          (acc[item.phaseType] ??= []).push(item);
          return acc;
        }, {})
      )
    : [];

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Compliance</h1>
          <p className="text-muted-foreground mt-2">Check which required images have been submitted per cable and phase.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-4 bg-muted/30 rounded-lg p-4 border">
        <div className="space-y-1">
          <Label className="text-xs">Cable / String</Label>
          <Select value={cableLink} onValueChange={setCableLink}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Select cable…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Select —</SelectItem>
              {cables?.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Phase Type</Label>
          <Select value={phaseType} onValueChange={setPhaseType}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="All phases" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All phases</SelectItem>
              {phaseTypes?.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {data?.summary && (
        <div className="flex items-center gap-6 p-4 bg-card rounded-lg border">
          <div className="text-center">
            <p className="text-2xl font-bold">{data.summary.total}</p>
            <p className="text-xs text-muted-foreground">Total Required</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{data.summary.submitted}</p>
            <p className="text-xs text-muted-foreground">Submitted</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-500">{data.summary.missing}</p>
            <p className="text-xs text-muted-foreground">Missing</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">
              {data.summary.total > 0
                ? Math.round((data.summary.submitted / data.summary.total) * 100)
                : 0}%
            </p>
            <p className="text-xs text-muted-foreground">Complete</p>
          </div>
        </div>
      )}

      {!cableSelected ? (
        <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground space-y-3">
          <ShieldAlert className="w-12 h-12 opacity-30" />
          <p className="text-sm font-medium">Select a cable to view compliance status.</p>
          <p className="text-xs opacity-60">Choose a cable from the filter above to load required-image compliance data.</p>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {[...Array(12)].map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : error ? (
        <div className="text-destructive text-sm p-4 rounded-md border border-destructive/20 bg-destructive/5">
          Error loading compliance data: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      ) : data?.items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground space-y-2">
          <CheckCircle2 className="w-10 h-10 opacity-30" />
          <p className="text-sm">No required image definitions found for this selection.</p>
          <p className="text-xs opacity-60">Import phase definitions from the Phases page first.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(([phase, items]) => (
            <div key={phase}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-base font-semibold">{phase}</h2>
                <Badge variant="outline" className="text-xs">
                  {items.filter((i) => i.status === "submitted").length}/{items.length}
                </Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {items.map((item, idx) => (
                  <ComplianceCard key={`${item.phaseType}-${item.reqImgType}-${idx}`} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
