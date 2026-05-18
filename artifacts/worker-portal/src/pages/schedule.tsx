import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost, apiDelete } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar,
  Clock,
  MapPin,
  Loader2,
  CalendarDays,
  SendHorizontal,
  X,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RotationPeriod {
  id: number;
  assignmentId: number;
  plannedStart: string;
  plannedEnd: string | null;
  status: string;
  notes: string | null;
  siteName: string;
  siteLocation: string | null;
}

interface ScheduleResponse {
  rotations: RotationPeriod[];
}

interface ChangeRequest {
  id: number;
  rotationPeriodId: number;
  requestedStart: string | null;
  requestedEnd: string | null;
  reason: string | null;
  status: string;
  adminNotes: string | null;
  createdAt: string;
  siteName: string;
  originalStart: string;
  originalEnd: string | null;
}

interface ChangeRequestsResponse {
  requests: ChangeRequest[];
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function rotationStatusBadge(status: string) {
  switch (status) {
    case "active":
      return { label: "Active", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "completed":
      return { label: "Completed", cls: "bg-slate-50 text-slate-600 border-slate-200" };
    case "cancelled":
      return { label: "Cancelled", cls: "bg-red-50 text-red-700 border-red-200" };
    default:
      return { label: "Planned", cls: "bg-blue-50 text-blue-700 border-blue-200" };
  }
}

function changeRequestStatusBadge(status: string) {
  switch (status) {
    case "approved":
      return { label: "Approved", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "rejected":
      return { label: "Rejected", cls: "bg-red-50 text-red-700 border-red-200" };
    case "withdrawn":
      return { label: "Withdrawn", cls: "bg-slate-50 text-slate-500 border-slate-200" };
    default:
      return { label: "Pending review", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  }
}

function isPast(dateStr: string | null) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}


interface RequestChangeDialogProps {
  rotation: RotationPeriod;
  onClose: () => void;
}

function RequestChangeDialog({ rotation, onClose }: RequestChangeDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [requestedStart, setRequestedStart] = useState(rotation.plannedStart);
  const [requestedEnd, setRequestedEnd] = useState(rotation.plannedEnd ?? "");
  const [reason, setReason] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      apiPost("/api/worker-portal/change-requests", {
        rotationPeriodId: rotation.id,
        requestedStart: requestedStart || null,
        requestedEnd: requestedEnd || null,
        reason: reason.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker-change-requests"] });
      toast({ title: "Change request submitted" });
      onClose();
    },
    onError: (err: Error) =>
      toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Request Schedule Change</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <p className="font-medium">{rotation.siteName}</p>
            <p className="text-muted-foreground text-xs mt-0.5">
              Current: {formatDate(rotation.plannedStart)}
              {rotation.plannedEnd ? ` → ${formatDate(rotation.plannedEnd)}` : ""}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="req-start" className="text-xs">
                Requested start
              </Label>
              <Input
                id="req-start"
                type="date"
                value={requestedStart}
                onChange={(e) => setRequestedStart(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-end" className="text-xs">
                Requested end
              </Label>
              <Input
                id="req-end"
                type="date"
                value={requestedEnd}
                onChange={(e) => setRequestedEnd(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason" className="text-xs">
              Reason <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. personal commitment, medical appointment…"
              rows={3}
              className="text-sm resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="gap-1.5"
          >
            {mut.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <SendHorizontal className="h-3.5 w-3.5" />
            )}
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SchedulePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [changeTarget, setChangeTarget] = useState<RotationPeriod | null>(null);
  const [showPast, setShowPast] = useState(false);

  const scheduleQ = useQuery<ScheduleResponse>({
    queryKey: ["worker-schedule"],
    queryFn: () => apiFetch("/api/worker-portal/schedule"),
    staleTime: 60_000,
  });

  const requestsQ = useQuery<ChangeRequestsResponse>({
    queryKey: ["worker-change-requests"],
    queryFn: () => apiFetch("/api/worker-portal/change-requests"),
    staleTime: 30_000,
  });

  const withdrawMut = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/worker-portal/change-requests/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker-change-requests"] });
      toast({ title: "Request withdrawn" });
    },
    onError: (err: Error) =>
      toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const rotations = scheduleQ.data?.rotations ?? [];
  const requests = requestsQ.data?.requests ?? [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // A rotation is "past" only if it has a defined end date that is before today.
  // Open-ended rotations (null plannedEnd) that started in the past are still ongoing
  // and belong in the upcoming/current section.
  const upcomingRotations = rotations.filter((r) => {
    if (!r.plannedEnd) return true; // open-ended = still running
    const end = new Date(r.plannedEnd);
    end.setHours(0, 0, 0, 0);
    return end >= today;
  });

  const pastRotations = rotations.filter((r) => {
    if (!r.plannedEnd) return false; // open-ended never goes to past
    const end = new Date(r.plannedEnd);
    end.setHours(0, 0, 0, 0);
    return end < today;
  });

  // Determine which rotation to highlight as "current or next":
  // 1. status "active", OR period spans today (start <= today <= end), OR open-ended started <= today
  // 2. If none qualifies, fall back to the first upcoming (earliest plannedStart)
  const activeOrCurrent = upcomingRotations.find((r) => {
    if (r.status === "active") return true;
    const start = new Date(r.plannedStart);
    start.setHours(0, 0, 0, 0);
    if (!r.plannedEnd) return start <= today; // open-ended: current if started
    const end = new Date(r.plannedEnd);
    end.setHours(0, 0, 0, 0);
    return start <= today && end >= today;
  });
  const nextUpcomingId = activeOrCurrent?.id ?? upcomingRotations[0]?.id ?? null;

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const otherRequests = requests.filter((r) => r.status !== "pending");

  const isLoading = scheduleQ.isLoading;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Pending change requests banner */}
      {pendingRequests.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-600">
              Pending Requests
            </h2>
          </div>
          <div className="space-y-2">
            {pendingRequests.map((req) => {
              const badge = changeRequestStatusBadge(req.status);
              return (
                <div
                  key={req.id}
                  className="rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{req.siteName}</p>
                      <span
                        className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full border",
                          badge.cls,
                        )}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Original: {formatDate(req.originalStart)}
                      {req.originalEnd ? ` → ${formatDate(req.originalEnd)}` : ""}
                    </p>
                    {(req.requestedStart || req.requestedEnd) && (
                      <p className="text-xs text-amber-700 mt-0.5">
                        Requested: {req.requestedStart ? formatDate(req.requestedStart) : "—"}
                        {req.requestedEnd ? ` → ${formatDate(req.requestedEnd)}` : ""}
                      </p>
                    )}
                    {req.reason && (
                      <p className="text-xs text-muted-foreground mt-1 italic">"{req.reason}"</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-muted-foreground hover:text-red-600 flex-shrink-0"
                    onClick={() => withdrawMut.mutate(req.id)}
                    disabled={withdrawMut.isPending}
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    Withdraw
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Upcoming rotations */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Upcoming Schedule
          </h2>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : upcomingRotations.length === 0 ? (
          <div className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
            No upcoming rotations scheduled.
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingRotations.map((r) => {
              const badge = rotationStatusBadge(r.status);
              const isNext = r.id === nextUpcomingId;
              const pendingForThis = pendingRequests.some((req) => req.rotationPeriodId === r.id);
              return (
                <div
                  key={r.id}
                  className={cn(
                    "rounded-xl border bg-card px-4 py-3 flex items-start justify-between gap-3",
                    isNext && "border-emerald-200 bg-emerald-50/30",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{r.siteName}</p>
                      <span
                        className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full border",
                          badge.cls,
                        )}
                      >
                        {badge.label}
                      </span>
                      {pendingForThis && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-amber-50 text-amber-600 border-amber-200">
                          Change requested
                        </span>
                      )}
                    </div>
                    {r.siteLocation && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <p className="text-xs text-muted-foreground">{r.siteLocation}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-1 mt-1">
                      <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <p className="text-xs text-muted-foreground">
                        {formatDate(r.plannedStart)}
                        {r.plannedEnd ? ` → ${formatDate(r.plannedEnd)}` : " (open-ended)"}
                      </p>
                    </div>
                    {r.notes && (
                      <p className="text-xs text-muted-foreground mt-1 italic">{r.notes}</p>
                    )}
                  </div>
                  {!pendingForThis && r.status !== "cancelled" && r.status !== "completed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs flex-shrink-0"
                      onClick={() => setChangeTarget(r)}
                    >
                      Request change
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Past rotations (collapsible) */}
      {!isLoading && pastRotations.length > 0 && (
        <section>
          <button
            type="button"
            className="flex items-center gap-2 mb-3 w-full text-left"
            onClick={() => setShowPast((v) => !v)}
          >
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Past Rotations
            </h2>
            <span className="ml-1 text-xs text-muted-foreground">({pastRotations.length})</span>
            {showPast ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground ml-auto" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto" />
            )}
          </button>
          {showPast && (
            <div className="space-y-2">
              {pastRotations.map((r) => {
                const badge = rotationStatusBadge(r.status);
                return (
                  <div
                    key={r.id}
                    className="rounded-xl border bg-card/60 px-4 py-3 flex items-start justify-between gap-3 opacity-75"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{r.siteName}</p>
                        <span
                          className={cn(
                            "text-xs font-medium px-2 py-0.5 rounded-full border",
                            badge.cls,
                          )}
                        >
                          {badge.label}
                        </span>
                      </div>
                      {r.siteLocation && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <p className="text-xs text-muted-foreground">{r.siteLocation}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <p className="text-xs text-muted-foreground">
                          {formatDate(r.plannedStart)}
                          {r.plannedEnd ? ` → ${formatDate(r.plannedEnd)}` : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Previous change requests */}
      {otherRequests.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Previous Requests
            </h2>
          </div>
          <div className="space-y-2">
            {otherRequests.map((req) => {
              const badge = changeRequestStatusBadge(req.status);
              return (
                <div
                  key={req.id}
                  className="rounded-xl border bg-card/60 px-4 py-3 opacity-75"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{req.siteName}</p>
                        <span
                          className={cn(
                            "text-xs font-medium px-2 py-0.5 rounded-full border",
                            badge.cls,
                          )}
                        >
                          {badge.label}
                        </span>
                      </div>
                      {req.adminNotes && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Admin note: {req.adminNotes}
                        </p>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground flex-shrink-0">
                      {formatDate(req.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {changeTarget && (
        <RequestChangeDialog
          rotation={changeTarget}
          onClose={() => setChangeTarget(null)}
        />
      )}
    </div>
  );
}
