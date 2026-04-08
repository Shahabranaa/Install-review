import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Image as ImageIcon,
  Camera,
  Wind,
  RefreshCw,
  Search,
  X,
  ZoomIn,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileSignature,
  Pencil,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "") + "/";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PhotoRecord {
  photoId: string;
  label: string;
  status: string;
  approval: string;
  type: "photo" | "signature" | "drawing" | "unknown";
  filePath: string;
  tower: string;
  string: string;
  phase: string;
  phaseOrder: string;
  reqImgType: string;
  reqImgOrder: string;
  createdAt: string;
  createdBy: string;
  comments: string;
  response: string;
}

interface SheetResponse {
  photos: PhotoRecord[];
  meta: { total: number; towers: string[]; strings: string[]; phases: string[] };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusBadge(status: string, approval: string) {
  const s = (status ?? "").toLowerCase();
  const a = (approval ?? "").toLowerCase();
  if (a === "approved" || a === "checked")
    return <Badge className="bg-green-600 text-white text-xs"><CheckCircle2 className="w-2.5 h-2.5 mr-1" />Approved</Badge>;
  if (s === "pending")
    return <Badge className="bg-amber-500 text-white text-xs"><Clock className="w-2.5 h-2.5 mr-1" />Pending</Badge>;
  if (s === "rejected")
    return <Badge variant="destructive" className="text-xs">Rejected</Badge>;
  return <Badge variant="outline" className="text-xs">{status || "—"}</Badge>;
}

function getTypeIcon(type: string) {
  switch (type) {
    case "photo":     return <Camera className="w-3 h-3" />;
    case "signature": return <FileSignature className="w-3 h-3" />;
    case "drawing":   return <Pencil className="w-3 h-3" />;
    default:          return <ImageIcon className="w-3 h-3" />;
  }
}

function formatPhase(phase: string) {
  return phase.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Photo card with lazy Drive image loading ─────────────────────────────────

function PhotoCard({
  photo,
  onFullscreen,
}: {
  photo: PhotoRecord;
  onFullscreen: (photo: PhotoRecord, fileId: string) => void;
}) {
  const { data: resolved } = useQuery<{ photoId: string; fileId: string } | null>({
    queryKey: ["photo-resolve", photo.photoId],
    queryFn: async () => {
      if (!photo.photoId) return null;
      const r = await fetch(`${BASE_URL}api/photos/resolve/${photo.photoId}`);
      if (!r.ok) return null;
      return r.json() as Promise<{ photoId: string; fileId: string }>;
    },
    staleTime: Infinity,
    retry: false,
    enabled: !!photo.photoId && !!photo.filePath,
  });

  const imageUrl = resolved?.fileId ? `${BASE_URL}api/drive/image/${resolved.fileId}` : null;

  return (
    <Card
      className={`overflow-hidden group transition-all duration-200 ${imageUrl ? "cursor-pointer hover:shadow-lg hover:ring-2 hover:ring-primary/30 hover:-translate-y-0.5" : ""}`}
      onClick={() => imageUrl && resolved?.fileId && onFullscreen(photo, resolved.fileId)}
    >
      {/* Image area */}
      <div className="aspect-[4/3] bg-muted flex items-center justify-center relative overflow-hidden">
        {imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt={photo.label || photo.photoId}
              className="object-cover w-full h-full transition-transform duration-200 group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
              <ZoomIn className="w-8 h-8 text-white drop-shadow-lg" />
            </div>
          </>
        ) : photo.filePath ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground/50">
            <div className="animate-pulse">
              <ImageIcon className="w-8 h-8" />
            </div>
            <span className="text-xs">Loading…</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground/30">
            <ImageIcon className="w-8 h-8" />
            <span className="text-xs">No image</span>
          </div>
        )}

        {/* Type badge */}
        <div className="absolute top-1.5 left-1.5">
          <div className="bg-black/50 text-white rounded px-1.5 py-0.5 flex items-center gap-1 text-xs backdrop-blur-sm">
            {getTypeIcon(photo.type)}
            <span className="capitalize">{photo.type}</span>
          </div>
        </div>
      </div>

      <CardContent className="p-3 space-y-2">
        {/* Label */}
        <p className="text-xs font-medium leading-snug line-clamp-2" title={photo.label}>
          {photo.label || <span className="text-muted-foreground italic">No label</span>}
        </p>

        {/* Status row */}
        <div className="flex items-center justify-between gap-1 flex-wrap">
          {getStatusBadge(photo.status, photo.approval)}
          {photo.reqImgType && (
            <span className="text-xs font-mono text-muted-foreground">{photo.reqImgType}</span>
          )}
        </div>

        {/* Meta */}
        {(photo.createdBy || photo.response) && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            {photo.createdBy && <div className="truncate">{photo.createdBy.replace(/@.*/, "")}</div>}
            {photo.response && <div className="truncate text-blue-600">→ {photo.response}</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Fullscreen viewer ────────────────────────────────────────────────────────

function FullscreenViewer({
  photo,
  fileId,
  onClose,
}: {
  photo: PhotoRecord;
  fileId: string;
  onClose: () => void;
}) {
  const imageUrl = `${BASE_URL}api/drive/image/${fileId}`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col"
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="flex items-start justify-between p-4 text-white flex-shrink-0"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex-1 min-w-0 mr-4">
          <p className="font-semibold text-sm leading-snug">{photo.label || photo.photoId}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-white/60 flex-wrap">
            <span>{photo.tower}</span>
            {photo.string && <><span>·</span><span>{photo.string}</span></>}
            {photo.phase && <><span>·</span><span className="truncate max-w-[200px]">{formatPhase(photo.phase)}</span></>}
            {photo.createdAt && <><span>·</span><span>{photo.createdAt.split(" ")[0]}</span></>}
          </div>
          {photo.comments && (
            <p className="text-xs text-white/50 mt-1 italic">{photo.comments}</p>
          )}
        </div>
        <button
          className="rounded-full bg-white/10 hover:bg-white/20 p-2 transition-colors flex-shrink-0"
          onClick={onClose}
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Image */}
      <div className="flex-1 flex items-center justify-center overflow-hidden px-4 pb-4" onClick={e => e.stopPropagation()}>
        <img
          src={imageUrl}
          alt={photo.label || photo.photoId}
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
        />
      </div>
    </div>
  );
}

// ─── Phase section ────────────────────────────────────────────────────────────

function PhaseSection({
  phase,
  photos,
  onFullscreen,
}: {
  phase: string;
  photos: PhotoRecord[];
  onFullscreen: (photo: PhotoRecord, fileId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="space-y-3">
      <button
        className="flex items-center gap-2 w-full text-left group"
        onClick={() => setExpanded(e => !e)}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <span className="font-semibold text-sm">{formatPhase(phase)}</span>
        <Badge variant="secondary" className="text-xs ml-1">{photos.length}</Badge>
      </button>

      {expanded && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 pl-6">
          {photos.map(p => (
            <PhotoCard key={p.photoId || `${p.tower}-${p.string}-${p.label}`} photo={p} onFullscreen={onFullscreen} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── String section ───────────────────────────────────────────────────────────

function StringSection({
  stringName,
  photos,
  onFullscreen,
}: {
  stringName: string;
  photos: PhotoRecord[];
  onFullscreen: (photo: PhotoRecord, fileId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  // Group by phase
  const byPhase = new Map<string, PhotoRecord[]>();
  for (const p of photos) {
    const key = p.phase || "Uncategorised";
    if (!byPhase.has(key)) byPhase.set(key, []);
    byPhase.get(key)!.push(p);
  }

  // Sort phases by phaseOrder then name
  const sortedPhases = [...byPhase.entries()].sort(([ka, va], [kb, vb]) => {
    const oa = Number(va[0]?.phaseOrder) || 999;
    const ob = Number(vb[0]?.phaseOrder) || 999;
    return oa !== ob ? oa - ob : ka.localeCompare(kb);
  });

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="flex items-center gap-3 w-full p-4 bg-muted/50 hover:bg-muted text-left transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
        <Wind className="w-4 h-4 text-blue-500 flex-shrink-0" />
        <span className="font-semibold">{stringName}</span>
        <Badge variant="outline" className="ml-1 text-xs">{photos.length} photos</Badge>
        <span className="text-xs text-muted-foreground ml-auto">{sortedPhases.length} phase{sortedPhases.length !== 1 ? "s" : ""}</span>
      </button>

      {expanded && (
        <div className="p-4 space-y-6 divide-y divide-border">
          {sortedPhases.map(([phase, phasePhotos]) => (
            <div key={phase} className="pt-4 first:pt-0">
              <PhaseSection phase={phase} photos={phasePhotos} onFullscreen={onFullscreen} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DrivePhotos() {
  const [selectedTower, setSelectedTower] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [fullscreen, setFullscreen] = useState<{ photo: PhotoRecord; fileId: string } | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery<SheetResponse>({
    queryKey: ["photos-sheet"],
    queryFn: async () => {
      const r = await fetch(`${BASE_URL}api/photos/sheet`);
      if (!r.ok) {
        const body = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      return r.json() as Promise<SheetResponse>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const handleFullscreen = useCallback((photo: PhotoRecord, fileId: string) => {
    setFullscreen({ photo, fileId });
  }, []);

  const handleClearCache = async () => {
    await fetch(`${BASE_URL}api/photos/cache-clear`, { method: "POST" });
    refetch();
  };

  // Filter photos
  const allPhotos = data?.photos ?? [];
  let filtered = allPhotos;
  if (selectedTower) filtered = filtered.filter(p => p.tower === selectedTower);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(p =>
      p.label.toLowerCase().includes(q) ||
      p.reqImgType.toLowerCase().includes(q) ||
      p.phase.toLowerCase().includes(q) ||
      p.string.toLowerCase().includes(q) ||
      p.tower.toLowerCase().includes(q) ||
      p.photoId.toLowerCase().includes(q)
    );
  }

  // Group by string then phase
  const byString = new Map<string, PhotoRecord[]>();
  for (const p of filtered) {
    const key = p.string || "Unknown String";
    if (!byString.has(key)) byString.set(key, []);
    byString.get(key)!.push(p);
  }
  const sortedStrings = [...byString.entries()].sort(([a], [b]) => a.localeCompare(b));

  const towers = data?.meta.towers ?? [];

  // Stats
  const photoCount = filtered.filter(p => p.type === "photo").length;
  const sigCount   = filtered.filter(p => p.type === "signature").length;

  return (
    <>
      {fullscreen && (
        <FullscreenViewer
          photo={fullscreen.photo}
          fileId={fullscreen.fileId}
          onClose={() => setFullscreen(null)}
        />
      )}

      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Drive Photos</h1>
            <p className="text-muted-foreground mt-1">
              Photos from the CVOW SmartBuild spreadsheet, served directly from Google Drive.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearCache}
            disabled={isFetching}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>

        {/* Stats */}
        {!isLoading && data && (
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span><strong className="text-foreground">{filtered.length}</strong> records</span>
            <span><strong className="text-foreground">{photoCount}</strong> photos</span>
            <span><strong className="text-foreground">{sigCount}</strong> signatures</span>
            <span><strong className="text-foreground">{towers.length}</strong> towers</span>
          </div>
        )}

        {/* Tower filter */}
        {!isLoading && towers.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground font-medium">Tower:</span>
            <Button
              size="sm"
              variant={selectedTower === null ? "default" : "outline"}
              onClick={() => setSelectedTower(null)}
              className="h-7 text-xs"
            >
              All ({towers.length})
            </Button>
            {towers.map(t => (
              <Button
                key={t}
                size="sm"
                variant={selectedTower === t ? "default" : "outline"}
                onClick={() => setSelectedTower(t)}
                className="h-7 text-xs"
              >
                {t}
              </Button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9"
            placeholder="Search by label, type, phase…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchQuery("")}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-[4/3] rounded-lg" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <Card className="border-destructive bg-destructive/5">
            <CardContent className="pt-6 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
              <div>
                <p className="font-semibold text-destructive">Failed to load photos</p>
                <p className="text-sm text-muted-foreground mt-0.5">{String(error)}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty */}
        {!isLoading && !error && filtered.length === 0 && (
          <Card className="border-dashed bg-muted/30">
            <CardContent className="pt-10 pb-10 flex flex-col items-center text-center gap-3">
              <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
              <div>
                <p className="font-semibold">No photos found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {searchQuery || selectedTower ? "Try adjusting your filters." : "No photo records in the spreadsheet."}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Content */}
        {!isLoading && !error && sortedStrings.length > 0 && (
          <div className="space-y-4">
            {sortedStrings.map(([stringName, photos]) => (
              <StringSection
                key={stringName}
                stringName={stringName}
                photos={photos}
                onFullscreen={handleFullscreen}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
