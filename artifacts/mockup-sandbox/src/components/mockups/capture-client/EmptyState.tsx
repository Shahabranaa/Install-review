import { useState } from "react";
import { CalendarDays, Users, ClipboardPaste } from "lucide-react";

const DATES = ["14/06", "15/06", "16/06", "17/06", "18/06"];
const TEAMS = ["Team 7", "Team 8", "Team 9"];

export function EmptyState() {
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [activeTeam, setActiveTeam] = useState<string | null>(null);

  const bothSelected = activeDate !== null && activeTeam !== null;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans">
      {/* Header */}
      <header className="px-6 py-4 border-b border-border bg-card flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Timesheet Capture</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Click any cell to edit it directly. Select a date and team to start.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm font-medium bg-background hover:bg-muted transition-colors">
            <ClipboardPaste className="w-4 h-4" />
            Paste Rows
          </button>
          {/* Add Row only appears once both filters are active */}
          {bothSelected && (
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              + Add Row
            </button>
          )}
        </div>
      </header>

      {/* Filter pills */}
      <div className="px-6 py-3 border-b border-border bg-card/50 shrink-0 space-y-2">
        {/* Date row */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-10 shrink-0">Date</span>
          <div className="flex gap-1.5 flex-wrap">
            {DATES.map((d) => (
              <button
                key={d}
                onClick={() => setActiveDate(activeDate === d ? null : d)}
                className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  activeDate === d
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-transparent text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        {/* Team row */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-10 shrink-0">Team</span>
          <div className="flex gap-1.5">
            {TEAMS.map((t) => (
              <button
                key={t}
                onClick={() => setActiveTeam(activeTeam === t ? null : t)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  activeTeam === t
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-transparent text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main content — gated empty state */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="flex gap-4 text-muted-foreground/30">
          <CalendarDays className="w-10 h-10" />
          <Users className="w-10 h-10" />
        </div>

        <div>
          <p className="text-lg font-semibold text-foreground">
            {!activeDate && !activeTeam
              ? "Select a date and team to start"
              : !activeDate
              ? "Now select a date"
              : "Now select a team"}
          </p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            {!activeDate && !activeTeam
              ? "Choose a date pill and a team pill above — the table appears once both are selected."
              : !activeDate
              ? "Pick a date above to see that team's entries."
              : "Pick a team above to see entries for that date."}
          </p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            activeDate ? "bg-primary/10 border-primary text-primary" : "bg-muted/40 border-border text-muted-foreground"
          }`}>
            <CalendarDays className="w-3.5 h-3.5" />
            {activeDate ? `${activeDate} selected` : "1. Select date"}
          </div>
          <div className="w-4 h-px bg-border" />
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            activeTeam ? "bg-primary/10 border-primary text-primary" : "bg-muted/40 border-border text-muted-foreground"
          }`}>
            <Users className="w-3.5 h-3.5" />
            {activeTeam ? `${activeTeam} selected` : "2. Select team"}
          </div>
        </div>

        {bothSelected && (
          <p className="text-sm text-muted-foreground animate-pulse">
            Table ready — click "+ Add Row" to start entering hours.
          </p>
        )}
      </div>
    </div>
  );
}
