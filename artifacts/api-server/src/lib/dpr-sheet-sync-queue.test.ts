import assert from "node:assert/strict";
import test from "node:test";
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