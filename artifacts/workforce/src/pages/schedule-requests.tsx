import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch, apiPatch } from "@/lib/api";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, Check, X, Loader2, Clock, User, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScheduleChangeRequest {
  id: number;
  workerId: number;
  workerName: string;
  rotationPeriodId: number;
  requestedStart: string | null;
  requestedEnd: string | null;
  reason: string | null;
  status: string;
  adminNotes: string | null;
  createdAt: string;
  siteId: number;
  siteName: string;
  originalStart: string;
  originalEnd: string | null;
}

interface ChangeRequestsResponse {
  requests: ScheduleChangeRequest[];
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusBadge(status: string) {
  switch (status) {
    case "approved":
      return { label: "Approved", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "rejected":
      return { label: "Rejected", cls: "bg-red-50 text-red-700 border-red-200" };
    case "withdrawn":
      return { label: "Withdrawn", cls: "bg-slate-50 text-slate-500 border-slate-200" };
    default:
      return { label: "Pending", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  }
}

interface ReviewDialogProps {
  request: ScheduleChangeRequest;
  action: "approve" | "reject";
  onClose: () => void;
}

function ReviewDialog({ request, action, onClose }: ReviewDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [adminNotes, setAdminNotes] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      apiPatch(`/api/workforce/schedule-change-requests/${request.id}`, {
        status: action === "approve" ? "approved" : "rejected",
        adminNotes: adminNotes.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workforce-schedule-change-requests"] });
      toast({ title: action === "approve" ? "Request approved" : "Request rejected" });
      onClose();
    },
    onError: (err: Error) =>
      toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {action === "approve" ? "Approve" : "Reject"} Change Request
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm space-y-1">
            <p className="font-medium">{request.workerName}</p>
            <p className="text-muted-foreground text-xs">{request.siteName}</p>
            <p className="text-muted-foreground text-xs">
              Original: {formatDate(request.originalStart)}
              {request.originalEnd ? ` → ${formatDate(request.originalEnd)}` : ""}
            </p>
            {(request.requestedStart || request.requestedEnd) && (
              <p className="text-xs font-medium">
                Requested: {request.requestedStart ? formatDate(request.requestedStart) : "—"}
                {request.requestedEnd ? ` → ${formatDate(request.requestedEnd)}` : ""}
              </p>
            )}
            {request.reason && (
              <p className="text-xs text-muted-foreground italic">"{request.reason}"</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-notes" className="text-xs">
              Admin notes <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="admin-notes"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder={
                action === "approve"
                  ? "e.g. Approved — amended on roster."
                  : "e.g. Rejected — dates conflict with site requirements."
              }
              rows={2}
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
            variant={action === "approve" ? "default" : "destructive"}
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="gap-1.5"
          >
            {mut.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : action === "approve" ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
            {action === "approve" ? "Approve" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ScheduleRequestsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [reviewTarget, setReviewTarget] = useState<{
    request: ScheduleChangeRequest;
    action: "approve" | "reject";
  } | null>(null);

  const { data, isLoading } = useQuery<ChangeRequestsResponse>({
    queryKey: ["workforce-schedule-change-requests", statusFilter],
    queryFn: () => {
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      return apiFetch<ChangeRequestsResponse>(`/api/workforce/schedule-change-requests${params}`);
    },
    staleTime: 30_000,
  });

  const requests = data?.requests ?? [];
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            Schedule Change Requests
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and action worker-submitted schedule change requests.
          </p>
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="withdrawn">Withdrawn</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : requests.length === 0 ? (
        <div className="border rounded-xl bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          <CalendarDays className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
          No {statusFilter !== "all" ? statusFilter : ""} change requests.
        </div>
      ) : (
        <div className="border rounded-xl bg-card overflow-hidden divide-y">
          {pendingCount > 0 && statusFilter === "pending" && (
            <div className="px-4 py-2.5 bg-amber-50/60 border-b border-amber-100 flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs font-medium text-amber-700">
                {pendingCount} pending request{pendingCount !== 1 ? "s" : ""} awaiting review
              </span>
            </div>
          )}
          {requests.map((req) => {
            const badge = statusBadge(req.status);
            return (
              <div key={req.id} className="px-4 py-3.5 flex items-start gap-4">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/workers/${req.workerId}`}>
                      <a className="font-semibold text-sm hover:underline flex items-center gap-1">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        {req.workerName}
                      </a>
                    </Link>
                    <span
                      className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded-full border",
                        badge.cls,
                      )}
                    >
                      {badge.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {formatDate(req.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 flex-shrink-0" />
                    <Link href={`/sites/${req.siteId}`}>
                      <a className="hover:underline">{req.siteName}</a>
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs mt-1">
                    <div>
                      <p className="text-muted-foreground">Original dates</p>
                      <p className="font-medium">
                        {formatDate(req.originalStart)}
                        {req.originalEnd ? ` → ${formatDate(req.originalEnd)}` : ""}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Requested dates</p>
                      <p className="font-medium">
                        {req.requestedStart ? formatDate(req.requestedStart) : "—"}
                        {req.requestedEnd ? ` → ${formatDate(req.requestedEnd)}` : ""}
                      </p>
                    </div>
                  </div>
                  {req.reason && (
                    <p className="text-xs text-muted-foreground italic">Reason: "{req.reason}"</p>
                  )}
                  {req.adminNotes && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">Admin note:</span> {req.adminNotes}
                    </p>
                  )}
                </div>

                {req.status === "pending" && (
                  <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 gap-1"
                      onClick={() => setReviewTarget({ request: req, action: "approve" })}
                    >
                      <Check className="h-3 w-3" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-50 gap-1"
                      onClick={() => setReviewTarget({ request: req, action: "reject" })}
                    >
                      <X className="h-3 w-3" />
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {reviewTarget && (
        <ReviewDialog
          request={reviewTarget.request}
          action={reviewTarget.action}
          onClose={() => setReviewTarget(null)}
        />
      )}
    </div>
  );
}
