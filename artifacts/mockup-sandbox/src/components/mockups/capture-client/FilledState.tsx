import { useState } from "react";
import { Info, X, ClipboardPaste, Plus } from "lucide-react";
import { ActivityToggle } from "./_ActivityToggle";
import { EditableCell } from "./_EditableCell";
import { SAMPLE, duration, totalDuration, type Row, type ActivityKind, type ActivityGroup } from "./_shared";

export function FilledState() {
  const [rows, setRows] = useState<Row[]>(SAMPLE);
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

  const total = totalDuration(rows);

  return (
    <div
      className="flex flex-col h-screen bg-background text-foreground font-sans overflow-hidden"
      onClick={deactivate}
    >
      {/* Header */}
      <header className="px-6 py-4 border-b border-border bg-card flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Timesheet Capture</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Click any cell to edit it directly, like a spreadsheet.
          </p>
        </div>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm font-medium bg-background hover:bg-muted transition-colors">
          <ClipboardPaste className="w-4 h-4" />
          Paste Rows
        </button>
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

      {/* Context bar */}
      <div className="px-6 py-2 border-b border-border bg-muted/20 shrink-0 flex items-center gap-3">
        <span className="px-2 py-0.5 rounded-md bg-primary/15 text-primary text-xs font-semibold">14/06</span>
        <span className="text-muted-foreground text-xs">·</span>
        <span className="px-2 py-0.5 rounded-md bg-primary/15 text-primary text-xs font-semibold">Team 7</span>
        <span className="text-muted-foreground text-xs ml-1">{total} · {rows.length} rows</span>
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
      <div className="flex-1 overflow-auto" onClick={(e) => e.stopPropagation()}>
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
                    deletingId === row.id
                      ? "opacity-0"
                      : anyEditing
                      ? "bg-primary/5"
                      : idx % 2 === 0
                      ? "bg-transparent"
                      : "bg-muted/10"
                  } hover:bg-muted/20`}
                  style={{ height: 52 }}
                >
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
                  <td className="px-3 py-1.5">
                    <span className="text-sm font-semibold tabular-nums text-emerald-500">{dur}</span>
                  </td>
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
                  <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <ActivityToggle
                      kind={row.kind}
                      group={row.group}
                      onChange={(k: ActivityKind, g: ActivityGroup | null) => updateRow(row.id, { kind: k, group: g })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1 justify-end">
                      <button className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Row details">
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
              <td className="px-3 py-2 text-xs font-bold text-emerald-500 tabular-nums">{total}</td>
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
