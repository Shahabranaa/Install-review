import { useState, useCallback, useEffect, useContext, createContext, useRef } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import ReactCrop, { type Crop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
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
  MapPin,
  User,
  Calendar,
  Hash,
  Network,
  Activity,
  FileText,
  MessageSquare,
  ClipboardCheck,
} from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "") + "/";

// ─── Review overrides context ─────────────────────────────────────────────────
// Maps photoId → override approval string so cards update immediately after review
const ReviewOverridesContext = createContext<Map<string, string>>(new Map());

// ─── Types ────────────────────────────────────────────────────────────────────

interface PhotoRecord {
  photoId: string;
  photoUpload: string;
  resizedPhoto: string;
  signatureCapture: string;
  drawingMarkup: string;
  type: "photo" | "signature" | "drawing" | "unknown";
  filePath: string;
  cableLink: string;
  cableSide: string;
  locationLink: string;
  photoType: string;
  phaseLink: string;
  phaseOrder: string;
  photoString: string;
  reqImgType: string;
  reqImgOrder: string;
  photoResponse: string;
  dataCaptureResponse: string;
  comments: string;
  terminationCompletedBy: string;
  continuingNotes: string;
  previousResponseImport: string;
  approval: string;
  status: string;
  reviewDetails: string;
  label: string;
  parentControl: string;
  parent: string;
  creationDateTime: string;
  creationDate: string;
  creationUser: string;
  creationLocation: string;
  editCount: string;
  editDateTime: string;
  editDate: string;
  editUser: string;
  editLocation: string;
  updateFlag: string;
  automationTrigger: string;
  formType: string;
  testFlag: string;
  temp: string;
  temp2: string;
  temp3: string;
  temp4: string;
  resizedChecked: string;
}

interface SheetResponse {
  photos: PhotoRecord[];
  meta: { total: number; towers: string[]; strings: string[]; phases: string[] };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusBadge(status: string, approval: string) {
  const a = (approval ?? "").toLowerCase();
  const s = (status ?? "").toLowerCase();
  if (a === "approved" || a === "checked" || a === "verified")
    return <Badge className="bg-green-600 text-white text-xs"><CheckCircle2 className="w-2.5 h-2.5 mr-1" />Approved</Badge>;
  if (a === "rejected" || s === "rejected")
    return <Badge variant="destructive" className="text-xs"><AlertTriangle className="w-2.5 h-2.5 mr-1" />Rejected</Badge>;
  if (s === "pending" || a === "unchecked" || !a)
    return <Badge className="bg-amber-500 text-white text-xs"><Clock className="w-2.5 h-2.5 mr-1" />Pending</Badge>;
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

function MetaRow({ label, value, icon }: { label: string; value?: string | null; icon?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-xs">
      {icon && <span className="text-muted-foreground mt-0.5 flex-shrink-0 w-3.5">{icon}</span>}
      <div className="flex-1 min-w-0">
        <span className="text-muted-foreground">{label}: </span>
        <span className="text-foreground break-words">{value}</span>
      </div>
    </div>
  );
}

function MetaSection({ title, children }: { title: string; children: React.ReactNode }) {
  const hasContent = Boolean(children);
  if (!hasContent) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

// ─── Photo card ───────────────────────────────────────────────────────────────

function PhotoCard({
  photo,
  onOpen,
}: {
  photo: PhotoRecord;
  onOpen: (photo: PhotoRecord, fileId: string) => void;
}) {
  const reviewOverrides = useContext(ReviewOverridesContext);
  const effectiveApproval = reviewOverrides.get(photo.photoId) ?? photo.approval;

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
      onClick={() => imageUrl && resolved?.fileId && onOpen(photo, resolved.fileId)}
    >
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
          <div className="flex flex-col items-center gap-2 text-muted-foreground/50 animate-pulse">
            <ImageIcon className="w-8 h-8" />
            <span className="text-xs">Loading…</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground/30">
            <ImageIcon className="w-8 h-8" />
            <span className="text-xs">No image</span>
          </div>
        )}
        <div className="absolute top-1.5 left-1.5">
          <div className="bg-black/50 text-white rounded px-1.5 py-0.5 flex items-center gap-1 text-xs backdrop-blur-sm">
            {getTypeIcon(photo.type)}
            <span className="capitalize">{photo.type}</span>
          </div>
        </div>
      </div>
      <CardContent className="p-3 space-y-2">
        <p className="text-xs font-medium leading-snug line-clamp-2" title={photo.label}>
          {photo.label || <span className="text-muted-foreground italic">No label</span>}
        </p>
        <div className="flex items-center justify-between gap-1 flex-wrap">
          {getStatusBadge(photo.status, effectiveApproval)}
          {photo.reqImgType && <span className="text-xs font-mono text-muted-foreground">{photo.reqImgType}</span>}
        </div>
        {(photo.creationUser || photo.photoResponse) && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            {photo.creationUser && <div className="truncate">{photo.creationUser.replace(/@.*/, "")}</div>}
            {photo.photoResponse && <div className="truncate text-blue-600">→ {photo.photoResponse}</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Fullscreen viewer ────────────────────────────────────────────────────────

// ─── DB review data type ──────────────────────────────────────────────────────
interface DbReview {
  approval: string | null;
  reviewComment: string | null;
  cropX: number | null;
  cropY: number | null;
  cropWidth: number | null;
  cropHeight: number | null;
}

function FullscreenViewer({
  photo,
  fileId,
  onClose,
  onReview,
}: {
  photo: PhotoRecord;
  fileId: string;
  onClose: () => void;
  onReview: (photoId: string, approval: string) => void;
}) {
  const imageUrl = `${BASE_URL}api/drive/image/${fileId}`;

  // Review panel state
  const [reviewMode, setReviewMode] = useState(false);
  const [decision, setDecision] = useState<"Approved" | "Rejected" | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [crop, setCrop] = useState<Crop>({ unit: "%", x: 0, y: 0, width: 0, height: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dbReview, setDbReview] = useState<DbReview | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [showCrop, setShowCrop] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);

  // Fetch existing DB review on open
  useEffect(() => {
    if (!photo.photoId) return;
    fetch(`${BASE_URL}api/photos/db/${photo.photoId}`)
      .then(r => (r.ok ? r.json() : null))
      .then((rec: DbReview | null) => { if (rec) setDbReview(rec); })
      .catch(() => {});
  }, [photo.photoId]);

  const applyDbReview = (rec: DbReview) => {
    const a = (rec.approval ?? "").toLowerCase();
    setDecision(a === "approved" ? "Approved" : a === "rejected" ? "Rejected" : null);
    setReviewComment(rec.reviewComment ?? "");
    if (rec.cropWidth != null && rec.cropWidth > 0) {
      setCrop({ unit: "%", x: rec.cropX ?? 0, y: rec.cropY ?? 0, width: rec.cropWidth, height: rec.cropHeight ?? 0 });
    } else {
      setCrop({ unit: "%", x: 0, y: 0, width: 0, height: 0 });
    }
  };

  // When dbReview arrives (async fetch) while review mode is already open, sync the fields
  const [dbReviewApplied, setDbReviewApplied] = useState(false);
  useEffect(() => {
    if (reviewMode && dbReview && !dbReviewApplied) {
      applyDbReview(dbReview);
      setDbReviewApplied(true);
    }
  }, [reviewMode, dbReview, dbReviewApplied]);

  const enterReviewMode = () => {
    if (dbReview) {
      applyDbReview(dbReview);
      setDbReviewApplied(true);
    } else {
      setDbReviewApplied(false);
    }
    setSaved(false);
    setSaveError(null);
    setReviewMode(true);
  };

  const handleSubmit = async () => {
    if (!decision) return;
    setSaveError(null);
    setSubmitting(true);
    try {
      const body: Record<string, string | number | null> = {
        approval: decision,
        status: decision,
        reviewComment: reviewComment.trim() || null,
        cropX: crop.width > 0 ? crop.x : null,
        cropY: crop.width > 0 ? crop.y : null,
        cropWidth: crop.width > 0 ? crop.width : null,
        cropHeight: crop.width > 0 ? crop.height : null,
      };
      const r = await fetch(`${BASE_URL}api/photos/db/${photo.photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setSaveError(null);
      if (r.ok) {
        setSaved(true);
        setDbReview({ approval: decision, reviewComment: reviewComment.trim() || null, cropX: body.cropX as number | null, cropY: body.cropY as number | null, cropWidth: body.cropWidth as number | null, cropHeight: body.cropHeight as number | null });
        onReview(photo.photoId, decision);
        setTimeout(() => { setReviewMode(false); setSaved(false); }, 1500);
      } else {
        const errBody = await r.json().catch(() => ({})) as { error?: string };
        setSaveError(errBody.error ?? `Save failed (${r.status}) — please try again`);
      }
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  const effectiveApproval = dbReview?.approval ?? photo.approval;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5 text-white/50 text-xs">
            {getTypeIcon(photo.type)}
            <span className="capitalize">{photo.type}</span>
          </div>
          <Separator orientation="vertical" className="h-4 bg-white/20" />
          <span className="text-white text-sm font-medium truncate">{photo.label || photo.photoId}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
          {/* Crop/Full toggle — only visible when a crop is saved and not in review mode */}
          {!reviewMode && dbReview?.cropWidth != null && dbReview.cropWidth > 0 && (
            <button
              onClick={() => setShowCrop(v => !v)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                showCrop
                  ? "bg-amber-500/80 hover:bg-amber-500 text-white"
                  : "bg-white/10 hover:bg-white/20 text-white"
              }`}
            >
              {showCrop ? "Show Full" : "Show Crop"}
            </button>
          )}
          {!reviewMode ? (
            <button
              onClick={enterReviewMode}
              className="flex items-center gap-1.5 rounded-full bg-primary/80 hover:bg-primary px-3 py-1.5 text-xs text-white font-medium transition-colors"
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              Review
            </button>
          ) : (
            <button
              onClick={() => setReviewMode(false)}
              className="flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs text-white font-medium transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            className="rounded-full bg-white/10 hover:bg-white/20 p-2 transition-colors"
            onClick={onClose}
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Body: image + side panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Image area */}
        <div className="flex-1 flex items-center justify-center p-4 min-w-0 overflow-auto bg-black/60">
          {reviewMode ? (
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              className="max-w-full max-h-full"
            >
              <img
                ref={imgRef}
                src={imageUrl}
                alt={photo.label || photo.photoId}
                onLoad={e => { const t = e.currentTarget; setNaturalSize({ w: t.naturalWidth, h: t.naturalHeight }); }}
                style={{ maxHeight: "calc(100vh - 8rem)", objectFit: "contain" }}
              />
            </ReactCrop>
          ) : (() => {
            const cx = dbReview?.cropX ?? 0;
            const cy = dbReview?.cropY ?? 0;
            const cw = dbReview?.cropWidth ?? 0;
            const ch = dbReview?.cropHeight ?? 0;
            const hasSavedCrop = cw > 0 && ch > 0;
            if (hasSavedCrop && showCrop) {
              // CSS transform approach: image stays in normal flow (no container collapse).
              // transformOrigin targets the centre of the crop region in image-% space.
              // scale() zooms so the smaller crop axis fills the container.
              const scale = Math.min(100 / cw, 100 / ch);
              return (
                <div style={{ overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", maxWidth: "100%", maxHeight: "calc(100vh - 8rem)" }}>
                  <img
                    ref={imgRef}
                    src={imageUrl}
                    alt={photo.label || photo.photoId}
                    onLoad={e => { const t = e.currentTarget; setNaturalSize({ w: t.naturalWidth, h: t.naturalHeight }); }}
                    style={{
                      maxWidth: "100%",
                      maxHeight: "calc(100vh - 8rem)",
                      display: "block",
                      transformOrigin: `${cx + cw / 2}% ${cy + ch / 2}%`,
                      transform: `scale(${scale})`,
                    }}
                  />
                </div>
              );
            }
            return (
              <img
                ref={imgRef}
                src={imageUrl}
                alt={photo.label || photo.photoId}
                onLoad={e => { const t = e.currentTarget; setNaturalSize({ w: t.naturalWidth, h: t.naturalHeight }); }}
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              />
            );
          })()}
        </div>

        {/* Right panel */}
        <div className="w-80 flex-shrink-0 bg-background/95 border-l border-white/10 overflow-y-auto">
          {reviewMode ? (
            /* ── Review panel ─────────────────────────────────── */
            <div className="p-4 space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1">Review Photo</p>
                <p className="text-xs text-muted-foreground leading-relaxed">Drag on the image to crop. Pick a decision and optionally add a comment, then save.</p>
              </div>

              <Separator />

              {/* Decision */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Decision</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDecision("Approved")}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-lg border-2 py-2.5 text-sm font-medium transition-all ${
                      decision === "Approved"
                        ? "border-green-500 bg-green-500/20 text-green-400"
                        : "border-white/10 bg-white/5 text-white/60 hover:border-green-500/40 hover:text-green-400"
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Approve
                  </button>
                  <button
                    onClick={() => setDecision("Rejected")}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-lg border-2 py-2.5 text-sm font-medium transition-all ${
                      decision === "Rejected"
                        ? "border-red-500 bg-red-500/20 text-red-400"
                        : "border-white/10 bg-white/5 text-white/60 hover:border-red-500/40 hover:text-red-400"
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              </div>

              <Separator />

              {/* Crop status */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Crop region</p>
                {crop.width > 0 ? (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-green-400">
                      Selected ({Math.round(crop.width)}% × {Math.round(crop.height)}%)
                    </span>
                    <button
                      onClick={() => setCrop({ unit: "%", x: 0, y: 0, width: 0, height: 0 })}
                      className="text-muted-foreground hover:text-white underline transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Drag on the image to highlight a specific area (optional).</p>
                )}
              </div>

              <Separator />

              {/* Comment */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Comment</p>
                <Textarea
                  placeholder="Add review notes…"
                  value={reviewComment}
                  onChange={e => setReviewComment(e.target.value)}
                  rows={4}
                  className="text-sm resize-none"
                />
              </div>

              <Separator />

              {/* Save */}
              {saved ? (
                <div className="flex items-center gap-2 justify-center py-2 text-green-400 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  Saved successfully
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    onClick={handleSubmit}
                    disabled={!decision || submitting}
                    className={`w-full rounded-lg py-2.5 text-sm font-semibold transition-all ${
                      decision === "Approved"
                        ? "bg-green-600 hover:bg-green-500 text-white disabled:opacity-40"
                        : decision === "Rejected"
                        ? "bg-red-600 hover:bg-red-500 text-white disabled:opacity-40"
                        : "bg-white/10 text-white/30 cursor-not-allowed"
                    }`}
                  >
                    {submitting ? "Saving…" : decision ? `Save — ${decision}` : "Choose Approve or Reject first"}
                  </button>
                  {saveError && (
                    <p className="text-xs text-red-400 text-center">{saveError}</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ── Metadata panel ───────────────────────────────── */
            <div className="p-4 space-y-5">

              {/* Current review status (if reviewed) */}
              {effectiveApproval && !["unchecked", "pending", ""].includes(effectiveApproval.toLowerCase()) && (
                <>
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">Review decision:</span>
                      {getStatusBadge(photo.status, effectiveApproval)}
                    </div>
                    {dbReview?.reviewComment && (
                      <p className="text-xs text-foreground">{dbReview.reviewComment}</p>
                    )}
                  </div>
                  <Separator />
                </>
              )}

              {/* Identity */}
              <MetaSection title="Identity">
                <MetaRow label="Photo ID" value={photo.photoId} icon={<Hash className="w-3 h-3" />} />
                <MetaRow label="Form Type" value={photo.formType} icon={<FileText className="w-3 h-3" />} />
                <MetaRow label="Photo Type" value={photo.photoType} icon={<Activity className="w-3 h-3" />} />
                <MetaRow label="Parent" value={photo.parent} />
                <MetaRow label="Parent Control" value={photo.parentControl} />
              </MetaSection>

              <Separator />

              {/* Location & Phase */}
              <MetaSection title="Location & Phase">
                <MetaRow label="Tower" value={photo.locationLink} icon={<Wind className="w-3 h-3" />} />
                <MetaRow label="Cable" value={photo.cableLink} icon={<Network className="w-3 h-3" />} />
                <MetaRow label="Cable Side" value={photo.cableSide} />
                <MetaRow label="String" value={photo.photoString} />
                <MetaRow label="Phase" value={photo.phaseLink ? formatPhase(photo.phaseLink) : ""} icon={<Activity className="w-3 h-3" />} />
                <MetaRow label="Phase Order" value={photo.phaseOrder} />
              </MetaSection>

              <Separator />

              {/* Required Image */}
              <MetaSection title="Required Image">
                <MetaRow label="Type" value={photo.reqImgType} icon={<Hash className="w-3 h-3" />} />
                <MetaRow label="Order" value={photo.reqImgOrder} />
              </MetaSection>

              <Separator />

              {/* Status & Review */}
              <MetaSection title="Status & Review">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Approval:</span>
                  {getStatusBadge(photo.status, effectiveApproval)}
                </div>
                <MetaRow label="Status" value={photo.status} />
                <MetaRow label="Review Details" value={photo.reviewDetails} icon={<MessageSquare className="w-3 h-3" />} />
              </MetaSection>

              <Separator />

              {/* Responses */}
              <MetaSection title="Responses">
                <MetaRow label="Photo Response" value={photo.photoResponse} />
                <MetaRow label="Data Capture" value={photo.dataCaptureResponse} />
                <MetaRow label="Previous Import" value={photo.previousResponseImport} />
              </MetaSection>

              <Separator />

              {/* Notes & Comments */}
              <MetaSection title="Notes & Comments">
                <MetaRow label="Comments" value={photo.comments} icon={<MessageSquare className="w-3 h-3" />} />
                <MetaRow label="Continuing Notes" value={photo.continuingNotes} />
                <MetaRow label="Termination By" value={photo.terminationCompletedBy} icon={<User className="w-3 h-3" />} />
              </MetaSection>

              <Separator />

              {/* Creation */}
              <MetaSection title="Creation">
                <MetaRow label="Date/Time" value={photo.creationDateTime} icon={<Calendar className="w-3 h-3" />} />
                <MetaRow label="Date" value={photo.creationDate} />
                <MetaRow label="User" value={photo.creationUser} icon={<User className="w-3 h-3" />} />
                <MetaRow label="Location" value={photo.creationLocation} icon={<MapPin className="w-3 h-3" />} />
              </MetaSection>

              {(photo.editCount || photo.editDateTime || photo.editUser) && (
                <>
                  <Separator />
                  <MetaSection title="Last Edit">
                    <MetaRow label="Edit Count" value={photo.editCount} icon={<Hash className="w-3 h-3" />} />
                    <MetaRow label="Date/Time" value={photo.editDateTime} icon={<Calendar className="w-3 h-3" />} />
                    <MetaRow label="Date" value={photo.editDate} />
                    <MetaRow label="User" value={photo.editUser} icon={<User className="w-3 h-3" />} />
                    <MetaRow label="Location" value={photo.editLocation} icon={<MapPin className="w-3 h-3" />} />
                  </MetaSection>
                </>
              )}

              {(photo.automationTrigger || photo.updateFlag || photo.testFlag || photo.resizedChecked) && (
                <>
                  <Separator />
                  <MetaSection title="System">
                    <MetaRow label="Automation Trigger" value={photo.automationTrigger} />
                    <MetaRow label="Update Flag" value={photo.updateFlag} />
                    <MetaRow label="Test Flag" value={photo.testFlag} />
                    <MetaRow label="Resized Checked" value={photo.resizedChecked} />
                  </MetaSection>
                </>
              )}

              <Separator />
              <MetaSection title="Files">
                <MetaRow label="Photo Upload" value={photo.photoUpload} />
                <MetaRow label="Resized Photo" value={photo.resizedPhoto} />
                <MetaRow label="Signature" value={photo.signatureCapture} />
                <MetaRow label="Drawing" value={photo.drawingMarkup} />
              </MetaSection>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── natural sort helper ──────────────────────────────────────────────────────
function natSort(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

// ─── Phase section ────────────────────────────────────────────────────────────

function PhaseSection({
  phase,
  photos,
  onOpen,
}: {
  phase: string;
  photos: PhotoRecord[];
  onOpen: (photo: PhotoRecord, fileId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  // Sort photos by required image order (numeric)
  const sorted = [...photos].sort((a, b) =>
    (Number(a.reqImgOrder) || 9999) - (Number(b.reqImgOrder) || 9999)
  );
  return (
    <div className="space-y-3">
      <button className="flex items-center gap-2 w-full text-left" onClick={() => setExpanded(e => !e)}>
        {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        <span className="font-semibold text-sm">{formatPhase(phase)}</span>
        <Badge variant="secondary" className="text-xs ml-1">{photos.length}</Badge>
      </button>
      {expanded && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 pl-6">
          {sorted.map(p => (
            <PhotoCard key={p.photoId || `${p.locationLink}-${p.cableLink}-${p.label}`} photo={p} onOpen={onOpen} />
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
  onOpen,
}: {
  stringName: string;
  photos: PhotoRecord[];
  onOpen: (photo: PhotoRecord, fileId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const byPhase = new Map<string, PhotoRecord[]>();
  for (const p of photos) {
    const key = p.phaseLink || "Uncategorised";
    if (!byPhase.has(key)) byPhase.set(key, []);
    byPhase.get(key)!.push(p);
  }
  const sortedPhases = [...byPhase.entries()].sort(([, va], [, vb]) => {
    const oa = Number(va[0]?.phaseOrder) || 999;
    const ob = Number(vb[0]?.phaseOrder) || 999;
    return oa - ob;
  });
  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <button
        className="flex items-center gap-3 w-full px-4 py-3 bg-muted/40 hover:bg-muted/70 text-left transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
        <Network className="w-4 h-4 text-blue-500 flex-shrink-0" />
        <span className="font-semibold text-sm">{stringName}</span>
        <Badge variant="outline" className="ml-1 text-xs">{photos.length}</Badge>
        <span className="text-xs text-muted-foreground ml-auto">{sortedPhases.length} phase{sortedPhases.length !== 1 ? "s" : ""}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-3 space-y-5 divide-y divide-border">
          {sortedPhases.map(([phase, phasePhotos]) => (
            <div key={phase} className="pt-4 first:pt-0">
              <PhaseSection phase={phase} photos={phasePhotos} onOpen={onOpen} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── OSP section ──────────────────────────────────────────────────────────────

function OspSection({
  ospName,
  stringMap,
  onOpen,
}: {
  ospName: string;
  stringMap: Map<string, PhotoRecord[]>;
  onOpen: (photo: PhotoRecord, fileId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const sortedStrings = [...stringMap.entries()].sort(([a], [b]) => natSort(a, b));
  const total = [...stringMap.values()].reduce((s, v) => s + v.length, 0);

  return (
    <div className="rounded-xl border-2 border-border overflow-hidden shadow-sm">
      {/* OSP header */}
      <button
        className="flex items-center gap-3 w-full px-5 py-4 bg-sidebar text-left transition-colors hover:bg-muted/60"
        onClick={() => setExpanded(e => !e)}
      >
        {expanded ? <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />}
        <Wind className="w-5 h-5 text-primary flex-shrink-0" />
        <span className="font-bold text-base">{ospName}</span>
        <Badge className="ml-1 text-xs">{total}</Badge>
        <span className="text-xs text-muted-foreground ml-auto">
          {sortedStrings.length} string{sortedStrings.length !== 1 ? "s" : ""}
        </span>
      </button>

      {expanded && (
        <div className="p-4 space-y-3 bg-background">
          {sortedStrings.map(([stringName, photos]) => (
            <StringSection key={stringName} stringName={stringName} photos={photos} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DrivePhotos() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const approvalFilter = params.get("approval") ?? "";   // "Approved" | "Rejected" | "Pending" | ""

  const [selectedTower, setSelectedTower] = useState<string | null>(params.get("tower") ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const [fullscreen, setFullscreen] = useState<{ photo: PhotoRecord; fileId: string } | null>(null);
  const [reviewOverrides, setReviewOverrides] = useState<Map<string, string>>(new Map());

  // Load existing reviewer decisions from DB on mount
  useEffect(() => {
    fetch(`${BASE_URL}api/photos/reviews`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: { photoId: string; approval: string | null }[]) => {
        if (rows.length > 0) {
          setReviewOverrides(new Map(rows.filter(r => r.approval).map(r => [r.photoId, r.approval!])));
        }
      })
      .catch(() => {});
  }, []);

  // Reset tower selection when approval filter changes (skip initial mount to preserve URL-derived tower)
  const approvalFilterMounted = useRef(false);
  useEffect(() => {
    if (!approvalFilterMounted.current) { approvalFilterMounted.current = true; return; }
    setSelectedTower(null);
  }, [approvalFilter]);

  const handleReview = useCallback((photoId: string, approval: string) => {
    setReviewOverrides(prev => new Map([...prev, [photoId, approval]]));
  }, []);

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

  const handleOpen = useCallback((photo: PhotoRecord, fileId: string) => {
    setFullscreen({ photo, fileId });
  }, []);

  const handleClearCache = async () => {
    await fetch(`${BASE_URL}api/photos/cache-clear`, { method: "POST" });
    refetch();
  };

  const allPhotos = data?.photos ?? [];
  let filtered = allPhotos;
  if (approvalFilter) {
    filtered = filtered.filter(p => {
      const effectiveApproval = reviewOverrides.get(p.photoId) ?? p.approval ?? "";
      return effectiveApproval.toLowerCase() === approvalFilter.toLowerCase();
    });
  }
  if (selectedTower) filtered = filtered.filter(p => p.locationLink === selectedTower);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(p =>
      p.label.toLowerCase().includes(q) ||
      p.reqImgType.toLowerCase().includes(q) ||
      p.phaseLink.toLowerCase().includes(q) ||
      p.cableLink.toLowerCase().includes(q) ||
      p.locationLink.toLowerCase().includes(q) ||
      p.photoId.toLowerCase().includes(q)
    );
  }

  // Build 3-level hierarchy: OSP → String → photos
  const byOsp = new Map<string, Map<string, PhotoRecord[]>>();
  for (const p of filtered) {
    const osp = p.locationLink || "Unknown OSP";
    const str = p.cableLink   || "Unknown String";
    if (!byOsp.has(osp)) byOsp.set(osp, new Map());
    const strMap = byOsp.get(osp)!;
    if (!strMap.has(str)) strMap.set(str, []);
    strMap.get(str)!.push(p);
  }
  const sortedOsps = [...byOsp.entries()].sort(([a], [b]) => natSort(a, b));

  const towers = data?.meta.towers ?? [];
  const photoCount = filtered.filter(p => p.type === "photo").length;
  const sigCount   = filtered.filter(p => p.type === "signature").length;

  return (
    <ReviewOverridesContext.Provider value={reviewOverrides}>
      {fullscreen && (
        <FullscreenViewer
          photo={fullscreen.photo}
          fileId={fullscreen.fileId}
          onClose={() => setFullscreen(null)}
          onReview={handleReview}
        />
      )}

      <div className="p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Photos
              {approvalFilter && (
                <span className="ml-3 text-lg font-normal text-muted-foreground">· {approvalFilter}</span>
              )}
            </h1>
            <p className="text-muted-foreground mt-1">
              Photos from CVOW SmartBuild — click any image to view full metadata.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleClearCache} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>

        {!isLoading && data && (
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span><strong className="text-foreground">{filtered.length}</strong> records</span>
            <span><strong className="text-foreground">{photoCount}</strong> photos</span>
            <span><strong className="text-foreground">{sigCount}</strong> signatures</span>
            <span><strong className="text-foreground">{sortedOsps.length}</strong> OSPs</span>
          </div>
        )}

        {!isLoading && towers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-muted-foreground font-medium mr-1">OSP:</span>
            <Button size="sm" variant={!selectedTower ? "default" : "outline"} onClick={() => setSelectedTower(null)} className="h-7 text-xs rounded-full">
              All
            </Button>
            {towers.map(t => (
              <Button key={t} size="sm" variant={selectedTower === t ? "default" : "outline"} onClick={() => setSelectedTower(t)} className="h-7 text-xs rounded-full">
                {t}
              </Button>
            ))}
          </div>
        )}

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9"
            placeholder="Search label, type, phase, tower…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearchQuery("")}>
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {isLoading && (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-[4/3] rounded-lg" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        )}

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

        {!isLoading && !error && sortedOsps.length > 0 && (
          <div className="space-y-4">
            {sortedOsps.map(([ospName, stringMap]) => (
              <OspSection key={ospName} ospName={ospName} stringMap={stringMap} onOpen={handleOpen} />
            ))}
          </div>
        )}
      </div>
    </ReviewOverridesContext.Provider>
  );
}
