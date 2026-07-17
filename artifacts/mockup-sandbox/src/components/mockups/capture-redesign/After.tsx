import { useState } from "react";
import { cn } from "@/lib/utils";

const DATES = [
  { label: "17/07", count: 0, total: 12 },
  { label: "16/06", count: 1, total: 12 },
  { label: "15/06", count: 1, total: 12 },
  { label: "14/06", count: 12, total: 12 },
];
const TEAMS = ["Team 1","Team 2","Team 3","Team 4","Team 5","Team 6","Team 7","Team 8","Team 9","Team 10","Team 11","Team 12"];

// Duration helper
function calcDuration(start: string, end: string): string {
  if (!start || !end) return "—";
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) return "—";
  return `${(mins / 60).toFixed(2)}h`;
}

function StatusBar({ count, total }: { count: number; total: number }) {
  const pct = total === 0 ? 0 : count / total;
  const color = count === 0 ? "#ef4444" : pct >= 1 ? "#22c55e" : "#f59e0b";
  return (
    <div className="mt-0.5 w-full h-1 rounded-full bg-white/10 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct * 100, 100)}%`, backgroundColor: color }} />
    </div>
  );
}

const ENTRIES = [
  { start: "06:00", end: "14:00", location: "A07", notes: "Waiting on transfer to platform, vessel delayed", type: "Non-Working", group: null },
  { start: "14:00", end: "22:00", location: "Vessel", notes: "Routine maintenance on turbine nacelle, torque checks completed", type: "Effective", group: "Effective" },
];

export function After() {
  const [activeDate, setActiveDate] = useState("17/07");
  const [activeTeam, setActiveTeam] = useState("Team 1");
  const [showNewRow, setShowNewRow] = useState(true);
  const [newStart, setNewStart] = useState("00:00");
  const [newEnd, setNewEnd] = useState("00:00");

  const hasContext = activeDate && activeTeam;
  const totalHours = ENTRIES.reduce((acc, e) => {
    const d = calcDuration(e.start, e.end);
    return acc + (d === "—" ? 0 : parseFloat(d));
  }, 0);

  return (
    <div className="h-screen bg-[#0a0f1a] flex overflow-hidden text-white font-sans">
      {/* Sidebar */}
      <div className="w-40 shrink-0 bg-[#0d1322] border-r border-slate-800 flex flex-col pt-4 px-3 gap-1">
        <div className="flex items-center gap-2 mb-6 px-1">
          <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center text-[10px] font-bold">D</div>
          <div>
            <div className="text-[11px] font-bold text-white">DPR</div>
            <div className="text-[9px] text-slate-500">TIMESHEETS</div>
          </div>
        </div>
        {["Capture","Clarify","JDR Mapping"].map(item => (
          <div key={item} className={cn("px-2 py-1.5 rounded text-[11px] cursor-pointer flex items-center justify-between", item === "Capture" ? "bg-blue-600/20 text-blue-400" : "text-slate-400 hover:text-white")}>
            <span>{item}</span>
            {item === "Capture" && <span className="bg-blue-500/30 text-blue-300 text-[9px] px-1.5 py-0.5 rounded-full">22</span>}
            {item === "Clarify" && <span className="bg-amber-500/30 text-amber-300 text-[9px] px-1.5 py-0.5 rounded-full">31</span>}
          </div>
        ))}
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header — Paste Rows only, Add Row removed */}
        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-base font-bold tracking-tight">Timesheet Capture</h1>
            <p className="text-[11px] text-slate-400 mt-0.5">Enter raw field hours to be clarified. Paste directly from a spreadsheet or add rows one at a time.</p>
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border border-slate-600 text-slate-300 bg-slate-800 hover:bg-slate-700">
              <span>⊞</span> Paste Rows
            </button>
            {/* Add Row is GONE from here */}
          </div>
        </div>

        {/* Filter pills */}
        <div className="px-5 py-2.5 border-b border-slate-800 shrink-0 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-500 w-8 shrink-0">Date</span>
            {DATES.map(d => {
              const isActive = activeDate === d.label;
              const statusColor = d.count === 0 ? "border-red-500" : d.count >= d.total ? "border-green-500" : "border-amber-500";
              return (
                <button key={d.label} onClick={() => setActiveDate(isActive ? "" : d.label)} className={cn("flex flex-col px-2.5 py-1 rounded-full border text-[10px] font-medium min-w-[64px] transition-colors", isActive ? "bg-blue-600 border-blue-400 text-white" : cn("bg-slate-800/60 text-slate-300", statusColor))}>
                  <div className="flex justify-between items-center gap-1">
                    <span className="font-bold">{d.label}</span>
                    <span className="opacity-70">{d.count}/{d.total}</span>
                  </div>
                  <StatusBar count={d.count} total={d.total} />
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-500 w-8 shrink-0">Team</span>
            {TEAMS.map(t => (
              <button key={t} onClick={() => setActiveTeam(t === activeTeam ? "" : t)} className={cn("px-2.5 py-1 rounded-full border text-[10px] font-medium transition-colors", activeTeam === t ? "bg-blue-600 border-blue-400 text-white" : "bg-slate-800/60 border-slate-600 text-slate-300")}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Context bar — shows selected date+team + total duration + Add Row button */}
        <div className="px-5 py-2 border-b border-slate-700/50 bg-slate-900/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {hasContext ? (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400">Showing:</span>
                  <span className="px-2 py-0.5 rounded bg-blue-600/20 border border-blue-500/40 text-blue-300 text-[10px] font-medium">{activeDate}</span>
                  <span className="text-slate-600 text-[10px]">·</span>
                  <span className="px-2 py-0.5 rounded bg-blue-600/20 border border-blue-500/40 text-blue-300 text-[10px] font-medium">{activeTeam}</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                  <span>Total:</span>
                  <span className="font-semibold text-emerald-400">{totalHours.toFixed(2)}h</span>
                  <span className="text-slate-500">/ 12h expected</span>
                </div>
              </>
            ) : (
              <span className="text-[10px] text-slate-500 italic">Select a date and team above to filter</span>
            )}
          </div>
          {/* ✅ Add Row lives here — contextual to selected date+team */}
          <button
            onClick={() => setShowNewRow(!showNewRow)}
            disabled={!hasContext}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors",
              hasContext ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
            )}
          >
            <span>+</span> Add Row
            {hasContext && <span className="text-blue-200 text-[9px] font-normal">↳ {activeDate} · {activeTeam}</span>}
          </button>
        </div>

        {/* Table — no Date or Team columns */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-[11px] border-collapse table-fixed">
            <colgroup>
              <col className="w-7" />
              <col className="w-20" />{/* start */}
              <col className="w-20" />{/* end */}
              <col className="w-16" />{/* duration — new */}
              <col className="w-32" />{/* location */}
              <col />{/* notes — widest */}
              <col className="w-52" />{/* activity group */}
              <col className="w-14" />{/* actions */}
            </colgroup>
            <thead className="bg-slate-900/80 sticky top-0 z-10">
              <tr>
                <th className="px-2 py-2 text-left"><input type="checkbox" className="accent-blue-500 w-3 h-3" /></th>
                <th className="px-2 py-2 text-left text-slate-400 font-medium">Start</th>
                <th className="px-2 py-2 text-left text-slate-400 font-medium">End</th>
                <th className="px-2 py-2 text-left text-emerald-400 font-medium">Duration</th>
                <th className="px-2 py-2 text-left text-slate-400 font-medium">Location</th>
                <th className="px-2 py-2 text-left text-slate-400 font-medium">Notes</th>
                <th className="px-2 py-2 text-left text-slate-400 font-medium">Activity Group</th>
                <th className="px-2 py-2 text-right text-slate-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Inline form — no Date or Team cells */}
              {showNewRow && hasContext && (
                <tr className="bg-blue-950/30 border-b border-slate-800">
                  <td className="px-2 py-2" />
                  <td className="px-2 py-2">
                    <input type="time" value={newStart} onChange={e => setNewStart(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-[10px] text-slate-200 outline-none" />
                  </td>
                  <td className="px-2 py-2">
                    <input type="time" value={newEnd} onChange={e => setNewEnd(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-[10px] text-slate-200 outline-none" />
                  </td>
                  <td className="px-2 py-2">
                    {/* Live-computed duration as you type */}
                    <span className={cn("text-[10px] font-semibold tabular-nums", calcDuration(newStart, newEnd) !== "—" ? "text-emerald-400" : "text-slate-500")}>
                      {calcDuration(newStart, newEnd)}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <select className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-[10px] text-slate-200 outline-none">
                      <option>Select Location</option>
                      <option>Vessel</option>
                      <option>A07</option>
                      <option>Port of Immingham</option>
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input placeholder="Notes..." className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-[10px] text-slate-200 outline-none placeholder:text-slate-500" />
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-col gap-1">
                      <div className="flex gap-1">
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-600 text-white">Effective Working</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-700 text-slate-300">Non-Working</span>
                      </div>
                      <div className="flex gap-1">
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-600 text-white">Effective</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-700 text-slate-300">Extra Work</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-700 text-slate-300">Re-Work</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button className="w-6 h-6 rounded bg-blue-600 hover:bg-blue-500 flex items-center justify-center text-white text-xs">✓</button>
                      <button onClick={() => setShowNewRow(false)} className="w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-300 text-xs">✕</button>
                    </div>
                  </td>
                </tr>
              )}

              {ENTRIES.map((e, i) => {
                const dur = calcDuration(e.start, e.end);
                return (
                  <tr key={i} className="border-b border-slate-800/60 hover:bg-slate-800/20">
                    <td className="px-2 py-2"><input type="checkbox" className="accent-blue-500 w-3 h-3" /></td>
                    <td className="px-2 py-2 text-slate-300 tabular-nums">{e.start}</td>
                    <td className="px-2 py-2 text-slate-300 tabular-nums">{e.end}</td>
                    <td className={cn("px-2 py-2 font-semibold tabular-nums text-[10px]", dur !== "—" ? "text-emerald-400" : "text-slate-500")}>{dur}</td>
                    <td className="px-2 py-2 text-slate-300">{e.location}</td>
                    <td className="px-2 py-2 text-slate-400">{e.notes}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex gap-1">
                          <span className={cn("px-1.5 py-0.5 rounded text-[9px]", e.type === "Effective" ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-300")}>Effective Working</span>
                          <span className={cn("px-1.5 py-0.5 rounded text-[9px]", e.type === "Non-Working" ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-300")}>Non-Working</span>
                        </div>
                        <div className="flex gap-1">
                          {["Effective","Extra Work","Re-Work"].map(g => (
                            <span key={g} className={cn("px-1.5 py-0.5 rounded text-[9px]", e.group === g ? "bg-blue-600 text-white" : e.type === "Non-Working" ? "bg-slate-700/30 text-slate-600" : "bg-slate-700 text-slate-300")}>{g}</span>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button className="w-6 h-6 rounded hover:bg-slate-700 flex items-center justify-center text-slate-400 text-xs">○</button>
                        <button className="w-6 h-6 rounded hover:bg-slate-700 flex items-center justify-center text-slate-400 text-xs">✕</button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* Duration footer row */}
              <tr className="bg-slate-900/60 border-t border-slate-700">
                <td colSpan={2} className="px-2 py-1.5 text-right text-[9px] text-slate-500">Total</td>
                <td className="px-2 py-1.5" />
                <td className="px-2 py-1.5 text-emerald-400 font-bold text-[10px] tabular-nums">{totalHours.toFixed(2)}h</td>
                <td colSpan={4} className="px-2 py-1.5 text-[9px] text-slate-500">{totalHours < 12 ? `${(12 - totalHours).toFixed(2)}h remaining of 12h expected` : "✓ Full day covered"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Improvement callout */}
        <div className="px-5 py-2.5 border-t border-emerald-700/40 bg-emerald-900/10 text-[10px] text-emerald-300 shrink-0 flex gap-5">
          <span>✓ Date &amp; Team entered once via pills — form is slimmer</span>
          <span>✓ "Add Row" contextual to selected date+team</span>
          <span>✓ Duration computed live, total visible at a glance</span>
        </div>
      </div>
    </div>
  );
}
