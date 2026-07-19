import "./_group.css";
import { useState } from "react";
import { Info, X, ClipboardPaste, Plus, CalendarX, CheckSquare, Trash2, CheckCheck, Square, Minus } from "lucide-react";
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
  const [selectedDate, setSelectedDate] = useState<string>(ALL_DATES[0]);
  const [selectedTeam, setSelectedTeam] = useState<string>("Team 7");
  const [editingCell, setEditingCell] = useState<{ rowId: number; field: string } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Bulk select
  const [selectMode, setSelectMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());

  const visibleRows = rows.filter((r) => r.date === selectedDate);

  const isEditing = (rowId: number, field: string) =>
    editingCell?.rowId === rowId && editingCell?.field === field;

  const activateCell = (rowId: number, field: string) => {
    if (selectMode) return;
    setEditingCell({ rowId, field });
  };
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
    setRows((prev) => [
      ...prev,
      { id: newId, date: selectedDate, start: "00:00", end: "00:00", location: "", notes: "", kind: "working", group: "effective" },
    ]);
    setEditingCell({ rowId: newId, field: "start" });
  };

  // Bulk select helpers
  const enterSelectMode = () => { setSelectMode(true); setCheckedIds(new Set()); setEditingCell(null); };
  const exitSelectMode = () => { setSelectMode(false); setCheckedIds(new Set()); };

  const toggleCheck = (id: number) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const allChecked = visibleRows.length > 0 && visibleRows.every((r) => checkedIds.has(r.id));
  const someChecked = visibleRows.some((r) => checkedIds.has(r.id));

  const toggleAll = () => {
    if (allChecked) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(visibleRows.map((r) => r.id)));
    }
  };

  const bulkDelete = () => {
    setRows((prev) => prev.filter((r) => !checkedIds.has(r.id)));
    exitSelectMode();
  };

  const bulkApprove = () => {
    // demo: just exits select mode (approval logic is server-side in real app)
    exitSelectMode();
  };

  const checkedCount = visibleRows.filter((r) => checkedIds.has(r.id)).length;
  const total = totalDuration(visibleRows);
  const rowsByDate = (d: string) => rows.filter((r) => r.date === d).length;

  return (
    <div
      className="flex flex-col h-screen bg-background text-foreground font-sans overflow-hidden"
      onClick={deactivate}
    >
      {/* ── Header ── */}
      <header className="px-6 py-4 border-b border-border bg-card flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Timesheet Capture</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Click any cell to edit it directly, like a spreadsheet.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Bulk select toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); selectMode ? exitSelectMode() : enterSelectMode(); }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${
              selectMode
                ? "border-primary bg-primary/10 text-primary hover:bg-primary/20"
                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            {selectMode ? "Cancel Select" : "Select"}
          </button>

          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm font-medium bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <ClipboardPaste className="w-4 h-4" />
            Paste Rows
          </button>
        </div>
      </header>

      {/* ── Filter pills ── */}
      <div className="px-6 py-2.5 border-b border-border bg-card/50 shrink-0 space-y-2">
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
                  <span className={`text-[10px] font-semibold tabular-nums rounded-full px-1 ${
                    active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
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

      {/* ── Context bar (normal) or Bulk action bar (select mode) ── */}
      {selectMode ? (
        <div className="px-6 py-2 border-b border-primary/30 bg-primary/5 shrink-0 flex items-center gap-3">
          <span className="text-xs font-semibold text-primary">
            {checkedCount === 0 ? "Select rows below" : `${checkedCount} row${checkedCount !== 1 ? "s" : ""} selected`}
          </span>
          <span className="text-border">·</span>
          <button
            onClick={(e) => { e.stopPropagation(); toggleAll(); }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {allChecked
              ? <CheckCheck className="w-3.5 h-3.5" />
              : someChecked
              ? <Minus className="w-3.5 h-3.5" />
              : <Square className="w-3.5 h-3.5" />}
            {allChecked ? "Deselect all" : "Select all"}
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              disabled={checkedCount === 0}
              onClick={(e) => { e.stopPropagation(); bulkDelete(); }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                checkedCount > 0
                  ? "border-red-500/60 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  : "border-border/40 bg-transparent text-muted-foreground/40 cursor-not-allowed"
              }`}
            >
              <Trash2 className="w-4 h-4" />
              Delete{checkedCount > 0 ? ` (${checkedCount})` : ""}
            </button>
            <button
              disabled={checkedCount === 0}
              onClick={(e) => { e.stopPropagation(); bulkApprove(); }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                checkedCount > 0
                  ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                  : "border-border/40 bg-transparent text-muted-foreground/40 cursor-not-allowed"
              }`}
            >
              <CheckCheck className="w-4 h-4" />
              Approve{checkedCount > 0 ? ` (${checkedCount})` : ""}
            </button>
          </div>
        </div>
      ) : (
        <div className="px-6 py-2 border-b border-border bg-muted/20 shrink-0 flex items-center gap-3">
          <span className="px-2 py-0.5 rounded-md bg-primary/15 text-primary text-xs font-semibold">{selectedDate}</span>
          <span className="text-muted-foreground text-xs">·</span>
          <span className="px-2 py-0.5 rounded-md bg-primary/15 text-primary text-xs font-semibold">{selectedTeam}</span>
          {visibleRows.length > 0 && (
            <span className="text-muted-foreground text-xs ml-1">{total} · {visibleRows.length} rows</span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); addRow(); }}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Row
            <span className="text-[10px] text-primary-foreground/60 ml-0.5">↳ {selectedDate} · {selectedTeam}</span>
          </button>
        </div>
      )}

      {/* ── Table / empty state ── */}
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
              {selectMode && <col style={{ width: 40 }} />}
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
                {selectMode && (
                  <th className="px-3 py-2 w-10">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleAll(); }}
                      className="flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                    >
                      {allChecked
                        ? <CheckCheck className="w-4 h-4 text-primary" />
                        : someChecked
                        ? <Minus className="w-4 h-4 text-primary" />
                        : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                )}
                {["Start", "End", "Duration", "Location", "Notes", "Activity Group", "Actions"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, idx) => {
                const dur = duration(row.start, row.end);
                const anyEditing = editingCell?.rowId === row.id;
                const isChecked = checkedIds.has(row.id);
                return (
                  <tr
                    key={row.id}
                    onClick={selectMode ? (e) => { e.stopPropagation(); toggleCheck(row.id); } : undefined}
                    className={`border-b border-border/50 transition-colors ${
                      deletingId === row.id ? "opacity-0"
                      : isChecked ? "bg-primary/10"
                      : anyEditing ? "bg-primary/5"
                      : idx % 2 === 0 ? "bg-transparent"
                      : "bg-muted/10"
                    } ${selectMode ? "cursor-pointer hover:bg-primary/15" : "hover:bg-muted/20"}`}
                    style={{ height: 52 }}
                  >
                    {/* Checkbox cell */}
                    {selectMode && (
                      <td className="px-3 py-1.5" onClick={(e) => { e.stopPropagation(); toggleCheck(row.id); }}>
                        <div className="flex items-center justify-center">
                          {isChecked
                            ? <CheckSquare className="w-4 h-4 text-primary" />
                            : <Square className="w-4 h-4 text-muted-foreground/50" />}
                        </div>
                      </td>
                    )}
                    <td className="px-3 py-1.5">
                      <EditableCell value={row.start} editing={isEditing(row.id, "start")} onActivate={() => activateCell(row.id, "start")} onChange={(v) => updateRow(row.id, { start: v })} className="text-sm font-mono tabular-nums text-foreground" inputClassName="w-20" />
                    </td>
                    <td className="px-3 py-1.5">
                      <EditableCell value={row.end} editing={isEditing(row.id, "end")} onActivate={() => activateCell(row.id, "end")} onChange={(v) => updateRow(row.id, { end: v })} className="text-sm font-mono tabular-nums text-foreground" inputClassName="w-20" />
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="text-sm font-semibold tabular-nums text-emerald-500">{dur}</span>
                    </td>
                    <td className="px-3 py-1.5">
                      <EditableCell value={row.location} editing={isEditing(row.id, "location")} onActivate={() => activateCell(row.id, "location")} onChange={(v) => updateRow(row.id, { location: v })} className="text-sm text-foreground" inputClassName="w-20" />
                    </td>
                    <td className="px-3 py-1.5 max-w-[260px]">
                      <EditableCell value={row.notes} editing={isEditing(row.id, "notes")} onActivate={() => activateCell(row.id, "notes")} onChange={(v) => updateRow(row.id, { notes: v })} className="text-sm text-foreground truncate block" inputClassName="w-full" />
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
                {selectMode && <td className="px-3 py-2" />}
                <td colSpan={2} className="px-3 py-2 text-xs text-muted-foreground font-medium">Total {visibleRows.length} rows</td>
                <td className="px-3 py-2 text-xs font-bold text-emerald-500 tabular-nums">{total}</td>
                <td colSpan={4} className="px-3 py-2" />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* ── Hint bar ── */}
      <div className="px-6 py-2 border-t border-border bg-card/50 shrink-0">
        <p className="text-xs text-muted-foreground">
          {selectMode
            ? "Click rows to select them, then use Delete or Approve above. Click Cancel Select to return to editing."
            : <>Click any cell in <strong className="text-foreground">Start</strong>, <strong className="text-foreground">End</strong>, <strong className="text-foreground">Location</strong> or <strong className="text-foreground">Notes</strong> to edit inline. Activity Group pills toggle instantly — no dropdowns.</>}
        </p>
      </div>
    </div>
  );
}
