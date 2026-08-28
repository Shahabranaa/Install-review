import type { DprLautecSnapshotRow } from "@workspace/db";
import {
  isBlankVisibleCell,
  isPlaceholderRow,
  lautecSemanticColumnIndexes,
  normaliseVisibleText,
  positionalColumnIndexes,
  visibleRowKey,
  type LautecSemanticColumnIndexes,
  type LautecVisibleTableSnapshot,
} from "./lautec-browser-adapter.js";

export class LautecReconcilePlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LautecReconcilePlanError";
  }
}

/**
 * True when the visible activity row carries exactly the semantic values of a
 * recorded snapshot row. A snapshot with a blank/absent PAX matches only a
 * blank visible PAX cell ("" or Lautec's unsaved "*" placeholder).
 */
export function visibleRowMatchesSnapshotRow(
  visibleRow: string[],
  indexes: LautecSemanticColumnIndexes,
  row: DprLautecSnapshotRow,
): boolean {
  const expectedPax = normaliseVisibleText(row.pax ?? "");
  const visiblePax = normaliseVisibleText(visibleRow[indexes.pax] ?? "");
  const paxMatches = expectedPax === "" ? isBlankVisibleCell(visiblePax) : visiblePax === expectedPax;
  return paxMatches
    && normaliseVisibleText(visibleRow[indexes.activityGroup] ?? "") === normaliseVisibleText(row.activityGroup)
    && normaliseVisibleText(visibleRow[indexes.activity] ?? "") === normaliseVisibleText(row.activity)
    && normaliseVisibleText(visibleRow[indexes.location] ?? "") === normaliseVisibleText(row.location)
    && normaliseVisibleText(visibleRow[indexes.start] ?? "") === normaliseVisibleText(row.start)
    && normaliseVisibleText(visibleRow[indexes.finish] ?? "") === normaliseVisibleText(row.finish)
    && normaliseVisibleText(visibleRow[indexes.comment] ?? "") === normaliseVisibleText(row.comment);
}

export type LautecReconcileTeamComputation = {
  /** Visible rows kept because they match the current Capture sheet (one per expected row). */
  keeps: string[][];
  /** Visible rows to delete: attributable to this system's imports but outdated or duplicates. */
  deletions: string[][];
  /** Visible rows this system cannot account for; never touched. */
  unattributed: string[][];
  /** Capture rows that have no visible counterpart in Lautec. */
  missingRows: DprLautecSnapshotRow[];
};

/**
 * Pure reconciliation of one team's visible Lautec table against the current
 * Capture sheet, attributing extra rows to this system's own import history.
 *
 * - Each expected sheet row claims exactly one matching visible row (keep).
 * - Every other visible row that matches ANY row this system ever sent
 *   (successful or uncertain runs) is scheduled for deletion.
 * - Visible rows that match nothing we ever sent are left alone and reported.
 */
export function computeLautecReconcileTeamPlan(input: {
  table: LautecVisibleTableSnapshot;
  expectedRows: DprLautecSnapshotRow[];
  historicRows: DprLautecSnapshotRow[];
}): LautecReconcileTeamComputation {
  const indexes = lautecSemanticColumnIndexes(input.table.headers);
  if (!indexes) {
    throw new LautecReconcilePlanError(
      `Lautec's activity table columns were not recognised (headers: ${input.table.headers.join(", ") || "none"}).`,
    );
  }
  const candidates = input.table.rows
    .filter((row) => !isPlaceholderRow(row))
    .map((row) => ({ row, claimed: false }));

  const keeps: string[][] = [];
  const missingRows: DprLautecSnapshotRow[] = [];
  for (const expected of input.expectedRows) {
    const match = candidates.find(
      (candidate) => !candidate.claimed && visibleRowMatchesSnapshotRow(candidate.row, indexes, expected),
    );
    if (match) {
      match.claimed = true;
      keeps.push(match.row);
    } else {
      missingRows.push(expected);
    }
  }

  const deletions: string[][] = [];
  const unattributed: string[][] = [];
  for (const candidate of candidates) {
    if (candidate.claimed) continue;
    const ours = input.historicRows.some(
      (historic) => visibleRowMatchesSnapshotRow(candidate.row, indexes, historic),
    );
    (ours ? deletions : unattributed).push(candidate.row);
  }

  return { keeps, deletions, unattributed, missingRows };
}

/** Order-insensitive equality of two visible tables (positional "#" ignored). */
export function visibleTablesMatch(
  headers: string[],
  rowsA: string[][],
  rowsB: string[][],
): boolean {
  const excludeIndexes = positionalColumnIndexes(headers);
  const keys = (rows: string[][]) => rows
    .filter((row) => !isPlaceholderRow(row))
    .map((row) => visibleRowKey(row, excludeIndexes))
    .sort();
  return JSON.stringify(keys(rowsA)) === JSON.stringify(keys(rowsB));
}

/** Multiset subtraction: `rows` minus one instance of each row in `removed`. */
export function visibleRowsMinus(
  headers: string[],
  rows: string[][],
  removed: string[][],
): string[][] {
  const excludeIndexes = positionalColumnIndexes(headers);
  const remaining = rows
    .filter((row) => !isPlaceholderRow(row))
    .map((row) => ({ key: visibleRowKey(row, excludeIndexes), row }));
  for (const gone of removed) {
    const key = visibleRowKey(gone, excludeIndexes);
    const index = remaining.findIndex((candidate) => candidate.key === key);
    if (index >= 0) remaining.splice(index, 1);
  }
  return remaining.map((candidate) => candidate.row);
}

/**
 * True when the visible table still contains every row of a recorded import
 * snapshot (as a multiset). Used after cleanup to decide which historic runs
 * no longer have their rows in Lautec.
 */
export function tableContainsSnapshotRows(
  table: LautecVisibleTableSnapshot,
  rows: DprLautecSnapshotRow[],
): boolean {
  const indexes = lautecSemanticColumnIndexes(table.headers);
  if (!indexes) return false;
  const remaining = table.rows
    .filter((row) => !isPlaceholderRow(row))
    .map((row) => ({ row, claimed: false }));
  for (const expected of rows) {
    const match = remaining.find(
      (candidate) => !candidate.claimed && visibleRowMatchesSnapshotRow(candidate.row, indexes, expected),
    );
    if (!match) return false;
    match.claimed = true;
  }
  return true;
}
