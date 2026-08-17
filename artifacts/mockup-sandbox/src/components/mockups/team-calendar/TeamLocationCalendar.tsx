import { useState } from "react";

// ── P6 Activities (from WF list) ──────────────────────────────────────────────
type Section = "OCS" | "2Cable" | "1Cable" | "String";

const SECTION_META: Record<Section, { label: string; bg: string; border: string; text: string; dot: string; headerBg: string }> = {
  OCS:    { label:"1st End @ OCS",   bg:"#eff6ff", border:"#93c5fd", text:"#1d4ed8", dot:"#3b82f6", headerBg:"#dbeafe" },
  "2Cable":{ label:"2Cable",         bg:"#f0fdf4", border:"#86efac", text:"#15803d", dot:"#22c55e", headerBg:"#dcfce7" },
  "1Cable":{ label:"1Cable",         bg:"#f3f0ff", border:"#c4b5fd", text:"#5b21b6", dot:"#7c3aed", headerBg:"#ede9fe" },
  String: { label:"String Complete", bg:"#fffbeb", border:"#fcd34d", text:"#92400e", dot:"#f59e0b", headerBg:"#fef3c7" },
};

const ACTIVITIES: Record<Section, { code: string; name: string }[]> = {
  OCS: [
    { code:"WF103630", name:"MOB / As found" },
    { code:"WF103635", name:"Post Pull-In Test (DC Voltage/OTDR/Phase Rotation)" },
    { code:"WF103640", name:"OCS Protection & required rigging" },
    { code:"WF103650", name:"Perm Hangoff's & Stripping" },
    { code:"WF103660", name:"CMS (build/re-build/soft routing)" },
    { code:"WF103670", name:"Partial routing & cut/cleat of Cable" },
    { code:"WF103680", name:"Heating of Cable" },
    { code:"WF103690", name:"Straightening bars on Cable" },
    { code:"WF103700", name:"Mount FO Box, install service loops and glands" },
    { code:"WF103710", name:"HV Terminations (up to plug-in)" },
    { code:"WF103720", name:"Connex Joints (containment/remove cleats/belly cable)" },
    { code:"WF103730", name:"FO Terminations" },
    { code:"WF103740", name:"HV Termination (plug-in)" },
    { code:"WF103750", name:"OTDR Testing (Part 1)" },
    { code:"WF103755", name:"RTS Testing" },
    { code:"WF103760", name:"OTDR Testing (Part 2)" },
    { code:"WF103770", name:"Connex Joints (remove & re-cleat cores)" },
    { code:"WF103775", name:"HV Terminations incl. Final plug-in and earthing" },
    { code:"WF103780", name:"QC Inspection" },
  ],
  "2Cable": [
    { code:"WF103800", name:"MOB / As found" },
    { code:"WF103805", name:"Pre-Termination Testing" },
    { code:"WF103810", name:"SIP Protection" },
    { code:"WF103820", name:"Perm Hangoff's & Stripping – Cables 1&2" },
    { code:"WF103830", name:"CMS modifications" },
    { code:"WF103840", name:"Routing & Cleating" },
    { code:"WF103850", name:"HV Prep Heating, Straightening & Cooling (Cable 1)" },
    { code:"WF103860", name:"HV Prep Heating, Straightening & Cooling (Cable 2)" },
    { code:"WF103870", name:"PT100 Installation" },
    { code:"WF103900", name:"Final Routing of Cables" },
    { code:"WF103910", name:"Termination of Cable 1" },
    { code:"WF103920", name:"Termination of Cable 2" },
    { code:"WF103950", name:"FO Terminations" },
    { code:"WF103960", name:"FO Testing" },
    { code:"WF103970", name:"Post Termination Testing (Earth verification)" },
    { code:"WF103980", name:"Internal QC JDR walk down" },
    { code:"WF103983", name:"JDR/ORST QC / As-Left" },
    { code:"WF103990", name:"DEMOB" },
    { code:"WF104000", name:"OTDR (Remedials)" },
  ],
  "1Cable": [
    { code:"WF104010", name:"MOB / As found" },
    { code:"WF104015", name:"Pre-Termination Testing" },
    { code:"WF104020", name:"SIP Protection" },
    { code:"WF104030", name:"Perm Hangoff's & Stripping" },
    { code:"WF104040", name:"CMS modifications" },
    { code:"WF104050", name:"Routing & Cleating" },
    { code:"WF104060", name:"HV Prep Heating, Straightening & Cooling (Cable 1)" },
    { code:"WF104070", name:"PT100 Installation" },
    { code:"WF104080", name:"Final Routing of Cables" },
    { code:"WF104090", name:"HV Terminations incl. Earthing Bonding – Cable 1" },
    { code:"WF104110", name:"FO Terminations" },
    { code:"WF104120", name:"FO Testing" },
    { code:"WF104130", name:"Post Termination Testing (Earth verification)" },
    { code:"WF104140", name:"Internal QC JDR walk down" },
    { code:"WF104145", name:"JDR/ORST QC / As-Left" },
    { code:"WF104150", name:"DEMOB" },
    { code:"WF104160", name:"OTDR (Remedials)" },
  ],
  String: [
    { code:"WF126565", name:"Termination of String complete" },
    { code:"SERV33650", name:"RTS Testing" },
  ],
};

// ── Locations (no Vessel) ─────────────────────────────────────────────────────
const ALL_LOCATIONS = [
  "A01","A02","A03","A15","A19","A21","A23","A24",
  "At-Sea","BLP 50","BLP 51","BLP 52","BLP 69",
  "OSS East","OSS West","Z01",
];

// Stage pill
const STAGE: Record<string, { bg: string; text: string; label: string }> = {
  captured: { bg:"#dbeafe", text:"#1d4ed8", label:"Captured"  },
  draft:    { bg:"#f1f5f9", text:"#64748b", label:"Draft"     },
  clarified:{ bg:"#dcfce7", text:"#15803d", label:"Clarified" },
};

// ── Entry & seed types ────────────────────────────────────────────────────────
type Entry = {
  id: string;
  section: Section;
  activityCode: string;
  activityName: string;
  location: string;
  stage: "draft" | "captured" | "clarified";
};
type CellKey = `${number}-${number}`;
type Assignments = Record<CellKey, Entry[]>;

const TEAMS = [
  { id:1, name:"Team 1" }, { id:2, name:"Team 2" }, { id:3, name:"Team 3" },
  { id:4, name:"Team 4" }, { id:5, name:"Team 5" }, { id:6, name:"Team 6" },
  { id:7, name:"Team 7" }, { id:8, name:"Team 8" }, { id:9, name:"Team 9" },
];

// dayIdx: 0=Jul27  1=Jul28  2=Jul29(empty)  3=Jul30  4=Jul31  5=Aug1
// Vessel entries removed; activities from P6 list replace them.
const SEED: Assignments = {
  // ── Jul 27 – early-stage activities, all Captured ──────────────────────────
  "1-0": [
    { id:"a01", section:"OCS",    activityCode:"WF103630", activityName:"MOB / As found",                  location:"A15",    stage:"captured" },
    { id:"a02", section:"OCS",    activityCode:"WF103635", activityName:"Post Pull-In Test (DC Voltage/OTDR/Phase Rotation)", location:"A15", stage:"captured" },
  ],
  "2-0": [
    { id:"a03", section:"OCS",    activityCode:"WF103630", activityName:"MOB / As found",                  location:"A15",    stage:"captured" },
    { id:"a04", section:"OCS",    activityCode:"WF103640", activityName:"OCS Protection & required rigging",location:"A15",   stage:"captured" },
  ],
  "3-0": [
    { id:"a05", section:"2Cable", activityCode:"WF103800", activityName:"MOB / As found",                  location:"Z01",    stage:"captured" },
    { id:"a06", section:"2Cable", activityCode:"WF103805", activityName:"Pre-Termination Testing",          location:"Z01",    stage:"captured" },
  ],
  "4-0": [
    { id:"a07", section:"2Cable", activityCode:"WF103800", activityName:"MOB / As found",                  location:"Z01",    stage:"captured" },
    { id:"a08", section:"2Cable", activityCode:"WF103810", activityName:"SIP Protection",                   location:"Z01",    stage:"captured" },
  ],
  "5-0": [
    { id:"a09", section:"1Cable", activityCode:"WF104010", activityName:"MOB / As found",                  location:"A21",    stage:"captured" },
    { id:"a10", section:"1Cable", activityCode:"WF104015", activityName:"Pre-Termination Testing",          location:"A21",    stage:"captured" },
  ],
  "6-0": [
    { id:"a11", section:"1Cable", activityCode:"WF104010", activityName:"MOB / As found",                  location:"At-Sea", stage:"captured" },
  ],
  "7-0": [
    { id:"a12", section:"1Cable", activityCode:"WF104020", activityName:"SIP Protection",                   location:"At-Sea", stage:"captured" },
  ],
  "8-0": [
    { id:"a13", section:"OCS",    activityCode:"WF103650", activityName:"Perm Hangoff's & Stripping",       location:"A19",    stage:"captured" },
    { id:"a14", section:"OCS",    activityCode:"WF103660", activityName:"CMS (build/re-build/soft routing)",location:"A23",    stage:"captured" },
    { id:"a15", section:"OCS",    activityCode:"WF103670", activityName:"Partial routing & cut/cleat of Cable", location:"A24", stage:"captured" },
  ],
  "9-0": [
    { id:"a16", section:"2Cable", activityCode:"WF103820", activityName:"Perm Hangoff's & Stripping – Cables 1&2", location:"A15", stage:"captured" },
    { id:"a17", section:"2Cable", activityCode:"WF103830", activityName:"CMS modifications",                location:"A15",    stage:"captured" },
  ],

  // ── Jul 28 ────────────────────────────────────────────────────────────────
  "8-1": [
    { id:"b01", section:"OCS",    activityCode:"WF103680", activityName:"Heating of Cable",                location:"A24",    stage:"draft" },
  ],

  // ── Jul 30 ────────────────────────────────────────────────────────────────
  "2-3": [
    { id:"d01", section:"OCS",    activityCode:"WF103710", activityName:"HV Terminations (up to plug-in)",  location:"BLP 69", stage:"clarified" },
  ],
  "4-3": [
    { id:"d02", section:"2Cable", activityCode:"WF103840", activityName:"Routing & Cleating",               location:"OSS East", stage:"draft" },
  ],
  "6-3": [
    { id:"d03", section:"1Cable", activityCode:"WF104030", activityName:"Perm Hangoff's & Stripping",       location:"At-Sea", stage:"draft" },
    { id:"d04", section:"1Cable", activityCode:"WF104040", activityName:"CMS modifications",                location:"BLP 52", stage:"draft" },
  ],

  // ── Jul 31 ────────────────────────────────────────────────────────────────
  "1-4": [
    { id:"e01", section:"OCS",    activityCode:"WF103720", activityName:"Connex Joints (containment/remove cleats/belly cable)", location:"At-Sea", stage:"captured" },
    { id:"e02", section:"OCS",    activityCode:"WF103730", activityName:"FO Terminations",                  location:"BLP 69", stage:"captured" },
    { id:"e03", section:"OCS",    activityCode:"WF103710", activityName:"HV Terminations (up to plug-in)",  location:"BLP 51", stage:"draft" },
    { id:"e04", section:"OCS",    activityCode:"WF103680", activityName:"Heating of Cable",                 location:"A01",    stage:"draft" },
    { id:"e05", section:"OCS",    activityCode:"WF103690", activityName:"Straightening bars on Cable",      location:"A02",    stage:"draft" },
  ],
  "2-4": [
    { id:"e06", section:"OCS",    activityCode:"WF103750", activityName:"OTDR Testing (Part 1)",            location:"BLP 69", stage:"draft" },
    { id:"e07", section:"OCS",    activityCode:"WF103740", activityName:"HV Termination (plug-in)",         location:"At-Sea", stage:"draft" },
    { id:"e08", section:"OCS",    activityCode:"WF103760", activityName:"OTDR Testing (Part 2)",            location:"BLP 51", stage:"draft" },
  ],
  "3-4": [
    { id:"e09", section:"2Cable", activityCode:"WF103850", activityName:"HV Prep Heating, Straightening & Cooling (Cable 1)", location:"A03", stage:"draft" },
    { id:"e10", section:"2Cable", activityCode:"WF103860", activityName:"HV Prep Heating, Straightening & Cooling (Cable 2)", location:"At-Sea", stage:"draft" },
    { id:"e11", section:"2Cable", activityCode:"WF103870", activityName:"PT100 Installation",               location:"OSS East", stage:"draft" },
  ],
  "4-4": [
    { id:"e12", section:"2Cable", activityCode:"WF103910", activityName:"Termination of Cable 1",           location:"A01",    stage:"captured" },
    { id:"e13", section:"2Cable", activityCode:"WF103900", activityName:"Final Routing of Cables",          location:"At-Sea", stage:"draft" },
    { id:"e14", section:"2Cable", activityCode:"WF103920", activityName:"Termination of Cable 2",           location:"OSS East", stage:"draft" },
  ],
  "5-4": [
    { id:"e15", section:"1Cable", activityCode:"WF104050", activityName:"Routing & Cleating",               location:"At-Sea", stage:"draft" },
    { id:"e16", section:"1Cable", activityCode:"WF104060", activityName:"HV Prep Heating, Straightening & Cooling (Cable 1)", location:"OSS West", stage:"draft" },
  ],
  "6-4": [
    { id:"e17", section:"1Cable", activityCode:"WF104070", activityName:"PT100 Installation",               location:"At-Sea", stage:"draft" },
    { id:"e18", section:"1Cable", activityCode:"WF104080", activityName:"Final Routing of Cables",          location:"OSS West", stage:"draft" },
  ],
  "7-4": [
    { id:"e19", section:"1Cable", activityCode:"WF104090", activityName:"HV Terminations incl. Earthing Bonding – Cable 1", location:"At-Sea", stage:"draft" },
    { id:"e20", section:"1Cable", activityCode:"WF104110", activityName:"FO Terminations",                  location:"BLP 52", stage:"draft" },
  ],
  "8-4": [
    { id:"e21", section:"1Cable", activityCode:"WF104120", activityName:"FO Testing",                       location:"At-Sea", stage:"draft" },
    { id:"e22", section:"1Cable", activityCode:"WF104130", activityName:"Post Termination Testing (Earth verification)", location:"BLP 52", stage:"draft" },
  ],
  "9-4": [
    { id:"e23", section:"2Cable", activityCode:"WF103950", activityName:"FO Terminations",                  location:"At-Sea", stage:"draft" },
    { id:"e24", section:"2Cable", activityCode:"WF103960", activityName:"FO Testing",                       location:"BLP 50", stage:"draft" },
  ],

  // ── Aug 1 ─────────────────────────────────────────────────────────────────
  "1-5": [
    { id:"f01", section:"OCS",    activityCode:"WF103775", activityName:"HV Terminations incl. Final plug-in and earthing", location:"A01", stage:"draft" },
    { id:"f02", section:"OCS",    activityCode:"WF103780", activityName:"QC Inspection",                    location:"A02",    stage:"draft" },
  ],
  "2-5": [
    { id:"f03", section:"OCS",    activityCode:"WF103755", activityName:"RTS Testing",                      location:"BLP 69", stage:"draft" },
  ],
  "4-5": [
    { id:"f04", section:"2Cable", activityCode:"WF103970", activityName:"Post Termination Testing (Earth verification)", location:"A02", stage:"captured" },
    { id:"f05", section:"2Cable", activityCode:"WF103980", activityName:"Internal QC JDR walk down",        location:"A02",    stage:"captured" },
  ],
  "9-5": [
    { id:"f06", section:"2Cable", activityCode:"WF103970", activityName:"Post Termination Testing (Earth verification)", location:"BLP 50", stage:"draft" },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const DOW   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTH = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const REAL_DATE = new Date(2026, 6, 27); // July 27 2026 (Mon)

function getDays(base: Date, count = 10) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return d;
  });
}

// ── Add Activity modal ────────────────────────────────────────────────────────
function AddModal({ onAdd, onClose }: {
  onAdd: (e: Omit<Entry, "id">) => void;
  onClose: () => void;
}) {
  const [section, setSection] = useState<Section>("OCS");
  const [actIdx, setActIdx]   = useState(0);
  const [loc, setLoc]         = useState(ALL_LOCATIONS[0]);
  const acts = ACTIVITIES[section];
  const meta = SECTION_META[section];

  return (
    <div style={{ position:"fixed", inset:0, zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(28,39,56,0.35)", backdropFilter:"blur(2px)" }}>
      <div style={{ background:"#fff", borderRadius:12, boxShadow:"0 20px 60px rgba(0,0,0,0.18)", width:380, border:"1px solid #d3dbe8", overflow:"hidden" }}>
        <div style={{ padding:"14px 18px", borderBottom:"1px solid #e8ecf4", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:"#7a8ba3", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:2 }}>Assign Activity</div>
            <div style={{ fontSize:14, fontWeight:700, color:"#1c2738" }}>Add P6 Activity to team</div>
          </div>
          <button onClick={onClose} style={{ width:26, height:26, borderRadius:"50%", border:"1px solid #d3dbe8", background:"#f3f5fa", color:"#7a8ba3", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
        </div>
        <div style={{ padding:"16px 18px", display:"flex", flexDirection:"column", gap:14 }}>

          {/* Section picker */}
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:"#7a8ba3", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:6 }}>Section</div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {(Object.keys(SECTION_META) as Section[]).map(s => {
                const m = SECTION_META[s];
                const active = section === s;
                return (
                  <button key={s} onClick={() => { setSection(s); setActIdx(0); }}
                    style={{ padding:"4px 10px", fontSize:11, fontWeight:600, borderRadius:20, border:`1px solid ${active ? m.border : "#d3dbe8"}`, background: active ? m.headerBg : "#f8fafc", color: active ? m.text : "#7a8ba3", cursor:"pointer" }}>
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Activity picker */}
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:"#7a8ba3", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:6 }}>Activity</div>
            <div style={{ border:`1px solid ${meta.border}`, borderRadius:8, overflow:"hidden", maxHeight:200, overflowY:"auto" }}>
              {acts.map((a, i) => {
                const active = actIdx === i;
                return (
                  <button key={a.code} onClick={() => setActIdx(i)}
                    style={{ width:"100%", textAlign:"left", padding:"7px 10px", fontSize:11, display:"flex", flexDirection:"column", gap:1, cursor:"pointer", borderBottom:"1px solid #f3f5fa", background: active ? meta.headerBg : "#fff", color:"#1c2738" }}>
                    <span style={{ fontSize:9, fontWeight:700, color: active ? meta.text : "#7a8ba3", letterSpacing:"0.06em" }}>{a.code}</span>
                    <span style={{ lineHeight:1.3, color: active ? meta.text : "#1c2738" }}>{a.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Location picker */}
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:"#7a8ba3", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:6 }}>Location</div>
            <div style={{ position:"relative" }}>
              <select value={loc} onChange={e => setLoc(e.target.value)} style={{ width:"100%", appearance:"none", background:"#f3f5fa", border:"1px solid #d3dbe8", borderRadius:6, padding:"7px 28px 7px 10px", fontSize:12, color:"#1c2738", cursor:"pointer" }}>
                {ALL_LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <svg style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7a8ba3" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
            </div>
          </div>
        </div>

        <div style={{ padding:"12px 18px", borderTop:"1px solid #e8ecf4", display:"flex", gap:8, justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ padding:"6px 14px", fontSize:12, fontWeight:500, borderRadius:6, border:"1px solid #d3dbe8", background:"#f3f5fa", color:"#1c2738", cursor:"pointer" }}>Cancel</button>
          <button onClick={() => {
            const act = acts[actIdx];
            onAdd({ section, activityCode: act.code, activityName: act.name, location: loc, stage:"draft" });
            onClose();
          }} style={{ padding:"6px 14px", fontSize:12, fontWeight:600, borderRadius:6, border:"none", background:"#1470cc", color:"#fff", cursor:"pointer" }}>Add Activity</button>
        </div>
      </div>
    </div>
  );
}

// ── Activity card ─────────────────────────────────────────────────────────────
function ActivityCard({ entry, onRemove }: { entry: Entry; onRemove: () => void }) {
  const m  = SECTION_META[entry.section] ?? SECTION_META["OCS"];
  const st = STAGE[entry.stage]          ?? STAGE.draft;
  const [hover, setHover] = useState(false);

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ position:"relative", background:m.bg, border:`1px solid ${m.border}`, borderRadius:7, overflow:"hidden", display:"flex", flexDirection:"column" }}>

      {/* Section header strip */}
      <div style={{ background:m.headerBg, borderBottom:`1px solid ${m.border}`, padding:"3px 8px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:4 }}>
        <div style={{ display:"flex", alignItems:"center", gap:4, minWidth:0 }}>
          <span style={{ width:5, height:5, borderRadius:"50%", background:m.dot, flexShrink:0 }} />
          <span style={{ fontSize:9, fontWeight:700, color:m.text, textTransform:"uppercase", letterSpacing:"0.07em", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.label}</span>
        </div>
        <span style={{ fontSize:9, fontWeight:600, padding:"1px 5px", borderRadius:10, background:st.bg, color:st.text, whiteSpace:"nowrap", flexShrink:0 }}>{st.label}</span>
      </div>

      {/* Activity body */}
      <div style={{ padding:"5px 8px 6px", display:"flex", flexDirection:"column", gap:2 }}>
        <span style={{ fontSize:9, fontWeight:700, color:m.text, letterSpacing:"0.05em" }}>{entry.activityCode}</span>
        <span style={{ fontSize:10, fontWeight:500, color:"#1c2738", lineHeight:1.35 }}>{entry.activityName}</span>
        {/* Location chip */}
        <div style={{ marginTop:2 }}>
          <span style={{ fontSize:9, fontWeight:600, color:"#475569", background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:4, padding:"1px 5px" }}>📍 {entry.location}</span>
        </div>
      </div>

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

  function addEntry(teamId: number, dayIdx: number, e: Omit<Entry, "id">) {
    const key: CellKey = `${teamId}-${dayIdx}`;
    setAssignments(p => ({ ...p, [key]: [...(p[key]??[]), { id:`${Date.now()}`, ...e }] }));
  }
  function removeEntry(teamId: number, dayIdx: number, id: string) {
    const key: CellKey = `${teamId}-${dayIdx}`;
    setAssignments(p => ({ ...p, [key]: (p[key]??[]).filter(e => e.id !== id) }));
  }

  return (
    <div style={{ display:"flex", height:"100vh", fontFamily:"'Inter', system-ui, sans-serif", background:"#fff", color:"#1c2738", overflow:"hidden" }}>

      {/* ── Collapsed sidebar ── */}
      <div style={{ width:48, flexShrink:0, background:"#f3f5fa", borderRight:"1px solid #d3dbe8", display:"flex", flexDirection:"column", alignItems:"center", height:"100%" }}>
        {[
          <path key="g" d="M3 12L12 3l9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9"/>,
          <><circle key="c" cx="12" cy="8" r="4"/><path key="p" d="M6 20v-1a6 6 0 0112 0v1"/></>,
          <><rect key="r" x="3" y="4" width="18" height="18" rx="2"/><path key="p1" d="M16 2v4M8 2v4M3 10h18"/></>,
          <><path key="p" d="M12 2v20M2 12h20"/></>,
        ].map((icon, i) => (
          <button key={i} style={{ width:36, height:36, margin: i===0?"12px auto 4px":"4px auto", borderRadius:8, border:"none", background: i===2?"#1470cc":"transparent", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={i===2?"#fff":"#7a8ba3"} strokeWidth="1.8">{icon}</svg>
          </button>
        ))}
      </div>

      {/* ── Main pane ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

        {/* Top nav */}
        <div style={{ background:"#fff", borderBottom:"1px solid #d3dbe8", padding:"0 16px", display:"flex", alignItems:"center", gap:20, height:40, flexShrink:0 }}>
          <button style={{ background:"none", border:"none", cursor:"pointer", padding:0, color:"#7a8ba3" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span style={{ fontWeight:600, fontSize:13, color:"#1c2738" }}>Mon, Jul 27</span>
          <span style={{ fontSize:10, background:"#dcfce7", color:"#15803d", border:"1px solid #86efac", padding:"2px 8px", borderRadius:10, fontWeight:600 }}>Live data · Jul 27 – Aug 1</span>
          <button style={{ background:"none", border:"none", cursor:"pointer", padding:0, color:"#7a8ba3", marginLeft:"auto" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>

        {/* Page tabs */}
        <div style={{ background:"#fff", borderBottom:"1px solid #d3dbe8", padding:"0 16px", display:"flex", gap:4, height:36, alignItems:"flex-end", flexShrink:0 }}>
          {[
            { label:"Team Setup",   icon:<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>, active:true },
            { label:"Capture",      icon:<path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>, active:false },
            { label:"Clarify",      icon:<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>, active:false },
          ].map(tab => (
            <button key={tab.label} style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 10px", fontSize:12, fontWeight:500, border:"none", borderBottom: tab.active ? "2px solid #1470cc" : "2px solid transparent", background:"none", color: tab.active ? "#1470cc" : "#7a8ba3", cursor:"pointer" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">{tab.icon}</svg>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          {/* Page title */}
          <div style={{ padding:"14px 20px 10px", flexShrink:0 }}>
            <h1 style={{ margin:0, fontSize:18, fontWeight:700, color:"#1c2738" }}>Team Setup</h1>
          </div>

          {/* Inner tab bar */}
          <div style={{ padding:"0 20px 0", flexShrink:0 }}>
            <div style={{ display:"inline-flex", gap:2, background:"#f3f5fa", borderRadius:8, padding:3 }}>
              {INNER_TABS.map(t => (
                <button key={t} onClick={() => setInnerTab(t)}
                  style={{ padding:"4px 14px", fontSize:12, fontWeight:500, borderRadius:5, border:"none", cursor:"pointer",
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
            <div style={{ flex:1, overflow:"auto", background:"#f3f5fa", marginTop:10 }}>
              <div style={{ minWidth:"max-content" }}>

                {/* Column headers */}
                <div style={{ display:"flex", position:"sticky", top:0, zIndex:10 }}>
                  <div style={{ width:100, flexShrink:0, background:"#fff", borderRight:"1px solid #d3dbe8", borderBottom:"1px solid #d3dbe8", padding:"8px 12px", display:"flex", alignItems:"flex-end" }}>
                    <span style={{ fontSize:10, fontWeight:600, color:"#7a8ba3", textTransform:"uppercase", letterSpacing:"0.06em" }}>Team</span>
                  </div>
                  {days.map((d, i) => {
                    const highlight = i === 4; // Jul 31
                    const hasData   = [0,1,3,4,5].includes(i);
                    return (
                      <div key={i} style={{ width:190, flexShrink:0, borderRight:"1px solid #d3dbe8", borderBottom:"1px solid #d3dbe8", padding:"8px 10px", background: highlight ? "#eff6ff" : hasData ? "#fafbfd" : "#fff", display:"flex", flexDirection:"column", gap:2 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.04em", color: highlight ? "#1470cc" : hasData ? "#475569" : "#7a8ba3" }}>{DOW[d.getDay()]}</span>
                          {highlight  && <span style={{ fontSize:9, background:"#1470cc", color:"#fff", padding:"1px 6px", borderRadius:10, fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase" }}>Jul 31</span>}
                          {!highlight && hasData  && <span style={{ fontSize:9, background:"#f1f5f9", color:"#64748b", padding:"1px 5px", borderRadius:10, fontWeight:600 }}>data</span>}
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
                      const highlight = dayIdx === 4;
                      return (
                        <div key={dayIdx} style={{ width:190, flexShrink:0, borderRight:"1px solid #d3dbe8", borderBottom:"1px solid #d3dbe8", padding:7, display:"flex", flexDirection:"column", gap:5, minHeight:100, background: highlight ? "rgba(239,246,255,0.4)" : "#fff" }}>
                          {entries.map(e => (
                            <ActivityCard key={e.id} entry={e} onRemove={() => removeEntry(team.id, dayIdx, e.id)} />
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
          onAdd={(e) => addEntry(modal.teamId, modal.dayIdx, e)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
