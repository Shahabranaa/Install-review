import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLautecSourceRows } from "./dpr-lautec-source.js";
import { buildCaptureSheetRow, CAPTURE_SHEET_HEADERS } from "./dpr-sheet-sync.js";
import { createDateTabSyncQueue } from "./dpr-sheet-sync-queue.js";

test("a manual sync after an in-flight rebuild writes the newest date snapshot last", async () => {
  const date = "2026-08-01";
  const rows = ["first row"];
  const snapshots: string[][] = [];
  let releaseFirstRebuild!: () => void;
  let signalFirstRebuild!: () => void;

  const firstRebuildStarted = new Promise<void>((resolve) => {
    signalFirstRebuild = resolve;
  });
  const queue = createDateTabSyncQueue(async () => {
    snapshots.push([...rows]);
    if (snapshots.length === 1) {
      signalFirstRebuild();
      await new Promise<void>((resolve) => {
        releaseFirstRebuild = resolve;
      });
    }
    return rows.length;
  });

  const automaticSync = queue.syncNow(date);
  await firstRebuildStarted;

  rows.push("newer row");
  const manualSave = queue.syncNow(date);
  releaseFirstRebuild();

  await Promise.all([automaticSync, manualSave]);
  assert.deepEqual(snapshots, [["first row"], ["first row", "newer row"]]);
});

test("a failed automatic sync retries its pending date", async () => {
  const date = "2026-08-01";
  let attempts = 0;
  const queue = createDateTabSyncQueue(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("Temporary Google Sheets outage");
    return 1;
  }, { debounceMs: 1, retryBaseMs: 1, retryMaxMs: 1 });

  queue.schedule(date);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Automatic retry did not complete")), 250);
    const poll = () => {
      if (attempts >= 2) {
        clearTimeout(timeout);
        resolve();
        return;
      }
      setTimeout(poll, 1);
    };
    poll();
  });

  assert.equal(attempts, 2);
});

test("Capture export sends the selected activity group to Lautec, not its broader type", () => {
  const sheetRow = buildCaptureSheetRow(
    {
      activityGroupId: 22,
      activityId: 38,
      startTime: "08:00",
      endTime: "16:00",
      notes: "Corrected cable route",
      teamId: 7,
    },
    "Platform A",
    new Map([[22, "Re-Work"]]),
    new Map([[38, "Cable repair"]]),
  );

  assert.equal(sheetRow[0], "Re-Work");
  assert.deepEqual(
    normalizeLautecSourceRows([CAPTURE_SHEET_HEADERS, sheetRow], 7),
    [{
      activityGroup: "Re-Work",
      activity: "Cable repair",
      location: "Platform A",
      start: "08:00",
      finish: "16:00",
      comment: "Corrected cable route",
      pax: "",
    }],
  );
});

test("Capture export includes PAX, the selected code, and Clarify notes", () => {
  const sheetRow = buildCaptureSheetRow(
    {
      activityGroupId: 22,
      activityId: 38,
      startTime: "08:00",
      endTime: "16:00",
      notes: "Original comment",
      teamId: 7,
      pax: 3,
      jdrCodeIds: [41],
      genericComment: "Routine work",
      combinedComment: "Final comment",
      stage: "captured",
    },
    "Platform A",
    new Map([[22, "Effective Working Time"]]),
    new Map([[38, "Cable pull"]]),
    new Map(),
    new Map([[41, "VOR-008"]]),
  );

  assert.deepEqual(sheetRow, [
    "Effective Working Time",
    "Cable pull",
    "Platform A",
    "08:00",
    "16:00",
    "Final comment",
    "7",
    "3",
    "VOR-008",
    "Routine work",
    "Y",
  ]);
});

test("Capture export keeps Is Clarified marked after clarification is completed", () => {
  const sheetRow = buildCaptureSheetRow(
    {
      activityGroupId: 22,
      activityId: 38,
      startTime: "08:00",
      endTime: "16:00",
      notes: "Completed clarification",
      teamId: 7,
      stage: "clarified",
    },
    "Platform A",
    new Map([[22, "Effective Working Time"]]),
    new Map([[38, "Cable pull"]]),
  );

  assert.equal(sheetRow[10], "Y");
});

test("Capture export uses the activity type when a non-working row has no sub-group", () => {
  const sheetRow = buildCaptureSheetRow(
    {
      activityTypeId: 9,
      activityGroupId: null,
      activityId: null,
      startTime: "08:00",
      endTime: "16:00",
      notes: "Weather delay",
      teamId: 7,
    },
    "Platform A",
    new Map(),
    new Map(),
    new Map([[9, "Non-Working Time"]]),
  );

  assert.equal(sheetRow[0], "Non-Working Time");
  assert.equal(sheetRow[1], "Non-Working Time");
});