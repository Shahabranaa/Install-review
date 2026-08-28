import { createHash } from "node:crypto";
import { fetchSheetRowsByTitle } from "../googleSheets.js";
import type { DprLautecSnapshotRow } from "@workspace/db";

export const DPR_CAPTURE_SHEET_ID = "1UWXflQzf1m1MAtnUfNE7dEq7C9YARoFq-TjykDhMQQo";
export const DPR_CAPTURE_SHEET_HEADERS = ["Activity Group", "Activity", "Location", "Start", "Finish", "Comment"] as const;
export const DPR_CAPTURE_TEAM_HEADER = "Team ID";
export const DPR_CAPTURE_ADDITIONAL_HEADERS = ["PAX", "Code", "Notes", "Is Clarified"] as const;
export const MAX_LAUTEC_IMPORT_ROWS = 75;

export class LautecSourceError extends Error {
  status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = "LautecSourceError";
    this.status = status;
  }
}

function normalizeCell(value: unknown): string {
  return String(value ?? "").trim();
}

function validTime(value: string): boolean {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 47 && minutes >= 0 && minutes <= 59;
}

/**
 * Converts a managed Capture date tab into the exact, ordered source snapshot
 * used by the Lautec adapter. The comment is allowed to be blank; all other
 * destination fields are required.
 */
export function normalizeLautecSourceRows(rows: string[][], selectedTeamId: number): DprLautecSnapshotRow[] {
  const expectedHeaders = [
    ...DPR_CAPTURE_SHEET_HEADERS,
    DPR_CAPTURE_TEAM_HEADER,
    ...DPR_CAPTURE_ADDITIONAL_HEADERS,
  ];
  const header = (rows[0] ?? []).slice(0, expectedHeaders.length).map(normalizeCell);
  if (
    header.length !== expectedHeaders.length ||
    header.some((value, index) => value !== expectedHeaders[index])
  ) {
    throw new LautecSourceError(
      `The Capture tab header must be: ${expectedHeaders.join(", ")}`,
    );
  }

  const result: DprLautecSnapshotRow[] = [];
  rows.slice(1).forEach((source, index) => {
    const sheetRowNumber = index + 2;
    const values = Array.from({ length: expectedHeaders.length }, (_, fieldIndex) =>
      normalizeCell(source[fieldIndex]),
    );
    if (values.every((value) => value === "")) return;
    if (source.slice(expectedHeaders.length).some((value) => normalizeCell(value) !== "")) {
      throw new LautecSourceError(`Capture row ${sheetRowNumber} has values outside the managed source columns.`);
    }

    const [activityGroup, activity, location, start, finish, comment, teamId, pax] = values;
    if (!teamId || !Number.isInteger(Number(teamId))) {
      throw new LautecSourceError(`Capture row ${sheetRowNumber} is missing a valid Team ID.`);
    }
    if (Number(teamId) !== selectedTeamId) return;
    const missing = [
      ["Activity Group", activityGroup],
      ["Activity", activity],
      ["Location", location],
      ["Start", start],
      ["Finish", finish],
    ].filter(([, value]) => !value).map(([label]) => label);
    if (missing.length > 0) {
      throw new LautecSourceError(`Capture row ${sheetRowNumber} is missing: ${missing.join(", ")}.`);
    }
    if (!validTime(start) || !validTime(finish)) {
      throw new LautecSourceError(`Capture row ${sheetRowNumber} must use valid HH:MM Start and Finish times.`);
    }
    if (pax !== "" && !/^\d+$/.test(pax)) {
      throw new LautecSourceError(`Capture row ${sheetRowNumber} must use a whole-number PAX or leave it blank.`);
    }
    result.push({ activityGroup, activity, location, start, finish, comment, pax });
  });

  if (result.length === 0) throw new LautecSourceError("The selected Capture tab has no rows to send.");
  if (result.length > MAX_LAUTEC_IMPORT_ROWS) {
    throw new LautecSourceError(
      `The selected Capture tab has ${result.length} rows. Lautec imports are limited to ${MAX_LAUTEC_IMPORT_ROWS} rows per run.`,
    );
  }
  return result;
}

export function createLautecSnapshotHash(date: string, teamId: number, rows: DprLautecSnapshotRow[]): string {
  return createHash("sha256")
    .update(JSON.stringify({ date, teamId, rows }))
    .digest("hex");
}

/**
 * The hash the same source rows produced before the PAX column was carried in
 * the snapshot. Checking it alongside the current hash keeps the "already
 * imported successfully" resend guard effective for runs recorded before PAX
 * support.
 */
export function createLegacyLautecSnapshotHash(date: string, teamId: number, rows: DprLautecSnapshotRow[]): string {
  const legacyRows = rows.map(({ pax: _pax, ...rest }) => rest);
  return createLautecSnapshotHash(date, teamId, legacyRows);
}

export function requiresLautecResendConfirmation(completedSnapshotExists: boolean, confirmResend: boolean): boolean {
  return completedSnapshotExists && !confirmResend;
}

/**
 * A browser run that reached Lautec's visible Submit button may have created
 * rows even when the final confirmation was lost or only some rows were
 * rejected. This is intentionally scoped to the destination date/team, not
 * the source hash: editing the Sheet must not bypass operator verification.
 */
export function requiresLautecUncertainConfirmation(
  uncertainSubmissionExists: boolean,
  confirmUncertain: boolean,
): boolean {
  return uncertainSubmissionExists && !confirmUncertain;
}

async function fetchCaptureTabRows(date: string): Promise<string[][]> {
  return fetchSheetRowsByTitle(
    DPR_CAPTURE_SHEET_ID,
    date,
    DPR_CAPTURE_SHEET_HEADERS.length + 1 + DPR_CAPTURE_ADDITIONAL_HEADERS.length,
  ).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unable to read the Capture tab.";
    if (message.includes("not found")) throw new LautecSourceError(`Capture tab "${date}" was not found.`, 404);
    throw error;
  });
}

function snapshotForTeam(date: string, teamId: number, sheetRows: string[][]) {
  const normalizedRows = normalizeLautecSourceRows(sheetRows, teamId);
  return {
    rows: normalizedRows,
    snapshotHash: createLautecSnapshotHash(date, teamId, normalizedRows),
    legacySnapshotHash: createLegacyLautecSnapshotHash(date, teamId, normalizedRows),
  };
}

export async function getLautecSourceSnapshot(date: string, teamId: number) {
  return snapshotForTeam(date, teamId, await fetchCaptureTabRows(date));
}

/**
 * Distinct Team IDs referenced by non-empty rows of a Capture tab, in
 * ascending order. Invalid Team ID cells are reported by the per-team
 * normalization, not here.
 */
export function listLautecSourceTeamIds(sheetRows: string[][]): number[] {
  const teamColumn = DPR_CAPTURE_SHEET_HEADERS.length;
  const ids = new Set<number>();
  for (const row of sheetRows.slice(1)) {
    if (row.every((value) => normalizeCell(value) === "")) continue;
    const teamId = normalizeCell(row[teamColumn]);
    if (teamId && Number.isInteger(Number(teamId))) ids.add(Number(teamId));
  }
  return [...ids].sort((a, b) => a - b);
}

/**
 * One sheet read producing the validated snapshot of every team that has
 * rows on the requested Capture date. Any invalid row fails the whole
 * preview, matching the single-team behaviour.
 */
export async function getLautecSourceSnapshotsForDate(date: string) {
  const sheetRows = await fetchCaptureTabRows(date);
  const teamIds = listLautecSourceTeamIds(sheetRows);
  if (teamIds.length === 0) throw new LautecSourceError("The selected Capture tab has no rows to send.");
  return teamIds.map((teamId) => ({ teamId, ...snapshotForTeam(date, teamId, sheetRows) }));
}