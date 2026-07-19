// @refresh reset
import { useState } from "react";
import { Info, X, ClipboardPaste, Plus } from "lucide-react";

// ─── Static sample data ───────────────────────────────────────────────────────
type ActivityKind = "working" | "non-working";
type ActivityGroup = "effective" | "extra" | "rework";

type Row = {
  id: number;
  start: string;
  end: string;
  location: string;
  notes: string;
  kind: ActivityKind;
  group: ActivityGroup | null;
};

const SAMPLE: Row[] = [
  { id: 1, start: "06:00", end: "18:00", location: "A99", notes: "Updated note text khkjgkh", kind: "working", group: "effective" },
  { id: 2, start: "19:30", end: "19:55", location: "A01", notes: "Back on the Vessel Olympic Orion (4pax)", kind: "non-working", group: null },
  { id: 3, start: "19:10", end: "19:30", location: "A01", notes: "Mob tower 69 lift ops", kind: "non-working", group: null },
  { id: 4, start: "19:00", end: "19:10", location: "A01", notes: "Transfer to A01 (4pax)", kind: "working", group: "effective" },
  { id: 5, start: "18:30", end: "19:00", location: "A01", notes: "Wait for transfer", kind: "working", group: "effective" },
  { id: 6, start: "17:30", end: "18:30", location: "A02", notes: "On deck sorting bags, prep for lift (4pax)", kind: "working", group: "effective" },
  { id: 7, start: "19:10", end: "19:30", location: "A03", notes: "Mob tower 69 lift ops", kind: "non-working", group: null },
  { id: 8, start: "09:00", end: "10:00", location: "A01", notes: "Andrew Test", kind: "non-working", group: null },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function duration(start: string, end: string): string {
  if (!start || !end) return "—";
  let mins = parseMinutes(end) - parseMinutes(start);
  if (mins <= 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

// ─── Activity pill toggle ─────────────────────────────────────────────────────
function ActivityToggle({
  kind,
  group,
  onChange,
}: {
  kind: ActivityKind;
  group: ActivityGroup | null;
  onChange: (k: ActivityKind, g: ActivityGroup | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {/* Row 1: Working / Non-Working */}
      <div className="flex gap-1">
        <button
          onClick={() => onChange("working", group ?? "effective")}
          className={`px-2 py-0.5 text-[11px] font-semibold rounded transition-colors whitespace-nowrap ${
            kind === "working"
              ? "bg-sky-600 text-white"
              : "bg-muted/50 text-muted-foreground hover:bg-muted"
          }`}
        >
          Working Time
        </button>
        <button
          onClick={() => onChange("non-working", null)}
          className={`px-2 py-0.5 text-[11px] font-semibold rounded transition-colors whitespace-nowrap ${
            kind === "non-working"
              ? "bg-amber-600 text-white"
              : "bg-muted/50 text-muted-foreground hover:bg-muted"
          }`}
        >
          Non-Working
        </button>
      </div>
      {/* Row 2: Sub-group (only if Working Time) */}
      {kind === "working" && (
        <div className="flex gap-1">
          {(["effective", "extra", "rework"] as const).map((g) => {
            const label = g === "effective" ? "Effective" : g === "extra" ? "Extra Work" : "Re-Work";
            return (
              <button
                key={g}
                onClick={() => onChange("working", g)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                  group === g
                    ? "bg-emerald-600 text-white"
                    : "bg-muted/40 text-muted-foreground/60 hover:bg-muted"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Inline-editable cell ─────────────────────────────────────────────────────
function EditableCell({
  value,
  editing,
  onActivate,
  onChange,
  className = "",
  inputClassName = "",
  type = "text",
}: {
  value: string;
  editing: boolean;
  onActivate: () => void;
  onChange: (v: string) => void;
  className?: string;
  inputClassName?: string;
  type?: string;
}) {
  if (editing) {
    return (
      <input
        autoFocus
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-primary/10 border border-primary rounded px-1.5 py-0.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary font-mono tabular-nums ${inputClassName}`}
      />
    );
  }
  return (
    <span
      onClick={onActivate}
      title="Click to edit"
      className={`cursor-text select-none hover:bg-muted/40 rounded px-1 -mx-1 transition-colors ${className}`}
    >
      {value || <span className="text-muted-foreground/40">—</span>}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function FilledState() {
  const [rows, setRows] = useState<Row[]>(SAMPLE);
  // editingCell: { rowId, field }
  const [editingCell, setEditingCell] = useState<{ rowId: number; field: string } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const isEditing = (rowId: number, field: string) =>
    editingCell?.rowId === rowId && editingCell?.field === field;

  const activateCell = (rowId: number, field: string) => setEditingCell({ rowId, field });
  const deactivate = () => setEditingCell(null);

  const updateRow = (id: number, updates: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));

  const deleteRow = (id: number) => {
    setDeletingId(id);
    setTimeout(() => {
      setRows((prev) => prev.filter((r) => r.id !== id));
      setDeletingId(null);
    }, 200);
  };

  const addRow = () => {
    const newId = Math.max(...rows.map((r) => r.id)) + 1;
    setRows((prev) => [
      ...prev,
      { id: newId, start: "00:00", end: "00:00", location: "", notes: "", kind: "working", group: "effective" },
    ]);
    setEditingCell({ rowId: newId, field: "start" });
  };

  const totalHours = rows.reduce((acc, r) => {
    let mins = parseMinutes(r.end) - parseMinutes(r.start);
    if (mins <= 0) mins += 24 * 60;
    return acc + mins;
  }, 0);
  const totalH = Math.floor(totalHours / 60);
  const totalM = totalHours % 60;

  return (
    <div
      className="flex flex-col h-screen bg-background text-foreground font-sans overflow-hidden"
      onClick={() => deactivate()}
    >
      {/* Header */}
      <header className="px-6 py-4 border-b border-border bg-card flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Timesheet Capture</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Click any cell to edit it directly, like a spreadsheet.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm font-medium bg-background hover:bg-muted transition-colors">
            <ClipboardPaste className="w-4 h-4" />
            Paste Rows
          </button>
        </div>
      </header>

      {/* Filter pills */}
      <div className="px-6 py-2.5 border-b border-border bg-card/50 shrink-0 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-10 shrink-0">Date</span>
          {["14/06", "15/06", "16/06"].map((d) => (
            <button
              key={d}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                d === "14/06"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:border-primary/40"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-10 shrink-0">Team</span>
          {["Team 7", "Team 8", "Team 9"].map((t) => (
            <button
              key={t}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                t === "Team 7"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:border-primary/40"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Context bar (date+team active → Add Row lives here) */}
      <div className="px-6 py-2 border-b border-border bg-muted/20 shrink-0 flex items-center gap-3">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/15 text-primary text-xs font-semibold">
          14/06
        </span>
        <span className="text-muted-foreground text-xs">·</span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/15 text-primary text-xs font-semibold">
          Team 7
        </span>
        <span className="text-muted-foreground text-xs ml-1">
          {totalH}h {String(totalM).padStart(2, "0")}m · {rows.length} rows
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); addRow(); }}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Row
          <span className="text-[10px] text-primary-foreground/60 ml-0.5">↳ 14/06 · Team 7</span>
        </button>
      </div>

      {/* Table */}
      <div
        className="flex-1 overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <table className="w-full border-collapse text-sm">
          <colgroup>
            <col style={{ width: 76 }} />
            <col style={{ width: 76 }} />
            <col style={{ width: 76 }} />
            <col style={{ width: 90 }} />
            <col />
            <col style={{ width: 220 }} />
            <col style={{ width: 72 }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-card border-b border-border">
            <tr>
              {["Start", "End", "Duration", "Location", "Notes", "Activity Group", "Actions"].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const dur = duration(row.start, row.end);
              const anyEditing = editingCell?.rowId === row.id;
              return (
                <tr
                  key={row.id}
                  className={`border-b border-border/50 transition-colors ${
                    deletingId === row.id ? "opacity-0" : anyEditing ? "bg-primary/5" : idx % 2 === 0 ? "bg-transparent" : "bg-muted/10"
                  } hover:bg-muted/20`}
                  style={{ height: 52 }} // ← fixed row height regardless of edit state
                >
                  {/* Start */}
                  <td className="px-3 py-1.5">
                    <EditableCell
                      value={row.start}
                      editing={isEditing(row.id, "start")}
                      onActivate={() => activateCell(row.id, "start")}
                      onChange={(v) => updateRow(row.id, { start: v })}
                      className="text-sm font-mono tabular-nums text-foreground"
                      inputClassName="w-20"
                    />
                  </td>
                  {/* End */}
                  <td className="px-3 py-1.5">
                    <EditableCell
                      value={row.end}
                      editing={isEditing(row.id, "end")}
                      onActivate={() => activateCell(row.id, "end")}
                      onChange={(v) => updateRow(row.id, { end: v })}
                      className="text-sm font-mono tabular-nums text-foreground"
                      inputClassName="w-20"
                    />
                  </td>
                  {/* Duration */}
                  <td className="px-3 py-1.5">
                    <span className="text-sm font-semibold tabular-nums text-emerald-500">
                      {dur}
                    </span>
                  </td>
                  {/* Location */}
                  <td className="px-3 py-1.5">
                    <EditableCell
                      value={row.location}
                      editing={isEditing(row.id, "location")}
                      onActivate={() => activateCell(row.id, "location")}
                      onChange={(v) => updateRow(row.id, { location: v })}
                      className="text-sm text-foreground"
                      inputClassName="w-20"
                    />
                  </td>
                  {/* Notes */}
                  <td className="px-3 py-1.5 max-w-[260px]">
                    <EditableCell
                      value={row.notes}
                      editing={isEditing(row.id, "notes")}
                      onActivate={() => activateCell(row.id, "notes")}
                      onChange={(v) => updateRow(row.id, { notes: v })}
                      className="text-sm text-foreground truncate block"
                      inputClassName="w-full"
                    />
                  </td>
                  {/* Activity Group */}
                  <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <ActivityToggle
                      kind={row.kind}
                      group={row.group}
                      onChange={(k, g) => updateRow(row.id, { kind: k, group: g })}
                    />
                  </td>
                  {/* Actions */}
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Row details"
                      >
                        <Info className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteRow(row.id); }}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Delete row"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/20">
              <td colSpan={2} className="px-3 py-2 text-xs text-muted-foreground font-medium">
                Total {rows.length} rows
              </td>
              <td className="px-3 py-2 text-xs font-bold text-emerald-500 tabular-nums">
                {totalH}h {String(totalM).padStart(2, "0")}m
              </td>
              <td colSpan={4} className="px-3 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Hint bar */}
      <div className="px-6 py-2 border-t border-border bg-card/50 shrink-0">
        <p className="text-xs text-muted-foreground">
          Click any cell in{" "}
          <strong className="text-foreground">Start</strong>,{" "}
          <strong className="text-foreground">End</strong>,{" "}
          <strong className="text-foreground">Location</strong> or{" "}
          <strong className="text-foreground">Notes</strong> to edit inline.
          Activity Group pills toggle instantly — no dropdowns.
        </p>
      </div>
    </div>
  );
}
