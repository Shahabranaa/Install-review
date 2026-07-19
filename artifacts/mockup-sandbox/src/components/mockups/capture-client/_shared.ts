// Shared types and pure helpers — no JSX, no React import needed

export type ActivityKind = "working" | "non-working";
export type ActivityGroup = "effective" | "extra" | "rework";

export type Row = {
  id: number;
  date: string; // "DD/MM"
  start: string;
  end: string;
  location: string;
  notes: string;
  kind: ActivityKind;
  group: ActivityGroup | null;
};

// All dates in the current period — latest first. Includes dates with zero captures.
export const ALL_DATES = ["19/06", "18/06", "17/06", "16/06", "15/06", "14/06", "13/06"];

export const SAMPLE: Row[] = [
  // 19/06 — 2 rows
  { id: 101, date: "19/06", start: "07:00", end: "15:00", location: "A01", notes: "Morning shift — tower inspection", kind: "working", group: "effective" },
  { id: 102, date: "19/06", start: "15:30", end: "16:00", location: "A01", notes: "Transfer to vessel", kind: "non-working", group: null },

  // 18/06 — 3 rows
  { id: 91, date: "18/06", start: "06:00", end: "14:00", location: "A02", notes: "Deck operations, crane assist", kind: "working", group: "effective" },
  { id: 92, date: "18/06", start: "14:30", end: "15:00", location: "A02", notes: "Safety briefing", kind: "working", group: "extra" },
  { id: 93, date: "18/06", start: "15:00", end: "15:20", location: "A01", notes: "Back on vessel", kind: "non-working", group: null },

  // 17/06 — 0 rows (empty date — all captures deleted or not yet entered)

  // 16/06 — 2 rows
  { id: 81, date: "16/06", start: "08:00", end: "16:30", location: "A03", notes: "Scaffold erection level 3", kind: "working", group: "effective" },
  { id: 82, date: "16/06", start: "16:30", end: "17:00", location: "A01", notes: "Demob to helideck", kind: "non-working", group: null },

  // 15/06 — 0 rows (empty)

  // 14/06 — 8 rows (original sample)
  { id: 1,  date: "14/06", start: "06:00", end: "18:00", location: "A99", notes: "Updated note text khkjgkh", kind: "working", group: "effective" },
  { id: 2,  date: "14/06", start: "19:30", end: "19:55", location: "A01", notes: "Back on the Vessel Olympic Orion (4pax)", kind: "non-working", group: null },
  { id: 3,  date: "14/06", start: "19:10", end: "19:30", location: "A01", notes: "Mob tower 69 lift ops", kind: "non-working", group: null },
  { id: 4,  date: "14/06", start: "19:00", end: "19:10", location: "A01", notes: "Transfer to A01 (4pax)", kind: "working", group: "effective" },
  { id: 5,  date: "14/06", start: "18:30", end: "19:00", location: "A01", notes: "Wait for transfer", kind: "working", group: "effective" },
  { id: 6,  date: "14/06", start: "17:30", end: "18:30", location: "A02", notes: "On deck sorting bags, prep for lift (4pax)", kind: "working", group: "effective" },
  { id: 7,  date: "14/06", start: "19:10", end: "19:30", location: "A03", notes: "Mob tower 69 lift ops", kind: "non-working", group: null },
  { id: 8,  date: "14/06", start: "09:00", end: "10:00", location: "A01", notes: "Andrew Test", kind: "non-working", group: null },

  // 13/06 — 1 row
  { id: 71, date: "13/06", start: "07:30", end: "18:30", location: "A01", notes: "Full day — mob and commissioning", kind: "working", group: "effective" },
];

function parseMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function duration(start: string, end: string): string {
  if (!start || !end) return "—";
  let mins = parseMinutes(end) - parseMinutes(start);
  if (mins <= 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function totalDuration(rows: Row[]): string {
  const totalMins = rows.reduce((acc, r) => {
    let m = parseMinutes(r.end) - parseMinutes(r.start);
    if (m <= 0) m += 24 * 60;
    return acc + m;
  }, 0);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
