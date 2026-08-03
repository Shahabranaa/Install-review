/**
 * Lautec "Level 3 Organise" CSV export.
 *
 * Column order matches the reference format:
 *   Is Current Revision, Activity Stream, Is Locked, Activity Group, Activity,
 *   Location, DPR Date, Start, Finish, Duration [hh:mm], Remarks,
 *   Duration Decimal, Week_Num, Month, Activity Label, Related Vessel,
 *   PAX, ManHours Decimal, TeamHours, TaskPAX, TeamPAX, Activity_Employees
 */

import { format, parseISO, addDays, getWeek, getMonth } from "date-fns";
import { hoursForEntry, formatDuration, formatTimeDisplay } from "./utils";

// ── Minimal shape needed from a timesheet entry ──────────────────────────────
export interface LautecExportEntry {
  date: string;                       // "YYYY-MM-DD" — calendar date entry starts
  shiftDate?: string | null;          // logical DPR date (may differ for overnight)
  startTime?: string | null;          // "HH:MM" 24 h
  endTime?: string | null;            // "HH:MM" 24 h
  stage: string;                      // "draft" | "captured" | "clarified"
  teamId?: number | null;
  activityGroupId?: number | null;
  activityId?: number | null;
  notes?: string | null;
  combinedComment?: string | null;
  location?: { name: string } | null;
}

// ── Lookup tables passed in from the calling component ───────────────────────
export interface LautecExportLookups {
  teams: Array<{ id: number; name: string }>;
  activityGroups: Array<{ id: number; name: string }>;
  activities: Array<{ id: number; name: string }>;
}

// ── CSV helpers ───────────────────────────────────────────────────────────────
function escapeCsv(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(cells: (string | number | null | undefined)[]): string {
  return cells.map(escapeCsv).join(",");
}

// ── Main builder ──────────────────────────────────────────────────────────────
export function buildLautecCsv(
  entries: LautecExportEntry[],
  lookups: LautecExportLookups,
): string {
  const HEADERS = [
    "Is Current Revision",
    "Activity Stream",
    "Is Locked",
    "Activity Group",
    "Activity",
    "Location",
    "DPR Date",
    "Start",
    "Finish",
    "Duration [hh:mm]",
    "Shift Start Date",
    "Remarks",
  ];

  const dataRows = entries.map((entry) => {
    const team = lookups.teams.find((t) => t.id === entry.teamId);
    const group = lookups.activityGroups.find((g) => g.id === entry.activityGroupId);
    const activity = lookups.activities.find((a) => a.id === entry.activityId);

    const entryDate = parseISO(entry.date);
    const shiftDate = parseISO(entry.shiftDate ?? entry.date);

    const startStr = entry.startTime ? formatTimeDisplay(entry.startTime) : "";
    const endStr = entry.endTime ? formatTimeDisplay(entry.endTime) : "";

    // Overnight: if end ≤ start, finish falls on the next calendar day
    const isOvernight = !!(startStr && endStr && startStr >= endStr);
    const finishDate = isOvernight ? addDays(entryDate, 1) : entryDate;

    const dprDateFmt = format(entryDate, "dd-MM-yyyy");         // calendar date the entry falls on
    const shiftDateFmt = format(shiftDate, "dd-MM-yyyy");       // logical shift-start date
    const startFmt = startStr ? `${format(entryDate, "dd-MM-yyyy")} ${startStr}` : "";
    const finishFmt = endStr ? `${format(finishDate, "dd-MM-yyyy")} ${endStr}` : "";

    const durStr = formatDuration(entry.startTime, entry.endTime);

    const remarks = entry.notes ?? entry.combinedComment ?? "";

    return row([
      "Y",                                          // Is Current Revision
      team?.name ?? "",                             // Activity Stream
      entry.stage !== "draft" ? "Y" : "N",         // Is Locked
      group?.name ?? "",                            // Activity Group
      activity?.name ?? "",                         // Activity
      entry.location?.name ?? "",                   // Location
      dprDateFmt,                                   // DPR Date (calendar date)
      startFmt,                                     // Start
      finishFmt,                                    // Finish
      durStr === "—" ? "" : durStr,                 // Duration [hh:mm]
      shiftDateFmt,                                 // Shift Start Date
      remarks,                                      // Remarks
    ]);
  });

  return [row(HEADERS), ...dataRows].join("\r\n");
}

// ── Trigger browser download ──────────────────────────────────────────────────
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
