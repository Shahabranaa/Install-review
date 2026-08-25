import assert from "node:assert/strict";
import test from "node:test";
import type {
  DprActivity,
  DprActivityGroup,
  DprJdrCode,
  DprTimesheetEntry,
} from "@workspace/api-client-react";
import { filterJdrCodesForEntry } from "./jdr-code-filter.ts";

const groups = [
  { id: 10, name: "Installation", activityTypeId: 1 },
  { id: 20, name: "Non-working", activityTypeId: 2 },
] as DprActivityGroup[];

const activities = [
  { id: 101, name: "Cable pull", activityGroupId: 10 },
  { id: 102, name: "Cable termination", activityGroupId: 10 },
  { id: 201, name: "Weather delay", activityGroupId: 20 },
] as DprActivity[];

const codes = [
  { id: 1, activityId: 101, contractualCode: "A", genericComment: "Pull", jdrWorkActivity: "Cable pull" },
  { id: 2, activityId: 102, contractualCode: "B", genericComment: "Terminate", jdrWorkActivity: "Cable termination" },
  { id: 3, activityId: 201, contractualCode: "C", genericComment: "Weather", jdrWorkActivity: "Weather delay" },
  { id: 4, activityId: null, contractualCode: "Legacy", genericComment: "Legacy", jdrWorkActivity: "Legacy mapping" },
] as DprJdrCode[];

function entry(overrides: Partial<DprTimesheetEntry>): DprTimesheetEntry {
  return {
    id: 1,
    date: "2026-08-20",
    stage: "captured",
    ...overrides,
  } as DprTimesheetEntry;
}

test("uses the exact activity before any broader context", () => {
  const result = filterJdrCodesForEntry(
    entry({ activityId: 101, activityGroupId: 10, activityTypeId: 1 }),
    codes,
    activities,
    groups,
  );
  assert.deepEqual(result.map((code) => code.id), [1]);
});

test("falls back to every activity in the saved group", () => {
  const result = filterJdrCodesForEntry(
    entry({ activityId: null, activityGroupId: 10, activityTypeId: 1 }),
    codes,
    activities,
    groups,
  );
  assert.deepEqual(result.map((code) => code.id), [1, 2]);
});

test("falls back to every activity beneath the saved type", () => {
  const result = filterJdrCodesForEntry(
    entry({ activityId: null, activityGroupId: null, activityTypeId: 2 }),
    codes,
    activities,
    groups,
  );
  assert.deepEqual(result.map((code) => code.id), [3]);
});

test("only uses all mappings when the row has no activity context", () => {
  const result = filterJdrCodesForEntry(entry({}), codes, activities, groups);
  assert.deepEqual(result.map((code) => code.id), [1, 2, 3, 4]);
});

test("does not return a stale saved code from another activity", () => {
  const result = filterJdrCodesForEntry(
    entry({ activityId: 101, activityGroupId: 10, activityTypeId: 1, jdrCodeIds: [3] }),
    codes,
    activities,
    groups,
  );
  assert.deepEqual(result.map((code) => code.id), [1]);
});