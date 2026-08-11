import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useCaptureNav } from "@/contexts/CaptureNavContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus, Loader2, CheckCircle2, Save, RotateCcw } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

type ShiftStatus = "off_shift" | "signing_on" | "on_shift" | "signing_off";

interface ShiftWorker {
  id: number;
  firstName: string;
  lastName: string;
  role: string | null;
  company: string | null;
  active: boolean;
  teamIds: number[];
  shiftStatus: ShiftStatus;
  signOnTime: string | null;
  signOffTime: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (!res.ok && res.status !== 204) throw new Error(`Request failed: ${res.status}`);
  if (res.status === 204) return null;
  return res.json();
}

function jsonBody(body: unknown): RequestInit {
  return { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function roleAbbr(role: string): string {
  const words = role.trim().split(/\s+/);
  if (words[0].length <= 3) return words[0].toUpperCase();
  if (words.length === 1) return role.substring(0, 3).toUpperCase();
  return words.map((w) => w[0]).join("").substring(0, 3).toUpperCase();
}

const ROLE_COLORS: Record<string, string> = {
  HV:  "bg-blue-50   text-blue-700   border-blue-200",
  HVJ: "bg-blue-50   text-blue-700   border-blue-200",
  FO:  "bg-violet-50 text-violet-700 border-violet-200",
  FOJ: "bg-violet-50 text-violet-700 border-violet-200",
  CT:  "bg-amber-50  text-amber-700  border-amber-200",
  CAB: "bg-amber-50  text-amber-700  border-amber-200",
  OIM: "bg-rose-50   text-rose-700   border-rose-200",
  DOI: "bg-cyan-50   text-cyan-700   border-cyan-200",
  SUP: "bg-pink-50   text-pink-700   border-pink-200",
  DC:  "bg-indigo-50 text-indigo-700 border-indigo-200",
  HSE: "bg-teal-50   text-teal-700   border-teal-200",
  ASS: "bg-orange-50 text-orange-700 border-orange-200",
  MEL: "bg-lime-50   text-lime-700   border-lime-200",
  SCA: "bg-sky-50    text-sky-700    border-sky-200",
  SCF: "bg-sky-50    text-sky-700    border-sky-200",
  WF:  "bg-emerald-50 text-emerald-700 border-emerald-200",
};
const FALLBACK_COLORS = [
  "bg-slate-50 text-slate-700 border-slate-200",
  "bg-zinc-50 text-zinc-700 border-zinc-200",
  "bg-stone-50 text-stone-700 border-stone-200",
];
const _dynamicRoleMap = new Map<string, string>();
function roleColor(abbr: string): string {
  if (ROLE_COLORS[abbr]) return ROLE_COLORS[abbr];
  if (!_dynamicRoleMap.has(abbr)) {
    _dynamicRoleMap.set(abbr, FALLBACK_COLORS[_dynamicRoleMap.size % FALLBACK_COLORS.length]);
  }
  return _dynamicRoleMap.get(abbr)!;
}

// ─── Status move buttons config ───────────────────────────────────────────────

const STATUS_LABELS: Record<ShiftStatus, string> = {
  off_shift:   "Off Shift",
  signing_on:  "Signing On",
  on_shift:    "On Shift",
  signing_off: "Signing Off",
};

const STATUS_BTN: Record<ShiftStatus, string> = {
  off_shift:   "text-muted-foreground border-border hover:bg-muted/60",
  signing_on:  "text-emerald-700 border-emerald-200 hover:bg-emerald-50",
  on_shift:    "text-blue-700 border-blue-200 hover:bg-blue-50",
  signing_off: "text-orange-700 border-orange-200 hover:bg-orange-50",
};

const ALL_STATUSES: ShiftStatus[] = ["off_shift", "signing_on", "on_shift", "signing_off"];

// ─── Stat chip ────────────────────────────────────────────────────────────────

function StatChip({ label, count, highlight }: { label: string; count: number; highlight?: boolean }) {
  return (
    <span className={cn(
      "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border",
      highlight
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-muted text-muted-foreground border-border"
    )}>
      <span className="font-bold tabular-nums">{count}</span>
      {label}
    </span>
  );
}

// ─── Worker card ──────────────────────────────────────────────────────────────

interface WorkerCardProps {
  worker: ShiftWorker;
  onMutate: (workerId: number, status: ShiftStatus) => void;
}

function WorkerCard({ worker, onMutate }: WorkerCardProps) {
  const abbr = roleAbbr(worker.role ?? "?");
  const otherStatuses = ALL_STATUSES.filter((s) => s !== worker.shiftStatus);

  return (
    <div className="flex flex-col gap-1.5 p-2.5 rounded-lg border border-border bg-card hover:bg-muted/20 transition-colors">
      {/* Name row */}
      <div className="flex items-center gap-2 min-w-0">
        <span className={cn(
          "flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border w-9 text-center tracking-wide",
          roleColor(abbr)
        )}>
          {abbr}
        </span>
        <span className="flex-1 text-sm font-medium truncate">
          {worker.firstName} {worker.lastName}
        </span>
        {worker.company && (
          <span className="text-[10px] text-muted-foreground flex-shrink-0">{worker.company}</span>
        )}
      </div>

      {/* Time info */}
      {worker.shiftStatus === "signing_on" && worker.signOnTime && (
        <div className="pl-11 text-[10px] text-muted-foreground">Signed on {worker.signOnTime}</div>
      )}
      {worker.shiftStatus === "on_shift" && worker.signOnTime && (
        <div className="pl-11 text-[10px] text-muted-foreground">On site since {worker.signOnTime}</div>
      )}
      {worker.shiftStatus === "signing_off" && worker.signOffTime && (
        <div className="pl-11 text-[10px] text-muted-foreground">Signing off {worker.signOffTime}</div>
      )}

      {/* Move-to buttons */}
      <div className="pl-11 flex flex-wrap gap-1">
        {otherStatuses.map((target) => (
          <button
            key={target}
            onClick={() => onMutate(worker.id, target)}
            className={cn(
              "text-[10px] font-medium px-2 py-0.5 rounded border transition-colors",
              STATUS_BTN[target]
            )}
          >
            → {STATUS_LABELS[target]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Add worker typeahead ─────────────────────────────────────────────────────

function AddWorkerTypeahead({
  offShiftWorkers,
  targetStatus,
  date,
  queryKey,
}: {
  offShiftWorkers: ShiftWorker[];
  targetStatus: "signing_on" | "signing_off";
  date: string;
  queryKey: unknown[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ workerId, status }: { workerId: number; status: ShiftStatus }) =>
      apiFetch(`/api/dpr/shift-attendance/${workerId}`, {
        method: "PUT",
        ...jsonBody({
          date,
          status,
          signOnTime: status === "signing_on" ? nowHHMM() : undefined,
          signOffTime: status === "signing_off" ? nowHHMM() : undefined,
        }),
      }),
    onMutate: async ({ workerId, status }) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<ShiftWorker[]>(queryKey);
      qc.setQueryData<ShiftWorker[]>(queryKey, (old = []) =>
        old.map((w) => w.id === workerId ? {
          ...w,
          shiftStatus: status,
          signOnTime: status === "signing_on" ? nowHHMM() : w.signOnTime,
          signOffTime: status === "signing_off" ? nowHHMM() : w.signOffTime,
        } : w)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
    onSuccess: () => { setQuery(""); setOpen(false); },
  });

  const matches = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return offShiftWorkers.slice(0, 8);
    return offShiftWorkers
      .filter((w) => `${w.firstName} ${w.lastName}`.toLowerCase().includes(q) || (w.role ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, offShiftWorkers]);

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 30); }}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1.5 px-1"
      >
        <Plus className="w-3 h-3" />
        Add worker {targetStatus === "signing_on" ? "signing on" : "signing off"}
      </button>
    );
  }

  return (
    <div className="relative mt-1">
      <input
        ref={inputRef}
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => { setOpen(false); setQuery(""); }, 150)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); setQuery(""); }
          if (e.key === "Enter" && matches.length === 1) {
            mutation.mutate({ workerId: matches[0].id, status: targetStatus });
          }
        }}
        placeholder="Search worker…"
        className="w-full border border-border rounded-md px-2 py-1.5 text-xs bg-background outline-none focus:ring-2 focus:ring-primary/30"
      />
      {matches.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 bg-popover border border-border rounded-md shadow-lg py-1 mt-1 max-h-48 overflow-y-auto">
          {matches.map((w) => {
            const wAbbr = roleAbbr(w.role ?? "?");
            return (
              <button
                key={w.id}
                onMouseDown={(e) => { e.preventDefault(); mutation.mutate({ workerId: w.id, status: targetStatus }); }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted transition-colors"
              >
                <span className={cn("flex-shrink-0 text-[9px] font-bold px-1 py-0.5 rounded border w-7 text-center", roleColor(wAbbr))}>
                  {wAbbr}
                </span>
                <span className="text-xs text-foreground truncate">{w.firstName} {w.lastName}</span>
                {w.company && <span className="text-[10px] text-muted-foreground ml-auto">{w.company}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Sub-section divider ──────────────────────────────────────────────────────

function SubSectionHeader({ label, count, accentClass }: { label: string; count: number; accentClass: string }) {
  return (
    <div className={cn("flex items-center gap-2 px-1 py-1 mb-1")}>
      <span className={cn("text-[10px] font-semibold uppercase tracking-widest", accentClass)}>{label}</span>
      <span className="text-[10px] text-muted-foreground/60 tabular-nums">({count})</span>
      <div className="flex-1 border-t border-dashed border-border/50" />
    </div>
  );
}

// ─── Shift panel (replaces 4 columns with 2) ──────────────────────────────────

interface ShiftPanelProps {
  panel: "on_shift" | "off_shift";
  /** Workers in the transition sub-section (signing_on | signing_off) */
  transitioning: ShiftWorker[];
  /** Workers in the steady state (on_shift | off_shift) */
  steady: ShiftWorker[];
  offShiftWorkers: ShiftWorker[];
  date: string;
  queryKey: unknown[];
  onMutate: (workerId: number, status: ShiftStatus) => void;
}

function ShiftPanel({ panel, transitioning, steady, offShiftWorkers, date, queryKey, onMutate }: ShiftPanelProps) {
  const isOnShift = panel === "on_shift";

  const panelTitle      = isOnShift ? "On Shift"  : "Off Shift";
  const panelSubtitle   = isOnShift ? "Currently on site" : "Not working today";
  const panelAccent     = isOnShift ? "border-blue-300"   : "border-border";
  const transitionLabel = isOnShift ? "Signing on"  : "Signing off";
  const transitionAccent = isOnShift ? "text-emerald-600" : "text-orange-600";
  const transitionStatus: "signing_on" | "signing_off" = isOnShift ? "signing_on" : "signing_off";
  const total = transitioning.length + steady.length;

  return (
    <div className="flex flex-col flex-1 min-w-0 border-r last:border-r-0 border-border">
      {/* Panel header */}
      <div className={cn("px-3 py-2.5 border-b-2", panelAccent)}>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-semibold text-foreground">{panelTitle}</span>
          <span className="text-xs text-muted-foreground tabular-nums">({total})</span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">{panelSubtitle}</p>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {/* Transition sub-section — at the top */}
        {transitioning.length > 0 && (
          <>
            <SubSectionHeader label={transitionLabel} count={transitioning.length} accentClass={transitionAccent} />
            {transitioning.map((w) => (
              <WorkerCard key={w.id} worker={w} onMutate={onMutate} />
            ))}
            {/* typeahead sits right below the transition group */}
            <div className="pt-0.5 pb-1">
              <AddWorkerTypeahead
                offShiftWorkers={offShiftWorkers}
                targetStatus={transitionStatus}
                date={date}
                queryKey={queryKey}
              />
            </div>
            {/* Divider before steady state */}
            {steady.length > 0 && <div className="border-t border-border/30 my-1" />}
          </>
        )}

        {/* Steady-state workers */}
        {steady.map((w) => (
          <WorkerCard key={w.id} worker={w} onMutate={onMutate} />
        ))}
      </div>

      {/* Add typeahead at bottom when no transition workers yet */}
      {transitioning.length === 0 && (
        <div className="p-2 border-t border-border">
          <AddWorkerTypeahead
            offShiftWorkers={offShiftWorkers}
            targetStatus={transitionStatus}
            date={date}
            queryKey={queryKey}
          />
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SignOnPage() {
  const { activeDate } = useCaptureNav();
  const date = activeDate ?? format(new Date(), "yyyy-MM-dd");
  const qc = useQueryClient();

  const queryKey = ["/api/dpr/shift-attendance", date];

  const { data: workers = [], isLoading } = useQuery<ShiftWorker[]>({
    queryKey,
    queryFn: ({ signal }) => apiFetch(`/api/dpr/shift-attendance?date=${date}`, { signal }),
  });

  // Optimistic update: move the worker in the cache immediately, sync after
  const updateMutation = useMutation({
    mutationFn: ({ workerId, status }: { workerId: number; status: ShiftStatus }) =>
      apiFetch(`/api/dpr/shift-attendance/${workerId}`, {
        method: "PUT",
        ...jsonBody({
          date,
          status,
          signOnTime: status === "signing_on" ? nowHHMM() : undefined,
          signOffTime: status === "signing_off" ? nowHHMM() : undefined,
        }),
      }),
    onMutate: async ({ workerId, status }) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<ShiftWorker[]>(queryKey);
      qc.setQueryData<ShiftWorker[]>(queryKey, (old = []) =>
        old.map((w) =>
          w.id === workerId
            ? {
                ...w,
                shiftStatus: status,
                signOnTime: status === "signing_on" ? nowHHMM() : w.signOnTime,
                signOffTime: status === "signing_off" ? nowHHMM() : w.signOffTime,
              }
            : w
        )
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey });
    },
  });

  const sessionKey = ["/api/dpr/shift-attendance/session", date];
  const { data: session } = useQuery<{ saved: boolean; savedAt: string | null }>({
    queryKey: sessionKey,
    queryFn: ({ signal }) => apiFetch(`/api/dpr/shift-attendance/session?date=${date}`, { signal }),
  });

  const copyMutation = useMutation({
    mutationFn: () => apiFetch(`/api/dpr/shift-attendance/copy-from-previous?date=${date}`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  // ── Auto-copy from yesterday on first load of a fresh day ─────────────────
  // A "fresh day" = every worker is still off_shift (no DB rows written yet)
  // AND the session hasn't been explicitly saved. We track per-date so a manual
  // reset doesn't trigger another auto-copy on the same render cycle.
  const autoCopiedDate = useRef<string | null>(null);
  const copyMutateRef = useRef(copyMutation.mutate);
  copyMutateRef.current = copyMutation.mutate;

  useEffect(() => {
    if (isLoading) return;
    if (session === undefined) return;              // session query still loading
    if (autoCopiedDate.current === date) return;    // already attempted for this date
    if (session.saved) return;                      // day deliberately saved, leave it alone
    if (workers.length === 0) return;               // no workers configured
    if (workers.some((w) => w.shiftStatus !== "off_shift")) return; // already has activity

    autoCopiedDate.current = date;
    copyMutateRef.current();
  }, [isLoading, session, workers, date]);

  // ── Reset ─────────────────────────────────────────────────────────────────
  const [confirmReset, setConfirmReset] = useState(false);
  const resetMutation = useMutation({
    mutationFn: () => apiFetch(`/api/dpr/shift-attendance?date=${date}`, { method: "DELETE" }),
    onSuccess: () => {
      setConfirmReset(false);
      // Mark that we've already "auto-copied" for this date so the effect
      // doesn't re-fire immediately after the reset empties everyone.
      autoCopiedDate.current = date;
      qc.invalidateQueries({ queryKey });
    },
  });

  // ── Save ──────────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: () => apiFetch("/api/dpr/shift-attendance/save", { method: "POST", ...jsonBody({ date }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionKey }),
  });

  function handleMutate(workerId: number, status: ShiftStatus) {
    updateMutation.mutate({ workerId, status });
  }

  // ── Group workers ─────────────────────────────────────────────────────────
  const byStatus: Record<ShiftStatus, ShiftWorker[]> = {
    off_shift: [],
    signing_on: [],
    on_shift: [],
    signing_off: [],
  };
  for (const w of workers) {
    byStatus[w.shiftStatus].push(w);
  }

  const totalOnSite = byStatus.signing_on.length + byStatus.on_shift.length + byStatus.signing_off.length;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Stats bar */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/20 flex-wrap">
        <StatChip label="On Shift" count={byStatus.on_shift.length + byStatus.signing_on.length} />
        <StatChip label="Off Shift" count={byStatus.off_shift.length + byStatus.signing_off.length} />
        <span className="mx-1 text-border">|</span>
        <StatChip label="Total on site" count={totalOnSite} highlight />

        <div className="ml-auto flex items-center gap-2">
          {confirmReset ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-destructive font-medium">Move all to Off Shift?</span>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
              >
                {resetMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm"}
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmReset(true)}
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </Button>
          )}
          {session?.saved ? (
            <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Saved
            </span>
          ) : (
            <Button
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save Sign On
            </Button>
          )}
        </div>
      </div>

      {/* 2-panel board: On Shift | Off Shift */}
      <div className="flex-1 flex overflow-hidden">
        <ShiftPanel
          panel="on_shift"
          transitioning={byStatus.signing_on}
          steady={byStatus.on_shift}
          offShiftWorkers={byStatus.off_shift}
          date={date}
          queryKey={queryKey}
          onMutate={handleMutate}
        />
        <ShiftPanel
          panel="off_shift"
          transitioning={byStatus.signing_off}
          steady={byStatus.off_shift}
          offShiftWorkers={byStatus.off_shift}
          date={date}
          queryKey={queryKey}
          onMutate={handleMutate}
        />
      </div>
    </div>
  );
}
