import "./_group.css";
import { useState } from "react";
import { Info, X, ClipboardPaste, Plus, CalendarX } from "lucide-react";
import { ActivityToggle } from "./_ActivityToggle";
import { EditableCell } from "./_EditableCell";
import {
  ALL_DATES,
  SAMPLE,
  duration,
  totalDuration,
  type Row,
  type ActivityKind,
  type ActivityGroup,
} from "./_shared";

export function FilledState() {
  const [rows, setRows] = useState<Row[]>(SAMPLE);
  const [selectedDate, setSelectedDate] = useState<string>(ALL_DATES[0]); // latest first
  const [selectedTeam, setSelectedTeam] = useState<string>("Team 7");
  const [editingCell, setEditingCell] = useState<{ rowId: number; field: string } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const visibleRows = rows.filter((r) => r.date === selectedDate);

  const isEditing = (rowId: number, field: string) =>
    editingCell?.rowId === rowId && editingCell?.field === field;

  const activateCell = (rowId: number, field: string) =>
    setEditingCell({ rowId, field });
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
    const newId = Math.max(...rows.map((r) => r.id), 0) + 1;
    const newRow: Row = {
      id: newId,
      date: selectedDate,
      start: "00:00",
      end: "00:00",
      location: "",
      notes: "",
      kind: "working",
      group: "effective",
    };
    setRows((prev) => [...prev, newRow]);
    setEditingCell({ rowId: newId, field: "start" });
  };

  const total = totalDuration(visibleRows);
  const rowsByDate = (d: string) => rows.filter((r) => r.date === d).length;

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
        {/* Dates — latest first, all shown */}
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-xs text-muted-foreground w-10 shrink-0">Date</span>
          {ALL_DATES.map((d) => {
            const count = rowsByDate(d);
            const active = d === selectedDate;
            return (
              <button
                key={d}
                onClick={(e) => { e.stopPropagation(); setSelectedDate(d); }}
                className={`relative flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border transition-colors shrink-0 ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-transparent text-muted-foreground border-border hover:border-primary/40"
                }`}
              >
                {d}
                {count > 0 && (
                  <span
                    className={`text-[10px] font-semibold tabular-nums rounded-full px-1 ${
                      active
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Team */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-10 shrink-0">Team</span>
          {["Team 7", "Team 8", "Team 9"].map((t) => (
            <button
              key={t}
              onClick={(e) => { e.stopPropagation(); setSelectedTeam(t); }}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                t === selectedTeam
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
        <span className="px-2 py-0.5 rounded-md bg-primary/15 text-primary text-xs font-semibold">
          {selectedDate}
        </span>
        <span className="text-muted-foreground text-xs">·</span>
        <span className="px-2 py-0.5 rounded-md bg-primary/15 text-primary text-xs font-semibold">
          {selectedTeam}
        </span>
        {visibleRows.length > 0 && (
          <span className="text-muted-foreground text-xs ml-1">
            {total} · {visibleRows.length} rows
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); addRow(); }}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Row
          <span className="text-[10px] text-primary-foreground/60 ml-0.5">
            ↳ {selectedDate} · {selectedTeam}
          </span>
        </button>
      </div>

      {/* Table / empty state */}
      <div className="flex-1 overflow-auto" onClick={(e) => e.stopPropagation()}>
        {visibleRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
            <CalendarX className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm font-semibold text-foreground">No captures for {selectedDate}</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              No timesheet entries have been recorded for this date yet. Use{" "}
              <strong>+ Add Row</strong> or <strong>Paste Rows</strong> to get started.
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <colgroup>
              <col style={{ width: 76 }} />
              <col style={{ width: 76 }} />
              <col style={{ width: 76 }} />
              <col style={{ width: 90 }} />
              <col />
              <col style={{ width: 300 }} />
              <col style={{ width: 72 }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-card border-b border-border">
              <tr>
                {["Start", "End", "Duration", "Location", "Notes", "Activity Group", "Actions"].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, idx) => {
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
                      <span className="text-sm font-semibold tabular-nums text-emerald-500">
                        {dur}
                      </span>
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
                        onChange={(k: ActivityKind, g: ActivityGroup | null) =>
                          updateRow(row.id, { kind: k, group: g })
                        }
                      />
                    </td>
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
                  Total {visibleRows.length} rows
                </td>
                <td className="px-3 py-2 text-xs font-bold text-emerald-500 tabular-nums">
                  {total}
                </td>
                <td colSpan={4} className="px-3 py-2" />
              </tr>
            </tfoot>
          </table>
        )}
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
