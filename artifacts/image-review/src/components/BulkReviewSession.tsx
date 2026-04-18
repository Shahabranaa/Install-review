import { useState, useEffect, useRef, useCallback } from "react";
import { CheckCircle2, AlertTriangle, ChevronRight, ChevronLeft, X, Clock, SkipForward, Loader2, ImageOff } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "") + "/";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BulkSessionPhoto {
  photoId: string;
  label?: string | null;
  reqImgType?: string | null;
  locationLink?: string | null;
  cableLink?: string | null;
}

interface BulkReviewSessionProps {
  photos: BulkSessionPhoto[];
  contextLabel: string;
  onClose: () => void;
  onDecision: (photoId: string, approval: string) => void;
}

type Decision = "Approved" | "Rejected";

interface ResolvedUrl {
  url: string | null;
  loading: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEta(ms: number): string {
  if (ms <= 0) return "< 1m";
  const totalSeconds = Math.ceil(ms / 1000);
  if (totalSeconds < 60) return `~${totalSeconds}s`;
  const mins = Math.ceil(totalSeconds / 60);
  if (mins < 60) return `~${mins}m`;
  return `~${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BulkReviewSession({
  photos,
  contextLabel,
  onClose,
  onDecision,
}: BulkReviewSessionProps) {
  const [index, setIndex] = useState(0);
  const [decisions, setDecisions] = useState<Map<string, Decision>>(new Map());
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [sessionDone, setSessionDone] = useState(false);
  const [resolvedUrls, setResolvedUrls] = useState<Map<string, ResolvedUrl>>(new Map());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [decisionTimestamps, setDecisionTimestamps] = useState<number[]>([]);
  const startTimeRef = useRef(Date.now());
  const preloadedRef = useRef<Set<string>>(new Set());

  const total = photos.length;
  const reviewed = decisions.size;
  // Use a unified processed set so a photo can't be counted in both decisions AND skipped
  const processedIds = new Set([...decisions.keys(), ...skipped]);
  const skippedCount = skipped.size; // summary: net skipped (decisions already removed from skipped)
  const approvedCount = [...decisions.values()].filter(d => d === "Approved").length;
  const rejectedCount = [...decisions.values()].filter(d => d === "Rejected").length;

  // ── ETA calculation ──────────────────────────────────────────────────────
  const avgMs = decisionTimestamps.length >= 2
    ? (decisionTimestamps[decisionTimestamps.length - 1] - decisionTimestamps[0]) / (decisionTimestamps.length - 1)
    : null;
  const remaining = total - processedIds.size;
  const etaMs = avgMs !== null && remaining > 0 ? avgMs * remaining : null;

  // ── URL resolution ───────────────────────────────────────────────────────
  const resolveUrl = useCallback(async (photoId: string) => {
    if (preloadedRef.current.has(photoId)) return;
    preloadedRef.current.add(photoId);

    setResolvedUrls(prev => {
      const next = new Map(prev);
      next.set(photoId, { url: null, loading: true });
      return next;
    });

    try {
      const r = await fetch(`${BASE_URL}api/photos/resolve/${photoId}`);
      if (!r.ok) throw new Error();
      const data = await r.json() as { photoId: string; fileId: string | null; wasabiUrl: string | null; notMigrated?: boolean };
      const url = data.wasabiUrl
        ? `${BASE_URL.replace(/\/$/, "")}${data.wasabiUrl}`
        : data.fileId && !data.notMigrated
        ? `${BASE_URL}api/drive/image/${data.fileId}`
        : null;
      setResolvedUrls(prev => new Map([...prev, [photoId, { url, loading: false }]]));
    } catch {
      setResolvedUrls(prev => new Map([...prev, [photoId, { url: null, loading: false }]]));
    }
  }, []);

  // Preload current + next 2 photos
  useEffect(() => {
    for (let i = index; i < Math.min(index + 3, photos.length); i++) {
      const p = photos[i];
      if (p?.photoId) resolveUrl(p.photoId);
    }
  }, [index, photos, resolveUrl]);

  // ── Decision handler ──────────────────────────────────────────────────────
  const makeDecision = useCallback(async (photoId: string, approval: Decision) => {
    setDecisions(prev => new Map([...prev, [photoId, approval]]));
    // Deciding a photo removes it from the skip set (decision takes precedence)
    setSkipped(prev => { const s = new Set(prev); s.delete(photoId); return s; });
    setDecisionTimestamps(prev => [...prev, Date.now()]);
    onDecision(photoId, approval);
    setSaveError(null);
    setSaving(prev => new Set([...prev, photoId]));

    try {
      const r = await fetch(`${BASE_URL}api/photos/db/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approval, status: approval }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({})) as { error?: string };
        setSaveError(body.error ?? `Save failed for ${photoId}`);
      }
    } catch {
      setSaveError(`Network error saving ${photoId}`);
    } finally {
      setSaving(prev => { const s = new Set(prev); s.delete(photoId); return s; });
    }
  }, [onDecision]);

  const skipPhoto = useCallback((photoId: string) => {
    setSkipped(prev => new Set([...prev, photoId]));
  }, []);

  // Advance to next undecided+unskipped photo
  const advance = useCallback((direction: 1 | -1 = 1) => {
    setIndex(prev => {
      let next = prev + direction;
      if (direction === 1) {
        while (next < photos.length) {
          const p = photos[next];
          if (p && !decisions.has(p.photoId) && !skipped.has(p.photoId)) return next;
          next++;
        }
        // All done
        setSessionDone(true);
        return prev;
      } else {
        while (next >= 0) {
          const p = photos[next];
          if (p) return next;
          next--;
        }
        return prev;
      }
    });
  }, [photos, decisions, skipped]);

  // ── Keyboard handler ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (sessionDone) {
        if (e.key === "Escape") onClose();
        return;
      }
      const photo = photos[index];
      if (!photo) return;

      switch (e.key) {
        case "a":
        case "A":
          e.preventDefault();
          makeDecision(photo.photoId, "Approved").then(() => advance(1));
          break;
        case "r":
        case "R":
          e.preventDefault();
          makeDecision(photo.photoId, "Rejected").then(() => advance(1));
          break;
        case "ArrowRight":
        case " ":
          e.preventDefault();
          skipPhoto(photo.photoId);
          advance(1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          advance(-1);
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sessionDone, index, photos, makeDecision, skipPhoto, advance, onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Check if session is done — use processedIds (deduped) to avoid premature completion
  useEffect(() => {
    if (photos.length > 0 && processedIds.size >= photos.length) {
      setSessionDone(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisions.size, skipped.size, photos.length]);

  const currentPhoto = photos[index];
  const currentResolved = currentPhoto ? resolvedUrls.get(currentPhoto.photoId) : null;
  const currentDecision = currentPhoto ? decisions.get(currentPhoto.photoId) : undefined;
  const isCurrentSkipped = currentPhoto ? skipped.has(currentPhoto.photoId) : false;
  const pct = total > 0 ? Math.round((reviewed / total) * 100) : 0;

  // ── Summary screen ────────────────────────────────────────────────────────
  if (sessionDone) {
    const elapsed = Date.now() - startTimeRef.current;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    const elapsedStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    return (
      <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col items-center justify-center p-8">
        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-8 max-w-md w-full space-y-6 shadow-2xl">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-full bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Review Session Complete</h2>
            <p className="text-sm text-white/50">{contextLabel}</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-4 text-center">
              <p className="text-2xl font-bold text-green-400">{approvedCount}</p>
              <p className="text-xs text-white/50 mt-1">Approved</p>
            </div>
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-center">
              <p className="text-2xl font-bold text-red-400">{rejectedCount}</p>
              <p className="text-xs text-white/50 mt-1">Rejected</p>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-center">
              <p className="text-2xl font-bold text-white/60">{skippedCount}</p>
              <p className="text-xs text-white/50 mt-1">Skipped</p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-white/30">
            <Clock className="w-3.5 h-3.5" />
            <span>Session took {elapsedStr}</span>
          </div>

          <button
            onClick={onClose}
            className="w-full rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold py-3 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  if (!currentPhoto) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-white/10 flex-shrink-0">
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-white/40">
            <span>{contextLabel}</span>
            <div className="flex items-center gap-3">
              {etaMs !== null && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatEta(etaMs)} remaining
                </span>
              )}
              <span className="tabular-nums">{reviewed} of {total} reviewed</span>
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 rounded-full bg-white/10 hover:bg-white/20 p-2 transition-colors"
          title="Exit session (Esc)"
        >
          <X className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* ── Main area ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Image */}
        <div className="flex-1 flex items-center justify-center p-6 relative overflow-hidden bg-black/60">
          {/* Nav arrows */}
          {index > 0 && (
            <button
              onClick={() => advance(-1)}
              className="absolute left-4 z-10 rounded-full bg-white/10 hover:bg-white/20 p-3 transition-colors"
              title="Previous (←)"
            >
              <ChevronLeft className="w-6 h-6 text-white" />
            </button>
          )}

          {currentResolved?.loading ? (
            <div className="flex flex-col items-center gap-3 text-white/30">
              <Loader2 className="w-10 h-10 animate-spin" />
              <span className="text-sm">Loading image…</span>
            </div>
          ) : currentResolved?.url ? (
            <img
              key={currentPhoto.photoId}
              src={currentResolved.url}
              alt={currentPhoto.label ?? currentPhoto.photoId}
              className="max-w-full max-h-full object-contain rounded-sm shadow-2xl"
              loading="eager"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-white/30">
              <ImageOff className="w-14 h-14" />
              <span className="text-sm">Image not available</span>
            </div>
          )}

          {/* Decision overlay if already decided */}
          {(currentDecision || isCurrentSkipped) && (
            <div className={`absolute inset-0 flex items-center justify-center pointer-events-none ${
              currentDecision === "Approved" ? "bg-green-500/20"
              : currentDecision === "Rejected" ? "bg-red-500/20"
              : "bg-white/5"
            }`}>
              <div className={`rounded-full p-4 ${
                currentDecision === "Approved" ? "bg-green-500/40"
                : currentDecision === "Rejected" ? "bg-red-500/40"
                : "bg-white/10"
              }`}>
                {currentDecision === "Approved" && <CheckCircle2 className="w-16 h-16 text-green-300" />}
                {currentDecision === "Rejected" && <AlertTriangle className="w-16 h-16 text-red-300" />}
                {isCurrentSkipped && !currentDecision && <SkipForward className="w-16 h-16 text-white/50" />}
              </div>
            </div>
          )}

          {/* Next arrow */}
          {index < photos.length - 1 && (
            <button
              onClick={() => advance(1)}
              className="absolute right-4 z-10 rounded-full bg-white/10 hover:bg-white/20 p-3 transition-colors"
              title="Skip / Next (→)"
            >
              <ChevronRight className="w-6 h-6 text-white" />
            </button>
          )}
        </div>

        {/* Right panel */}
        <div className="w-72 flex-shrink-0 bg-zinc-950 border-l border-white/10 flex flex-col">
          {/* Photo metadata */}
          <div className="p-5 border-b border-white/10 space-y-2 flex-shrink-0">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">
              Photo {index + 1} of {total}
            </p>
            <p className="text-sm text-white font-medium leading-snug line-clamp-3">
              {currentPhoto.label || currentPhoto.photoId}
            </p>
            {currentPhoto.reqImgType && (
              <p className="text-xs text-white/40 font-mono">{currentPhoto.reqImgType}</p>
            )}
            {currentPhoto.cableLink && (
              <p className="text-xs text-white/30">{currentPhoto.cableLink}</p>
            )}
          </div>

          {/* Decision buttons */}
          <div className="p-5 space-y-3 flex-1">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Decision</p>
            <button
              onClick={async () => { await makeDecision(currentPhoto.photoId, "Approved"); advance(1); }}
              disabled={saving.has(currentPhoto.photoId)}
              className={`w-full flex items-center justify-center gap-2.5 rounded-xl border-2 py-3 text-sm font-semibold transition-all ${
                currentDecision === "Approved"
                  ? "border-green-500 bg-green-500/20 text-green-300"
                  : "border-white/10 bg-white/5 text-white/60 hover:border-green-500/50 hover:bg-green-500/10 hover:text-green-300"
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              Approve
              <kbd className="ml-auto text-[10px] rounded bg-white/10 px-1.5 py-0.5 font-mono text-white/30">A</kbd>
            </button>

            <button
              onClick={async () => { await makeDecision(currentPhoto.photoId, "Rejected"); advance(1); }}
              disabled={saving.has(currentPhoto.photoId)}
              className={`w-full flex items-center justify-center gap-2.5 rounded-xl border-2 py-3 text-sm font-semibold transition-all ${
                currentDecision === "Rejected"
                  ? "border-red-500 bg-red-500/20 text-red-300"
                  : "border-white/10 bg-white/5 text-white/60 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              Reject
              <kbd className="ml-auto text-[10px] rounded bg-white/10 px-1.5 py-0.5 font-mono text-white/30">R</kbd>
            </button>

            <button
              onClick={() => { skipPhoto(currentPhoto.photoId); advance(1); }}
              disabled={saving.has(currentPhoto.photoId)}
              className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-white/10 py-2.5 text-sm text-white/40 hover:text-white/60 hover:border-white/20 transition-all"
            >
              <SkipForward className="w-4 h-4" />
              Skip
              <kbd className="ml-auto text-[10px] rounded bg-white/10 px-1.5 py-0.5 font-mono text-white/30">→</kbd>
            </button>

            {saveError && (
              <p className="text-xs text-red-400 text-center">{saveError}</p>
            )}

            {saving.size > 0 && (
              <p className="text-xs text-white/30 text-center flex items-center justify-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Saving…
              </p>
            )}
          </div>

          {/* Keyboard hints */}
          <div className="px-5 pb-5 pt-2 border-t border-white/10 space-y-1 flex-shrink-0">
            <p className="text-[10px] text-white/20 uppercase tracking-wider font-semibold mb-2">Shortcuts</p>
            {[
              ["A", "Approve"],
              ["R", "Reject"],
              ["→ / Space", "Skip"],
              ["←", "Go back"],
              ["Esc", "Exit session"],
            ].map(([key, action]) => (
              <div key={key} className="flex items-center justify-between text-[10px] text-white/25">
                <span>{action}</span>
                <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono">{key}</kbd>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
