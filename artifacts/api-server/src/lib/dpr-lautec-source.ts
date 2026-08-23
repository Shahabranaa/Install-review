import { createHash } from "node:crypto";
import { fetchSheetRowsByTitle } from "../googleSheets.js";
import type { DprLautecSnapshotRow } from "@workspace/db";

export const DPR_CAPTURE_SHEET_ID = "1UWXflQzf1m1MAtnUfNE7dEq7C9YARoFq-TjykDhMQQo";
export const DPR_CAPTURE_SHEET_HEADERS = ["Activity Group", "Activity", "Location", "Start", "Finish", "Comment"] as const;
export const DPR_CAPTURE_TEAM_HEADER = "Team ID";
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
  const expectedHeaders = [...DPR_CAPTURE_SHEET_HEADERS, DPR_CAPTURE_TEAM_HEADER];
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

    const [activityGroup, activity, location, start, finish, comment, teamId] = values;
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
    result.push({ activityGroup, activity, location, start, finish, comment });
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

export async function getLautecSourceSnapshot(date: string, teamId: number) {
  const rows = await fetchSheetRowsByTitle(DPR_CAPTURE_SHEET_ID, date, DPR_CAPTURE_SHEET_HEADERS.length + 1).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unable to read the Capture tab.";
    if (message.includes("not found")) throw new LautecSourceError(`Capture tab "${date}" was not found.`, 404);
    throw error;
  });
  const normalizedRows = normalizeLautecSourceRows(rows, teamId);
  return {
    rows: normalizedRows,
    snapshotHash: createLautecSnapshotHash(date, teamId, normalizedRows),
  };
}