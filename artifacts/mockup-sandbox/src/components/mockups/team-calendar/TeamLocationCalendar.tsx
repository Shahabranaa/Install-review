import { useState } from "react";

// ── DPR design tokens (matched from index.css CSS variables) ──────────────────
// background:  hsl(0 0% 100%)       → #ffffff
// foreground:  hsl(215 25% 15%)     → #1c2738
// border:      hsl(214 20% 88%)     → #d3dbe8
// primary:     hsl(213 82% 43%)     → #1470cc
// sidebar:     hsl(214 25% 97%)     → #f3f5fa
// muted:       hsl(214 20% 94%)     → #e8ecf4
// muted-fg:    hsl(215 15% 55%)     → #7a8ba3

// ── Mock data ──────────────────────────────────────────────────────────────────

const TEAMS = [
  { id: 1, name: "Team 01" },
  { id: 2, name: "Team 02" },
  { id: 3, name: "Team 03" },
  { id: 4, name: "Team 04" },
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

const LOCATIONS = [
  "Platform A-12",
  "Vessel Aquata",
  "Jacket B-07",
  "FPSO Meridian",
  "Buoy Station 3",
];

const LOC_STYLE: Record<string, { bg: string; border: string; label: string; dot: string }> = {
  "Platform A-12": { bg: "#f3f0ff", border: "#c4b5fd", label: "#5b21b6", dot: "#7c3aed" },
  "Vessel Aquata":  { bg: "#eff6ff", border: "#93c5fd", label: "#1d4ed8", dot: "#3b82f6" },
  "Jacket B-07":   { bg: "#f0fdf4", border: "#86efac", label: "#15803d", dot: "#22c55e" },
  "FPSO Meridian": { bg: "#fffbeb", border: "#fcd34d", label: "#92400e", dot: "#f59e0b" },
  "Buoy Station 3":{ bg: "#fff1f2", border: "#fda4af", label: "#9f1239", dot: "#f43f5e" },
};

const styleFor = (loc: string) =>
  LOC_STYLE[loc] ?? { bg: "#f8fafc", border: "#cbd5e1", label: "#475569", dot: "#94a3b8" };

function getWeekDates(base: Date, count = 12) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return d;
  });
}

const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MON = ["January","February","March","April","May","June","July","August","September","October","November","December"];

type CellKey = `${number}-${number}`;
type Entry = { id: string; location: string; scope: string };
type Assignments = Record<CellKey, Entry[]>;

const INITIAL: Assignments = {
  "1-0": [{ id:"a1", location:"Platform A-12",  scope:"Hull Inspection" }],
  "1-1": [{ id:"a2", location:"Platform A-12",  scope:"Hull Inspection" }, { id:"a3", location:"Vessel Aquata", scope:"Rope Access" }],
  "1-2": [{ id:"a4", location:"Vessel Aquata",   scope:"Corrosion Survey" }],
  "2-0": [{ id:"b1", location:"Jacket B-07",     scope:"Structural Survey" }, { id:"b2", location:"Jacket B-07", scope:"Thickness Measurement" }],
  "2-1": [{ id:"b3", location:"Jacket B-07",     scope:"Structural Survey" }],
  "2-3": [{ id:"b4", location:"FPSO Meridian",   scope:"Marine Growth Removal" }],
  "3-0": [{ id:"c1", location:"FPSO Meridian",   scope:"Non-Destructive Testing" }],
  "3-1": [{ id:"c2", location:"FPSO Meridian",   scope:"Non-Destructive Testing" }],
  "3-2": [{ id:"c3", location:"FPSO Meridian",   scope:"Cathodic Protection" }],
  "3-3": [{ id:"c4", location:"Buoy Station 3",  scope:"Cathodic Protection" }],
  "4-2": [{ id:"d1", location:"Platform A-12",   scope:"Thickness Measurement" }],
};

// ── Add-location modal ─────────────────────────────────────────────────────────

function AddModal({ onAdd, onClose }: { onAdd: (l: string, s: string) => void; onClose: () => void }) {
  const [loc, setLoc] = useState(LOCATIONS[0]);
  const [scope, setScope] = useState(SCOPES[0]);

  return (
    <div style={{ position:"fixed", inset:0, zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(28,39,56,0.35)", backdropFilter:"blur(2px)" }}>
      <div style={{ background:"#fff", borderRadius:12, boxShadow:"0 20px 60px rgba(0,0,0,0.18)", width:320, border:"1px solid #d3dbe8", overflow:"hidden" }}>
        {/* Header */}
        <div style={{ padding:"14px 18px", borderBottom:"1px solid #e8ecf4", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:"#7a8ba3", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:2 }}>Assign Location</div>
            <div style={{ fontSize:14, fontWeight:700, color:"#1c2738" }}>Add to team</div>
          </div>
          <button onClick={onClose} style={{ width:26, height:26, borderRadius:"50%", border:"1px solid #d3dbe8", background:"#f3f5fa", color:"#7a8ba3", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
        </div>

        <div style={{ padding:"16px 18px", display:"flex", flexDirection:"column", gap:14 }}>
          {/* Location */}
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:"#7a8ba3", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:6 }}>Location</div>
            <div style={{ position:"relative" }}>
              <select value={loc} onChange={e => setLoc(e.target.value)}
                style={{ width:"100%", appearance:"none", background:"#f3f5fa", border:"1px solid #d3dbe8", borderRadius:6, padding:"7px 28px 7px 10px", fontSize:12, color:"#1c2738", cursor:"pointer" }}>
                {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <svg style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7a8ba3" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
            </div>
          </div>

          {/* Scope */}
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:"#7a8ba3", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:6 }}>Scope of Work</div>
            <div style={{ border:"1px solid #d3dbe8", borderRadius:8, overflow:"hidden", maxHeight:180, overflowY:"auto" }}>
              {SCOPES.map(s => (
                <button key={s} onClick={() => setScope(s)}
                  style={{ width:"100%", textAlign:"left", padding:"8px 12px", fontSize:12, display:"flex", alignItems:"center", gap:8, cursor:"pointer", borderBottom:"1px solid #f3f5fa", background: scope===s ? "#1470cc" : "#fff", color: scope===s ? "#fff" : "#1c2738", transition:"background 0.12s" }}>
                  <span style={{ width:6, height:6, borderRadius:"50%", background: scope===s ? "rgba(255,255,255,0.5)" : "#d3dbe8", flexShrink:0 }} />
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding:"12px 18px", borderTop:"1px solid #e8ecf4", display:"flex", gap:8, justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ padding:"6px 14px", fontSize:12, fontWeight:500, borderRadius:6, border:"1px solid #d3dbe8", background:"#f3f5fa", color:"#1c2738", cursor:"pointer" }}>Cancel</button>
          <button onClick={() => { onAdd(loc, scope); onClose(); }}
            style={{ padding:"6px 14px", fontSize:12, fontWeight:600, borderRadius:6, border:"none", background:"#1470cc", color:"#fff", cursor:"pointer" }}>
            Add Location
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Location card ──────────────────────────────────────────────────────────────

function LocCard({ entry, onRemove }: { entry: Entry; onRemove: () => void }) {
  const s = styleFor(entry.location);
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ position:"relative", background:s.bg, border:`1px solid ${s.border}`, borderRadius:6, padding:"5px 8px", display:"flex", flexDirection:"column", gap:2 }}>
      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
        <span style={{ width:6, height:6, borderRadius:"50%", background:s.dot, flexShrink:0 }} />
        <span style={{ fontSize:11, fontWeight:600, color:s.label, lineHeight:1.2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{entry.location}</span>
      </div>
      <span style={{ fontSize:10, color:"#7a8ba3", lineHeight:1.3, paddingLeft:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{entry.scope}</span>
      {hover && (
        <button onClick={onRemove}
          style={{ position:"absolute", top:-6, right:-6, width:16, height:16, borderRadius:"50%", background:"#fff", border:"1px solid #d3dbe8", color:"#7a8ba3", fontSize:11, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 1px 3px rgba(0,0,0,0.12)" }}>
          ×
        </button>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

const INNER_TABS = ["Sign On", "Workers", "Schedule", "Teams", "Planning"] as const;
type InnerTab = typeof INNER_TABS[number];

export function TeamLocationCalendar() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = getWeekDates(today, 12);

  const [assignments, setAssignments] = useState<Assignments>(INITIAL);
  const [modal, setModal] = useState<{ teamId: number; dayIdx: number } | null>(null);
  const [innerTab, setInnerTab] = useState<InnerTab>("Planning");

  function addEntry(teamId: number, dayIdx: number, loc: string, scope: string) {
    const key: CellKey = `${teamId}-${dayIdx}`;
    setAssignments(p => ({ ...p, [key]: [...(p[key]??[]), { id:`${Date.now()}`, location:loc, scope }] }));
  }
  function removeEntry(teamId: number, dayIdx: number, id: string) {
    const key: CellKey = `${teamId}-${dayIdx}`;
    setAssignments(p => ({ ...p, [key]: (p[key]??[]).filter(e => e.id !== id) }));
  }

  const dateLabel = `${DOW[today.getDay()]}, ${MON[today.getMonth()].slice(0,3)} ${today.getDate()}`;

  return (
    <div style={{ display:"flex", height:"100vh", fontFamily:"'Inter', system-ui, sans-serif", background:"#fff", color:"#1c2738", overflow:"hidden" }}>

      {/* ── Sidebar (collapsed, w-12) ── */}
      <div style={{ width:48, flexShrink:0, background:"#f3f5fa", borderRight:"1px solid #d3dbe8", display:"flex", flexDirection:"column", height:"100%" }}>
        {/* Logo icon */}
        <div style={{ height:57, display:"flex", alignItems:"center", justifyContent:"center", borderBottom:"1px solid #d3dbe8" }}>
          <div style={{ width:32, height:32, borderRadius:4, background:"rgba(20,112,204,0.15)", border:"1px solid rgba(20,112,204,0.25)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1470cc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
              <rect x="8" y="2" width="8" height="4" rx="1"/>
              <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
            </svg>
          </div>
        </div>
        {/* Collapse toggle icon */}
        <div style={{ padding:"8px 0", display:"flex", justifyContent:"center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7a8ba3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>
          </svg>
        </div>
        {/* Nav icons */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2, paddingTop:8 }}>
          {[
            "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
            "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2",
            "M9 12l2 2 4-4M7 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2h-2",
          ].map((d, i) => (
            <button key={i} style={{ width:32, height:32, borderRadius:4, display:"flex", alignItems:"center", justifyContent:"center", background:"transparent", border:"none", cursor:"pointer" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={i===0?"#1470cc":"#7a8ba3"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
            </button>
          ))}
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>

        {/* DprHeader — date nav */}
        <div style={{ borderBottom:"1px solid #d3dbe8", background:"#fff", padding:"8px 12px", display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
          <button style={{ padding:"4px 6px", borderRadius:4, border:"none", background:"transparent", cursor:"pointer", color:"#7a8ba3", display:"flex" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span style={{ fontWeight:600, fontSize:13, color:"#1c2738" }}>{dateLabel}</span>
          <button style={{ padding:"4px 6px", borderRadius:4, border:"none", background:"transparent", cursor:"pointer", color:"#7a8ba3", marginLeft:"auto", display:"flex" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>

        {/* TopNav — page tabs */}
        <nav style={{ borderBottom:"1px solid #d3dbe8", background:"#fff", padding:"0 8px", display:"flex", flexShrink:0 }}>
          {[
            { label:"Team Setup", icon:"M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0", active:true },
            { label:"Capture", icon:"M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4", active:false },
            { label:"Clarify", icon:"M9 12l2 2 4-4M7 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2h-2M9 3h6", active:false },
          ].map(t => (
            <a key={t.label} style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 14px", fontSize:13, fontWeight:500, borderBottom: t.active ? "2px solid #1470cc" : "2px solid transparent", marginBottom:-1, color: t.active ? "#1470cc" : "#7a8ba3", textDecoration:"none", cursor:"pointer", transition:"color 0.12s" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={t.icon}/></svg>
              {t.label}
            </a>
          ))}
        </nav>

        {/* Team Setup page */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          {/* Inner header + tabs */}
          <div style={{ borderBottom:"1px solid #d3dbe8", background:"#fff", padding:"16px 24px 0", flexShrink:0 }}>
            <h1 style={{ fontSize:20, fontWeight:700, marginBottom:12, lineHeight:1, color:"#1c2738" }}>Team Setup</h1>
            {/* Shadcn-style TabsList */}
            <div style={{ display:"inline-flex", background:"#e8ecf4", borderRadius:6, padding:3, gap:2, marginBottom:0 }}>
              {INNER_TABS.map(t => (
                <button key={t} onClick={() => setInnerTab(t)}
                  style={{ padding:"4px 14px", fontSize:12, fontWeight:500, borderRadius:4, border:"none", cursor:"pointer", transition:"background 0.12s, color 0.12s",
                    background: innerTab===t ? "#fff" : "transparent",
                    color: innerTab===t ? "#1c2738" : "#7a8ba3",
                    boxShadow: innerTab===t ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content — only Planning shown */}
          {innerTab !== "Planning" ? (
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:"#7a8ba3", fontSize:13 }}>
              {innerTab} tab content
            </div>
          ) : (
            <div style={{ flex:1, overflow:"auto", background:"#f3f5fa" }}>
              {/* Calendar */}
              <div style={{ minWidth:"max-content" }}>
                {/* Column headers */}
                <div style={{ display:"flex", position:"sticky", top:0, zIndex:10 }}>
                  {/* Team column header */}
                  <div style={{ width:120, flexShrink:0, background:"#fff", borderRight:"1px solid #d3dbe8", borderBottom:"1px solid #d3dbe8", padding:"8px 12px", display:"flex", alignItems:"flex-end" }}>
                    <span style={{ fontSize:10, fontWeight:600, color:"#7a8ba3", textTransform:"uppercase", letterSpacing:"0.06em" }}>Team</span>
                  </div>
                  {days.map((d, i) => {
                    const isToday = i === 0;
                    const isPast = false;
                    return (
                      <div key={i} style={{ width:168, flexShrink:0, borderRight:"1px solid #d3dbe8", borderBottom:"1px solid #d3dbe8", padding:"8px 10px", background: isToday ? "#eff6ff" : "#fff", display:"flex", flexDirection:"column", gap:2 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.04em", color: isToday ? "#1470cc" : "#7a8ba3" }}>{DOW[d.getDay()]}</span>
                          {isToday && <span style={{ fontSize:9, background:"#1470cc", color:"#fff", padding:"1px 6px", borderRadius:10, fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase" }}>Today</span>}
                          {!isToday && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#d3dbe8" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>}
                        </div>
                        <span style={{ fontSize:11, color: isToday ? "#1470cc" : "#7a8ba3", fontWeight: isToday ? 500 : 400 }}>{MON[d.getMonth()].slice(0,3)} {d.getDate()}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Team rows */}
                {TEAMS.map(team => (
                  <div key={team.id} style={{ display:"flex" }}>
                    {/* Team name */}
                    <div style={{ width:120, flexShrink:0, background:"#fff", borderRight:"1px solid #d3dbe8", borderBottom:"1px solid #d3dbe8", padding:"10px 12px", position:"sticky", left:0, zIndex:5 }}>
                      <span style={{ fontSize:12, fontWeight:600, color:"#1c2738" }}>{team.name}</span>
                    </div>

                    {days.map((d, dayIdx) => {
                      const key: CellKey = `${team.id}-${dayIdx}`;
                      const entries = assignments[key] ?? [];
                      const isToday = dayIdx === 0;

                      return (
                        <div key={dayIdx} style={{ width:168, flexShrink:0, borderRight:"1px solid #d3dbe8", borderBottom:"1px solid #d3dbe8", padding:8, display:"flex", flexDirection:"column", gap:6, minHeight:88, background: isToday ? "rgba(239,246,255,0.4)" : "#fff" }}>
                          {entries.map(e => (
                            <LocCard key={e.id} entry={e} onRemove={() => removeEntry(team.id, dayIdx, e.id)} />
                          ))}
                          <button onClick={() => setModal({ teamId:team.id, dayIdx })}
                            style={{ marginTop:"auto", alignSelf:"flex-start", display:"flex", alignItems:"center", gap:4, padding:"3px 10px", borderRadius:999, background:"#1470cc", color:"#fff", fontSize:11, fontWeight:700, border:"none", cursor:"pointer", boxShadow:"0 1px 3px rgba(20,112,204,0.35)" }}>
                            <span style={{ fontSize:15, lineHeight:1, marginTop:-1 }}>+</span>
                            Add
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <AddModal
          onAdd={(loc, scope) => addEntry(modal.teamId, modal.dayIdx, loc, scope)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
