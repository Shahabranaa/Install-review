import assert from "node:assert/strict";
import test from "node:test";
import { buildRawSheetTabValuesRequest } from "./googleSheets.js";

test("date-tab rebuilds keep formula-looking Capture comments as literal data", () => {
  const note = '=HYPERLINK("https://example.invalid","Open")';
  const request = buildRawSheetTabValuesRequest(
    [{ title: "2026-08-01", values: [["Working Time", "Activity", "Location", "08:00", "17:00", note]] }],
    ["Activity Group", "Activity", "Location", "Start", "Finish", "Comment"],
  );

  assert.equal(request.valueInputOption, "RAW");
  assert.equal(request.data[0].values[1][5], note);
});