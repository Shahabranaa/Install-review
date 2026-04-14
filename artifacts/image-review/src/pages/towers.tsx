import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { useListStrings, useListTowers, useListLocations } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Wind, MapPin, Activity, Link as LinkIcon, Search, Camera,
  ExternalLink, X, FileText,
} from "lucide-react";
import { Link } from "wouter";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "") + "/";

const STATUS_COLORS: Record<string, string> = {
  "In Progress": "bg-blue-100 text-blue-800",
  Complete: "bg-green-100 text-green-800",
  Completed: "bg-green-100 text-green-800",
  Pending: "bg-yellow-100 text-yellow-800",
  pending: "bg-yellow-100 text-yellow-800",
  "Not Started": "bg-slate-100 text-slate-700",
  Excluded: "bg-slate-100 text-slate-500",
  "": "bg-slate-100 text-slate-500",
};

function getStatusClass(status: string) {
  return STATUS_COLORS[status] ?? "bg-slate-100 text-slate-700";
}

interface TowerPhotoCount {
  tower: string;
  count: number;
}

interface TowerPhoto {
  photoId: string | null;
  driveFileId: string | null;
  label: string | null;
  reqImgType: string | null;
  approval: string | null;
  phaseLink: string | null;
  cableLink: string | null;
}

interface ResolvedPhoto {
  photoId: string;
  fileId: string | null;
  wasabiUrl: string | null;
  notMigrated?: boolean;
}

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

function reportTypeColor(type: string): string {
  switch (type) {
    case "As-Found":               return "bg-blue-100 text-blue-700 border-blue-200";
    case "As-Left":                return "bg-green-100 text-green-700 border-green-200";
    case "Completion Check":       return "bg-purple-100 text-purple-700 border-purple-200";
    case "FO Termination":         return "bg-orange-100 text-orange-700 border-orange-200";
    case "ICCP":                   return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "Pull-in Preparation":    return "bg-cyan-100 text-cyan-700 border-cyan-200";
    case "Temporary Hang Off":     return "bg-rose-100 text-rose-700 border-rose-200";
    case "Permanent Hang Off":     return "bg-red-100 text-red-700 border-red-200";
    case "Cable Pull-in":          return "bg-teal-100 text-teal-700 border-teal-200";
    case "Termination Completion": return "bg-indigo-100 text-indigo-700 border-indigo-200";
    default:                       return "bg-muted text-muted-foreground border-border";
  }
}

// ─── Photo thumbnail (resolves Wasabi URL) ────────────────────────────────────

function PhotoThumb({ photo }: { photo: TowerPhoto }) {
  const [resolved, setResolved] = useState<ResolvedPhoto | null>(null);

  useEffect(() => {
    if (!photo.photoId) return;
    fetch(`${BASE_URL}api/photos/resolve/${photo.photoId}`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: ResolvedPhoto | null) => setResolved(data))
      .catch(() => {});
  }, [photo.photoId]);

  const imageUrl = resolved?.wasabiUrl
    ? `${BASE_URL.replace(/\/$/, "")}${resolved.wasabiUrl}`
    : resolved?.fileId && !resolved.notMigrated
    ? `${BASE_URL}api/drive/image/${resolved.fileId}`
    : photo.driveFileId
    ? `${BASE_URL}api/drive/image/${photo.driveFileId}`
    : null;

  return (
    <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted border border-border/50 flex-shrink-0">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={photo.label ?? photo.photoId ?? ""}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground/40">
          <Camera className="w-5 h-5" />
          <span className="text-[9px] text-center px-1 leading-tight">
            {photo.reqImgType ?? "Photo"}
          </span>
        </div>
      )}
    </div>
  );
}

export default function Towers() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const initialStringId = params.get("stringId") ? parseInt(params.get("stringId")!) : undefined;

  const [selectedStringId, setSelectedStringId] = useState<number | undefined>(initialStringId);

  useEffect(() => {
    const id = params.get("stringId") ? parseInt(params.get("stringId")!) : undefined;
    setSelectedStringId(id);
  }, [search]);

  const [searchQuery, setSearchQuery] = useState("");

  const { data: locations } = useListLocations();
  const ospLocations = locations?.filter((l) => l.type === "OSP") ?? [];
  const [selectedOspId, setSelectedOspId] = useState<number | undefined>(undefined);

  const { data: strings, isLoading: strLoading } = useListStrings(
    selectedOspId ? { locationId: selectedOspId } : undefined,
  );

  const { data: towers, isLoading: towerLoading } = useListTowers(
    selectedStringId ? { stringId: selectedStringId } : undefined,
  );

  const isLoading = strLoading || towerLoading;

  const filteredTowers = towers?.filter((t) =>
    !searchQuery ||
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.progressStatus.toLowerCase().includes(searchQuery.toLowerCase())
  ) ?? [];

  const selectedString = strings?.find((s) => s.id === selectedStringId);

  const statusCounts = filteredTowers.reduce<Record<string, number>>((acc, t) => {
    const key = t.progressStatus || "No Status";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  // Photo counts per tower
  const [photoCounts, setPhotoCounts] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    fetch(`${BASE_URL}api/photos/counts`)
      .then(r => (r.ok ? r.json() : []))
      .then((rows: TowerPhotoCount[]) => {
        setPhotoCounts(new Map(rows.map(r => [r.tower, r.count])));
      })
      .catch(() => {});
  }, []);

  // Expanded tower state
  const [expandedTowerId, setExpandedTowerId] = useState<number | null>(null);
  const [towerPhotos, setTowerPhotos] = useState<Map<string, TowerPhoto[]>>(new Map());
  const [loadingPhotos, setLoadingPhotos] = useState<Set<string>>(new Set());

  // Reports state — fetched once lazily
  const [allReports, setAllReports] = useState<Report[] | null>(null);
  const [loadingReports, setLoadingReports] = useState(false);

  const fetchReports = () => {
    if (allReports !== null || loadingReports) return;
    setLoadingReports(true);
    fetch(`${BASE_URL}api/reports`)
      .then(r => (r.ok ? r.json() : { reports: [] }))
      .then((data: { reports: Report[] }) => setAllReports(data.reports))
      .catch(() => setAllReports([]))
      .finally(() => setLoadingReports(false));
  };

  const handleCardClick = (towerId: number, towerName: string) => {
    if (expandedTowerId === towerId) {
      setExpandedTowerId(null);
      return;
    }
    setExpandedTowerId(towerId);
    fetchReports();
    if (!towerPhotos.has(towerName)) {
      setLoadingPhotos(prev => new Set([...prev, towerName]));
      fetch(`${BASE_URL}api/photos/db?tower=${encodeURIComponent(towerName)}`)
        .then(r => (r.ok ? r.json() : []))
        .then((photos: TowerPhoto[]) => {
          setTowerPhotos(prev => new Map([...prev, [towerName, photos]]));
          setLoadingPhotos(prev => { const s = new Set(prev); s.delete(towerName); return s; });
        })
        .catch(() => {
          setLoadingPhotos(prev => { const s = new Set(prev); s.delete(towerName); return s; });
        });
    }
  };

  const expandedTower = expandedTowerId !== null
    ? filteredTowers.find(t => t.id === expandedTowerId) ?? null
    : null;

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Towers</h1>
          <p className="text-muted-foreground mt-2">
            {selectedString
              ? `Towers on string ${selectedString.name}`
              : "Offshore wind turbine tower locations."}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Wind className="w-4 h-4" />
          {filteredTowers.length} towers
        </div>
      </div>

      {/* OSP Filter */}
      {ospLocations.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground font-medium">OSP:</span>
          <Button
            size="sm"
            variant={selectedOspId === undefined ? "default" : "outline"}
            onClick={() => { setSelectedOspId(undefined); setSelectedStringId(undefined); }}
          >
            All
          </Button>
          {ospLocations.map((osp) => (
            <Button
              key={osp.id}
              size="sm"
              variant={selectedOspId === osp.id ? "default" : "outline"}
              onClick={() => { setSelectedOspId(osp.id); setSelectedStringId(undefined); }}
            >
              {osp.name}
            </Button>
          ))}
        </div>
      )}

      {/* String Filter */}
      {strings && strings.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground font-medium">String:</span>
          <Button
            size="sm"
            variant={selectedStringId === undefined ? "default" : "outline"}
            onClick={() => setSelectedStringId(undefined)}
          >
            All
          </Button>
          {strings.map((s) => (
            <Button
              key={s.id}
              size="sm"
              variant={selectedStringId === s.id ? "default" : "outline"}
              onClick={() => setSelectedStringId(s.id)}
            >
              {s.name}
            </Button>
          ))}
        </div>
      )}

      {/* Status Summary */}
      {!isLoading && filteredTowers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(statusCounts).map(([status, count]) => (
            <Badge key={status} className={`text-xs ${getStatusClass(status)}`}>
              {status}: {count}
            </Badge>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search towers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : filteredTowers.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center bg-muted/50 border-dashed">
          <Wind className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No towers found</h3>
          <p className="text-muted-foreground mt-1">
            {searchQuery
              ? "No towers match your search."
              : selectedStringId
              ? "No towers on this string."
              : "Select a string to view towers, or view all."}
          </p>
          {!selectedStringId && (
            <div className="mt-4">
              <Link href="/strings">
                <Button variant="outline" size="sm">
                  Browse Strings
                </Button>
              </Link>
            </div>
          )}
        </Card>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredTowers.map((tower) => {
              const str = strings?.find((s) => s.id === tower.stringId);
              const photoCount = photoCounts.get(tower.name) ?? 0;
              const isExpanded = expandedTowerId === tower.id;
              return (
                <Card
                  key={tower.id}
                  className={`hover:shadow-sm transition-all cursor-pointer select-none ${isExpanded ? "ring-2 ring-primary/50 shadow-sm" : ""}`}
                  onClick={() => handleCardClick(tower.id, tower.name)}
                >
                  <CardContent className="pt-4 pb-3 space-y-2">
                    <div className="flex items-center justify-between gap-1">
                      <h3 className="font-semibold text-sm">{tower.name}</h3>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {photoCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-xs font-medium">
                            <Camera className="w-3 h-3" />
                            {photoCount}
                          </span>
                        )}
                        <Badge className={`text-xs ${getStatusClass(tower.progressStatus)}`}>
                          {tower.progressStatus || "—"}
                        </Badge>
                      </div>
                    </div>

                    {str && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Activity className="w-3 h-3 flex-shrink-0" />
                        <span>String {str.name}</span>
                      </div>
                    )}

                    {tower.lat !== null && tower.lat !== undefined && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="font-mono">
                          {tower.lat?.toFixed(5)}, {tower.lng?.toFixed(5)}
                        </span>
                      </div>
                    )}

                    {tower.connectedTo && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <LinkIcon className="w-3 h-3 flex-shrink-0" />
                        <span>→ {tower.connectedTo}</span>
                      </div>
                    )}

                    {tower.countOnString !== null && tower.countOnString !== undefined && (
                      <div className="text-xs text-muted-foreground">
                        Position {tower.countOnString} on string
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Expanded detail panel — Images + Reports side by side */}
          {expandedTower && (() => {
            const photos = towerPhotos.get(expandedTower.name) ?? [];
            const isLoadingPh = loadingPhotos.has(expandedTower.name);
            const photoCount = photoCounts.get(expandedTower.name) ?? 0;

            // Filter reports to this tower's string and/or tower name
            const towerReports = (allReports ?? []).filter(r =>
              (selectedString && r.string === selectedString.name) ||
              r.cable === expandedTower.name ||
              r.string === expandedTower.name
            );

            return (
              <div className="rounded-xl border bg-muted/30 p-4 space-y-3 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                {/* Header row */}
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-sm">{expandedTower.name}</span>
                  <button
                    onClick={() => setExpandedTowerId(null)}
                    className="rounded-full p-1 hover:bg-muted transition-colors"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                {/* Two-column grid */}
                <div className="grid grid-cols-2 gap-4">

                  {/* ── Images column ── */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Camera className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Images</span>
                      {photoCount > 0 && (
                        <Badge variant="secondary" className="text-xs ml-auto">{photoCount}</Badge>
                      )}
                    </div>

                    {isLoadingPh ? (
                      <div className="flex gap-2 flex-wrap">
                        {[1, 2, 3, 4].map(i => (
                          <Skeleton key={i} className="w-20 h-20 rounded-lg flex-shrink-0" />
                        ))}
                      </div>
                    ) : photos.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 text-muted-foreground/50 gap-2 rounded-lg border border-dashed">
                        <Camera className="w-6 h-6" />
                        <span className="text-xs">No photos yet for this tower.</span>
                      </div>
                    ) : (
                      <div className="flex gap-2 flex-wrap">
                        {photos.slice(0, 8).map((photo, idx) => (
                          <PhotoThumb key={photo.photoId ?? idx} photo={photo} />
                        ))}
                        {photoCount > 8 && (
                          <div className="w-20 h-20 rounded-lg bg-muted border border-border/50 flex-shrink-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
                            <span className="text-sm font-semibold">+{photoCount - 8}</span>
                            <span className="text-[10px]">more</span>
                          </div>
                        )}
                      </div>
                    )}

                    {photoCount > 0 && (
                      <div className="pt-1">
                        <Link href={`/drive-photos?tower=${encodeURIComponent(expandedTower.name)}`}>
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                            <ExternalLink className="w-3 h-3" />
                            View all in Images
                          </Button>
                        </Link>
                      </div>
                    )}
                  </div>

                  {/* ── Reports column ── */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reports</span>
                      {towerReports.length > 0 && (
                        <Badge variant="secondary" className="text-xs ml-auto">{towerReports.length}</Badge>
                      )}
                    </div>

                    {loadingReports ? (
                      <div className="space-y-1.5">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full rounded" />)}
                      </div>
                    ) : towerReports.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 text-muted-foreground/50 gap-2 rounded-lg border border-dashed">
                        <FileText className="w-6 h-6" />
                        <span className="text-xs italic">
                          {allReports === null ? "Loading reports…" : "No reports found for this string."}
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
                        {towerReports.map(r => (
                          <div key={r.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/60 transition-colors group">
                            <Badge
                              variant="outline"
                              className={`text-[10px] flex-shrink-0 border whitespace-nowrap ${reportTypeColor(r.reportType)}`}
                            >
                              {r.reportType}
                            </Badge>
                            <span className="text-xs text-foreground truncate flex-1 min-w-0" title={r.name}>
                              {r.name}
                            </span>
                            <a
                              href={`${BASE_URL}api/reports/view?key=${encodeURIComponent(r.wasabiKey)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-[10px] text-primary hover:underline flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={e => e.stopPropagation()}
                            >
                              <ExternalLink className="w-3 h-3" />
                              PDF
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
