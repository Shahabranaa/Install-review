import { useState } from "react";
import { cn } from "@/lib/utils";

// ── Sample data mimicking real DPR state ─────────────────────────────────────
const TEAMS = [
  "Team 1", "Team 2", "Team 3", "Team 4",
  "Team 5", "Team 6", "Team 7", "Team 8",
  "Team 9", "Team 10", "Team 11", "Team 12",
];

// 20 sample dates going backwards from 16 Jul 2026
const ALL_DATES = Array.from({ length: 20 }, (_, i) => {
  const d = new Date(2026, 6, 16 - i); // months are 0-indexed
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return { iso: `${d.getFullYear()}-${mm}-${dd}`, label: `${dd}/${mm}` };
});

export function FilterPills() {
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [activeTeamId, setActiveTeamId] = useState<number | null>(null);
  const [visibleDateRows, setVisibleDateRows] = useState(1);

  const pageSize = TEAMS.length; // dates per row = number of teams
  const visibleDates = ALL_DATES.slice(0, visibleDateRows * pageSize);
  const hasMore = ALL_DATES.length > visibleDates.length;

  // Split visible dates into rows of pageSize
  const dateRows: typeof ALL_DATES[] = [];
  for (let i = 0; i < visibleDates.length; i += pageSize) {
    dateRows.push(visibleDates.slice(i, i + pageSize));
  }

  return (
    <div className="min-h-screen bg-[#0a0f1a] flex items-start justify-center pt-10 px-6">
      <div className="w-full max-w-5xl">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white tracking-tight">Timesheet Capture</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Enter raw field hours to be clarified. Paste directly from a spreadsheet or add rows one at a time.
          </p>
        </div>

        {/* Filter pill area */}
        <div className="border border-slate-700/60 rounded-lg bg-slate-900/50 px-4 py-3 flex flex-col gap-2">

          {/* ── Date rows ─────────────────────────────────────────────── */}
          {dateRows.map((row, rowIdx) => {
            const isLastRow = rowIdx === dateRows.length - 1;
            return (
              <div key={rowIdx} className="flex items-center gap-1.5">
                {/* Label only on first row */}
                <span
                  className="text-xs text-slate-500 w-10 shrink-0 select-none"
                  style={{ visibility: rowIdx === 0 ? "visible" : "hidden" }}
                >
                  Date
                </span>

                {/* Date pills */}
                {row.map((d) => (
                  <button
                    key={d.iso}
                    onClick={() => setActiveDate(activeDate === d.iso ? null : d.iso)}
                    className={cn(
                      "rounded-full px-3 py-0.5 text-xs font-medium border transition-all duration-150 shrink-0",
                      activeDate === d.iso
                        ? "bg-cyan-500 text-white border-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.4)]"
                        : "bg-transparent text-slate-400 border-slate-600 hover:border-cyan-500/60 hover:text-slate-200"
                    )}
                  >
                    {d.label}
                  </button>
                ))}

                {/* Show more at end of last row only */}
                {isLastRow && hasMore && (
                  <button
                    onClick={() => setVisibleDateRows((n) => n + 1)}
                    className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors shrink-0 ml-1 underline underline-offset-2"
                  >
                    show more
                  </button>
                )}
              </div>
            );
          })}

          {/* Divider */}
          <div className="border-t border-slate-700/40 my-0.5" />

          {/* ── Team row ──────────────────────────────────────────────── */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 w-10 shrink-0 select-none">Team</span>
            {TEAMS.map((name, idx) => (
              <button
                key={idx}
                onClick={() => setActiveTeamId(activeTeamId === idx ? null : idx)}
                className={cn(
                  "rounded-full px-3 py-0.5 text-xs font-medium border transition-all duration-150 shrink-0",
                  activeTeamId === idx
                    ? "bg-cyan-500 text-white border-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.4)]"
                    : "bg-transparent text-slate-400 border-slate-600 hover:border-cyan-500/60 hover:text-slate-200"
                )}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* Annotation */}
        <div className="mt-4 flex items-start gap-6 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-cyan-500" />
            Active filter
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full border border-slate-600" />
            Inactive
          </div>
          <span className="ml-2">
            Page size = {TEAMS.length} (team count) · {ALL_DATES.length} dates total · click "show more" to expand one row at a time
          </span>
        </div>
      </div>
    </div>
  );
}
