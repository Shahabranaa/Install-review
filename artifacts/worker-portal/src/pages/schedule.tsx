import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost, apiDelete } from "@/lib/api";
import { Button } from "@/components/ui/button";
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
  ChevronLeft,
  ChevronRight,
  List,
  PlusCircle,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  isBefore,
  isAfter,
  isSameDay,
} from "date-fns";

// ── Types ──────────────────────────────────────────────────────────────────

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

interface UnavailabilityPeriod {
  id: number;
  workerId: number;
  label: string | null;
  startDate: string;
  endDate: string;
  createdAt: string;
}

interface UnavailabilityResponse {
  periods: UnavailabilityPeriod[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toDateObj(s: string): Date {
  // date strings are YYYY-MM-DD — parse as local midnight
  return new Date(s + "T00:00:00");
}

function dateInRange(day: Date, start: string, end: string | null): boolean {
  const s = toDateObj(start);
  const e = end ? toDateObj(end) : null;
  if (e) return !isBefore(day, s) && !isAfter(day, e);
  return isSameDay(day, s) || isAfter(day, s);
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

// ── RequestChangeDialog ────────────────────────────────────────────────────

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
        reason: reason.trim(),
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
              <Label htmlFor="req-start" className="text-xs">Requested start</Label>
              <Input id="req-start" type="date" value={requestedStart}
                onChange={(e) => setRequestedStart(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-end" className="text-xs">Requested end</Label>
              <Input id="req-end" type="date" value={requestedEnd}
                onChange={(e) => setRequestedEnd(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason" className="text-xs">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. personal commitment, medical appointment…"
              rows={3} className="text-sm resize-none" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => mut.mutate()}
            disabled={mut.isPending || !reason.trim()} className="gap-1.5">
            {mut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SendHorizontal className="h-3.5 w-3.5" />}
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── AddUnavailabilityDialog ────────────────────────────────────────────────

interface AddUnavailabilityDialogProps {
  initialStart?: string;
  onClose: () => void;
}

function AddUnavailabilityDialog({ initialStart, onClose }: AddUnavailabilityDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const [startDate, setStartDate] = useState(initialStart ?? today);
  const [endDate, setEndDate] = useState(initialStart ?? today);
  const [label, setLabel] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      apiPost("/api/worker-portal/unavailability", { startDate, endDate, label: label.trim() || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker-unavailability"] });
      toast({ title: "Unavailability period saved" });
      onClose();
    },
    onError: (err: Error) =>
      toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const invalid = !startDate || !endDate || endDate < startDate;

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark unavailable period</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="unavail-start" className="text-xs">From</Label>
              <Input id="unavail-start" type="date" value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (endDate < e.target.value) setEndDate(e.target.value);
                }} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unavail-end" className="text-xs">To</Label>
              <Input id="unavail-end" type="date" value={endDate} min={startDate}
                onChange={(e) => setEndDate(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="unavail-label" className="text-xs">Label (optional)</Label>
            <Input id="unavail-label" type="text" value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Holiday, Personal, Medical…" className="h-8 text-sm" />
          </div>
          {invalid && startDate && endDate && (
            <p className="text-xs text-destructive">End date must be on or after start date.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => mut.mutate()}
            disabled={mut.isPending || invalid} className="gap-1.5 bg-red-600 hover:bg-red-700 text-white">
            {mut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlusCircle className="h-3.5 w-3.5" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── DeleteUnavailabilityDialog ─────────────────────────────────────────────

interface DeleteUnavailabilityDialogProps {
  period: UnavailabilityPeriod;
  onClose: () => void;
}

function DeleteUnavailabilityDialog({ period, onClose }: DeleteUnavailabilityDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: () => apiDelete(`/api/worker-portal/unavailability/${period.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker-unavailability"] });
      toast({ title: "Period removed" });
      onClose();
    },
    onError: (err: Error) =>
      toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove unavailable period</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <div className="rounded-lg border bg-red-50 border-red-200 px-3 py-2 text-sm">
            <p className="font-medium text-red-800">{period.label ?? "Unavailable"}</p>
            <p className="text-red-700 text-xs mt-0.5">
              {formatDate(period.startDate)} → {formatDate(period.endDate)}
            </p>
          </div>
          <p className="text-sm text-muted-foreground mt-3">Remove this period from your unavailability calendar?</p>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="destructive" onClick={() => mut.mutate()} disabled={mut.isPending}
            className="gap-1.5">
            {mut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── ScheduleCalendar ───────────────────────────────────────────────────────

const WEEK_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface ScheduleCalendarProps {
  rotations: RotationPeriod[];
  unavailability: UnavailabilityPeriod[];
  onDayClick: (day: Date) => void;
  onUnavailClick: (period: UnavailabilityPeriod) => void;
}

function ScheduleCalendar({ rotations, unavailability, onDayClick, onUnavailClick }: ScheduleCalendarProps) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  function getDayState(day: Date) {
    const isRotation = rotations.some(
      (r) => r.status !== "cancelled" && dateInRange(day, r.plannedStart, r.plannedEnd)
    );
    const rotationStatus = rotations.find(
      (r) => r.status !== "cancelled" && dateInRange(day, r.plannedStart, r.plannedEnd)
    )?.status;
    const unavailPeriod = unavailability.find((u) => dateInRange(day, u.startDate, u.endDate));
    return { isRotation, rotationStatus, unavailPeriod };
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Month nav */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonth(subMonths(month, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold">{format(month, "MMMM yyyy")}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Week day headers */}
      <div className="grid grid-cols-7 border-b">
        {WEEK_DAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-1.5 uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const { isRotation, rotationStatus, unavailPeriod } = getDayState(day);
          const inMonth = isSameMonth(day, month);
          const today = isToday(day);

          let bg = "";
          if (!inMonth) bg = "";
          else if (unavailPeriod && isRotation) bg = "bg-orange-200";
          else if (unavailPeriod) bg = "bg-red-100";
          else if (isRotation && rotationStatus === "active") bg = "bg-emerald-100";
          else if (isRotation) bg = "bg-blue-100";

          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                if (!inMonth) return;
                if (unavailPeriod) {
                  onUnavailClick(unavailPeriod);
                } else {
                  onDayClick(day);
                }
              }}
              className={cn(
                "relative min-h-[40px] flex flex-col items-center justify-start pt-1 pb-0.5 text-xs transition-colors",
                inMonth ? "cursor-pointer hover:bg-muted/60" : "cursor-default opacity-30",
                bg,
                today && inMonth && "font-bold",
              )}
            >
              <span className={cn(
                "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs",
                today && inMonth && "bg-primary text-primary-foreground font-bold",
                !today && inMonth && unavailPeriod && "text-red-700",
                !today && inMonth && isRotation && !unavailPeriod && (rotationStatus === "active" ? "text-emerald-700" : "text-blue-700"),
                !inMonth && "text-muted-foreground",
              )}>
                {format(day, "d")}
              </span>
              {inMonth && unavailPeriod && (
                <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
              )}
              {inMonth && isRotation && !unavailPeriod && (
                <span className={cn(
                  "mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0",
                  rotationStatus === "active" ? "bg-emerald-500" : "bg-blue-400",
                )} />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-t bg-muted/20 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-300 inline-block" />
          Active rotation
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-300 inline-block" />
          Planned rotation
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-100 border border-red-300 inline-block" />
          Unavailable
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-orange-200 border border-orange-300 inline-block" />
          Unavailable + rotation
        </span>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [changeTarget, setChangeTarget] = useState<RotationPeriod | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [addUnavailStart, setAddUnavailStart] = useState<string | undefined>(undefined);
  const [showAddUnavail, setShowAddUnavail] = useState(false);
  const [deleteUnavail, setDeleteUnavail] = useState<UnavailabilityPeriod | null>(null);

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

  const unavailQ = useQuery<UnavailabilityResponse>({
    queryKey: ["worker-unavailability"],
    queryFn: () => apiFetch("/api/worker-portal/unavailability"),
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
  const unavailPeriods = unavailQ.data?.periods ?? [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingRotations = rotations.filter((r) => {
    if (!r.plannedEnd) return true;
    const end = new Date(r.plannedEnd);
    end.setHours(0, 0, 0, 0);
    return end >= today;
  });

  const pastRotations = rotations.filter((r) => {
    if (!r.plannedEnd) return false;
    const end = new Date(r.plannedEnd);
    end.setHours(0, 0, 0, 0);
    return end < today;
  });

  const activeOrCurrent = upcomingRotations.find((r) => {
    if (r.status === "active") return true;
    const start = new Date(r.plannedStart);
    start.setHours(0, 0, 0, 0);
    if (!r.plannedEnd) return start <= today;
    const end = new Date(r.plannedEnd);
    end.setHours(0, 0, 0, 0);
    return start <= today && end >= today;
  });
  const nextUpcomingId = activeOrCurrent?.id ?? upcomingRotations[0]?.id ?? null;

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const otherRequests = requests.filter((r) => r.status !== "pending");
  const isLoading = scheduleQ.isLoading;

  function handleDayClick(day: Date) {
    setAddUnavailStart(format(day, "yyyy-MM-dd"));
    setShowAddUnavail(true);
  }

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
                <div key={req.id}
                  className="rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{req.siteName}</p>
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", badge.cls)}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Original: {formatDate(req.originalStart)}{req.originalEnd ? ` → ${formatDate(req.originalEnd)}` : ""}
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
                  <Button size="sm" variant="ghost"
                    className="h-7 text-xs text-muted-foreground hover:text-red-600 flex-shrink-0"
                    onClick={() => withdrawMut.mutate(req.id)} disabled={withdrawMut.isPending}>
                    <X className="h-3.5 w-3.5 mr-1" />Withdraw
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* View toggle + Add unavailability */}
      <div className="flex items-center justify-between">
        <div className="flex items-center rounded-lg border bg-muted/30 p-0.5 gap-0.5">
          <Button
            variant={view === "calendar" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-3 text-xs gap-1.5"
            onClick={() => setView("calendar")}
          >
            <CalendarDays className="h-3.5 w-3.5" />Calendar
          </Button>
          <Button
            variant={view === "list" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-3 text-xs gap-1.5"
            onClick={() => setView("list")}
          >
            <List className="h-3.5 w-3.5" />List
          </Button>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1.5 border-red-200 text-red-700 hover:bg-red-50"
          onClick={() => { setAddUnavailStart(undefined); setShowAddUnavail(true); }}
        >
          <PlusCircle className="h-3.5 w-3.5" />
          Mark unavailable
        </Button>
      </div>

      {/* Calendar view */}
      {view === "calendar" && (
        <section className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ScheduleCalendar
              rotations={rotations}
              unavailability={unavailPeriods}
              onDayClick={handleDayClick}
              onUnavailClick={(p) => setDeleteUnavail(p)}
            />
          )}

          {/* Unavailability chips */}
          {unavailPeriods.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Your unavailable periods</p>
              <div className="flex flex-wrap gap-2">
                {unavailPeriods.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setDeleteUnavail(p)}
                    className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-700 hover:bg-red-100 transition-colors"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                    {p.label ? `${p.label}: ` : ""}
                    {formatDate(p.startDate)}{p.startDate !== p.endDate ? ` → ${formatDate(p.endDate)}` : ""}
                    <X className="h-3 w-3 ml-0.5" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* List view */}
      {view === "list" && (
        <>
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
                    <div key={r.id}
                      className={cn(
                        "rounded-xl border bg-card px-4 py-3 flex items-start justify-between gap-3",
                        isNext && "border-emerald-200 bg-emerald-50/30",
                      )}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold">{r.siteName}</p>
                          <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", badge.cls)}>
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
                        <Button size="sm" variant="outline" className="h-7 text-xs flex-shrink-0"
                          onClick={() => setChangeTarget(r)}>
                          Request change
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Past rotations */}
          {!isLoading && pastRotations.length > 0 && (
            <section>
              <button type="button"
                className="flex items-center gap-2 mb-3 w-full text-left"
                onClick={() => setShowPast((v) => !v)}>
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Past Rotations
                </h2>
                <span className="ml-1 text-xs text-muted-foreground">({pastRotations.length})</span>
                {showPast ? <ChevronUp className="h-4 w-4 text-muted-foreground ml-auto" /> : <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto" />}
              </button>
              {showPast && (
                <div className="space-y-2">
                  {pastRotations.map((r) => {
                    const badge = rotationStatusBadge(r.status);
                    return (
                      <div key={r.id}
                        className="rounded-xl border bg-card/60 px-4 py-3 flex items-start justify-between gap-3 opacity-75">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">{r.siteName}</p>
                            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", badge.cls)}>
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
                              {formatDate(r.plannedStart)}{r.plannedEnd ? ` → ${formatDate(r.plannedEnd)}` : ""}
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
                    <div key={req.id} className="rounded-xl border bg-card/60 px-4 py-3 opacity-75">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">{req.siteName}</p>
                            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", badge.cls)}>
                              {badge.label}
                            </span>
                          </div>
                          {req.adminNotes && (
                            <p className="text-xs text-muted-foreground mt-1">Admin note: {req.adminNotes}</p>
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
        </>
      )}

      {/* Dialogs */}
      {changeTarget && (
        <RequestChangeDialog rotation={changeTarget} onClose={() => setChangeTarget(null)} />
      )}
      {showAddUnavail && (
        <AddUnavailabilityDialog
          initialStart={addUnavailStart}
          onClose={() => setShowAddUnavail(false)}
        />
      )}
      {deleteUnavail && (
        <DeleteUnavailabilityDialog
          period={deleteUnavail}
          onClose={() => setDeleteUnavail(null)}
        />
      )}
    </div>
  );
}
