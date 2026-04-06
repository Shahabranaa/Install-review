import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  X, CheckCircle2, XCircle, AlertTriangle, Clock, HardDrive,
  ChevronDown, ChevronUp, Image as ImageIcon, User, FileText,
  ShieldAlert, Wrench, ClipboardList, MapPin, Eye, Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Flag definitions ────────────────────────────────────────────────────────

interface FlagCategory {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  severity: string;
  flags: { code: string; label: string }[];
}

function toLabel(code: string): string {
  return code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const FLAG_CATEGORIES: FlagCategory[] = [
  {
    id: "image_quality",
    label: "Image Quality",
    icon: Camera,
    color: "text-blue-500",
    severity: "low",
    flags: [
      { code: "blurry_image", label: "Blurry Image" },
      { code: "too_dark_or_overexposed", label: "Too Dark or Overexposed" },
      { code: "low_resolution", label: "Low Resolution" },
      { code: "obstructed_view", label: "Obstructed View" },
      { code: "subject_not_visible", label: "Subject Not Visible" },
    ],
  },
  {
    id: "evidence_quality",
    label: "Evidence Quality",
    icon: Eye,
    color: "text-purple-500",
    severity: "medium",
    flags: [
      { code: "wrong_angle", label: "Wrong Angle" },
      { code: "insufficient_coverage", label: "Insufficient Coverage" },
      { code: "partial_subject_visible", label: "Partial Subject Visible" },
      { code: "missing_required_view_type", label: "Missing Required View Type" },
      { code: "before_instead_of_after", label: "Before Instead of After" },
      { code: "irrelevant_photo", label: "Irrelevant Photo" },
    ],
  },
  {
    id: "installation_quality",
    label: "Installation Quality",
    icon: Wrench,
    color: "text-orange-500",
    severity: "high",
    flags: [
      { code: "visible_defect", label: "Visible Defect" },
      { code: "misalignment", label: "Misalignment" },
      { code: "poor_finish", label: "Poor Finish" },
      { code: "damage_visible", label: "Damage Visible" },
      { code: "incorrect_position", label: "Incorrect Position" },
      { code: "loose_or_unsecured_item", label: "Loose or Unsecured Item" },
      { code: "routing_or_dressing_issue", label: "Routing or Dressing Issue" },
      { code: "missing_fixing_or_fastening", label: "Missing Fixing or Fastening" },
      { code: "contamination_or_debris", label: "Contamination or Debris" },
    ],
  },
  {
    id: "completeness",
    label: "Completeness",
    icon: ClipboardList,
    color: "text-yellow-600",
    severity: "high",
    flags: [
      { code: "missing_component", label: "Missing Component" },
      { code: "partial_installation", label: "Partial Installation" },
      { code: "required_step_not_evidenced", label: "Required Step Not Evidenced" },
      { code: "missing_protection_or_cover", label: "Missing Protection or Cover" },
      { code: "sequence_gap", label: "Sequence Gap" },
      { code: "final_state_not_evidenced", label: "Final State Not Evidenced" },
    ],
  },
  {
    id: "context_mismatch",
    label: "Context Mismatch",
    icon: MapPin,
    color: "text-indigo-500",
    severity: "medium",
    flags: [
      { code: "wrong_location", label: "Wrong Location" },
      { code: "wrong_asset", label: "Wrong Asset" },
      { code: "wrong_phase", label: "Wrong Phase" },
      { code: "metadata_conflict", label: "Metadata Conflict" },
      { code: "timestamp_sequence_issue", label: "Timestamp Sequence Issue" },
      { code: "duplicate_image", label: "Duplicate Image" },
    ],
  },
  {
    id: "safety",
    label: "Safety",
    icon: ShieldAlert,
    color: "text-red-500",
    severity: "critical",
    flags: [
      { code: "trip_hazard", label: "Trip Hazard" },
      { code: "poor_housekeeping", label: "Poor Housekeeping" },
      { code: "unsafe_access", label: "Unsafe Access" },
      { code: "ppe_missing_or_incorrect", label: "PPE Missing or Incorrect" },
      { code: "unsecured_tools", label: "Unsecured Tools" },
      { code: "barrier_or_exclusion_issue", label: "Barrier or Exclusion Issue" },
    ],
  },
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface ImageRecord {
  id: number;
  filename?: string | null;
  imageUrl?: string | null;
  driveFileId?: string | null;
  reviewStatus: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  uploadedAt: string;
  phaseId: number;
  notes?: string | null;
}

interface IssueRecord {
  id: number;
  imageId: number;
  type: string;
  severity: string;
  description: string;
  resolved: boolean;
}

interface ImageDetail extends ImageRecord {
  issues: IssueRecord[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  if (status === "approved") return (
    <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400">
      <CheckCircle2 className="w-3 h-3 mr-1" /> Approved
    </Badge>
  );
  if (status === "rejected") return (
    <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400">
      <XCircle className="w-3 h-3 mr-1" /> Rejected
    </Badge>
  );
  if (status === "flagged") return (
    <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400">
      <AlertTriangle className="w-3 h-3 mr-1" /> Flagged
    </Badge>
  );
  return (
    <Badge className="bg-slate-100 text-slate-600 border-slate-200">
      <Clock className="w-3 h-3 mr-1" /> Pending
    </Badge>
  );
}

function severityBadge(severity: string) {
  const map: Record<string, string> = {
    critical: "bg-red-100 text-red-700 border-red-200",
    high: "bg-orange-100 text-orange-700 border-orange-200",
    medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
    low: "bg-blue-100 text-blue-700 border-blue-200",
  };
  return <Badge className={`text-xs ${map[severity] ?? "bg-slate-100 text-slate-600"}`}>{toLabel(severity)}</Badge>;
}

// ─── Category section component ───────────────────────────────────────────────

function CategorySection({
  category,
  checkedCodes,
  onToggle,
}: {
  category: FlagCategory;
  checkedCodes: Set<string>;
  onToggle: (code: string) => void;
}) {
  const Icon = category.icon;
  const checked = category.flags.filter((f) => checkedCodes.has(f.code));
  const [open, setOpen] = useState(checked.length > 0);

  useEffect(() => {
    if (checked.length > 0) setOpen(true);
  }, [checked.length]);

  return (
    <div className="rounded-lg border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/40 hover:bg-muted/70 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 flex-shrink-0 ${category.color}`} />
          <span className="text-sm font-medium">{category.label}</span>
          {checked.length > 0 && (
            <Badge variant="destructive" className="text-xs h-4 px-1.5">{checked.length}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {severityBadge(category.severity)}
          {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="divide-y">
          {category.flags.map((flag) => {
            const isChecked = checkedCodes.has(flag.code);
            return (
              <label
                key={flag.code}
                className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                  isChecked ? "bg-red-50 dark:bg-red-950/20" : "hover:bg-muted/30"
                }`}
              >
                <Checkbox
                  id={`flag-${flag.code}`}
                  checked={isChecked}
                  onCheckedChange={() => onToggle(flag.code)}
                  className={isChecked ? "border-red-500 data-[state=checked]:bg-red-500" : ""}
                />
                <span className={`text-sm select-none ${isChecked ? "text-red-700 dark:text-red-400 font-medium" : ""}`}>
                  {flag.label}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function ImageReviewModal({
  imageId,
  onClose,
}: {
  imageId: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [reviewedBy, setReviewedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [checkedFlags, setCheckedFlags] = useState<Map<string, string>>(new Map()); // code → categoryId
  const [imgError, setImgError] = useState(false);

  const { data: image, isLoading } = useQuery<ImageDetail>({
    queryKey: ["image-detail", imageId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/images/${imageId}`);
      if (!res.ok) throw new Error("Failed to load image");
      return res.json();
    },
  });

  // Pre-populate from existing review
  useEffect(() => {
    if (!image) return;
    if (image.reviewedBy) setReviewedBy(image.reviewedBy);
    if (image.notes) setNotes(image.notes);
    if (image.issues?.length > 0) {
      const map = new Map<string, string>();
      for (const issue of image.issues) {
        map.set(issue.description, issue.type);
      }
      setCheckedFlags(map);
    }
  }, [image]);

  const toggleFlag = (code: string, categoryId: string) => {
    setCheckedFlags((prev) => {
      const next = new Map(prev);
      if (next.has(code)) next.delete(code);
      else next.set(code, categoryId);
      return next;
    });
  };

  const reviewMutation = useMutation({
    mutationFn: async (decision: "approved" | "rejected" | "flagged") => {
      const flags = Array.from(checkedFlags.entries()).map(([code, category]) => ({ code, category }));
      const res = await fetch(`${API_BASE}/api/images/${imageId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewedBy, decision, notes: notes || null, flags }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Review failed" }));
        throw new Error(err.error ?? "Review failed");
      }
      return res.json();
    },
    onSuccess: (_data, decision) => {
      queryClient.invalidateQueries({ queryKey: ["images"] });
      queryClient.invalidateQueries({ queryKey: ["image-detail", imageId] });
      const labels = { approved: "Approved", rejected: "Rejected", flagged: "Flagged for review" };
      toast({ title: labels[decision], description: `Image has been ${decision}.` });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Review failed", description: err.message, variant: "destructive" });
    },
  });

  const { isReviewer } = useAuth();
  const flagCount = checkedFlags.size;
  const hasSafetyFlags = Array.from(checkedFlags.values()).some((cat) => cat === "safety");
  const canSubmit = isReviewer && reviewedBy.trim().length > 0 && !reviewMutation.isPending;

  const imgSrc = image?.imageUrl ?? undefined;
  const filename = image?.filename ?? `Image #${imageId}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-stretch" onClick={onClose}>
      <div
        className="relative flex w-full max-w-[1100px] mx-auto my-4 rounded-xl overflow-hidden shadow-2xl bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Left: Image ─────────────────────────────────────────────────── */}
        <div className="flex-1 bg-black flex flex-col min-w-0">
          {/* Image header */}
          <div className="flex items-center justify-between px-4 py-3 bg-black/60 backdrop-blur-sm flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {image?.driveFileId && <HardDrive className="w-4 h-4 text-blue-400 flex-shrink-0" />}
              <span className="text-white text-sm font-medium truncate">{filename}</span>
            </div>
            {image && (
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                {statusBadge(image.reviewStatus)}
                <span className="text-xs text-white/50 hidden sm:inline">
                  {format(new Date(image.uploadedAt), "MMM d, yyyy")}
                </span>
              </div>
            )}
          </div>

          {/* Image body */}
          <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
            {isLoading ? (
              <div className="flex flex-col items-center gap-3 text-white/50">
                <ImageIcon className="w-12 h-12 animate-pulse" />
                <span className="text-sm">Loading image…</span>
              </div>
            ) : imgSrc && !imgError ? (
              <img
                src={imgSrc}
                alt={filename}
                onError={() => setImgError(true)}
                className="max-w-full max-h-full object-contain rounded"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-white/40">
                <ImageIcon className="w-16 h-16" />
                <span className="text-sm">{filename}</span>
              </div>
            )}
          </div>

          {/* Flagged issues overlay (shown if flags exist after review) */}
          {flagCount > 0 && (
            <div className="px-4 py-2 bg-red-900/80 backdrop-blur-sm flex flex-wrap gap-1.5 flex-shrink-0">
              {Array.from(checkedFlags.entries()).map(([code]) => (
                <span key={code} className="inline-flex items-center text-xs bg-red-800 text-red-100 rounded px-2 py-0.5">
                  {toLabel(code)}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Review form ───────────────────────────────────────────── */}
        <div className="w-[420px] flex-shrink-0 flex flex-col border-l bg-background">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
            <h2 className="font-semibold text-base">Image Review</h2>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Scrollable form body */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {/* Status summary */}
            {image && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground pb-1">
                {statusBadge(image.reviewStatus)}
                {image.reviewedBy && (
                  <span className="truncate">by <strong>{image.reviewedBy}</strong></span>
                )}
              </div>
            )}

            {/* Flag categories */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Review Checklist
                {flagCount > 0 && (
                  <span className="ml-2 text-red-500">{flagCount} flag{flagCount !== 1 ? "s" : ""} raised</span>
                )}
              </p>
              <div className="space-y-2">
                {FLAG_CATEGORIES.map((cat) => (
                  <CategorySection
                    key={cat.id}
                    category={cat}
                    checkedCodes={new Set(
                      Array.from(checkedFlags.entries())
                        .filter(([, catId]) => catId === cat.id)
                        .map(([code]) => code)
                    )}
                    onToggle={(code) => toggleFlag(code, cat.id)}
                  />
                ))}
              </div>
            </div>

            <Separator />

            {/* Safety warning */}
            {hasSafetyFlags && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 flex gap-2">
                <ShieldAlert className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 dark:text-red-400">
                  Safety issues flagged — this image should be <strong>rejected</strong> until resolved.
                </p>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                <FileText className="w-3.5 h-3.5" /> Review Notes
              </Label>
              <Textarea
                placeholder="Add any comments, observations, or required actions…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="text-sm resize-none"
                rows={3}
              />
            </div>

            {/* Reviewer */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground" htmlFor="reviewer-name">
                <User className="w-3.5 h-3.5" /> Reviewer Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="reviewer-name"
                placeholder="Your name"
                value={reviewedBy}
                onChange={(e) => setReviewedBy(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>

          {/* Sticky footer */}
          <div className="border-t px-4 py-3 flex-shrink-0 space-y-2">
            {!isReviewer && (
              <div className="rounded-md bg-slate-50 dark:bg-slate-900 border px-3 py-2 text-xs text-muted-foreground text-center">
                You have view-only access. Contact an admin to get reviewer permissions.
              </div>
            )}
            {isReviewer && !reviewedBy.trim() && (
              <p className="text-xs text-amber-600 text-center">Enter your name to submit a review</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                disabled={!canSubmit}
                onClick={() => reviewMutation.mutate("rejected")}
              >
                <XCircle className="w-4 h-4 mr-1.5" />
                {reviewMutation.isPending ? "Saving…" : "Reject"}
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                disabled={!canSubmit || hasSafetyFlags}
                onClick={() => reviewMutation.mutate("approved")}
                title={hasSafetyFlags ? "Cannot approve while safety issues are flagged" : undefined}
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                {reviewMutation.isPending ? "Saving…" : "Approve"}
              </Button>
            </div>
            {flagCount > 0 && !hasSafetyFlags && (
              <Button
                variant="outline"
                className="w-full border-amber-200 text-amber-700 hover:bg-amber-50"
                disabled={!canSubmit}
                onClick={() => reviewMutation.mutate("flagged")}
              >
                <AlertTriangle className="w-4 h-4 mr-1.5" />
                Flag for Further Review
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
