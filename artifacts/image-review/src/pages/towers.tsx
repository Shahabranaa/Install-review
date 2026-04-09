import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { useListStrings, useListTowers, useListLocations } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wind, MapPin, Activity, Link as LinkIcon, Search, Camera, ExternalLink, X } from "lucide-react";
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

export default function Towers() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const initialStringId = params.get("stringId") ? parseInt(params.get("stringId")!) : undefined;

  const [selectedStringId, setSelectedStringId] = useState<number | undefined>(initialStringId);
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

  // Photo counts per tower (fetched once on mount from DB)
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

  const handleCardClick = (towerId: number, towerName: string) => {
    if (expandedTowerId === towerId) {
      setExpandedTowerId(null);
      return;
    }
    setExpandedTowerId(towerId);
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
                            {photoCount} photos
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

          {/* Expanded photo strip — shown below the grid when a tower is selected */}
          {expandedTower && (() => {
            const photos = towerPhotos.get(expandedTower.name) ?? [];
            const isLoadingPh = loadingPhotos.has(expandedTower.name);
            const photoCount = photoCounts.get(expandedTower.name) ?? 0;
            return (
              <div className="rounded-xl border bg-muted/30 p-4 space-y-3 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Camera className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium text-sm">
                      {expandedTower.name}
                      {photoCount > 0 && (
                        <span className="ml-2 text-muted-foreground font-normal">
                          {photoCount} photo{photoCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/drive-photos?tower=${encodeURIComponent(expandedTower.name)}`}>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                        <ExternalLink className="w-3 h-3" />
                        Open in Images
                      </Button>
                    </Link>
                    <button
                      onClick={() => setExpandedTowerId(null)}
                      className="rounded-full p-1 hover:bg-muted transition-colors"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>

                {isLoadingPh ? (
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                      <Skeleton key={i} className="w-20 h-20 rounded-lg flex-shrink-0" />
                    ))}
                  </div>
                ) : photos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-muted-foreground/50 gap-2">
                    <Camera className="w-8 h-8" />
                    <span className="text-sm">No photos in the database yet for this tower.</span>
                  </div>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    {photos.slice(0, 8).map((photo, idx) => (
                      <div
                        key={photo.photoId ?? idx}
                        className="w-20 h-20 rounded-lg overflow-hidden bg-muted border border-border/50 flex-shrink-0"
                      >
                        {photo.driveFileId ? (
                          <img
                            src={`${BASE_URL}api/drive/image/${photo.driveFileId}`}
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
                    ))}
                    {photoCount > 8 && (
                      <div className="w-20 h-20 rounded-lg bg-muted border border-border/50 flex-shrink-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
                        <span className="text-sm font-semibold">+{photoCount - 8}</span>
                        <span className="text-[10px]">more</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
