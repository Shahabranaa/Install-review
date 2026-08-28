import assert from "node:assert/strict";
import { test } from "node:test";
import type { DprLautecSnapshotRow } from "@workspace/db";
import {
  computeLautecReconcileTeamPlan,
  LautecReconcilePlanError,
  tableContainsSnapshotRows,
  visibleRowsMinus,
  visibleTablesMatch,
} from "./dpr-lautec-reconcile.js";

const HEADERS = ["", "#", "Activity Group", "Activity", "Location", "Start", "Finish", "Comment", "PAX", ""];

function snapRow(overrides: Partial<DprLautecSnapshotRow> = {}): DprLautecSnapshotRow {
  return {
    activityGroup: "Working Day",
    activity: "Installation",
    location: "Port of Immingham",
    start: "06:00",
    finish: "18:00",
    comment: "VOR-008",
    pax: "4",
    ...overrides,
  };
}

function visRow(row: DprLautecSnapshotRow, positional = "1"): string[] {
  return ["", positional, row.activityGroup, row.activity, row.location, row.start, row.finish, row.comment, row.pax ?? "", ""];
}

test("keeps expected rows, deletes historic extras, preserves unattributed rows", () => {
  const expected = snapRow();
  const outdated = snapRow({ start: "08:00" });
  const foreign = snapRow({ comment: "typed by hand in Lautec" });
  const plan = computeLautecReconcileTeamPlan({
    table: { headers: HEADERS, rows: [visRow(expected, "1"), visRow(outdated, "2"), visRow(foreign, "3")] },
    expectedRows: [expected],
    historicRows: [outdated, expected],
  });
  assert.equal(plan.keeps.length, 1);
  assert.deepEqual(plan.deletions, [visRow(outdated, "2")]);
  assert.deepEqual(plan.unattributed, [visRow(foreign, "3")]);
  assert.deepEqual(plan.missingRows, []);
});

test("duplicate copies: exactly one is kept, the rest deleted when historic", () => {
  const expected = snapRow();
  const plan = computeLautecReconcileTeamPlan({
    table: { headers: HEADERS, rows: [visRow(expected, "1"), visRow(expected, "2"), visRow(expected, "3")] },
    expectedRows: [expected],
    historicRows: [expected],
  });
  assert.equal(plan.keeps.length, 1);
  assert.equal(plan.deletions.length, 2);
  assert.equal(plan.unattributed.length, 0);
});

test("two identical expected rows keep two visible copies", () => {
  const expected = snapRow();
  const plan = computeLautecReconcileTeamPlan({
    table: { headers: HEADERS, rows: [visRow(expected, "1"), visRow(expected, "2"), visRow(expected, "3")] },
    expectedRows: [expected, expected],
    historicRows: [expected],
  });
  assert.equal(plan.keeps.length, 2);
  assert.equal(plan.deletions.length, 1);
});

test("missing expected rows are reported, never invented", () => {
  const present = snapRow();
  const absent = snapRow({ activity: "Demob" });
  const plan = computeLautecReconcileTeamPlan({
    table: { headers: HEADERS, rows: [visRow(present)] },
    expectedRows: [present, absent],
    historicRows: [present],
  });
  assert.equal(plan.keeps.length, 1);
  assert.deepEqual(plan.missingRows, [absent]);
  assert.equal(plan.deletions.length, 0);
});

test("legacy pre-PAX historic rows attribute blank-PAX visible rows", () => {
  const expected = snapRow({ pax: "8" });
  const legacyHistoric = snapRow({ pax: undefined });
  const blankPaxVisible = visRow(snapRow({ pax: "" }));
  const starPaxVisible = visRow(snapRow({ pax: "*" }));
  const plan = computeLautecReconcileTeamPlan({
    table: { headers: HEADERS, rows: [visRow(expected, "1"), blankPaxVisible, starPaxVisible] },
    expectedRows: [expected],
    historicRows: [legacyHistoric, expected],
  });
  assert.equal(plan.keeps.length, 1);
  assert.equal(plan.deletions.length, 2, "blank and * PAX rows both match the legacy pre-PAX snapshot");
  assert.equal(plan.unattributed.length, 0);
});

test("a PAX-filled visible row does not match a blank-PAX expected row", () => {
  const expectedBlankPax = snapRow({ pax: "" });
  const visibleWithPax = visRow(snapRow({ pax: "4" }));
  const plan = computeLautecReconcileTeamPlan({
    table: { headers: HEADERS, rows: [visibleWithPax] },
    expectedRows: [expectedBlankPax],
    historicRows: [],
  });
  assert.deepEqual(plan.missingRows, [expectedBlankPax]);
  assert.equal(plan.unattributed.length, 1);
});

test("placeholder and blank rows are ignored", () => {
  const expected = snapRow();
  const plan = computeLautecReconcileTeamPlan({
    table: {
      headers: HEADERS,
      rows: [
        ["", "", "", "", "", "", "", "", "", ""],
        ["No records to display", "", "", "", "", "", "", "", "", ""],
        visRow(expected),
      ],
    },
    expectedRows: [expected],
    historicRows: [],
  });
  assert.equal(plan.keeps.length, 1);
  assert.equal(plan.deletions.length, 0);
  assert.equal(plan.unattributed.length, 0);
});

test("unrecognised table headers raise a plan error", () => {
  assert.throws(
    () => computeLautecReconcileTeamPlan({
      table: { headers: ["A", "B"], rows: [] },
      expectedRows: [],
      historicRows: [],
    }),
    LautecReconcilePlanError,
  );
});

test("visibleTablesMatch ignores positional column and row order", () => {
  const a = [visRow(snapRow(), "1"), visRow(snapRow({ activity: "Demob" }), "2")];
  const b = [visRow(snapRow({ activity: "Demob" }), "9"), visRow(snapRow(), "4")];
  assert.equal(visibleTablesMatch(HEADERS, a, b), true);
  assert.equal(visibleTablesMatch(HEADERS, a, [a[0]]), false);
});

test("visibleTablesMatch treats duplicates as a multiset", () => {
  const row = visRow(snapRow());
  assert.equal(visibleTablesMatch(HEADERS, [row, row], [row]), false);
  assert.equal(visibleTablesMatch(HEADERS, [row, row], [row, row]), true);
});

test("visibleRowsMinus removes one instance per planned deletion", () => {
  const row = visRow(snapRow());
  const other = visRow(snapRow({ activity: "Demob" }));
  const remaining = visibleRowsMinus(HEADERS, [row, row, other], [row]);
  assert.equal(remaining.length, 2);
  assert.equal(visibleTablesMatch(HEADERS, remaining, [row, other]), true);
});

test("tableContainsSnapshotRows requires every snapshot row as a multiset", () => {
  const row = snapRow();
  const table = { headers: HEADERS, rows: [visRow(row)] };
  assert.equal(tableContainsSnapshotRows(table, [row]), true);
  assert.equal(tableContainsSnapshotRows(table, [row, row]), false);
  assert.equal(tableContainsSnapshotRows(table, [snapRow({ start: "08:00" })]), false);
});
