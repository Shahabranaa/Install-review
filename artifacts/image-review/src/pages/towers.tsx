import { useState, useEffect, useCallback, useRef } from "react";
import { useSearch } from "wouter";
import { useListStrings, useListTowers, useListLocations } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Wind, Search, Camera, FileText, X, ChevronLeft, ChevronRight,
  ArrowLeft, ZoomIn, ExternalLink, ImageOff,
} from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "") + "/";

// ─── Types ────────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { dot: string; badge: string }> = {
  "In Progress": { dot: "bg-blue-500",   badge: "bg-blue-100 text-blue-800" },
  Complete:      { dot: "bg-green-500",  badge: "bg-green-100 text-green-800" },
  Completed:     { dot: "bg-green-500",  badge: "bg-green-100 text-green-800" },
  Pending:       { dot: "bg-amber-400",  badge: "bg-amber-100 text-amber-800" },
  pending:       { dot: "bg-amber-400",  badge: "bg-amber-100 text-amber-800" },
  "Not Started": { dot: "bg-slate-400",  badge: "bg-slate-100 text-slate-700" },
  Excluded:      { dot: "bg-slate-300",  badge: "bg-slate-100 text-slate-400" },
  "":            { dot: "bg-slate-300",  badge: "bg-slate-100 text-slate-400" },
};

function statusStyle(s: string) {
  return STATUS_COLORS[s] ?? { dot: "bg-slate-300", badge: "bg-slate-100 text-slate-700" };
}

interface TowerPhotoCount { tower: string; count: number; }

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

// ─── Report badge colours ─────────────────────────────────────────────────────

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

// ─── Approval badge ───────────────────────────────────────────────────────────

function ApprovalBadge({ approval }: { approval?: string | null }) {
  const a = (approval ?? "").toLowerCase();
  if (a === "approved" || a === "checked" || a === "verified")
    return <span className="rounded-full bg-green-600 text-white px-2.5 py-0.5 text-xs font-medium">Approved</span>;
  if (a === "rejected")
    return <span className="rounded-full bg-red-600 text-white px-2.5 py-0.5 text-xs font-medium">Rejected</span>;
  return <span className="rounded-full bg-amber-500 text-white px-2.5 py-0.5 text-xs font-medium">Pending</span>;
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({
  photos,
  resolvedUrls,
  startIndex,
  onClose,
}: {
  photos: TowerPhoto[];
  resolvedUrls: Map<string, string | null>;
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const photo = photos[index];

  const prev = useCallback(() => setIndex(i => (i - 1 + photos.length) % photos.length), [photos.length]);
  const next = useCallback(() => setIndex(i => (i + 1) % photos.length), [photos.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft")  prev();
      if (e.key === "ArrowRight") next();
      if (e.key === "Escape")     onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [prev, next, onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const imageUrl = photo?.photoId ? resolvedUrls.get(photo.photoId) ?? null : null;

  // Preload neighbours
  const preload = (idx: number) => {
    const p = photos[idx];
    if (!p?.photoId) return;
    const url = resolvedUrls.get(p.photoId);
    if (url) { const img = new Image(); img.src = url; }
  };
  useEffect(() => {
    preload((index - 1 + photos.length) % photos.length);
    preload((index + 1) % photos.length);
  }, [index, resolvedUrls]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-5 py-3.5 flex-shrink-0 border-b border-white/10"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-white/50 text-sm tabular-nums">{index + 1} / {photos.length}</span>
          {photo?.label && (
            <span className="text-white text-sm font-medium truncate max-w-xs">{photo.label}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="rounded-full bg-white/10 hover:bg-white/20 p-2 transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div
        className="flex-1 flex items-center justify-center relative overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Left arrow */}
        {photos.length > 1 && (
          <button
            onClick={prev}
            className="absolute left-4 z-10 rounded-full bg-white/10 hover:bg-white/25 p-3 transition-colors"
          >
            <ChevronLeft className="w-7 h-7 text-white" />
          </button>
        )}

        {/* Image */}
        <div className="flex items-center justify-center w-full h-full px-20">
          {imageUrl ? (
            <img
              key={imageUrl}
              src={imageUrl}
              alt={photo?.label ?? photo?.photoId ?? ""}
              className="max-w-full max-h-full object-contain rounded-sm shadow-2xl"
              loading="eager"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-white/30">
              <ImageOff className="w-16 h-16" />
              <span className="text-sm">Image not available</span>
            </div>
          )}
        </div>

        {/* Right arrow */}
        {photos.length > 1 && (
          <button
            onClick={next}
            className="absolute right-4 z-10 rounded-full bg-white/10 hover:bg-white/25 p-3 transition-colors"
          >
            <ChevronRight className="w-7 h-7 text-white" />
          </button>
        )}
      </div>

      {/* Bottom bar — approval badge + metadata */}
      <div
        className="flex items-center gap-3 px-5 py-3 border-t border-white/10 flex-shrink-0"
        onClick={e => e.stopPropagation()}
      >
        <ApprovalBadge approval={photo?.approval} />
        {photo?.reqImgType && (
          <span className="text-xs text-white/50 font-mono">{photo.reqImgType}</span>
        )}
        {photo?.phaseLink && (
          <span className="text-xs text-white/40 truncate">{photo.phaseLink}</span>
        )}
      </div>
    </div>
  );
}

// ─── Photo tile ───────────────────────────────────────────────────────────────

function PhotoTile({
  photo,
  onResolved,
  onClick,
}: {
  photo: TowerPhoto;
  onResolved: (photoId: string, url: string | null) => void;
  onClick: () => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!photo.photoId) { setLoading(false); return; }
    fetch(`${BASE_URL}api/photos/resolve/${photo.photoId}`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: ResolvedPhoto | null) => {
        const url = data?.wasabiUrl
          ? `${BASE_URL.replace(/\/$/, "")}${data.wasabiUrl}`
          : data?.fileId && !data.notMigrated
          ? `${BASE_URL}api/drive/image/${data.fileId}`
          : null;
        setImageUrl(url);
        if (photo.photoId) onResolved(photo.photoId, url);
      })
      .catch(() => { setImageUrl(null); if (photo.photoId) onResolved(photo.photoId, null); })
      .finally(() => setLoading(false));
  }, [photo.photoId]);

  if (loading) {
    return <Skeleton className="aspect-square w-full rounded-none" />;
  }

  if (!imageUrl || error) {
    return (
      <div className="aspect-square w-full bg-zinc-900 flex items-center justify-center">
        <ImageOff className="w-6 h-6 text-white/20" />
      </div>
    );
  }

  return (
    <div
      className="aspect-square w-full overflow-hidden bg-black relative cursor-pointer group"
      onClick={onClick}
    >
      <img
        src={imageUrl}
        alt={photo.label ?? photo.photoId ?? ""}
        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
        loading="lazy"
        onError={() => setError(true)}
      />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
        <ZoomIn className="w-7 h-7 text-white opacity-0 group-hover:opacity-100 drop-shadow-lg transition-opacity" />
      </div>
    </div>
  );
}

// ─── Tower folder (detail view) ───────────────────────────────────────────────

interface TowerRecord {
  id: number;
  name: string;
  progressStatus: string;
  stringId: number;
  lat?: number | null;
  lng?: number | null;
  connectedTo?: string | null;
  countOnString?: number | null;
}

function TowerFolderView({
  tower,
  strings,
  allReports,
  loadingReports,
  photoCounts,
  onBack,
}: {
  tower: TowerRecord;
  strings: { id: number; name: string }[] | undefined;
  allReports: Report[] | null;
  loadingReports: boolean;
  photoCounts: Map<string, number>;
  onBack: () => void;
}) {
  const [photos, setPhotos] = useState<TowerPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [resolvedUrls, setResolvedUrls] = useState<Map<string, string | null>>(new Map());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showAllReports, setShowAllReports] = useState(false);

  const photoCount = photoCounts.get(tower.name) ?? 0;
  const selectedString = strings?.find(s => s.id === tower.stringId);

  useEffect(() => {
    setLoadingPhotos(true);
    fetch(`${BASE_URL}api/photos/db?tower=${encodeURIComponent(tower.name)}`)
      .then(r => (r.ok ? r.json() : []))
      .then((data: TowerPhoto[]) => setPhotos(data))
      .catch(() => setPhotos([]))
      .finally(() => setLoadingPhotos(false));
  }, [tower.name]);

  const handleResolved = useCallback((photoId: string, url: string | null) => {
    setResolvedUrls(prev => new Map([...prev, [photoId, url]]));
  }, []);

  // Filter reports: string-level + cable/tower-level
  const towerReports = (allReports ?? []).filter(r =>
    (selectedString && r.string === selectedString.name) ||
    r.cable === tower.name ||
    r.string === tower.name
  );
  const visibleReports = showAllReports ? towerReports : towerReports.slice(0, 8);

  const st = statusStyle(tower.progressStatus);
  const displayPhotos = photos.filter(p => p.photoId);

  return (
    <div className="flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-start gap-4 px-8 pt-6 pb-5 border-b border-border/60">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 mt-0.5"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{tower.name}</h1>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${st.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
              {tower.progressStatus || "No Status"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {photoCount > 0 ? `${photoCount} photo${photoCount !== 1 ? "s" : ""}` : "No photos"}
            {towerReports.length > 0 && ` · ${towerReports.length} report${towerReports.length !== 1 ? "s" : ""}`}
            {selectedString && (
              <span className="ml-2 text-muted-foreground/60">· String {selectedString.name}</span>
            )}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8">

        {/* ── Photos section ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Camera className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Photos</h2>
            {photoCount > 0 && (
              <Badge variant="secondary" className="text-xs">{photoCount}</Badge>
            )}
          </div>

          {loadingPhotos ? (
            <div className="grid grid-cols-3 gap-0.5">
              {Array.from({ length: Math.min(photoCount || 9, 9) }).map((_, i) => (
                <Skeleton key={i} className="aspect-square w-full rounded-none" />
              ))}
            </div>
          ) : displayPhotos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/40 border border-dashed rounded-xl">
              <Camera className="w-10 h-10 mb-2" />
              <span className="text-sm">No photos for this tower yet</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-0.5 rounded-sm overflow-hidden">
              {displayPhotos.map((photo, idx) => (
                <PhotoTile
                  key={photo.photoId ?? idx}
                  photo={photo}
                  onResolved={handleResolved}
                  onClick={() => setLightboxIndex(idx)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Reports section ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Reports</h2>
            {towerReports.length > 0 && (
              <Badge variant="secondary" className="text-xs">{towerReports.length}</Badge>
            )}
          </div>

          {loadingReports ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
            </div>
          ) : towerReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/40 border border-dashed rounded-xl">
              <FileText className="w-8 h-8 mb-2" />
              <span className="text-sm italic">
                {allReports === null ? "Loading reports…" : "No reports found for this string."}
              </span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {visibleReports.map(r => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/50 hover:bg-muted/40 transition-colors group"
                >
                  <Badge
                    variant="outline"
                    className={`text-[10px] flex-shrink-0 border whitespace-nowrap ${reportTypeColor(r.reportType)}`}
                  >
                    {r.reportType}
                  </Badge>
                  <span className="text-sm text-foreground truncate flex-1 min-w-0" title={r.name}>
                    {r.name}
                  </span>
                  <a
                    href={`${BASE_URL}api/reports/view?key=${encodeURIComponent(r.wasabiKey)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary hover:underline flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={e => e.stopPropagation()}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open PDF
                  </a>
                </div>
              ))}
              {towerReports.length > 8 && (
                <button
                  onClick={() => setShowAllReports(v => !v)}
                  className="w-full text-xs text-muted-foreground hover:text-foreground py-2 transition-colors"
                >
                  {showAllReports ? "Show less" : `Show all ${towerReports.length} reports`}
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          photos={displayPhotos}
          resolvedUrls={resolvedUrls}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

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
  const [selectedOspId, setSelectedOspId] = useState<number | undefined>(undefined);
  const [selectedTower, setSelectedTower] = useState<TowerRecord | null>(null);

  const { data: locations } = useListLocations();
  const ospLocations = locations?.filter((l) => l.type === "OSP") ?? [];

  const { data: strings, isLoading: strLoading } = useListStrings(
    selectedOspId ? { locationId: selectedOspId } : undefined,
  );

  const { data: towers, isLoading: towerLoading } = useListTowers(
    selectedStringId ? { stringId: selectedStringId } : undefined,
  );

  const isLoading = strLoading || towerLoading;

  const filteredTowers = (towers ?? []).filter(t =>
    !searchQuery ||
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.progressStatus.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

  // Reports — lazy, fetched once when any tower is first opened
  const [allReports, setAllReports] = useState<Report[] | null>(null);
  const [loadingReports, setLoadingReports] = useState(false);

  const ensureReports = useCallback(() => {
    if (allReports !== null || loadingReports) return;
    setLoadingReports(true);
    fetch(`${BASE_URL}api/reports`)
      .then(r => (r.ok ? r.json() : { reports: [] }))
      .then((data: { reports: Report[] }) => setAllReports(data.reports))
      .catch(() => setAllReports([]))
      .finally(() => setLoadingReports(false));
  }, [allReports, loadingReports]);

  const handleTowerClick = (tower: TowerRecord) => {
    setSelectedTower(tower);
    ensureReports();
  };

  // If a tower folder is open, render it
  if (selectedTower) {
    return (
      <TowerFolderView
        tower={selectedTower}
        strings={strings ?? []}
        allReports={allReports}
        loadingReports={loadingReports}
        photoCounts={photoCounts}
        onBack={() => setSelectedTower(null)}
      />
    );
  }

  // Status summary
  const statusCounts = filteredTowers.reduce<Record<string, number>>((acc, t) => {
    const key = t.progressStatus || "No Status";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-8 space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Towers</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {strings?.find(s => s.id === selectedStringId)
              ? `String ${strings?.find(s => s.id === selectedStringId)?.name}`
              : "Offshore wind turbine locations"}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Wind className="w-4 h-4" />
          <span>{filteredTowers.length} towers</span>
        </div>
      </div>

      {/* OSP filter */}
      {ospLocations.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-muted-foreground font-medium mr-1">OSP:</span>
          <Button size="sm" variant={selectedOspId === undefined ? "default" : "outline"}
            onClick={() => { setSelectedOspId(undefined); setSelectedStringId(undefined); }}>
            All
          </Button>
          {ospLocations.map(osp => (
            <Button key={osp.id} size="sm"
              variant={selectedOspId === osp.id ? "default" : "outline"}
              onClick={() => { setSelectedOspId(osp.id); setSelectedStringId(undefined); }}>
              {osp.name}
            </Button>
          ))}
        </div>
      )}

      {/* String filter */}
      {strings && strings.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-muted-foreground font-medium mr-1">String:</span>
          <Button size="sm" variant={selectedStringId === undefined ? "default" : "outline"}
            onClick={() => setSelectedStringId(undefined)}>
            All
          </Button>
          {strings.map(s => (
            <Button key={s.id} size="sm"
              variant={selectedStringId === s.id ? "default" : "outline"}
              onClick={() => setSelectedStringId(s.id)}>
              {s.name}
            </Button>
          ))}
        </div>
      )}

      {/* Status summary chips */}
      {!isLoading && filteredTowers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(statusCounts).map(([status, count]) => {
            const { dot, badge } = statusStyle(status);
            return (
              <span key={status} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                {status}: {count}
              </span>
            );
          })}
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search towers…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {/* Tower grid */}
      {isLoading ? (
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : filteredTowers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed rounded-xl bg-muted/20">
          <Wind className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="font-semibold text-sm">No towers found</p>
          <p className="text-muted-foreground text-xs mt-1">
            {searchQuery ? "No towers match your search." : selectedStringId ? "No towers on this string." : "Select a string to view towers."}
          </p>
        </div>
      ) : (
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filteredTowers.map(tower => {
            const photoCount = photoCounts.get(tower.name) ?? 0;
            const st = statusStyle(tower.progressStatus);
            return (
              <button
                key={tower.id}
                onClick={() => handleTowerClick(tower)}
                className="group flex flex-col gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-2.5 text-left hover:shadow-md hover:ring-2 hover:ring-primary/20 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="flex items-center justify-between gap-1 w-full">
                  <span className="font-semibold text-sm truncate">{tower.name}</span>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} title={tower.progressStatus} />
                </div>
                {photoCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-blue-600 font-medium">
                    <Camera className="w-3 h-3" />
                    {photoCount} photos
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground/50">No photos</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
