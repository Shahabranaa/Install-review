import assert from "node:assert/strict";
import test from "node:test";
import { buildRawSheetTabValuesRequest, sheetTabRange } from "./googleSheets.js";

test("date-tab rebuilds keep formula-looking Capture comments as literal data", () => {
  const note = '=HYPERLINK("https://example.invalid","Open")';
  const request = buildRawSheetTabValuesRequest(
    [{ title: "2026-08-01", values: [["Working Time", "Activity", "Location", "08:00", "17:00", note, "7", "3", "VOR-008", "Routine work", "N"]] }],
    ["Activity Group", "Activity", "Location", "Start", "Finish", "Comment", "Team ID", "PAX", "Code", "Notes", "Is Clarified"],
  );

  assert.equal(request.valueInputOption, "RAW");
  assert.equal(request.data[0].values[1][5], note);
});

test("team-scoped Lautec source reads include every managed Capture column", () => {
  assert.equal(sheetTabRange("2026-08-01", 11), "'2026-08-01'!A:K");
  assert.equal(sheetTabRange("O'Brien", 11), "'O''Brien'!A:K");
});