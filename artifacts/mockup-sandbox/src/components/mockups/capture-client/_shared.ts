// Shared types and pure helpers — no JSX, no React import needed

export type ActivityKind = "working" | "non-working";
export type ActivityGroup = "effective" | "extra" | "rework";

export type Row = {
  id: number;
  start: string;
  end: string;
  location: string;
  notes: string;
  kind: ActivityKind;
  group: ActivityGroup | null;
};

export const SAMPLE: Row[] = [
  { id: 1, start: "06:00", end: "18:00", location: "A99", notes: "Updated note text khkjgkh", kind: "working", group: "effective" },
  { id: 2, start: "19:30", end: "19:55", location: "A01", notes: "Back on the Vessel Olympic Orion (4pax)", kind: "non-working", group: null },
  { id: 3, start: "19:10", end: "19:30", location: "A01", notes: "Mob tower 69 lift ops", kind: "non-working", group: null },
  { id: 4, start: "19:00", end: "19:10", location: "A01", notes: "Transfer to A01 (4pax)", kind: "working", group: "effective" },
  { id: 5, start: "18:30", end: "19:00", location: "A01", notes: "Wait for transfer", kind: "working", group: "effective" },
  { id: 6, start: "17:30", end: "18:30", location: "A02", notes: "On deck sorting bags, prep for lift (4pax)", kind: "working", group: "effective" },
  { id: 7, start: "19:10", end: "19:30", location: "A03", notes: "Mob tower 69 lift ops", kind: "non-working", group: null },
  { id: 8, start: "09:00", end: "10:00", location: "A01", notes: "Andrew Test", kind: "non-working", group: null },
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
  return `${h}h ${String(m).padStart(2, "0")}m`;
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
