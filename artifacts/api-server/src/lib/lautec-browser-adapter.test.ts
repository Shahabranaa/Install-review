import assert from "node:assert/strict";
import test from "node:test";
import {
  lautecDateLabel,
  lautecTableDeltaMatchesReviewedRows,
  performLautecUiImport,
  type LautecUi,
} from "./lautec-browser-adapter.js";
import { validateLautecBrowserUrl, validateLautecUrl } from "./lautec-url-policy.js";

const rows = [{
  activityGroup: "Effective Working Time",
  activity: "Inspection",
  location: "Platform A",
  start: "08:00",
  finish: "12:30",
  comment: "Routine check",
}];

function mockUi(events: string[], verifyFailure = false): LautecUi {
  return {
    async login() { events.push("login"); },
    async openImport() { events.push("open"); },
    async ensureRows(count) { events.push(`rows:${count}`); },
    async populateRow(index) { events.push(`populate:${index}`); },
    async verifyRow(index) {
      events.push(`verify:${index}`);
      if (verifyFailure) throw new Error("visible values did not match");
    },
    async submit() {
      events.push("submit");
      return { confirmation: "Import complete", rejectedRows: [] };
    },
    async close() { events.push("close"); },
  };
}

test("browser sequence logs in, verifies every visible row, submits, and closes", async () => {
  const events: string[] = [];
  const result = await performLautecUiImport(mockUi(events), {
    teamName: "Alpha",
    date: "2026-08-21",
    rows,
    username: "server-only-user",
    password: "server-only-password",
  });
  assert.deepEqual(events, ["login", "open", "rows:1", "populate:0", "verify:0", "verify:0", "submit", "close"]);
  assert.equal(result.rowsSubmitted, 1);
  assert.equal(result.confirmation, "Import complete");
});

test("records the pre-submit checkpoint only after every row is verified", async () => {
  const events: string[] = [];
  await performLautecUiImport(mockUi(events), {
    teamName: "Alpha",
    date: "2026-08-21",
    rows,
    username: "server-only-user",
    password: "server-only-password",
    beforeSubmit: async () => { events.push("checkpoint"); },
  });
  assert.deepEqual(events, ["login", "open", "rows:1", "populate:0", "verify:0", "verify:0", "checkpoint", "submit", "close"]);
});

test("never records a submit checkpoint when grid verification fails", async () => {
  const events: string[] = [];
  await assert.rejects(
    () => performLautecUiImport(mockUi(events, true), {
      teamName: "Alpha",
      date: "2026-08-21",
      rows,
      username: "server-only-user",
      password: "server-only-password",
      beforeSubmit: async () => { events.push("checkpoint"); },
    }),
  );
  assert(!events.includes("checkpoint"));
});

test("browser sequence never submits when verification fails and always closes", async () => {
  const events: string[] = [];
  await assert.rejects(
    () => performLautecUiImport(mockUi(events, true), {
      teamName: "Alpha",
      date: "2026-08-21",
      rows,
      username: "server-only-user",
      password: "server-only-password",
    }),
    /visible values did not match/,
  );
  assert.deepEqual(events, ["login", "open", "rows:1", "populate:0", "verify:0", "close"]);
});

test("Lautec browser destinations are limited to approved HTTPS pages", () => {
  assert.equal(validateLautecUrl("https://dpr.lautec.com/"), null);
  assert.equal(validateLautecBrowserUrl("https://identity.lautec.com/oauth2/v2.0/authorize"), null);
  assert.equal(validateLautecBrowserUrl("https://dpr.lautec.com/dprs/0031/edit"), null);
  assert.match(validateLautecUrl("http://dpr.lautec.com/") ?? "", /HTTPS/);
  assert.match(validateLautecUrl("https://evil.example/") ?? "", /approved/);
  assert.match(validateLautecBrowserUrl("https://identity.lautec.com.evil.example/") ?? "", /approved/);
  assert.match(validateLautecUrl("https://user:pass@dpr.lautec.com/") ?? "", /without credentials/);
  assert.match(validateLautecUrl("https://dpr.lautec.com/private") ?? "", /not approved/);
});

test("formats the selected Capture date exactly as Lautec renders a DPR card", () => {
  assert.equal(lautecDateLabel("2026-08-21"), "Fri, Aug 21");
});

test("matches only the newly added visible rows and requires persisted PAX to stay blank", () => {
  const headers = ["Activity Group", "Activity", "Location", "Start", "Finish", "Comment", "PAX working on task"];
  const reviewed = ["Effective Working Time", "Inspection", "Platform A", "08:00", "12:30", "Routine check", ""];
  const baseline = { headers, rows: [reviewed] };

  assert.equal(
    lautecTableDeltaMatchesReviewedRows(baseline, { headers, rows: [reviewed, reviewed] }, rows),
    true,
  );
  assert.equal(
    lautecTableDeltaMatchesReviewedRows(
      baseline,
      { headers, rows: [reviewed, ["Effective Working Time", "Wrong Activity", "Platform A", "08:00", "12:30", "Routine check", ""]] },
      rows,
    ),
    false,
  );
  assert.equal(
    lautecTableDeltaMatchesReviewedRows(
      baseline,
      { headers, rows: [reviewed, ["Effective Working Time", "Inspection", "Platform A", "08:00", "12:30", "Routine check", "4"]] },
      rows,
    ),
    false,
  );
});