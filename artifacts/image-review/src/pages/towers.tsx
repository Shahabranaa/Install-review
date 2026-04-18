import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSearch } from "wouter";
import { useListStrings, useListTowers, useListLocations } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Wind, Search, Camera, FileText, X, ChevronLeft, ChevronRight,
  ArrowLeft, ZoomIn, ExternalLink, ImageOff, EyeOff, Eye, Cable,
  Package, Loader2, Flag, CheckCheck,
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
  photoUpload: string | null;
  imageAvailable: boolean | null;
}

function classifyPhoto(photoUpload: string | null): "stamped" | "original" {
  if (!photoUpload) return "original";
  if (photoUpload.includes("Photo_Images_2_Stamped")) return "stamped";
  return "original";
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

type FolderTab = "original" | "stamped" | "reports" | "issues";

interface TowerIssue { id: number; type: string; severity: string; description: string; raisedBy?: string | null; resolved: boolean; resolvedBy?: string | null; resolvedAt?: string | null; createdAt: string; photoId?: string | null; }

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
  const [activeTab, setActiveTab] = useState<FolderTab>("original");
  const [hideUnavailable, setHideUnavailable] = useState(true);
  const [selectedCable, setSelectedCable] = useState<string>("all");
  const [compliance, setCompliance] = useState<{ actual: number; expected: number; pct: number } | null>(null);
  const [towerIssues, setTowerIssues] = useState<TowerIssue[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${BASE_URL}api/photos/compliance?tower=${encodeURIComponent(tower.name)}`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: { towers?: { actual: number; expected: number; pct: number }[] } | null) => {
        if (data?.towers?.[0]) setCompliance(data.towers[0]);
      })
      .catch(() => {});
  }, [tower.name]);

  useEffect(() => {
    setLoadingIssues(true);
    fetch(`${BASE_URL}api/issues?tower=${encodeURIComponent(tower.name)}`)
      .then(r => (r.ok ? r.json() : []))
      .then((rows: TowerIssue[]) => setTowerIssues(rows))
      .catch(() => setTowerIssues([]))
      .finally(() => setLoadingIssues(false));
  }, [tower.name]);

  const { user } = useAuth();

  const handleResolveIssue = useCallback(async (id: number) => {
    setResolvingId(id);
    try {
      const r = await fetch(`${BASE_URL}api/issues/${id}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolvedBy: user?.displayName ?? null }),
      });
      if (r.ok) {
        setTowerIssues(prev => prev.map(i => i.id === id ? { ...i, resolved: true } : i));
      }
    } catch { /* ignore */ } finally {
      setResolvingId(null);
    }
  }, [user]);

  const photoCount = photoCounts.get(tower.name) ?? 0;
  const selectedString = strings?.find(s => s.id === tower.stringId);

  // Reset to first tab whenever the tower changes
  useEffect(() => {
    setActiveTab("original");
    setShowAllReports(false);
    setHideUnavailable(true);
    setSelectedCable("all");
  }, [tower.name]);

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

  // Apply cable filter to reports (same cable selector used by photos)
  const cableFilteredReports = selectedCable === "all"
    ? towerReports
    : towerReports.filter(r => r.cable === selectedCable || r.cable === null);

  const visibleReports = showAllReports ? cableFilteredReports : cableFilteredReports.slice(0, 8);

  const st = statusStyle(tower.progressStatus);

  // Derive sorted unique cable IDs from loaded photos
  const cableIds = Array.from(
    new Set(photos.map(p => p.cableLink).filter((c): c is string => !!c))
  ).sort();

  const allDisplayPhotos = photos.filter(p => p.photoId);
  const displayPhotos = selectedCable === "all"
    ? allDisplayPhotos
    : allDisplayPhotos.filter(p => p.cableLink === selectedCable);

  // Split into original vs stamped; global index maps to displayPhotos for unified lightbox
  const globalIndexMap = new Map(displayPhotos.map((p, i) => [p.photoId, i]));

  // A photo is confirmed unavailable if:
  // 1. DB pre-computed flag says false (fast, available immediately), OR
  // 2. Runtime resolve settled to null (covers photos not yet scanned)
  const isConfirmedUnavailable = (p: TowerPhoto) => {
    if (p.imageAvailable === false) return true;
    return p.photoId !== null && resolvedUrls.has(p.photoId) && resolvedUrls.get(p.photoId) === null;
  };

  const originalPhotosAll = displayPhotos.filter(p => classifyPhoto(p.photoUpload) === "original");
  const stampedPhotosAll  = displayPhotos.filter(p => classifyPhoto(p.photoUpload) === "stamped");
  const originalPhotos = hideUnavailable
    ? originalPhotosAll.filter(p => !isConfirmedUnavailable(p))
    : originalPhotosAll;
  const stampedPhotos = hideUnavailable
    ? stampedPhotosAll.filter(p => !isConfirmedUnavailable(p))
    : stampedPhotosAll;

  const openIssueCount = towerIssues.filter(i => !i.resolved).length;

  const tabs: { id: FolderTab; label: string; count: number | null; icon: React.ReactNode; badge?: boolean }[] = [
    {
      id: "original",
      label: "Original Images",
      count: loadingPhotos ? null : originalPhotos.length,
      icon: <Camera className="w-3.5 h-3.5" />,
    },
    {
      id: "stamped",
      label: "Stamped Images",
      count: loadingPhotos ? null : stampedPhotos.length,
      icon: <Camera className="w-3.5 h-3.5" />,
    },
    {
      id: "reports",
      label: "Reports",
      count: loadingReports ? null : cableFilteredReports.length,
      icon: <FileText className="w-3.5 h-3.5" />,
    },
    {
      id: "issues",
      label: "Issues",
      count: loadingIssues ? null : towerIssues.length,
      icon: <Flag className="w-3.5 h-3.5" />,
      badge: openIssueCount > 0,
    },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Header ── */}
      <div className="flex items-start gap-4 px-8 pt-6 pb-4 border-b border-border/60 flex-shrink-0">
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
            {compliance && (
              <span
                className={[
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border",
                  compliance.pct === 100
                    ? "bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300"
                    : compliance.pct >= 50
                    ? "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300"
                    : "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300",
                ].join(" ")}
                title={`${compliance.actual} of ${compliance.expected} required image types covered`}
              >
                {compliance.actual}/{compliance.expected} required
              </span>
            )}
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

      {/* ── Cable filter ── only shown when photos span 2+ cables */}
      {!loadingPhotos && cableIds.length >= 2 && (
        <div className="flex flex-wrap items-center gap-1.5 px-8 py-2.5 border-b border-border/40 bg-muted/30 flex-shrink-0">
          <Cable className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-muted-foreground font-medium mr-0.5">Cable:</span>
          <button
            onClick={() => setSelectedCable("all")}
            className={[
              "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors border",
              selectedCable === "all"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground",
            ].join(" ")}
          >
            All
          </button>
          {cableIds.map(cable => (
            <button
              key={cable}
              onClick={() => setSelectedCable(cable)}
              className={[
                "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors border",
                selectedCable === cable
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground",
              ].join(" ")}
            >
              {cable}
            </button>
          ))}
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="flex items-end gap-0 px-8 border-b border-border/60 flex-shrink-0 bg-background">
        {tabs.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap relative",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
              ].join(" ")}
            >
              {tab.icon}
              {tab.label}
              <span
                className={[
                  "inline-flex items-center justify-center rounded-full text-[10px] font-semibold min-w-[18px] h-[18px] px-1",
                  tab.badge
                    ? "bg-amber-500 text-white"
                    : active
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground",
                ].join(" ")}
              >
                {tab.count === null ? "–" : tab.count}
              </span>
            </button>
          );
        })}
        {/* Hide unavailable toggle — only relevant on photo tabs */}
        {activeTab !== "reports" && activeTab !== "issues" && (
          <button
            onClick={() => setHideUnavailable(v => !v)}
            className={[
              "ml-auto mb-1 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors border",
              hideUnavailable
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground",
            ].join(" ")}
          >
            {hideUnavailable ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {hideUnavailable ? "Show all" : "Hide unavailable"}
          </button>
        )}
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto px-8 py-6">

        {/* Original Images tab */}
        {activeTab === "original" && (
          loadingPhotos ? (
            <div className="grid grid-cols-3 gap-0.5">
              {Array.from({ length: Math.min(photoCount || 9, 9) }).map((_, i) => (
                <Skeleton key={i} className="aspect-square w-full rounded-none" />
              ))}
            </div>
          ) : originalPhotos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/40 border border-dashed rounded-xl">
              <Camera className="w-10 h-10 mb-2" />
              <span className="text-sm">No original images for this tower</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-0.5 rounded-sm overflow-hidden">
              {originalPhotos.map(photo => (
                <PhotoTile
                  key={photo.photoId}
                  photo={photo}
                  onResolved={handleResolved}
                  onClick={() => setLightboxIndex(globalIndexMap.get(photo.photoId!) ?? 0)}
                />
              ))}
            </div>
          )
        )}

        {/* Stamped Images tab */}
        {activeTab === "stamped" && (
          loadingPhotos ? (
            <div className="grid grid-cols-3 gap-0.5">
              {Array.from({ length: Math.min(photoCount || 9, 9) }).map((_, i) => (
                <Skeleton key={i} className="aspect-square w-full rounded-none" />
              ))}
            </div>
          ) : stampedPhotos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/40 border border-dashed rounded-xl">
              <Camera className="w-10 h-10 mb-2" />
              <span className="text-sm">No stamped images for this tower</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-0.5 rounded-sm overflow-hidden">
              {stampedPhotos.map(photo => (
                <PhotoTile
                  key={photo.photoId}
                  photo={photo}
                  onResolved={handleResolved}
                  onClick={() => setLightboxIndex(globalIndexMap.get(photo.photoId!) ?? 0)}
                />
              ))}
            </div>
          )
        )}

        {/* Reports tab */}
        {activeTab === "reports" && (
          loadingReports ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
            </div>
          ) : cableFilteredReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/40 border border-dashed rounded-xl">
              <FileText className="w-10 h-10 mb-2" />
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
              {cableFilteredReports.length > 8 && (
                <button
                  onClick={() => setShowAllReports(v => !v)}
                  className="w-full text-xs text-muted-foreground hover:text-foreground py-2 transition-colors"
                >
                  {showAllReports ? "Show less" : `Show all ${cableFilteredReports.length} reports`}
                </button>
              )}
            </div>
          )
        )}
        {/* Issues tab */}
        {activeTab === "issues" && (
          loadingIssues ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
            </div>
          ) : towerIssues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/40 border border-dashed rounded-xl">
              <Flag className="w-10 h-10 mb-2" />
              <span className="text-sm">No issues raised for this tower</span>
              <span className="text-xs mt-1">Open a photo in the Image Review page to raise an issue.</span>
            </div>
          ) : (() => {
            const openIssues = towerIssues.filter(i => !i.resolved);
            const resolvedIssues = towerIssues.filter(i => i.resolved);
            const IssueCard = ({ issue }: { issue: TowerIssue }) => (
              <div
                className={`rounded-lg border px-4 py-3 space-y-1.5 transition-colors ${issue.resolved ? "border-border/40 bg-muted/20 opacity-70" : "border-amber-500/30 bg-amber-500/5"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-semibold uppercase rounded-full px-2 py-0.5 ${
                      issue.severity === "critical" ? "bg-red-100 text-red-700" :
                      issue.severity === "high"     ? "bg-orange-100 text-orange-700" :
                      issue.severity === "medium"   ? "bg-amber-100 text-amber-700" :
                      "bg-slate-100 text-slate-600"
                    }`}>{issue.severity}</span>
                    <span className="text-xs text-muted-foreground capitalize">{issue.type}</span>
                    {issue.photoId && (
                      <span className="text-[10px] font-mono text-muted-foreground/60">{issue.photoId}</span>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {issue.resolved ? (
                      <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                        <CheckCheck className="w-3.5 h-3.5" />Resolved
                      </span>
                    ) : (
                      <button
                        onClick={() => handleResolveIssue(issue.id)}
                        disabled={resolvingId === issue.id}
                        className="text-xs text-green-600 hover:text-green-700 font-medium transition-colors border border-green-200 rounded-full px-2.5 py-0.5 hover:bg-green-50"
                      >
                        {resolvingId === issue.id ? "…" : "Resolve"}
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-foreground/80 leading-snug">{issue.description}</p>
                <p className="text-[10px] text-muted-foreground/50">
                  {new Date(issue.createdAt).toLocaleDateString()}
                  {issue.raisedBy && ` · Raised by ${issue.raisedBy}`}
                  {issue.resolved && issue.resolvedBy && (
                    <span className="ml-2 text-green-600/70">
                      · Resolved by {issue.resolvedBy}
                      {issue.resolvedAt && ` on ${new Date(issue.resolvedAt).toLocaleDateString()}`}
                    </span>
                  )}
                </p>
              </div>
            );
            return (
              <div className="space-y-6">
                {openIssues.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/40 border border-dashed rounded-xl">
                    <CheckCheck className="w-8 h-8 mb-2 text-green-500/40" />
                    <span className="text-sm">All issues resolved</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 flex items-center gap-1.5">
                      <Flag className="w-3.5 h-3.5" />
                      Open ({openIssues.length})
                    </p>
                    {openIssues.map(issue => <IssueCard key={issue.id} issue={issue} />)}
                  </div>
                )}
                {resolvedIssues.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-green-600 flex items-center gap-1.5">
                      <CheckCheck className="w-3.5 h-3.5" />
                      Resolved ({resolvedIssues.length})
                    </p>
                    {resolvedIssues.map(issue => <IssueCard key={issue.id} issue={issue} />)}
                  </div>
                )}
              </div>
            );
          })()
        )}
      </div>

      {/* Lightbox — unified across all photos regardless of active tab */}
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
  const initialTowerName = params.get("tower") ?? undefined;

  const [selectedStringId, setSelectedStringId] = useState<number | undefined>(initialStringId);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOspId, setSelectedOspId] = useState<number | undefined>(undefined);
  const [selectedTower, setSelectedTower] = useState<TowerRecord | null>(null);
  const [generating, setGenerating] = useState(false);
  const [lastPack, setLastPack] = useState<{ docId: number | null; stringName: string } | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    const id = params.get("stringId") ? parseInt(params.get("stringId")!) : undefined;
    setSelectedStringId(id);
    setLastPack(null);
  }, [search]);

  const { data: locations } = useListLocations();
  const ospLocations = locations?.filter((l) => l.type === "OSP") ?? [];

  const { data: strings, isLoading: strLoading } = useListStrings(
    selectedOspId ? { locationId: selectedOspId } : undefined,
  );

  const { data: towers, isLoading: towerLoading } = useListTowers(
    selectedStringId ? { stringId: selectedStringId }
    : selectedOspId  ? { locationId: selectedOspId }
    : undefined,
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

  // Auto-select tower from ?tower=<name> URL param
  useEffect(() => {
    if (!initialTowerName || selectedTower || !towers) return;
    const match = towers.find(t => t.name === initialTowerName);
    if (match) {
      setSelectedTower(match);
      ensureReports();
    }
  }, [towers, initialTowerName]);

  const handleTowerClick = (tower: TowerRecord) => {
    setSelectedTower(tower);
    ensureReports();
  };

  // ── Generate handover pack for the currently selected string ──────────────
  const selectedString = strings?.find(s => s.id === selectedStringId);

  const generateHandoverPack = useCallback(async () => {
    if (!selectedString) return;
    setGenerating(true);
    setLastPack(null);
    try {
      const resp = await fetch(`${BASE_URL}api/documents/generate-handover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stringId: selectedString.id, stringName: selectedString.name }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? `HTTP ${resp.status}`);
      }
      // If Wasabi is not configured the server sends the PDF directly as a download
      const ct = resp.headers.get("content-type") ?? "";
      if (ct.includes("application/pdf")) {
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${selectedString.name}-handover.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        // Non-Wasabi path: PDF sent directly, no docId available
        setLastPack(null);
        toast({ title: "Handover pack downloaded", description: `String ${selectedString.name}` });
      } else {
        const data = await resp.json();
        setLastPack({ docId: data.id ?? null, stringName: selectedString.name });
        toast({ title: "Handover pack generated", description: `String ${selectedString.name} — saved to Wasabi.` });
      }
    } catch (err: unknown) {
      toast({
        title: "Generation failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }, [selectedString, toast]);

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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Towers</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {selectedString
              ? `String ${selectedString.name}`
              : "Offshore wind turbine locations"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
          {selectedString && (
            <Button
              variant="outline"
              size="sm"
              onClick={generateHandoverPack}
              disabled={generating}
              className="gap-1.5"
            >
              {generating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Package className="w-3.5 h-3.5" />
              )}
              {generating ? "Generating…" : "Generate Handover Pack"}
            </Button>
          )}
          {lastPack && lastPack.stringName === selectedString?.name && lastPack.docId && (
            <Button
              variant="default"
              size="sm"
              className="gap-1.5"
              onClick={() => window.open(`${BASE_URL}api/documents/${lastPack.docId}/download`, "_blank")}
            >
              <FileText className="w-3.5 h-3.5" />
              View Pack
            </Button>
          )}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Wind className="w-4 h-4" />
            <span>{filteredTowers.length} towers</span>
          </div>
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
                {tower.connectedTo && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70 font-medium">
                    <Cable className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{tower.connectedTo}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
