import { useState } from "react";
import { cn } from "@/lib/utils";

const DATES = [
  { label: "17/07", count: 0, total: 12 },
  { label: "16/06", count: 1, total: 12 },
  { label: "15/06", count: 1, total: 12 },
  { label: "14/06", count: 12, total: 12 },
];
const TEAMS = ["Team 1","Team 2","Team 3","Team 4","Team 5","Team 6","Team 7","Team 8","Team 9","Team 10","Team 11","Team 12"];

const ENTRIES = [
  { date: "17/07/2026", team: "Team 1", start: "--", end: "--", duration: "--", location: "A07", notes: "Waiting on transfer to...", type: "Non-Working Time", group: null },
];

function StatusBar({ count, total }: { count: number; total: number }) {
  const pct = total === 0 ? 0 : count / total;
  const color = count === 0 ? "#ef4444" : pct >= 1 ? "#22c55e" : "#f59e0b";
  return (
    <div className="mt-0.5 w-full h-1 rounded-full bg-white/10 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct * 100, 100)}%`, backgroundColor: color }} />
    </div>
  );
}

export function Before() {
  const [activeDate, setActiveDate] = useState("17/07");
  const [activeTeam, setActiveTeam] = useState("Team 1");
  const [showNewRow, setShowNewRow] = useState(true);

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
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-base font-bold tracking-tight">Timesheet Capture</h1>
            <p className="text-[11px] text-slate-400 mt-0.5">Enter raw field hours to be clarified. Paste directly from a spreadsheet or add rows one at a time.</p>
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border border-slate-600 text-slate-300 bg-slate-800 hover:bg-slate-700">
              <span>⊞</span> Paste Rows
            </button>
            {/* ADD ROW IN HEADER — the problem */}
            <button onClick={() => setShowNewRow(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium">
              <span>+</span> Add Row
            </button>
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
                <button key={d.label} onClick={() => setActiveDate(d.label)} className={cn("flex flex-col px-2.5 py-1 rounded-full border text-[10px] font-medium min-w-[64px] transition-colors", isActive ? "bg-blue-600 border-blue-400 text-white" : cn("bg-slate-800/60 text-slate-300", statusColor))}>
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
              <button key={t} onClick={() => setActiveTeam(t)} className={cn("px-2.5 py-1 rounded-full border text-[10px] font-medium transition-colors", activeTeam === t ? "bg-blue-600 border-blue-400 text-white" : "bg-slate-800/60 border-slate-600 text-slate-300")}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead className="bg-slate-900/80 sticky top-0 z-10">
              <tr>
                <th className="w-7 px-2 py-2 text-left"><input type="checkbox" className="accent-blue-500 w-3 h-3" /></th>
                <th className="px-2 py-2 text-left text-slate-400 font-medium w-28">Date</th>
                <th className="px-2 py-2 text-left text-slate-400 font-medium w-24">Team</th>
                <th className="px-2 py-2 text-left text-slate-400 font-medium w-24">Start Time</th>
                <th className="px-2 py-2 text-left text-slate-400 font-medium w-24">End Time</th>
                <th className="px-2 py-2 text-left text-slate-400 font-medium w-32">Location</th>
                <th className="px-2 py-2 text-left text-slate-400 font-medium">Notes</th>
                <th className="px-2 py-2 text-left text-slate-400 font-medium w-52">Activity Group</th>
                <th className="px-2 py-2 text-right text-slate-400 font-medium w-16">Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Inline new-row form — date + team columns visible */}
              {showNewRow && (
                <tr className="bg-blue-950/30 border-b border-slate-800">
                  <td className="px-2 py-2" />
                  {/* DATE — redundant since already selected above */}
                  <td className="px-2 py-2">
                    <div className="relative">
                      <input type="date" defaultValue="2026-07-17" className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-[10px] text-slate-200 outline-none" />
                      <div className="absolute -top-4 left-0 text-[8px] text-amber-400 font-medium whitespace-nowrap">← Already selected above</div>
                    </div>
                  </td>
                  {/* TEAM — redundant since already selected above */}
                  <td className="px-2 py-2">
                    <div className="relative">
                      <select className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-[10px] text-slate-200 outline-none">
                        <option>Team 1</option>
                      </select>
                      <div className="absolute -top-4 left-0 text-[8px] text-amber-400 font-medium whitespace-nowrap">← Already selected above</div>
                    </div>
                  </td>
                  <td className="px-2 py-2"><input type="time" defaultValue="00:00" className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-[10px] text-slate-200 outline-none" /></td>
                  <td className="px-2 py-2"><input type="time" defaultValue="00:00" className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-[10px] text-slate-200 outline-none" /></td>
                  <td className="px-2 py-2"><select className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-[10px] text-slate-200 outline-none"><option>Select Location</option><option>Vessel</option><option>A07</option><option>Port of Immingham</option></select></td>
                  <td className="px-2 py-2"><input placeholder="Notes..." className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-[10px] text-slate-200 outline-none placeholder:text-slate-500" /></td>
                  <td className="px-2 py-2">
                    <div className="flex flex-col gap-1">
                      <div className="flex gap-1">
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-600 text-white">Effective Working Time</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-700 text-slate-300">Non-Working Time</span>
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

              {ENTRIES.map((e, i) => (
                <tr key={i} className="border-b border-slate-800/60 hover:bg-slate-800/20">
                  <td className="px-2 py-2"><input type="checkbox" className="accent-blue-500 w-3 h-3" /></td>
                  <td className="px-2 py-2 text-slate-200 font-medium">{e.date}</td>
                  <td className="px-2 py-2 text-slate-300">{e.team}</td>
                  <td className="px-2 py-2 text-slate-400">{e.start}</td>
                  <td className="px-2 py-2 text-slate-400">{e.end}</td>
                  <td className="px-2 py-2 text-slate-300">{e.location}</td>
                  <td className="px-2 py-2 text-slate-400 truncate max-w-[160px]">{e.notes}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-col gap-1">
                      <div className="flex gap-1">
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-700 text-slate-300">Effective Working Time</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-600 text-white">Non-Working Time</span>
                      </div>
                      <div className="flex gap-1">
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-700/50 text-slate-500">Effective</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-700/50 text-slate-500">Extra Work</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-700/50 text-slate-500">Re-Work</span>
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
              ))}
            </tbody>
          </table>
        </div>

        {/* Pain-point callout */}
        <div className="px-5 py-3 border-t border-amber-700/40 bg-amber-900/10 text-[10px] text-amber-300 shrink-0 flex gap-4">
          <span>⚠ Date &amp; Team are asked twice — filter pills + the add form</span>
          <span>⚠ "Add Row" is far from where rows appear</span>
          <span>⚠ No duration visible</span>
        </div>
      </div>
    </div>
  );
}
