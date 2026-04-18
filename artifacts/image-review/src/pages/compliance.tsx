import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CheckCircle2, XCircle, ExternalLink, RefreshCw, ShieldAlert, DatabaseZap, Loader2, Layers } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { credentials: "include", ...options });
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

interface TowerItem {
  reqImgType: string;
  reqImgOrder: string | null;
  phaseType: string;
  status: "submitted" | "missing";
  photo: CompliancePhoto | null;
}

interface TowerGroup {
  tower: string;
  items: TowerItem[];
  submitted: number;
  total: number;
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

function TowerComplianceCard({ item }: { item: TowerItem }) {
  const submitted = item.status === "submitted";

  const cardContent = (
    <Card
      className={`overflow-hidden border-2 transition-shadow ${
        submitted
          ? "border-green-400 dark:border-green-700 hover:shadow-md cursor-pointer"
          : "border-red-300 dark:border-red-800"
      }`}
    >
      <div className={`h-1.5 ${submitted ? "bg-green-400 dark:bg-green-600" : "bg-red-400 dark:bg-red-700"}`} />
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold leading-snug line-clamp-2">{item.reqImgType}</p>
            {item.reqImgOrder && (
              <p className="text-xs text-muted-foreground mt-0.5">#{item.reqImgOrder}</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5 italic">{item.phaseType}</p>
          </div>
          {submitted
            ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
            : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          }
        </div>

        {submitted && item.photo ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-1">
              <ApprovalBadge approval={item.photo.approval} />
            </div>
            {item.photo.imageUrl && (
              <span className="inline-flex items-center gap-1 text-xs text-primary">
                Open Image <ExternalLink className="w-3 h-3" />
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">(Missing)</p>
        )}
      </CardContent>
    </Card>
  );

  if (submitted && item.photo?.imageUrl) {
    return (
      <a href={item.photo.imageUrl} target="_blank" rel="noopener noreferrer" className="block">
        {cardContent}
      </a>
    );
  }

  return cardContent;
}

export default function Compliance() {
  const [cableLink, setCableLink] = useState<string>("none");
  const [phaseType, setPhaseType] = useState<string>("all");
  const [groupByTower, setGroupByTower] = useState(false);
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const syncMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; synced: number }>("/api/photos/sync", { method: "POST" }),
    onSuccess: (result) => {
      toast({ title: `Sync complete — ${result.synced} photos loaded from sheet` });
      qc.invalidateQueries({ queryKey: ["compliance"] });
      qc.invalidateQueries({ queryKey: ["compliance-cables"] });
    },
    onError: (err: Error) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

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

  const towerGroups = useMemo<TowerGroup[]>(() => {
    if (!data?.items) return [];

    const towerSet = new Set<string>();
    data.items.forEach((item) => {
      item.photos.forEach((photo) => {
        if (photo.locationLink) towerSet.add(photo.locationLink);
      });
    });

    const towers = [...towerSet].sort();

    return towers.map((tower) => {
      const towerItems: TowerItem[] = data.items.map((item) => {
        const towerPhotos = item.photos.filter((p) => p.locationLink === tower);
        const photo = towerPhotos[0] ?? null;
        return {
          reqImgType: item.reqImgType,
          reqImgOrder: item.reqImgOrder,
          phaseType: item.phaseType,
          status: towerPhotos.length > 0 ? "submitted" : "missing",
          photo,
        };
      });

      const submitted = towerItems.filter((i) => i.status === "submitted").length;
      return { tower, items: towerItems, submitted, total: towerItems.length };
    });
  }, [data]);

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Compliance</h1>
          <p className="text-muted-foreground mt-2">Check which required images have been submitted per cable and phase.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              title="Pull latest photos from Google Sheet into the database"
            >
              {syncMutation.isPending
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <DatabaseZap className="w-4 h-4 mr-2" />
              }
              {syncMutation.isPending ? "Syncing…" : "Sync Photos"}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
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

        {cableSelected && data && towerGroups.length > 0 && (
          <div className="space-y-1 ml-auto">
            <Label className="text-xs">Group by</Label>
            <div className="flex rounded-md border overflow-hidden">
              <button
                onClick={() => setGroupByTower(false)}
                className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  !groupByTower
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Phase
              </button>
              <button
                onClick={() => setGroupByTower(true)}
                className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors border-l ${
                  groupByTower
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
                Tower
              </button>
            </div>
          </div>
        )}
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
          {groupByTower && towerGroups.length > 0 && (
            <div className="text-center">
              <p className="text-2xl font-bold">{towerGroups.length}</p>
              <p className="text-xs text-muted-foreground">Towers</p>
            </div>
          )}
        </div>
      )}

      {!cableSelected ? (
        <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground space-y-3">
          <ShieldAlert className="w-12 h-12 opacity-30" />
          <p className="text-sm font-medium">Select a cable to view compliance status.</p>
          {cables && cables.length === 0 && isAdmin ? (
            <p className="text-xs opacity-70">
              No photos synced yet.{" "}
              <button
                className="underline hover:opacity-100"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
              >
                Sync from Google Sheet
              </button>{" "}
              to load photo data.
            </p>
          ) : (
            <p className="text-xs opacity-60">Choose a cable from the filter above to load required-image compliance data.</p>
          )}
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
      ) : groupByTower ? (
        towerGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground space-y-2">
            <p className="text-sm">No towers found in photos for this cable.</p>
            <p className="text-xs opacity-60">Photos must have a location link to appear in tower view.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {towerGroups.map(({ tower, items, submitted, total }) => (
              <div key={tower}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                      <path d="M2 12l10 5 10-5" />
                    </svg>
                    <h2 className="text-base font-semibold">{tower}</h2>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-xs ${submitted === total ? "border-green-400 text-green-700 dark:text-green-400" : submitted === 0 ? "border-red-400 text-red-600 dark:text-red-400" : ""}`}
                  >
                    {submitted}/{total}
                  </Badge>
                  {submitted < total && (
                    <span className="text-xs text-red-500">{total - submitted} missing</span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {items.map((item, idx) => (
                    <TowerComplianceCard key={`${tower}-${item.phaseType}-${item.reqImgType}-${idx}`} item={item} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
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
