import assert from "node:assert/strict";
import test from "node:test";
import {
  lautecBodyShowsImportModal,
  lautecDateLabel,
  lautecTableDeltaMatchesReviewedRows,
  resolveLautecSelectors,
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

test("recognises the added row even when it sorts first and renumbers existing rows", () => {
  // Lautec keeps the activities table sorted by Start. A new 00:00 row lands
  // at the top and shifts every pre-existing row's "#" cell (1→2, 2→3). The
  // delta must still match: only semantic columns identify a row.
  const headers = ["", "#", "Status", "Activity Group", "Activity", "Location", "Start", "Finish", "Duration", "PAX working on task", "ORSTED Comments", "Comment", "Info", ""];
  const baseline = {
    headers,
    rows: [
      ["", "1", "", "Extra Work", "Variation", "Port of Immingham", "06:00", "18:00", "12:00", "*", "*", "VOR-008", "", ""],
      ["", "2", "", "Extra Work", "Variation", "Port of Immingham", "08:00", "18:00", "10:00", "4", "*", "VOR-008", "", ""],
    ],
  };
  const afterImport = {
    headers,
    rows: [
      ["", "1", "", "Extra Work", "Variation", "Port of Immingham", "00:00", "18:00", "18:00", "4", "*", "VOR-008", "", ""],
      ["", "2", "", "Extra Work", "Variation", "Port of Immingham", "06:00", "18:00", "12:00", "*", "*", "VOR-008", "", ""],
      ["", "3", "", "Extra Work", "Variation", "Port of Immingham", "08:00", "18:00", "10:00", "4", "*", "VOR-008", "", ""],
    ],
  };
  const expected = [{
    activityGroup: "Extra Work",
    activity: "Variation",
    location: "Port of Immingham",
    start: "00:00",
    finish: "18:00",
    comment: "VOR-008",
    pax: "4",
  }];
  assert.equal(lautecTableDeltaMatchesReviewedRows(baseline, afterImport, expected), true);
  // A resent identical row still counts as exactly one addition.
  const duplicateResend = {
    headers,
    rows: [
      ...baseline.rows.map((row) => [...row]),
      ["", "3", "", "Extra Work", "Variation", "Port of Immingham", "08:00", "18:00", "10:00", "4", "*", "VOR-008", "", ""],
    ],
  };
  assert.equal(lautecTableDeltaMatchesReviewedRows(baseline, duplicateResend, [{
    activityGroup: "Extra Work",
    activity: "Variation",
    location: "Port of Immingham",
    start: "08:00",
    finish: "18:00",
    comment: "VOR-008",
    pax: "4",
  }]), true);
  // A baseline row that vanished must still fail the delta.
  const lostRow = {
    headers,
    rows: [
      ["", "1", "", "Extra Work", "Variation", "Port of Immingham", "00:00", "18:00", "18:00", "4", "*", "VOR-008", "", ""],
      ["", "2", "", "Extra Work", "Variation", "Port of Immingham", "08:00", "18:00", "10:00", "4", "*", "VOR-008", "", ""],
    ],
  };
  assert.equal(lautecTableDeltaMatchesReviewedRows(baseline, lostRow, expected), false);
  // A baseline row replaced by one with identical managed columns but a
  // changed non-positional cell (here ORSTED Comments) must also fail: only
  // the "#" renumbering is forgiven, not any other visible difference.
  const replacedRow = {
    headers,
    rows: [
      ["", "1", "", "Extra Work", "Variation", "Port of Immingham", "00:00", "18:00", "18:00", "4", "*", "VOR-008", "", ""],
      ["", "2", "", "Extra Work", "Variation", "Port of Immingham", "06:00", "18:00", "12:00", "*", "Changed by someone else", "VOR-008", "", ""],
      ["", "3", "", "Extra Work", "Variation", "Port of Immingham", "08:00", "18:00", "10:00", "4", "*", "VOR-008", "", ""],
    ],
  };
  assert.equal(lautecTableDeltaMatchesReviewedRows(baseline, replacedRow, expected), false);
});

test("Lautec browser destinations are limited to approved HTTPS pages", () => {
  assert.equal(validateLautecUrl("https://dpr.lautec.com/"), null);
  assert.equal(
    validateLautecUrl("https://dpr.lautec.com/_RjXISwj7iY-/dpr-details/wfZM99_32Xs-/390476/activities/12872?modal=import-data"),
    null,
  );
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

test("resolves only selectors that the adapter actually honors", () => {
  const selectors = resolveLautecSelectors(
    {
      username: "#env-email",
      resetRows: "#ignored-grid-control",
      importDataButton: "#env-import",
    } as never,
    {
      password: "#saved-password",
      loginComplete: "[data-ready]",
      submit: "#saved-submit",
      activityGroup: "#ignored-field",
    } as never,
  );
  assert.deepEqual(selectors, {
    username: "#env-email",
    continueSubmit: "button[type=submit]",
    password: "#saved-password",
    loginSubmit: "button[type=submit]",
    loginComplete: "[data-ready]",
    importDataButton: "#env-import",
    submit: "#saved-submit",
  });
  assert.equal("resetRows" in selectors, false);
  assert.equal("activityGroup" in selectors, false);
});

test("detects a pre-opened Import Data modal before the baseline and after the post-save reload", () => {
  // A direct ?modal=import-data URL pins one team's modal; it reappears on
  // every load of that URL, including the reload that follows Save Changes.
  const pageWithPinnedModal = "Tue, Aug 25 - #0068\nTeam 1: Import Data\nActivity Group\nCancel\nImport";
  const pageAfterReloadOtherTeam = "Tue, Aug 25 - #0068\nTeam 1: Import Data\nTeam 5\nImport Data\nAdd Entry";
  const pageWithoutModal = "Tue, Aug 25 - #0068\nTeam 5\nImport Data\nAdd Entry\nNo records to display";
  assert.equal(lautecBodyShowsImportModal(pageWithPinnedModal), true);
  assert.equal(lautecBodyShowsImportModal(pageAfterReloadOtherTeam), true);
  // The plain Import Data button must not read as an open modal.
  assert.equal(lautecBodyShowsImportModal(pageWithoutModal), false);
});

test("the reopened import grid can never satisfy the persisted-table readback", () => {
  // If the pinned modal reopened after the post-save reload and its empty
  // grid were snapshotted instead of the persisted activities table, the
  // readback must fail rather than falsely confirm the save.
  const persistedHeaders = ["#", "Status", "Activity Group", "Activity", "Location", "Start", "Finish", "Duration", "PAX working on task", "ORSTED Comments", "Comment", "Info"];
  const baseline = { headers: persistedHeaders, rows: [["No records to display"]] };
  const reopenedImportGrid = {
    headers: ["", "Activity Group", "Activity", "Location", "Start", "Finish", "Comment", "PAX working on task", "ORSTED Comments"],
    rows: [["1", "", "", "", "", "", "", "", ""]],
  };
  assert.equal(
    lautecTableDeltaMatchesReviewedRows(baseline, reopenedImportGrid, rows),
    false,
  );
});

test("reads the managed Comment column, not ORSTED Comments, in Lautec's persisted table", () => {
  const headers = ["#", "Status", "Activity Group", "Activity", "Location", "Start", "Finish", "Duration", "PAX working on task", "ORSTED Comments", "Comment", "Info"];
  const baseline = { headers, rows: [] as string[][] };
  const added = ["1", "Draft", "Effective Working Time", "Inspection", "Platform A", "08:00", "12:30", "4.5", "", "", "Routine check", ""];
  assert.equal(
    lautecTableDeltaMatchesReviewedRows(baseline, { headers, rows: [added] }, rows),
    true,
  );
  const commentInOrstedColumn = ["1", "Draft", "Effective Working Time", "Inspection", "Platform A", "08:00", "12:30", "4.5", "", "Routine check", "", ""];
  assert.equal(
    lautecTableDeltaMatchesReviewedRows(baseline, { headers, rows: [commentInOrstedColumn] }, rows),
    false,
  );
});

test("unsaved rows may show Lautec's * placeholder in PAX, but a PAX the sheet never supplied is rejected", () => {
  const headers = ["#", "Status", "Activity Group", "Activity", "Location", "Start", "Finish", "Duration", "PAX working on task", "ORSTED Comments", "Comment", "Info"];
  const baseline = { headers, rows: [["No records to display"]] };
  const starredBlanks = ["1", "", "Effective Working Time", "Inspection", "Platform A", "08:00", "12:30", "4.5", "*", "*", "Routine check", ""];
  assert.equal(
    lautecTableDeltaMatchesReviewedRows(baseline, { headers, rows: [starredBlanks] }, rows),
    true,
  );
  const paxFilled = ["1", "", "Effective Working Time", "Inspection", "Platform A", "08:00", "12:30", "4.5", "6", "*", "Routine check", ""];
  assert.equal(
    lautecTableDeltaMatchesReviewedRows(baseline, { headers, rows: [paxFilled] }, rows),
    false,
  );
});

test("a sheet-supplied PAX must read back exactly in the persisted table", () => {
  const headers = ["#", "Status", "Activity Group", "Activity", "Location", "Start", "Finish", "Duration", "PAX working on task", "ORSTED Comments", "Comment", "Info"];
  const baseline = { headers, rows: [["No records to display"]] };
  const rowsWithPax = [{ ...rows[0], pax: "3" }];
  const paxRetained = ["1", "", "Effective Working Time", "Inspection", "Platform A", "08:00", "12:30", "4.5", "3", "*", "Routine check", ""];
  assert.equal(
    lautecTableDeltaMatchesReviewedRows(baseline, { headers, rows: [paxRetained] }, rowsWithPax),
    true,
  );
  const paxDropped = ["1", "", "Effective Working Time", "Inspection", "Platform A", "08:00", "12:30", "4.5", "*", "*", "Routine check", ""];
  assert.equal(
    lautecTableDeltaMatchesReviewedRows(baseline, { headers, rows: [paxDropped] }, rowsWithPax),
    false,
  );
  const paxChanged = ["1", "", "Effective Working Time", "Inspection", "Platform A", "08:00", "12:30", "4.5", "6", "*", "Routine check", ""];
  assert.equal(
    lautecTableDeltaMatchesReviewedRows(baseline, { headers, rows: [paxChanged] }, rowsWithPax),
    false,
  );
});

test("an empty table's placeholder row does not block verification once real rows appear", () => {
  const headers = ["#", "Status", "Activity Group", "Activity", "Location", "Start", "Finish", "Duration", "PAX working on task", "ORSTED Comments", "Comment", "Info"];
  const baseline = { headers, rows: [["No records to display"]] };
  const added = ["1", "Draft", "Effective Working Time", "Inspection", "Platform A", "08:00", "12:30", "4.5", "", "", "Routine check", ""];
  assert.equal(
    lautecTableDeltaMatchesReviewedRows(baseline, { headers, rows: [added] }, rows),
    true,
  );
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