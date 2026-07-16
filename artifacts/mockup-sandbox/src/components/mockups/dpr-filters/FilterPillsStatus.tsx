import { useState } from "react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
type TeamStatus = "none" | "partial" | "full"; // no time | < 12h | ≥ 12h

interface TeamEntry {
  id: number;
  name: string;
}

interface TeamDaySummary {
  teamId: number;
  totalHours: number; // 0 = none recorded
}

interface DateSummary {
  date: string;
  label: string;
  teamData: TeamDaySummary[];
}

// ─── Mock data ────────────────────────────────────────────────────────────────
const TEAMS: TeamEntry[] = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  name: `Team ${i + 1}`,
}));

// Per-date breakdown: what each team recorded
const DATE_DATA: DateSummary[] = [
  {
    date: "2026-06-16",
    label: "16/06",
    teamData: [
      { teamId: 1, totalHours: 12.5 },
      { teamId: 2, totalHours: 12.0 },
      { teamId: 3, totalHours: 9.5 },   // partial
      { teamId: 4, totalHours: 12.0 },
      { teamId: 5, totalHours: 0 },      // none
      { teamId: 6, totalHours: 12.0 },
      { teamId: 7, totalHours: 11.0 },   // partial
      { teamId: 8, totalHours: 12.0 },
      { teamId: 9, totalHours: 12.0 },
      { teamId: 10, totalHours: 0 },     // none
      { teamId: 11, totalHours: 12.0 },
      { teamId: 12, totalHours: 12.0 },
    ],
  },
  {
    date: "2026-06-15",
    label: "15/06",
    teamData: [
      { teamId: 1, totalHours: 12.0 },
      { teamId: 2, totalHours: 13.0 },
      { teamId: 3, totalHours: 12.0 },
      { teamId: 4, totalHours: 12.5 },
      { teamId: 5, totalHours: 9.0 },   // partial
      { teamId: 6, totalHours: 12.0 },
      { teamId: 7, totalHours: 12.0 },
      { teamId: 8, totalHours: 12.0 },
      { teamId: 9, totalHours: 11.5 },  // partial
      { teamId: 10, totalHours: 12.0 },
      { teamId: 11, totalHours: 12.0 },
      { teamId: 12, totalHours: 12.0 },
    ],
  },
  {
    date: "2026-06-14",
    label: "14/06",
    teamData: [
      { teamId: 1, totalHours: 12.0 },
      { teamId: 2, totalHours: 12.0 },
      { teamId: 3, totalHours: 12.0 },
      { teamId: 4, totalHours: 12.0 },
      { teamId: 5, totalHours: 12.0 },
      { teamId: 6, totalHours: 12.0 },
      { teamId: 7, totalHours: 12.0 },
      { teamId: 8, totalHours: 12.0 },
      { teamId: 9, totalHours: 12.0 },
      { teamId: 10, totalHours: 12.0 },
      { teamId: 11, totalHours: 12.0 },
      { teamId: 12, totalHours: 12.0 },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTeamStatus(hours: number): TeamStatus {
  if (hours === 0) return "none";
  if (hours < 12) return "partial";
  return "full";
}

function getDateOverallStatus(summary: DateSummary): TeamStatus {
  const statuses = summary.teamData.map((t) => getTeamStatus(t.totalHours));
  if (statuses.some((s) => s === "none")) return "none";
  if (statuses.some((s) => s === "partial")) return "partial";
  return "full";
}

function countTeamsWithTime(summary: DateSummary): { recorded: number; total: number } {
  const recorded = summary.teamData.filter((t) => t.totalHours > 0).length;
  return { recorded, total: summary.teamData.length };
}

// ─── Colour tokens ────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<TeamStatus, { border: string; text: string; badgeBg: string; badgeText: string }> = {
  none:    { border: "border-red-500",    text: "text-red-400",    badgeBg: "bg-red-500/20",    badgeText: "text-red-400" },
  partial: { border: "border-amber-400",  text: "text-amber-400",  badgeBg: "bg-amber-400/20",  badgeText: "text-amber-400" },
  full:    { border: "border-green-500",  text: "text-green-400",  badgeBg: "bg-green-500/20",  badgeText: "text-green-400" },
};

// ─── Legend ───────────────────────────────────────────────────────────────────
function Legend() {
  return (
    <div className="flex items-center gap-5 px-6 py-2 border-b border-white/10 text-xs text-white/40">
      <span className="font-medium text-white/50 uppercase tracking-wider text-[10px]">Legend</span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-full border-2 border-green-500" />
        <span>≥ 12 h recorded</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-full border-2 border-amber-400" />
        <span>Time recorded, but &lt; 12 h</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-full border-2 border-red-500" />
        <span>No time recorded</span>
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function FilterPillsStatus() {
  const [activeDate, setActiveDate] = useState<string | null>("2026-06-16");
  const [activeTeamId, setActiveTeamId] = useState<number | null>(null);

  const activeDateSummary = DATE_DATA.find((d) => d.date === activeDate) ?? null;

  const teamStatusMap = new Map<number, TeamStatus>(
    (activeDateSummary?.teamData ?? []).map((t) => [t.teamId, getTeamStatus(t.totalHours)])
  );

  return (
    <div className="min-h-screen bg-[#0f1623] flex flex-col font-sans">

      {/* ── Annotation ── */}
      <div className="px-6 pt-4 pb-1 text-xs text-white/35 italic">
        Click a date or team pill to see selection behaviour. Status colours update per-date selection.
      </div>

      {/* ── Filter bar ── */}
      <div className="px-6 py-3 border-b border-white/10 bg-[#111827] flex flex-col gap-2">

        {/* Date row */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40 shrink-0 w-9">Date</span>
          {DATE_DATA.map((ds) => {
            const overallStatus = getDateOverallStatus(ds);
            const { recorded, total } = countTeamsWithTime(ds);
            const col = STATUS_COLORS[overallStatus];
            const isActive = activeDate === ds.date;

            return (
              <button
                key={ds.date}
                type="button"
                onClick={() => setActiveDate((prev) => (prev === ds.date ? null : ds.date))}
                className={cn(
                  "shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-all",
                  isActive
                    ? "bg-sky-500 text-white border-sky-500"
                    : cn("bg-transparent border-white/20 text-white/70 hover:border-white/40", col.border)
                )}
              >
                <span>{ds.label}</span>
                {/* Coverage badge */}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums",
                    isActive
                      ? "bg-white/20 text-white"
                      : cn(col.badgeBg, col.badgeText)
                  )}
                >
                  {recorded}/{total}
                </span>
              </button>
            );
          })}
        </div>

        {/* Team row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-white/40 shrink-0 w-9">Team</span>
          {TEAMS.map((team) => {
            const status: TeamStatus = activeDateSummary
              ? (teamStatusMap.get(team.id) ?? "none")
              : "full"; // no date selected → neutral (show green/default)
            const col = STATUS_COLORS[status];
            const isActive = activeTeamId === team.id;

            return (
              <button
                key={team.id}
                type="button"
                onClick={() => setActiveTeamId((prev) => (prev === team.id ? null : team.id))}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-xs font-medium border-2 transition-all",
                  isActive
                    ? cn("text-white", {
                        "bg-green-600 border-green-500": status === "full",
                        "bg-amber-600 border-amber-400": status === "partial",
                        "bg-red-700 border-red-500": status === "none",
                      })
                    : cn("bg-transparent text-white/70 hover:text-white", col.border)
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

      {/* ── Annotation callouts ── */}
      <div className="px-6 py-4 flex flex-col gap-4 text-xs text-white/60">

        <div className="flex gap-6">
          {/* Date pill annotations */}
          <div className="flex-1 bg-white/5 rounded-lg p-4 border border-white/10">
            <p className="font-semibold text-white/80 mb-3 text-sm">Date pills — coverage badge</p>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border bg-transparent text-white/70 border-green-500")}>
                  14/06 <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-green-500/20 text-green-400">12/12</span>
                </span>
                <span className="text-white/50">All 12 teams have ≥ 12 h — green badge</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border bg-transparent text-white/70 border-amber-400")}>
                  15/06 <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-amber-400/20 text-amber-400">10/12</span>
                </span>
                <span className="text-white/50">All logged time, but 2 teams &lt; 12 h — amber badge</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border bg-transparent text-white/70 border-red-500")}>
                  16/06 <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-red-500/20 text-red-400">10/12</span>
                </span>
                <span className="text-white/50">2 teams have zero time — red badge</span>
              </div>
            </div>
          </div>

          {/* Team pill annotations */}
          <div className="flex-1 bg-white/5 rounded-lg p-4 border border-white/10">
            <p className="font-semibold text-white/80 mb-3 text-sm">Team pills — status border (for selected date)</p>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <span className="inline-flex rounded-full px-3 py-1 text-xs font-medium border-2 border-green-500 bg-transparent text-white/70">Team 1</span>
                <span className="text-white/50">≥ 12 h recorded for this date</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex rounded-full px-3 py-1 text-xs font-medium border-2 border-amber-400 bg-transparent text-white/70">Team 3</span>
                <span className="text-white/50">Time recorded, but &lt; 12 h</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex rounded-full px-3 py-1 text-xs font-medium border-2 border-red-500 bg-transparent text-white/70">Team 5</span>
                <span className="text-white/50">No time recorded for this date</span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-white/35 text-[11px]">
          Note: team pill colours only apply when a date is selected — they reflect that date's coverage. Without a date filter, pills show neutral styling.
          The existing active-state (filled background) is preserved; the status border colour carries through even when active.
        </p>
      </div>

    </div>
  );
}
