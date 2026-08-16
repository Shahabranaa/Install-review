import { useState } from "react";

const DOMAIN = "942c94df-2dcd-42a8-9d3d-5065ada1279c-00-306oz2e0dl4xy.pike.replit.dev";

// ── Mock data ──────────────────────────────────────────────────────────────────

const TEAMS = [
  { id: 1, name: "Alpha" },
  { id: 2, name: "Bravo" },
  { id: 3, name: "Charlie" },
  { id: 4, name: "Delta" },
];

const SCOPES = [
  "Hull Inspection",
  "Corrosion Survey",
  "Cathodic Protection",
  "Non-Destructive Testing",
  "Structural Survey",
  "Thickness Measurement",
  "Marine Growth Removal",
  "Rope Access",
];

const LOCATION_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  "Platform A-12": { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-800", dot: "bg-purple-400" },
  "Vessel Aquata":  { bg: "bg-blue-50",   border: "border-blue-200",   text: "text-blue-800",   dot: "bg-blue-400" },
  "Jacket B-07":   { bg: "bg-green-50",  border: "border-green-200",  text: "text-green-800",  dot: "bg-green-400" },
  "FPSO Meridian": { bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-800",  dot: "bg-amber-400" },
  "Buoy Station 3":{ bg: "bg-rose-50",   border: "border-rose-200",   text: "text-rose-800",   dot: "bg-rose-400" },
};

const colorFor = (loc: string) =>
  LOCATION_COLORS[loc] ?? { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-700", dot: "bg-slate-400" };

function getWeekDates(base: Date) {
  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    days.push(d);
  }
  return days;
}

function fmtDay(d: Date) {
  return d.toLocaleDateString("en-GB", { weekday: "short" });
}
function fmtDate(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}
function isToday(d: Date) {
  const now = new Date();
  return d.toDateString() === now.toDateString();
}
function isPast(d: Date) {
  const now = new Date();
  now.setHours(0,0,0,0);
  return d < now;
}

type LocationEntry = {
  id: string;
  location: string;
  scope: string;
};

type CellKey = `${number}-${number}`; // teamId-dayIndex
type Assignments = Record<CellKey, LocationEntry[]>;

const INITIAL: Assignments = {
  "1-0": [{ id: "a1", location: "Platform A-12", scope: "Hull Inspection" }],
  "1-1": [{ id: "a2", location: "Platform A-12", scope: "Hull Inspection" }, { id: "a3", location: "Vessel Aquata", scope: "Rope Access" }],
  "1-2": [{ id: "a4", location: "Vessel Aquata", scope: "Corrosion Survey" }],
  "2-0": [{ id: "b1", location: "Jacket B-07", scope: "Structural Survey" }, { id: "b2", location: "Jacket B-07", scope: "Thickness Measurement" }],
  "2-1": [{ id: "b3", location: "Jacket B-07", scope: "Structural Survey" }],
  "2-3": [{ id: "b4", location: "FPSO Meridian", scope: "Marine Growth Removal" }],
  "3-0": [{ id: "c1", location: "FPSO Meridian", scope: "Non-Destructive Testing" }],
  "3-1": [{ id: "c2", location: "FPSO Meridian", scope: "Non-Destructive Testing" }],
  "3-2": [{ id: "c3", location: "FPSO Meridian", scope: "Cathodic Protection" }],
  "3-3": [{ id: "c4", location: "Buoy Station 3", scope: "Cathodic Protection" }],
  "4-2": [{ id: "d1", location: "Platform A-12", scope: "Thickness Measurement" }],
};

// ── Add-location modal ─────────────────────────────────────────────────────────

const ALL_LOCATIONS = Object.keys(LOCATION_COLORS);

function AddModal({
  onAdd,
  onClose,
}: {
  onAdd: (loc: string, scope: string) => void;
  onClose: () => void;
}) {
  const [loc, setLoc] = useState(ALL_LOCATIONS[0]);
  const [scope, setScope] = useState(SCOPES[0]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-80 overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-widest">Assign</p>
            <h3 className="text-[15px] font-semibold text-slate-800 mt-0.5">Add Location</h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors text-base"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Location */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Location</label>
            <div className="relative">
              <select
                value={loc}
                onChange={(e) => setLoc(e.target.value)}
                className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 pr-8"
              >
                {ALL_LOCATIONS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/></svg>
            </div>
          </div>

          {/* Scope */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Scope of Work</label>
            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white max-h-48 overflow-y-auto">
              {SCOPES.map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`w-full text-left px-3.5 py-2.5 text-[12px] flex items-center gap-2.5 transition-colors border-b border-slate-50 last:border-0 ${
                    scope === s
                      ? "bg-blue-600 text-white"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${scope === s ? "bg-white/60" : "bg-slate-300"}`} />
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-[12px] font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { onAdd(loc, scope); onClose(); }}
            className="px-4 py-1.5 text-[12px] font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Add Location
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Location card ──────────────────────────────────────────────────────────────

function LocationCard({ entry, onRemove }: { entry: LocationEntry; onRemove: () => void }) {
  const c = colorFor(entry.location);
  return (
    <div className={`group relative rounded-lg border px-2 py-1.5 ${c.bg} ${c.border} flex flex-col gap-0.5`}>
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
        <span className={`text-[11px] font-semibold leading-tight ${c.text} truncate`}>{entry.location}</span>
      </div>
      <span className="text-[10px] text-slate-500 leading-tight pl-3 truncate">{entry.scope}</span>
      <button
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-300 items-center justify-center text-[10px] font-bold hidden group-hover:flex shadow-sm transition-colors"
      >×</button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function TeamLocationCalendar() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = getWeekDates(today);

  const [assignments, setAssignments] = useState<Assignments>(INITIAL);
  const [modal, setModal] = useState<{ teamId: number; dayIdx: number } | null>(null);

  function addEntry(teamId: number, dayIdx: number, loc: string, scope: string) {
    const key: CellKey = `${teamId}-${dayIdx}`;
    setAssignments((prev) => ({
      ...prev,
      [key]: [...(prev[key] ?? []), { id: `${Date.now()}`, location: loc, scope }],
    }));
  }

  function removeEntry(teamId: number, dayIdx: number, entryId: string) {
    const key: CellKey = `${teamId}-${dayIdx}`;
    setAssignments((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).filter((e) => e.id !== entryId),
    }));
  }

  return (
    <div className="min-h-screen bg-[#f4f5f7] font-sans text-slate-800 overflow-auto">
      {/* ── Top nav ── */}
      <div className="bg-white border-b border-slate-200 flex items-center gap-6 px-6 h-11 sticky top-0 z-20">
        <span className="text-[11px] font-bold tracking-[0.2em] text-slate-800">H O R I Z O N</span>
        <div className="flex gap-1">
          {["Map", "Planning ▾", "Site ▾", "Setup ▾", "Customise ▾"].map((n) => (
            <button key={n} className={`px-3 py-1 text-[12px] rounded transition-colors ${n.startsWith("Planning") ? "text-blue-600 font-semibold border-b-2 border-blue-600" : "text-slate-500 hover:text-slate-700"}`}>{n}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-slate-500">
          <span>andrew.spence.contractor@jd...</span>
          <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-600 text-[10px]">Contractor</span>
        </div>
      </div>

      {/* ── Sub-nav ── */}
      <div className="bg-white border-b border-slate-100 flex items-center gap-4 px-6 h-9 sticky top-11 z-20">
        {["Campaigns", "Planning", "Lookahead"].map((t) => (
          <button key={t} className={`text-[12px] pb-0.5 border-b-2 transition-colors ${t === "Lookahead" ? "border-blue-500 text-blue-600 font-semibold" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{t}</button>
        ))}
      </div>

      {/* ── Page header ── */}
      <div className="px-6 pt-5 pb-3 flex items-start justify-between sticky top-20 z-20 bg-[#f4f5f7]">
        <div>
          <h1 className="text-[20px] font-bold text-slate-900">Planning</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">Manage location assignments for teams</p>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 text-[11px] bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors shadow-sm">
            Task List <span className="ml-1 bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-semibold">0</span>
          </button>
          <button className="px-3 py-1.5 text-[11px] bg-white border border-red-200 rounded-lg text-red-500 hover:bg-red-50 transition-colors shadow-sm">
            Rejected <span className="ml-1 bg-red-100 px-1.5 py-0.5 rounded text-[10px] font-semibold">3</span>
          </button>
        </div>
      </div>

      {/* ── Calendar ── */}
      <div className="px-6 pb-8 overflow-x-auto">
        <div className="min-w-max">
          {/* Column headers */}
          <div className="flex">
            {/* Team label column */}
            <div className="w-32 shrink-0 bg-white border-r border-b border-slate-200 sticky left-0 z-10 flex items-end px-3 pb-2">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Team</span>
            </div>

            {days.map((d, i) => {
              const past = isPast(d);
              const today_ = isToday(d);
              return (
                <div
                  key={i}
                  className={`w-44 shrink-0 border-r border-b border-slate-200 px-2.5 py-2 flex flex-col gap-0.5 ${
                    today_ ? "bg-blue-50" : past ? "bg-slate-50" : "bg-white"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[11px] font-bold uppercase tracking-wide ${today_ ? "text-blue-600" : "text-slate-600"}`}>{fmtDay(d)}</span>
                    {today_ && <span className="text-[9px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wide">Today</span>}
                    {!today_ && !past && (
                      <svg className="w-3 h-3 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                    )}
                  </div>
                  <span className={`text-[11px] ${today_ ? "text-blue-500 font-medium" : "text-slate-400"}`}>{fmtDate(d)}</span>
                </div>
              );
            })}
          </div>

          {/* Team rows */}
          {TEAMS.map((team) => (
            <div key={team.id} className="flex">
              {/* Team name */}
              <div className="w-32 shrink-0 bg-white border-r border-b border-slate-200 sticky left-0 z-10 flex items-start pt-3 px-3">
                <span className="text-[12px] font-semibold text-slate-700">{team.name}</span>
              </div>

              {days.map((d, dayIdx) => {
                const key: CellKey = `${team.id}-${dayIdx}`;
                const entries = assignments[key] ?? [];
                const past = isPast(d);
                const today_ = isToday(d);

                return (
                  <div
                    key={dayIdx}
                    className={`w-44 shrink-0 border-r border-b border-slate-200 p-2 flex flex-col gap-1.5 min-h-[90px] ${
                      today_ ? "bg-blue-50/40" : past ? "bg-slate-50/60" : "bg-white"
                    }`}
                  >
                    {entries.map((e) => (
                      <LocationCard
                        key={e.id}
                        entry={e}
                        onRemove={() => removeEntry(team.id, dayIdx, e.id)}
                      />
                    ))}

                    {/* Add button */}
                    <button
                      onClick={() => setModal({ teamId: team.id, dayIdx })}
                      className="mt-auto self-start flex items-center gap-1 px-2 py-1 rounded-full bg-blue-600 text-white text-[10px] font-bold hover:bg-blue-700 transition-colors shadow-sm"
                    >
                      <span className="text-[13px] leading-none">+</span>
                      <span>Add</span>
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Modal ── */}
      {modal && (
        <AddModal
          onAdd={(loc, scope) => addEntry(modal.teamId, modal.dayIdx, loc, scope)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
