import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch, apiPatch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  ChevronRight,
  User,
  ExternalLink,
  Loader2,
  FileText,
  AlertTriangle,
  X as XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ReviewItem {
  workerId: number;
  workerName: string;
  certId: number;
  certName: string;
  certCategory: string | null;
  dateAchieved: string | null;
  expiryDate: string | null;
  submittedAt: string | null;
  fileUrl: string | null;
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function certFileUrl(item: ReviewItem) {
  return `${BASE}/api/workforce/workers/${item.workerId}/certifications/${item.certId}/file`;
}

export default function ReviewQueuePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<ReviewItem | null>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const { data: items, isLoading } = useQuery<ReviewItem[]>({
    queryKey: ["review-queue"],
    queryFn: () => apiFetch<ReviewItem[]>("/api/workforce/review-queue"),
    refetchInterval: 30_000,
  });

  const verifyMut = useMutation({
    mutationFn: (item: ReviewItem) =>
      apiPatch(`/api/workforce/workers/${item.workerId}/certifications/${item.certId}`, {
        verified: true,
      }),
    onSuccess: (_, item) => {
      toast({ title: "Certification verified", description: `${item.certName} for ${item.workerName}` });
      void qc.invalidateQueries({ queryKey: ["review-queue"] });
      setSelected(null);
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const rejectMut = useMutation({
    mutationFn: ({ item, reason }: { item: ReviewItem; reason: string }) =>
      apiPatch(`/api/workforce/workers/${item.workerId}/certifications/${item.certId}/reject`, {
        rejected: true,
        rejectionComment: reason,
      }),
    onSuccess: (_, { item }) => {
      toast({ title: "Certification rejected", description: `${item.certName} for ${item.workerName}` });
      void qc.invalidateQueries({ queryKey: ["review-queue"] });
      setSelected(null);
      setRejectMode(false);
      setRejectReason("");
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  function selectItem(item: ReviewItem) {
    setSelected(item);
    setRejectMode(false);
    setRejectReason("");
  }

  function closePanel() {
    setSelected(null);
    setRejectMode(false);
    setRejectReason("");
  }

  const queue = items ?? [];
  const pendingCount = queue.length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            Review Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Certifications submitted by workers awaiting your verification.
          </p>
        </div>
        {pendingCount > 0 && (
          <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-sm px-3 py-1">
            {pendingCount} pending
          </Badge>
        )}
      </div>

      {/* Body — split view */}
      <div className="flex flex-1 min-h-0">
        {/* Left: list */}
        <div
          className={cn(
            "flex flex-col border-r overflow-y-auto transition-all",
            selected ? "w-80 flex-shrink-0" : "flex-1",
          )}
        >
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 py-20 px-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-400 mb-3" />
              <p className="font-semibold text-lg">All clear!</p>
              <p className="text-sm text-muted-foreground mt-1">
                No certifications are waiting for review right now.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {queue.map((item) => {
                const isSelected = selected?.workerId === item.workerId && selected?.certId === item.certId;
                return (
                  <button
                    key={`${item.workerId}-${item.certId}`}
                    onClick={() => selectItem(item)}
                    className={cn(
                      "w-full text-left px-4 py-3.5 flex items-center gap-3 transition-colors hover:bg-muted/50",
                      isSelected && "bg-primary/5 border-l-2 border-l-primary",
                    )}
                  >
                    <div className="h-9 w-9 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-orange-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{item.workerName}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{item.certName}</p>
                      {item.certCategory && (
                        <span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 mt-1 inline-block">
                          {item.certCategory}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-[11px] text-muted-foreground">{formatDate(item.submittedAt)}</span>
                      {!selected && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: detail panel */}
        {selected && (
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            {/* Panel header */}
            <div className="flex items-start justify-between px-5 py-3.5 border-b flex-shrink-0">
              <div>
                <p className="font-semibold text-sm">{selected.workerName}</p>
                <p className="text-xs text-muted-foreground">{selected.certName}</p>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/workers/${selected.workerId}`}>
                  <a className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <ExternalLink className="h-3 w-3" />
                    View profile
                  </a>
                </Link>
                <button onClick={closePanel} className="rounded p-1 hover:bg-muted transition-colors">
                  <XIcon className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Cert metadata */}
            <div className="px-5 py-3 border-b flex-shrink-0 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <span className="text-xs text-muted-foreground block">Date achieved</span>
                <span>{formatDate(selected.dateAchieved)}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Expiry date</span>
                <span>{formatDate(selected.expiryDate)}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Submitted</span>
                <span>{formatDate(selected.submittedAt)}</span>
              </div>
              {selected.certCategory && (
                <div>
                  <span className="text-xs text-muted-foreground block">Category</span>
                  <span>{selected.certCategory}</span>
                </div>
              )}
            </div>

            {/* Document viewer */}
            <div className="flex-1 min-h-0 relative bg-muted/30">
              <DocumentViewer url={certFileUrl(selected)} key={`${selected.workerId}-${selected.certId}`} />
            </div>

            {/* Actions */}
            <div className="border-t px-5 py-4 flex-shrink-0 space-y-3">
              {rejectMode ? (
                <>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium flex items-center gap-1">
                      Reason for rejection
                      <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                      rows={3}
                      placeholder="e.g. Document is unreadable, please re-upload a clearer image"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      autoFocus
                    />
                    {rejectReason.trim().length === 0 && (
                      <p className="text-xs text-red-500 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        A reason is required before rejecting.
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => { setRejectMode(false); setRejectReason(""); }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      disabled={!rejectReason.trim() || rejectMut.isPending}
                      onClick={() => rejectMut.mutate({ item: selected, reason: rejectReason.trim() })}
                    >
                      {rejectMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                      Confirm Rejection
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300"
                    onClick={() => setRejectMode(true)}
                    disabled={verifyMut.isPending}
                  >
                    <XCircle className="h-4 w-4 mr-1.5" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={verifyMut.isPending}
                    onClick={() => verifyMut.mutate(selected)}
                  >
                    {verifyMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                    Verify
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DocumentViewer({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <FileText className="h-10 w-10 opacity-30" />
        <p className="text-sm">Could not display document inline.</p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          Open in new tab
        </a>
      </div>
    );
  }

  return (
    <iframe
      src={url}
      title="Certification document"
      className="w-full h-full border-0"
      onError={() => setFailed(true)}
    />
  );
}
