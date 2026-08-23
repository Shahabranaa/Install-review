import assert from "node:assert/strict";
import test from "node:test";
import {
  createLautecSnapshotHash,
  LautecSourceError,
  MAX_LAUTEC_IMPORT_ROWS,
  normalizeLautecSourceRows,
  requiresLautecUncertainConfirmation,
  requiresLautecResendConfirmation,
} from "./dpr-lautec-source.js";

const header = ["Activity Group", "Activity", "Location", "Start", "Finish", "Comment", "Team ID"];
const row = ["Effective Working Time", "Inspection", "Platform A", "08:00", "12:30", "Routine check"];

test("normalizes the managed Capture columns in their original order", () => {
  const rows = normalizeLautecSourceRows([header, [...row, "7"], ["", "", "", "", "", "", ""], [...row, "7"]], 7);
  assert.deepEqual(rows, [
    {
      activityGroup: "Effective Working Time",
      activity: "Inspection",
      location: "Platform A",
      start: "08:00",
      finish: "12:30",
      comment: "Routine check",
    },
    {
      activityGroup: "Effective Working Time",
      activity: "Inspection",
      location: "Platform A",
      start: "08:00",
      finish: "12:30",
      comment: "Routine check",
    },
  ]);
});

test("rejects changed headers, blank required fields, invalid times, and unmanaged values", () => {
  assert.throws(
    () => normalizeLautecSourceRows([["Group", ...header.slice(1)], [...row, "7"]], 7),
    LautecSourceError,
  );
  assert.throws(
    () => normalizeLautecSourceRows([header, ["", "Inspection", "Platform A", "08:00", "12:30", "", "7"]], 7),
    /Capture row 2 is missing: Activity Group/,
  );
  assert.throws(
    () => normalizeLautecSourceRows([header, ["Group", "Inspection", "Platform A", "8:75", "12:30", "", "7"]], 7),
    /valid HH:MM/,
  );
  assert.throws(
    () => normalizeLautecSourceRows([header, [...row, "7", "unexpected eighth value"]], 7),
    /outside the managed source columns/,
  );
});

test("snapshot fingerprint is deterministic and binds the date and team context", () => {
  const rows = normalizeLautecSourceRows([header, [...row, "7"]], 7);
  assert.equal(createLautecSnapshotHash("2026-08-21", 1, rows), createLautecSnapshotHash("2026-08-21", 1, rows));
  assert.notEqual(createLautecSnapshotHash("2026-08-21", 1, rows), createLautecSnapshotHash("2026-08-22", 1, rows));
  assert.notEqual(createLautecSnapshotHash("2026-08-21", 1, rows), createLautecSnapshotHash("2026-08-21", 2, rows));
});

test("a completed snapshot requires deliberate resend confirmation", () => {
  assert.equal(requiresLautecResendConfirmation(false, false), false);
  assert.equal(requiresLautecResendConfirmation(true, false), true);
  assert.equal(requiresLautecResendConfirmation(true, true), false);
});

test("an unverified post-submit run requires acknowledgement even if the Sheet changed", () => {
  assert.equal(requiresLautecUncertainConfirmation(false, false), false);
  assert.equal(requiresLautecUncertainConfirmation(true, false), true);
  assert.equal(requiresLautecUncertainConfirmation(true, true), false);
});

test("rejects source tabs too large to finish safely in one browser run", () => {
  const tooManyRows = Array.from({ length: MAX_LAUTEC_IMPORT_ROWS + 1 }, () => [...row, "7"]);
  assert.throws(
    () => normalizeLautecSourceRows([header, ...tooManyRows], 7),
    new RegExp(`limited to ${MAX_LAUTEC_IMPORT_ROWS} rows`),
  );
});

test("isolates the selected team's rows from a shared date tab", () => {
  const rows = normalizeLautecSourceRows([
    header,
    [...row, "7"],
    ["Effective Working Time", "Other team task", "Platform B", "13:00", "17:00", "", "8"],
  ], 7);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].activity, "Inspection");
});