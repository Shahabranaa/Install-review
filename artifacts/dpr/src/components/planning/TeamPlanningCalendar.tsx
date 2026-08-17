import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addDays, startOfWeek } from "date-fns";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { Plus, X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── P6 Activities ────────────────────────────────────────────────────────────

type Section = "OCS" | "2Cable" | "1Cable" | "String";

const SECTION_META: Record<Section, { label: string; color: string; bg: string; border: string }> = {
  OCS:     { label: "1st End @ OCS",   color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200" },
  "2Cable":{ label: "2Cable",          color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200" },
  "1Cable":{ label: "1Cable",          color: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200" },
  String:  { label: "String Complete", color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200" },
};

const ACTIVITIES: Record<Section, { code: string; name: string }[]> = {
  OCS: [
    { code: "WF103630", name: "MOB / As found" },
    { code: "WF103635", name: "Post Pull-In Test (DC Voltage/OTDR/Phase Rotation)" },
    { code: "WF103640", name: "OCS Protection & required rigging" },
    { code: "WF103650", name: "Perm Hangoff's & Stripping" },
    { code: "WF103660", name: "CMS (build/re-build/soft routing)" },
    { code: "WF103670", name: "Partial routing & cut/cleat of Cable" },
    { code: "WF103680", name: "Heating of Cable" },
    { code: "WF103690", name: "Straightening bars on Cable" },
    { code: "WF103700", name: "Mount FO Box, install service loops and glands" },
    { code: "WF103710", name: "HV Terminations (up to plug-in)" },
    { code: "WF103720", name: "Connex Joints (containment/remove cleats/belly cable)" },
    { code: "WF103730", name: "FO Terminations" },
    { code: "WF103740", name: "HV Termination (plug-in)" },
    { code: "WF103750", name: "OTDR Testing (Part 1)" },
    { code: "WF103755", name: "RTS Testing" },
    { code: "WF103760", name: "OTDR Testing (Part 2)" },
    { code: "WF103770", name: "Connex Joints (remove & re-cleat cores)" },
    { code: "WF103775", name: "HV Terminations incl. Final plug-in and earthing" },
    { code: "WF103780", name: "QC Inspection" },
  ],
  "2Cable": [
    { code: "WF103800", name: "MOB / As found" },
    { code: "WF103805", name: "Pre-Termination Testing" },
    { code: "WF103810", name: "SIP Protection" },
    { code: "WF103820", name: "Perm Hangoff's & Stripping – Cables 1&2" },
    { code: "WF103830", name: "CMS modifications" },
    { code: "WF103840", name: "Routing & Cleating" },
    { code: "WF103850", name: "HV Prep Heating, Straightening & Cooling (Cable 1)" },
    { code: "WF103860", name: "HV Prep Heating, Straightening & Cooling (Cable 2)" },
    { code: "WF103870", name: "PT100 Installation" },
    { code: "WF103900", name: "Final Routing of Cables" },
    { code: "WF103910", name: "Termination of Cable 1" },
    { code: "WF103920", name: "Termination of Cable 2" },
    { code: "WF103950", name: "FO Terminations" },
    { code: "WF103960", name: "FO Testing" },
    { code: "WF103970", name: "Post Termination Testing (Earth verification)" },
    { code: "WF103980", name: "Internal QC JDR walk down" },
    { code: "WF103983", name: "JDR/ORST QC / As-Left" },
    { code: "WF103990", name: "DEMOB" },
    { code: "WF104000", name: "OTDR (Remedials)" },
  ],
  "1Cable": [
    { code: "WF104010", name: "MOB / As found" },
    { code: "WF104015", name: "Pre-Termination Testing" },
    { code: "WF104020", name: "SIP Protection" },
    { code: "WF104030", name: "Perm Hangoff's & Stripping" },
    { code: "WF104040", name: "CMS modifications" },
    { code: "WF104050", name: "Routing & Cleating" },
    { code: "WF104060", name: "HV Prep Heating, Straightening & Cooling (Cable 1)" },
    { code: "WF104070", name: "PT100 Installation" },
    { code: "WF104080", name: "Final Routing of Cables" },
    { code: "WF104090", name: "HV Terminations incl. Earthing Bonding – Cable 1" },
    { code: "WF104110", name: "FO Terminations" },
    { code: "WF104120", name: "FO Testing" },
    { code: "WF104130", name: "Post Termination Testing (Earth verification)" },
    { code: "WF104140", name: "Internal QC JDR walk down" },
    { code: "WF104145", name: "JDR/ORST QC / As-Left" },
    { code: "WF104150", name: "DEMOB" },
    { code: "WF104160", name: "OTDR (Remedials)" },
  ],
  String: [
    { code: "WF126565", name: "Termination of String complete" },
    { code: "SERV33650", name: "RTS Testing" },
  ],
};

const STAGE_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  captured:  { label: "Captured",  variant: "default"   },
  draft:     { label: "Draft",     variant: "secondary" },
  clarified: { label: "Clarified", variant: "outline"   },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Team { id: number; name: string }
interface Location { id: number; name: string }
interface ActivityPlan {
  id: number;
  date: string;
  teamId: number;
  locationName: string;
  activityCode: string;
  activityName: string;
  section: Section;
  stage: string;
}

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts);
  if (!res.ok && res.status !== 204) throw new Error(`${res.status}`);
  if (res.status === 204) return null;
  return res.json();
}
function jsonBody(body: unknown): RequestInit {
  return { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

// ─── Add Activity Dialog ──────────────────────────────────────────────────────

function AddActivityDialog({
  teamName,
  date,
  locations,
  onAdd,
  onClose,
}: {
  teamName: string;
  date: string;
  locations: Location[];
  onAdd: (data: {
    locationName: string;
    activityCode: string;
    activityName: string;
    section: Section;
  }) => void;
  onClose: () => void;
}) {
  const [section, setSection] = useState<Section>("OCS");
  const [activityCode, setActivityCode] = useState<string>(ACTIVITIES.OCS[0].code);
  const [locationName, setLocationName] = useState<string>(locations[0]?.name ?? "");

  const acts = ACTIVITIES[section];
  const selectedAct = acts.find((a) => a.code === activityCode) ?? acts[0];
  const meta = SECTION_META[section];

  function handleSectionChange(s: Section) {
    setSection(s);
    setActivityCode(ACTIVITIES[s][0].code);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Activity — {teamName}</DialogTitle>
          <p className="text-xs text-muted-foreground">{date}</p>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Section */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
              Section
            </label>
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(SECTION_META) as Section[]).map((s) => (
                <button
                  key={s}
                  onClick={() => handleSectionChange(s)}
                  className={cn(
                    "px-3 py-1 text-xs font-semibold rounded-full border transition-colors",
                    section === s
                      ? `${SECTION_META[s].bg} ${SECTION_META[s].border} ${SECTION_META[s].color}`
                      : "bg-muted border-border text-muted-foreground hover:bg-accent"
                  )}
                >
                  {SECTION_META[s].label}
                </button>
              ))}
            </div>
          </div>

          {/* Activity */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
              Activity
            </label>
            <div className={cn("border rounded-lg overflow-hidden max-h-52 overflow-y-auto", meta.border)}>
              {acts.map((a) => (
                <button
                  key={a.code}
                  onClick={() => setActivityCode(a.code)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-xs flex flex-col gap-0.5 border-b last:border-0 transition-colors",
                    activityCode === a.code
                      ? `${meta.bg} ${meta.color}`
                      : "hover:bg-accent"
                  )}
                >
                  <span className="font-mono font-bold text-[10px] opacity-70">{a.code}</span>
                  <span>{a.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
              Location
            </label>
            <Select value={locationName} onValueChange={setLocationName}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.name} className="text-xs">
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={() => {
              onAdd({
                locationName,
                activityCode: selectedAct.code,
                activityName: selectedAct.name,
                section,
              });
              onClose();
            }}
          >
            Add Activity
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Activity Card ────────────────────────────────────────────────────────────

function ActivityCard({
  plan,
  onRemove,
}: {
  plan: ActivityPlan;
  onRemove: () => void;
}) {
  const [hover, setHover] = useState(false);
  const meta = SECTION_META[plan.section] ?? SECTION_META.OCS;
  const stg  = STAGE_BADGE[plan.stage]    ?? STAGE_BADGE.draft;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn("relative rounded-md border overflow-hidden text-xs", meta.border)}
    >
      {/* Section strip */}
      <div className={cn("flex items-center justify-between gap-1 px-2 py-1 border-b", meta.bg, meta.border)}>
        <span className={cn("font-bold uppercase tracking-wide text-[10px]", meta.color)}>
          {meta.label}
        </span>
        <Badge variant={stg.variant} className="text-[9px] px-1.5 py-0 h-4">
          {stg.label}
        </Badge>
      </div>

      {/* Body */}
      <div className={cn("px-2 py-1.5 flex flex-col gap-1", meta.bg)}>
        <span className={cn("font-mono font-bold text-[10px]", meta.color)}>{plan.activityCode}</span>
        <span className="text-foreground leading-snug">{plan.activityName}</span>
        <span className="text-muted-foreground text-[10px] mt-0.5">📍 {plan.locationName}</span>
      </div>

      {hover && (
        <button
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-background border border-border flex items-center justify-center shadow-sm hover:bg-destructive hover:text-destructive-foreground transition-colors"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const DOW   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function TeamPlanningCalendar() {
  const qc = useQueryClient();

  // Week navigation: start from current Monday
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const startDate = format(weekStart, "yyyy-MM-dd");
  const endDate   = format(addDays(weekStart, 6), "yyyy-MM-dd");
  const today     = format(new Date(), "yyyy-MM-dd");

  // Dialog state
  const [modal, setModal] = useState<{ teamId: number; teamName: string; date: string } | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: teams = [], isLoading: teamsLoading } = useQuery<Team[]>({
    queryKey: ["/api/dpr/teams"],
    queryFn: ({ signal }) => apiFetch("/api/dpr/teams", { signal }),
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/dpr/locations"],
    queryFn: ({ signal }) => apiFetch("/api/dpr/locations", { signal }),
  });

  const plansKey = ["/api/dpr/team-activity-plans", startDate, endDate];
  const { data: plans = [], isLoading: plansLoading } = useQuery<ActivityPlan[]>({
    queryKey: plansKey,
    queryFn: ({ signal }) =>
      apiFetch(`/api/dpr/team-activity-plans?startDate=${startDate}&endDate=${endDate}`, { signal }),
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: (body: object) =>
      apiFetch("/api/dpr/team-activity-plans", { method: "POST", ...jsonBody(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: plansKey }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/dpr/team-activity-plans/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: plansKey }),
  });

  // ── Index plans by teamId-date ────────────────────────────────────────────
  const planIndex = useMemo(() => {
    const idx: Record<string, ActivityPlan[]> = {};
    for (const p of plans) {
      const k = `${p.teamId}-${p.date}`;
      (idx[k] ??= []).push(p);
    }
    return idx;
  }, [plans]);

  const isLoading = teamsLoading || plansLoading;

  return (
    <div className="flex flex-col h-full">
      {/* Week navigation */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border flex-none">
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setWeekStart(d => addDays(d, -7))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-semibold">
          {format(weekStart, "d MMM")} – {format(addDays(weekStart, 6), "d MMM yyyy")}
        </span>
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setWeekStart(d => addDays(d, 7))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs ml-1"
          onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
        >
          This week
        </Button>
        {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground ml-auto" />}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-max">
          {/* Header row */}
          <div className="flex sticky top-0 z-10 border-b border-border bg-background">
            <div className="w-24 shrink-0 border-r border-border px-3 py-2 flex items-end">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Team</span>
            </div>
            {days.map((d) => {
              const dateStr = format(d, "yyyy-MM-dd");
              const isToday = dateStr === today;
              return (
                <div
                  key={dateStr}
                  className={cn(
                    "w-48 shrink-0 border-r border-border px-3 py-2 flex flex-col gap-0.5",
                    isToday ? "bg-blue-50" : "bg-background"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={cn("text-[11px] font-bold uppercase tracking-wide", isToday ? "text-primary" : "text-muted-foreground")}>
                      {DOW[d.getDay()]}
                    </span>
                    {isToday && (
                      <span className="text-[9px] bg-primary text-primary-foreground px-1.5 py-0 rounded-full font-bold uppercase tracking-wide">
                        Today
                      </span>
                    )}
                  </div>
                  <span className={cn("text-[11px]", isToday ? "text-primary font-medium" : "text-muted-foreground")}>
                    {MONTH[d.getMonth()]} {d.getDate()}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Team rows */}
          {teams.map((team) => (
            <div key={team.id} className="flex border-b border-border">
              {/* Team name */}
              <div className="w-24 shrink-0 border-r border-border px-3 py-2 sticky left-0 bg-background z-[5]">
                <span className="text-xs font-semibold">{team.name}</span>
              </div>

              {/* Day cells */}
              {days.map((d) => {
                const dateStr = format(d, "yyyy-MM-dd");
                const isToday = dateStr === today;
                const cellPlans = planIndex[`${team.id}-${dateStr}`] ?? [];

                return (
                  <div
                    key={dateStr}
                    className={cn(
                      "w-48 shrink-0 border-r border-border p-1.5 flex flex-col gap-1.5 min-h-[90px]",
                      isToday ? "bg-blue-50/40" : "bg-background"
                    )}
                  >
                    {cellPlans.map((p) => (
                      <ActivityCard
                        key={p.id}
                        plan={p}
                        onRemove={() => removeMutation.mutate(p.id)}
                      />
                    ))}

                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-auto h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground self-start"
                      onClick={() => setModal({ teamId: team.id, teamName: team.name, date: dateStr })}
                    >
                      <Plus className="w-3 h-3 mr-0.5" />
                      Add
                    </Button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Dialog */}
      {modal && (
        <AddActivityDialog
          teamName={modal.teamName}
          date={modal.date}
          locations={locations}
          onAdd={(data) =>
            addMutation.mutate({
              date:         modal.date,
              teamId:       modal.teamId,
              locationName: data.locationName,
              activityCode: data.activityCode,
              activityName: data.activityName,
              section:      data.section,
            })
          }
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
