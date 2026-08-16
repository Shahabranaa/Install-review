import { useState } from "react";

// ── Real data from DB: 2026-07-27 → 2026-08-01 ───────────────────────────────
// Calendar starts Monday 27 Jul; dayIdx 0=Jul27 … 5=Aug1

const REAL_DATE = new Date(2026, 6, 27); // July 27 2026 (Mon)

const TEAMS = [
  { id: 1,  name: "Team 1" },
  { id: 2,  name: "Team 2" },
  { id: 3,  name: "Team 3" },
  { id: 4,  name: "Team 4" },
  { id: 5,  name: "Team 5" },
  { id: 6,  name: "Team 6" },
  { id: 7,  name: "Team 7" },
  { id: 8,  name: "Team 8" },
  { id: 9,  name: "Team 9" },
];

const SCOPES = [
  "Effective Working Time",
  "Re-Work",
  "Extra Work",
  "Standby",
  "Transit",
  "Maintenance",
];

const ALL_LOCATIONS = [
  "At-Sea","BLP 69","BLP 51","BLP 52","BLP 50",
  "A01","A02","A03","A15","A19","A21","A23","A24",
  "OSS East","OSS West","Vessel","Z01",
];

// Location colour palette
const LOC_STYLE: Record<string, { bg: string; border: string; label: string; dot: string }> = {
  "At-Sea":   { bg:"#eff6ff", border:"#93c5fd", label:"#1d4ed8", dot:"#3b82f6" },
  "BLP 69":   { bg:"#f3f0ff", border:"#c4b5fd", label:"#5b21b6", dot:"#7c3aed" },
  "BLP 51":   { bg:"#f0fdf4", border:"#86efac", label:"#15803d", dot:"#22c55e" },
  "BLP 52":   { bg:"#f0fdfa", border:"#5eead4", label:"#0f766e", dot:"#14b8a6" },
  "BLP 50":   { bg:"#eef2ff", border:"#a5b4fc", label:"#3730a3", dot:"#6366f1" },
  "A01":      { bg:"#fff7ed", border:"#fed7aa", label:"#9a3412", dot:"#f97316" },
  "A02":      { bg:"#fff1f2", border:"#fda4af", label:"#9f1239", dot:"#f43f5e" },
  "A03":      { bg:"#fffbeb", border:"#fcd34d", label:"#92400e", dot:"#f59e0b" },
  "A15":      { bg:"#fef9c3", border:"#fde047", label:"#713f12", dot:"#eab308" },
  "A19":      { bg:"#fef3c7", border:"#fbbf24", label:"#78350f", dot:"#d97706" },
  "A21":      { bg:"#ecfdf5", border:"#6ee7b7", label:"#065f46", dot:"#10b981" },
  "A23":      { bg:"#f0f9ff", border:"#7dd3fc", label:"#075985", dot:"#0ea5e9" },
  "A24":      { bg:"#e0f2fe", border:"#38bdf8", label:"#0c4a6e", dot:"#0284c7" },
  "OSS East": { bg:"#fdf4ff", border:"#e879f9", label:"#86198f", dot:"#d946ef" },
  "OSS West": { bg:"#fdf2f8", border:"#f0abfc", label:"#701a75", dot:"#c026d3" },
  "Vessel":   { bg:"#f8fafc", border:"#cbd5e1", label:"#475569", dot:"#94a3b8" },
  "Z01":      { bg:"#fff7f0", border:"#fdba74", label:"#7c2d12", dot:"#ea580c" },
};
const styleFor = (loc: string) =>
  LOC_STYLE[loc] ?? { bg:"#f8fafc", border:"#cbd5e1", label:"#475569", dot:"#94a3b8" };

// Stage pill styles
const STAGE: Record<string, { bg: string; text: string; label: string }> = {
  captured: { bg:"#dbeafe", text:"#1d4ed8", label:"Captured" },
  draft:    { bg:"#f1f5f9", text:"#64748b", label:"Draft"    },
  clarified:{ bg:"#dcfce7", text:"#15803d", label:"Clarified" },
};

// ── Real seed data (from DB query: dpr_timesheet_entries, 2026-07-31) ─────────
type Entry = { id: string; location: string; scope: string; stage: "draft"|"captured"|"clarified" };
type CellKey = `${number}-${number}`;
type Assignments = Record<CellKey, Entry[]>;

// dayIdx: 0=Jul27  1=Jul28  2=Jul29(empty)  3=Jul30  4=Jul31  5=Aug1
const SEED: Assignments = {
  // ── Jul 27 (all Captured) ──────────────────────────────────
  "1-0": [{ id:"a01", location:"A15",    scope:"Effective Working Time", stage:"captured" },
          { id:"a02", location:"Vessel",  scope:"Effective Working Time", stage:"captured" }],
  "2-0": [{ id:"a03", location:"A15",    scope:"Effective Working Time", stage:"captured" },
          { id:"a04", location:"Vessel",  scope:"Effective Working Time", stage:"captured" }],
  "3-0": [{ id:"a05", location:"Vessel", scope:"Effective Working Time", stage:"captured" },
          { id:"a06", location:"Z01",     scope:"Effective Working Time", stage:"captured" }],
  "4-0": [{ id:"a07", location:"Vessel", scope:"Effective Working Time", stage:"captured" },
          { id:"a08", location:"Z01",     scope:"Effective Working Time", stage:"captured" }],
  "5-0": [{ id:"a09", location:"A21",    scope:"Effective Working Time", stage:"captured" },
          { id:"a10", location:"Vessel",  scope:"Effective Working Time", stage:"captured" }],
  "6-0": [{ id:"a11", location:"Vessel", scope:"Effective Working Time", stage:"captured" }],
  "7-0": [{ id:"a12", location:"Vessel", scope:"Effective Working Time", stage:"captured" }],
  "8-0": [{ id:"a13", location:"A19",    scope:"Effective Working Time", stage:"captured" },
          { id:"a14", location:"A23",     scope:"Effective Working Time", stage:"captured" },
          { id:"a15", location:"A24",     scope:"Effective Working Time", stage:"captured" },
          { id:"a16", location:"Vessel",  scope:"Effective Working Time", stage:"captured" }],
  "9-0": [{ id:"a17", location:"A15",    scope:"Effective Working Time", stage:"captured" },
          { id:"a18", location:"Vessel",  scope:"Effective Working Time", stage:"captured" }],

  // ── Jul 28 ────────────────────────────────────────────────
  "8-1": [{ id:"b01", location:"Vessel", scope:"Effective Working Time", stage:"draft" }],

  // ── Jul 30 ────────────────────────────────────────────────
  "2-3": [{ id:"d01", location:"BLP 69",   scope:"Effective Working Time", stage:"clarified" }],
  "4-3": [{ id:"d02", location:"OSS East", scope:"Effective Working Time", stage:"draft"     }],
  "6-3": [{ id:"d03", location:"At-Sea",   scope:"Effective Working Time", stage:"draft"     },
          { id:"d04", location:"BLP 52",   scope:"Effective Working Time", stage:"draft"      }],

  // ── Jul 31 ────────────────────────────────────────────────
  "1-4": [{ id:"e01", location:"At-Sea",  scope:"Effective Working Time", stage:"captured" },
          { id:"e02", location:"BLP 69",  scope:"Effective Working Time", stage:"captured" },
          { id:"e03", location:"BLP 51",  scope:"Effective Working Time", stage:"draft"    },
          { id:"e04", location:"A01",     scope:"Effective Working Time", stage:"draft"    },
          { id:"e05", location:"A02",     scope:"Re-Work",                stage:"draft"    }],
  "2-4": [{ id:"e06", location:"BLP 69",  scope:"Effective Working Time", stage:"draft"   },
          { id:"e07", location:"At-Sea",  scope:"Effective Working Time", stage:"draft"    },
          { id:"e08", location:"BLP 51",  scope:"Effective Working Time", stage:"draft"    },
          { id:"e09", location:"Vessel",  scope:"Extra Work",             stage:"draft"    }],
  "3-4": [{ id:"e10", location:"A03",      scope:"Re-Work",               stage:"draft"   },
          { id:"e11", location:"At-Sea",   scope:"Effective Working Time", stage:"draft"   },
          { id:"e12", location:"OSS East", scope:"Effective Working Time", stage:"draft"   }],
  "4-4": [{ id:"e13", location:"A01",      scope:"Effective Working Time", stage:"captured" },
          { id:"e14", location:"At-Sea",   scope:"Effective Working Time", stage:"draft"    },
          { id:"e15", location:"OSS East", scope:"Effective Working Time", stage:"draft"    }],
  "5-4": [{ id:"e16", location:"At-Sea",   scope:"Effective Working Time", stage:"draft"   },
          { id:"e17", location:"OSS West", scope:"Effective Working Time", stage:"draft"   }],
  "6-4": [{ id:"e18", location:"At-Sea",   scope:"Effective Working Time", stage:"draft"   },
          { id:"e19", location:"OSS West", scope:"Effective Working Time", stage:"draft"   }],
  "7-4": [{ id:"e20", location:"At-Sea",   scope:"Effective Working Time", stage:"draft"   },
          { id:"e21", location:"BLP 52",   scope:"Effective Working Time", stage:"draft"   }],
  "8-4": [{ id:"e22", location:"At-Sea",   scope:"Effective Working Time", stage:"draft"   },
          { id:"e23", location:"BLP 52",   scope:"Effective Working Time", stage:"draft"   }],
  "9-4": [{ id:"e24", location:"At-Sea",   scope:"Effective Working Time", stage:"draft"   },
          { id:"e25", location:"BLP 50",   scope:"Effective Working Time", stage:"draft"   }],

  // ── Aug 1 ─────────────────────────────────────────────────
  "1-5": [{ id:"f01", location:"A01", scope:"Extra Work",             stage:"draft"    },
          { id:"f02", location:"A02", scope:"Effective Working Time",  stage:"draft"    }],
  "2-5": [{ id:"f03", location:"Vessel", scope:"Re-Work",             stage:"draft"    }],
  "4-5": [{ id:"f04", location:"A02", scope:"Effective Working Time",  stage:"captured" }],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTH = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getDays(base: Date, count = 10) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return d;
  });
}

// ── Add-location modal ────────────────────────────────────────────────────────
function AddModal({ onAdd, onClose }: { onAdd: (l: string, s: string) => void; onClose: () => void }) {
  const [loc, setLoc]   = useState(ALL_LOCATIONS[0]);
  const [scope, setScope] = useState(SCOPES[0]);
  return (
    <div style={{ position:"fixed", inset:0, zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(28,39,56,0.35)", backdropFilter:"blur(2px)" }}>
      <div style={{ background:"#fff", borderRadius:12, boxShadow:"0 20px 60px rgba(0,0,0,0.18)", width:320, border:"1px solid #d3dbe8", overflow:"hidden" }}>
        <div style={{ padding:"14px 18px", borderBottom:"1px solid #e8ecf4", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:"#7a8ba3", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:2 }}>Assign Location</div>
            <div style={{ fontSize:14, fontWeight:700, color:"#1c2738" }}>Add to team</div>
          </div>
          <button onClick={onClose} style={{ width:26, height:26, borderRadius:"50%", border:"1px solid #d3dbe8", background:"#f3f5fa", color:"#7a8ba3", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
        </div>
        <div style={{ padding:"16px 18px", display:"flex", flexDirection:"column", gap:14 }}>
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:"#7a8ba3", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:6 }}>Location</div>
            <div style={{ position:"relative" }}>
              <select value={loc} onChange={e => setLoc(e.target.value)} style={{ width:"100%", appearance:"none", background:"#f3f5fa", border:"1px solid #d3dbe8", borderRadius:6, padding:"7px 28px 7px 10px", fontSize:12, color:"#1c2738", cursor:"pointer" }}>
                {ALL_LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <svg style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7a8ba3" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
            </div>
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:"#7a8ba3", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:6 }}>Scope of Work</div>
            <div style={{ border:"1px solid #d3dbe8", borderRadius:8, overflow:"hidden", maxHeight:180, overflowY:"auto" }}>
              {SCOPES.map(s => (
                <button key={s} onClick={() => setScope(s)} style={{ width:"100%", textAlign:"left", padding:"8px 12px", fontSize:12, display:"flex", alignItems:"center", gap:8, cursor:"pointer", borderBottom:"1px solid #f3f5fa", background: scope===s ? "#1470cc" : "#fff", color: scope===s ? "#fff" : "#1c2738" }}>
                  <span style={{ width:6, height:6, borderRadius:"50%", background: scope===s ? "rgba(255,255,255,0.5)" : "#d3dbe8", flexShrink:0 }} />
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding:"12px 18px", borderTop:"1px solid #e8ecf4", display:"flex", gap:8, justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ padding:"6px 14px", fontSize:12, fontWeight:500, borderRadius:6, border:"1px solid #d3dbe8", background:"#f3f5fa", color:"#1c2738", cursor:"pointer" }}>Cancel</button>
          <button onClick={() => { onAdd(loc, scope); onClose(); }} style={{ padding:"6px 14px", fontSize:12, fontWeight:600, borderRadius:6, border:"none", background:"#1470cc", color:"#fff", cursor:"pointer" }}>Add Location</button>
        </div>
      </div>
    </div>
  );
}

// ── Location card ─────────────────────────────────────────────────────────────
function LocCard({ entry, onRemove }: { entry: Entry; onRemove: () => void }) {
  const s = styleFor(entry.location);
  const st = STAGE[entry.stage] ?? STAGE.draft;
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ position:"relative", background:s.bg, border:`1px solid ${s.border}`, borderRadius:6, padding:"5px 8px", display:"flex", flexDirection:"column", gap:3 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:4 }}>
        <div style={{ display:"flex", alignItems:"center", gap:5, minWidth:0 }}>
          <span style={{ width:6, height:6, borderRadius:"50%", background:s.dot, flexShrink:0 }} />
          <span style={{ fontSize:11, fontWeight:600, color:s.label, lineHeight:1.2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{entry.location}</span>
        </div>
        <span style={{ fontSize:9, fontWeight:600, padding:"1px 5px", borderRadius:10, background:st.bg, color:st.text, whiteSpace:"nowrap", flexShrink:0 }}>{st.label}</span>
      </div>
      <span style={{ fontSize:10, color:"#7a8ba3", lineHeight:1.3, paddingLeft:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{entry.scope}</span>
      {hover && (
        <button onClick={onRemove} style={{ position:"absolute", top:-6, right:-6, width:16, height:16, borderRadius:"50%", background:"#fff", border:"1px solid #d3dbe8", color:"#7a8ba3", fontSize:11, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 1px 3px rgba(0,0,0,0.12)" }}>×</button>
      )}
    </div>
  );
}

// ── Inner tabs ────────────────────────────────────────────────────────────────
const INNER_TABS = ["Sign On","Workers","Schedule","Teams","Planning"] as const;
type InnerTab = typeof INNER_TABS[number];

// ── Main component ────────────────────────────────────────────────────────────
export function TeamLocationCalendar() {
  const days = getDays(REAL_DATE, 10);

  const [assignments, setAssignments] = useState<Assignments>(SEED);
  const [modal, setModal]   = useState<{ teamId: number; dayIdx: number } | null>(null);
  const [innerTab, setInnerTab] = useState<InnerTab>("Planning");

  function addEntry(teamId: number, dayIdx: number, loc: string, scope: string) {
    const key: CellKey = `${teamId}-${dayIdx}`;
    setAssignments(p => ({ ...p, [key]: [...(p[key]??[]), { id:`${Date.now()}`, location:loc, scope, stage:"draft" }] }));
  }
  function removeEntry(teamId: number, dayIdx: number, id: string) {
    const key: CellKey = `${teamId}-${dayIdx}`;
    setAssignments(p => ({ ...p, [key]: (p[key]??[]).filter(e => e.id !== id) }));
  }

  return (
    <div style={{ display:"flex", height:"100vh", fontFamily:"'Inter', system-ui, sans-serif", background:"#fff", color:"#1c2738", overflow:"hidden" }}>

      {/* ── Collapsed sidebar ── */}
      <div style={{ width:48, flexShrink:0, background:"#f3f5fa", borderRight:"1px solid #d3dbe8", display:"flex", flexDirection:"column", alignItems:"center", height:"100%" }}>
        <div style={{ height:57, display:"flex", alignItems:"center", justifyContent:"center", borderBottom:"1px solid #d3dbe8", width:"100%" }}>
          <div style={{ width:32, height:32, borderRadius:4, background:"rgba(20,112,204,0.15)", border:"1px solid rgba(20,112,204,0.25)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1470cc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
              <rect x="8" y="2" width="8" height="4" rx="1"/>
              <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
            </svg>
          </div>
        </div>
        <div style={{ padding:"8px 0", width:"100%", display:"flex", justifyContent:"center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7a8ba3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>
        </div>
        <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2, paddingTop:8 }}>
          {["M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
            "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2",
            "M9 12l2 2 4-4M7 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2h-2"].map((d, i) => (
            <button key={i} style={{ width:32, height:32, borderRadius:4, display:"flex", alignItems:"center", justifyContent:"center", background: i===0?"rgba(20,112,204,0.08)":"transparent", border:"none", cursor:"pointer" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={i===0?"#1470cc":"#7a8ba3"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
            </button>
          ))}
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>

        {/* DprHeader */}
        <div style={{ borderBottom:"1px solid #d3dbe8", background:"#fff", padding:"8px 12px", display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
          <button style={{ padding:"4px 6px", borderRadius:4, border:"none", background:"transparent", cursor:"pointer", color:"#7a8ba3", display:"flex" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span style={{ fontWeight:600, fontSize:13, color:"#1c2738" }}>Mon, Jul 27</span>
          <span style={{ fontSize:10, background:"#dcfce7", color:"#15803d", border:"1px solid #86efac", padding:"2px 8px", borderRadius:10, fontWeight:600 }}>Live data · Jul 27 – Aug 1</span>
          <button style={{ padding:"4px 6px", borderRadius:4, border:"none", background:"transparent", cursor:"pointer", color:"#7a8ba3", marginLeft:"auto", display:"flex" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>

        {/* TopNav */}
        <nav style={{ borderBottom:"1px solid #d3dbe8", background:"#fff", padding:"0 8px", display:"flex", flexShrink:0 }}>
          {[
            { label:"Team Setup", icon:"M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0", active:true },
            { label:"Capture",   icon:"M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4", active:false },
            { label:"Clarify",  icon:"M9 12l2 2 4-4M7 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2h-2M9 3h6", active:false },
          ].map(t => (
            <a key={t.label} style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 14px", fontSize:13, fontWeight:500, borderBottom: t.active ? "2px solid #1470cc" : "2px solid transparent", marginBottom:-1, color: t.active ? "#1470cc" : "#7a8ba3", textDecoration:"none", cursor:"pointer" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={t.icon}/></svg>
              {t.label}
            </a>
          ))}
        </nav>

        {/* Page */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          {/* Inner header + tabs */}
          <div style={{ borderBottom:"1px solid #d3dbe8", background:"#fff", padding:"16px 24px 0", flexShrink:0 }}>
            <h1 style={{ fontSize:20, fontWeight:700, marginBottom:12, lineHeight:1, color:"#1c2738" }}>Team Setup</h1>
            <div style={{ display:"inline-flex", background:"#e8ecf4", borderRadius:6, padding:3, gap:2 }}>
              {INNER_TABS.map(t => (
                <button key={t} onClick={() => setInnerTab(t)}
                  style={{ padding:"4px 14px", fontSize:12, fontWeight:500, borderRadius:4, border:"none", cursor:"pointer",
                    background: innerTab===t ? "#fff" : "transparent",
                    color: innerTab===t ? "#1c2738" : "#7a8ba3",
                    boxShadow: innerTab===t ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          {innerTab !== "Planning" ? (
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:"#7a8ba3", fontSize:13 }}>{innerTab} tab content</div>
          ) : (
            <div style={{ flex:1, overflow:"auto", background:"#f3f5fa" }}>
              <div style={{ minWidth:"max-content" }}>

                {/* Column headers */}
                <div style={{ display:"flex", position:"sticky", top:0, zIndex:10 }}>
                  <div style={{ width:100, flexShrink:0, background:"#fff", borderRight:"1px solid #d3dbe8", borderBottom:"1px solid #d3dbe8", padding:"8px 12px", display:"flex", alignItems:"flex-end" }}>
                    <span style={{ fontSize:10, fontWeight:600, color:"#7a8ba3", textTransform:"uppercase", letterSpacing:"0.06em" }}>Team</span>
                  </div>
                  {days.map((d, i) => {
                    // dayIdx 4 = Jul 31, the busiest real-data day
                    const highlight = i === 4;
                    // days with any data
                    const hasData = [0,1,3,4,5].includes(i);
                    return (
                      <div key={i} style={{ width:160, flexShrink:0, borderRight:"1px solid #d3dbe8", borderBottom:"1px solid #d3dbe8", padding:"8px 10px", background: highlight ? "#eff6ff" : hasData ? "#fafbfd" : "#fff", display:"flex", flexDirection:"column", gap:2 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.04em", color: highlight ? "#1470cc" : hasData ? "#475569" : "#7a8ba3" }}>{DOW[d.getDay()]}</span>
                          {highlight && <span style={{ fontSize:9, background:"#1470cc", color:"#fff", padding:"1px 6px", borderRadius:10, fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase" }}>Jul 31</span>}
                          {!highlight && hasData && <span style={{ fontSize:9, background:"#f1f5f9", color:"#64748b", padding:"1px 5px", borderRadius:10, fontWeight:600 }}>data</span>}
                          {!highlight && !hasData && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#d3dbe8" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>}
                        </div>
                        <span style={{ fontSize:11, color: highlight ? "#1470cc" : hasData ? "#64748b" : "#7a8ba3", fontWeight: highlight ? 500 : 400 }}>{MONTH[d.getMonth()]} {d.getDate()}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Team rows */}
                {TEAMS.map(team => (
                  <div key={team.id} style={{ display:"flex" }}>
                    <div style={{ width:100, flexShrink:0, background:"#fff", borderRight:"1px solid #d3dbe8", borderBottom:"1px solid #d3dbe8", padding:"10px 12px", position:"sticky", left:0, zIndex:5 }}>
                      <span style={{ fontSize:12, fontWeight:600, color:"#1c2738" }}>{team.name}</span>
                    </div>
                    {days.map((_, dayIdx) => {
                      const key: CellKey = `${team.id}-${dayIdx}`;
                      const entries = assignments[key] ?? [];
                      const highlight = dayIdx === 0;
                      return (
                        <div key={dayIdx} style={{ width:160, flexShrink:0, borderRight:"1px solid #d3dbe8", borderBottom:"1px solid #d3dbe8", padding:7, display:"flex", flexDirection:"column", gap:5, minHeight:entries.length > 3 ? "auto" : 100, background: highlight ? "rgba(239,246,255,0.5)" : "#fff" }}>
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

      {modal && (
        <AddModal
          onAdd={(loc, scope) => addEntry(modal.teamId, modal.dayIdx, loc, scope)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
