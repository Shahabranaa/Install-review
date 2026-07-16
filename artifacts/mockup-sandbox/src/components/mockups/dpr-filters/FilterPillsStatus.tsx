import { useState } from "react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
type TeamStatus = "none" | "partial" | "full";

interface TeamEntry { id: number; name: string; }
interface TeamDaySummary { teamId: number; totalHours: number; }
interface DateSummary { date: string; label: string; teamData: TeamDaySummary[]; }

// ─── Mock data ────────────────────────────────────────────────────────────────
const TEAMS: TeamEntry[] = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Team ${i + 1}` }));

const DATE_DATA: DateSummary[] = [
  {
    date: "2026-06-16", label: "16/06",
    teamData: [
      { teamId: 1,  totalHours: 12.5 },
      { teamId: 2,  totalHours: 12.0 },
      { teamId: 3,  totalHours: 9.5  },  // partial
      { teamId: 4,  totalHours: 12.0 },
      { teamId: 5,  totalHours: 0    },  // none
      { teamId: 6,  totalHours: 12.0 },
      { teamId: 7,  totalHours: 11.0 },  // partial
      { teamId: 8,  totalHours: 12.0 },
      { teamId: 9,  totalHours: 12.0 },
      { teamId: 10, totalHours: 0    },  // none
      { teamId: 11, totalHours: 12.0 },
      { teamId: 12, totalHours: 12.0 },
    ],
  },
  {
    date: "2026-06-15", label: "15/06",
    teamData: [
      { teamId: 1,  totalHours: 12.0 },
      { teamId: 2,  totalHours: 13.0 },
      { teamId: 3,  totalHours: 12.0 },
      { teamId: 4,  totalHours: 12.5 },
      { teamId: 5,  totalHours: 9.0  },  // partial
      { teamId: 6,  totalHours: 12.0 },
      { teamId: 7,  totalHours: 12.0 },
      { teamId: 8,  totalHours: 12.0 },
      { teamId: 9,  totalHours: 11.5 },  // partial
      { teamId: 10, totalHours: 12.0 },
      { teamId: 11, totalHours: 12.0 },
      { teamId: 12, totalHours: 12.0 },
    ],
  },
  {
    date: "2026-06-14", label: "14/06",
    teamData: Array.from({ length: 12 }, (_, i) => ({ teamId: i + 1, totalHours: 12.0 })),
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTeamStatus(hours: number): TeamStatus {
  if (hours === 0) return "none";
  if (hours < 12) return "partial";
  return "full";
}

interface DateBreakdown {
  full: number; partial: number; none: number; total: number;
  worstStatus: TeamStatus;
}

function getDateBreakdown(summary: DateSummary): DateBreakdown {
  const statuses = summary.teamData.map((t) => getTeamStatus(t.totalHours));
  const full    = statuses.filter((s) => s === "full").length;
  const partial = statuses.filter((s) => s === "partial").length;
  const none    = statuses.filter((s) => s === "none").length;
  const total   = statuses.length;
  const worstStatus: TeamStatus = none > 0 ? "none" : partial > 0 ? "partial" : "full";
  return { full, partial, none, total, worstStatus };
}

// ─── Colour maps ──────────────────────────────────────────────────────────────
// Active (selected) pill — filled with status colour
const ACTIVE_PILL: Record<TeamStatus, string> = {
  full:    "bg-green-600  border-green-500  text-white",
  partial: "bg-amber-500  border-amber-400  text-white",
  none:    "bg-red-600    border-red-500    text-white",
};
// Inactive pill border
const INACTIVE_BORDER: Record<TeamStatus, string> = {
  full:    "border-green-500  text-white/70",
  partial: "border-amber-400  text-white/70",
  none:    "border-red-500    text-white/70",
};
// Team pill active fill
const TEAM_ACTIVE_FILL: Record<TeamStatus, string> = {
  full:    "bg-green-700  border-green-500  text-white",
  partial: "bg-amber-600  border-amber-400  text-white",
  none:    "bg-red-700    border-red-500    text-white",
};
// Team pill inactive border
const TEAM_BORDER: Record<TeamStatus, string> = {
  full:    "border-green-500  text-white/75",
  partial: "border-amber-400  text-white/75",
  none:    "border-red-500    text-white/75",
};

// ─── Segmented status bar ─────────────────────────────────────────────────────
function StatusBar({ breakdown }: { breakdown: DateBreakdown }) {
  const { full, partial, none, total } = breakdown;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="mt-1.5 w-full flex rounded-full overflow-hidden h-1.5 gap-px">
      {full    > 0 && <div style={{ width: pct(full)    }} className="bg-green-500  rounded-l-full" title={`${full} full`} />}
      {partial > 0 && <div style={{ width: pct(partial) }} className={cn("bg-amber-400", full === 0 ? "rounded-l-full" : "")} title={`${partial} partial`} />}
      {none    > 0 && <div style={{ width: pct(none)    }} className={cn("bg-red-500 rounded-r-full", full === 0 && partial === 0 ? "rounded-l-full" : "")} title={`${none} none`} />}
    </div>
  );
}

// ─── Date pill ────────────────────────────────────────────────────────────────
function DatePill({
  ds, isActive, onToggle,
}: {
  ds: DateSummary; isActive: boolean; onToggle: () => void;
}) {
  const bd = getDateBreakdown(ds);

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "shrink-0 flex flex-col items-start rounded-lg px-3 py-1.5 text-xs font-medium border transition-all min-w-[80px]",
        isActive
          ? ACTIVE_PILL[bd.worstStatus]
          : cn("bg-transparent hover:bg-white/5", INACTIVE_BORDER[bd.worstStatus])
      )}
    >
      {/* Label + count */}
      <div className="flex items-center justify-between w-full gap-2">
        <span className="font-semibold">{ds.label}</span>
        <span className={cn(
          "text-[10px] font-bold tabular-nums",
          isActive ? "text-white/80" : {
            "text-green-400": bd.worstStatus === "full",
            "text-amber-400": bd.worstStatus === "partial",
            "text-red-400":   bd.worstStatus === "none",
          }
        )}>
          {bd.full + bd.partial}/{bd.total}
        </span>
      </div>
      {/* Segmented bar */}
      <StatusBar breakdown={bd} />
    </button>
  );
}

// ─── Legend row ───────────────────────────────────────────────────────────────
function Legend() {
  return (
    <div className="flex items-center gap-5 px-6 py-2 border-b border-white/10 text-[11px] text-white/40">
      <span className="font-medium text-white/50 uppercase tracking-wider text-[10px]">Legend</span>
      {[
        { color: "bg-green-500 border-green-500", label: "≥ 12 h recorded" },
        { color: "bg-amber-400 border-amber-400", label: "< 12 h recorded" },
        { color: "bg-red-500   border-red-500",   label: "No time recorded" },
      ].map(({ color, label }) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={cn("inline-block w-2.5 h-2.5 rounded-full border", color)} />
          {label}
        </span>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function FilterPillsStatus() {
  const [activeDate, setActiveDate]     = useState<string | null>("2026-06-16");
  const [activeTeamId, setActiveTeamId] = useState<number | null>(null);

  const activeDateSummary = DATE_DATA.find((d) => d.date === activeDate) ?? null;

  const teamStatusMap = new Map<number, TeamStatus>(
    (activeDateSummary?.teamData ?? []).map((t) => [t.teamId, getTeamStatus(t.totalHours)])
  );

  return (
    <div className="min-h-screen bg-[#0f1623] flex flex-col font-sans select-none">

      {/* hint */}
      <div className="px-6 pt-4 pb-1 text-[11px] text-white/30 italic">
        Click date or team pills to toggle. Team pill colours reflect the selected date's coverage.
      </div>

      {/* ── Filter bar ── */}
      <div className="px-6 py-3 border-b border-white/10 bg-[#111827] flex flex-col gap-2.5">

        {/* Date row */}
        <div className="flex items-start gap-2">
          <span className="text-xs text-white/40 shrink-0 w-9 pt-2">Date</span>
          {DATE_DATA.map((ds) => (
            <DatePill
              key={ds.date}
              ds={ds}
              isActive={activeDate === ds.date}
              onToggle={() => setActiveDate((prev) => (prev === ds.date ? null : ds.date))}
            />
          ))}
        </div>

        {/* Team row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-white/40 shrink-0 w-9">Team</span>
          {TEAMS.map((team) => {
            const status: TeamStatus = activeDateSummary
              ? (teamStatusMap.get(team.id) ?? "none")
              : "full";
            const isActive = activeTeamId === team.id;
            return (
              <button
                key={team.id}
                type="button"
                onClick={() => setActiveTeamId((prev) => (prev === team.id ? null : team.id))}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-xs font-medium border-2 transition-all",
                  isActive ? TEAM_ACTIVE_FILL[status] : cn("bg-transparent hover:brightness-125", TEAM_BORDER[status])
                )}
              >
                {team.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Legend ── */}
      <Legend />

      {/* ── Annotation panels ── */}
      <div className="px-6 py-5 flex gap-5 text-xs text-white/60">

        {/* Date pill annotation */}
        <div className="flex-1 bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="font-semibold text-white/80 mb-4 text-sm">Date pills</p>
          <div className="flex flex-col gap-4">

            {/* All-green example */}
            <div className="flex items-center gap-3">
              <div className="shrink-0 flex flex-col items-start rounded-lg px-3 py-1.5 text-xs font-medium border border-green-500 bg-transparent min-w-[80px]">
                <div className="flex items-center justify-between w-full gap-2">
                  <span className="font-semibold text-white/70">14/06</span>
                  <span className="text-[10px] font-bold text-green-400">12/12</span>
                </div>
                <div className="mt-1.5 w-full flex rounded-full overflow-hidden h-1.5">
                  <div className="w-full bg-green-500 rounded-full" />
                </div>
              </div>
              <span className="text-white/50">All 12 teams ≥ 12 h — solid green bar</span>
            </div>

            {/* Amber example */}
            <div className="flex items-center gap-3">
              <div className="shrink-0 flex flex-col items-start rounded-lg px-3 py-1.5 text-xs font-medium border border-amber-400 bg-transparent min-w-[80px]">
                <div className="flex items-center justify-between w-full gap-2">
                  <span className="font-semibold text-white/70">15/06</span>
                  <span className="text-[10px] font-bold text-amber-400">10/12</span>
                </div>
                <div className="mt-1.5 w-full flex rounded-full overflow-hidden h-1.5 gap-px">
                  <div style={{ width: "83%" }} className="bg-green-500 rounded-l-full" />
                  <div style={{ width: "17%" }} className="bg-amber-400 rounded-r-full" />
                </div>
              </div>
              <span className="text-white/50">All logged, 2 under 12 h — amber border, split bar</span>
            </div>

            {/* Red example */}
            <div className="flex items-center gap-3">
              <div className="shrink-0 flex flex-col items-start rounded-lg px-3 py-1.5 text-xs font-medium border border-red-500 bg-transparent min-w-[80px]">
                <div className="flex items-center justify-between w-full gap-2">
                  <span className="font-semibold text-white/70">16/06</span>
                  <span className="text-[10px] font-bold text-red-400">10/12</span>
                </div>
                <div className="mt-1.5 w-full flex rounded-full overflow-hidden h-1.5 gap-px">
                  <div style={{ width: "67%" }} className="bg-green-500 rounded-l-full" />
                  <div style={{ width: "16%" }} className="bg-amber-400" />
                  <div style={{ width: "17%" }} className="bg-red-500 rounded-r-full" />
                </div>
              </div>
              <span className="text-white/50">2 teams with zero time — red border, split bar</span>
            </div>

            {/* Selected state */}
            <div className="flex items-center gap-3">
              <div className="shrink-0 flex flex-col items-start rounded-lg px-3 py-1.5 text-xs font-medium border border-red-500 bg-red-600 min-w-[80px]">
                <div className="flex items-center justify-between w-full gap-2">
                  <span className="font-semibold text-white">16/06</span>
                  <span className="text-[10px] font-bold text-white/70">10/12</span>
                </div>
                <div className="mt-1.5 w-full flex rounded-full overflow-hidden h-1.5 gap-px">
                  <div style={{ width: "67%" }} className="bg-white/50 rounded-l-full" />
                  <div style={{ width: "16%" }} className="bg-white/30" />
                  <div style={{ width: "17%" }} className="bg-white/20 rounded-r-full" />
                </div>
              </div>
              <span className="text-white/50">Selected — filled with status colour; bar visible in white tones</span>
            </div>

          </div>
        </div>

        {/* Team pill annotation */}
        <div className="flex-1 bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="font-semibold text-white/80 mb-4 text-sm">Team pills (for selected date)</p>
          <div className="flex flex-col gap-3">
            {[
              { label: "Team 1",  border: TEAM_BORDER.full,    note: "≥ 12 h on this date" },
              { label: "Team 3",  border: TEAM_BORDER.partial,  note: "9.5 h — under 12 h" },
              { label: "Team 5",  border: TEAM_BORDER.none,     note: "No entries recorded" },
            ].map(({ label, border, note }) => (
              <div key={label} className="flex items-center gap-3">
                <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-medium border-2 bg-transparent shrink-0", border)}>
                  {label}
                </span>
                <span className="text-white/50">{note}</span>
              </div>
            ))}
            <div className="flex items-center gap-3 mt-1">
              <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-medium border-2 shrink-0", TEAM_ACTIVE_FILL.none)}>
                Team 5
              </span>
              <span className="text-white/50">Selected — fills with status colour</span>
            </div>
            <p className="text-white/35 text-[11px] mt-2 pt-2 border-t border-white/10">
              Without a date selected, team pills show neutral styling. Colours only apply when a specific date is active.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
