import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import * as XLSX from "xlsx";

import { parseDprExportWorkbook } from "./dpr-excel.ts";

const fixturePath = path.resolve(
  process.cwd(),
  "../../attached_assets/DPR_HOW03_Array_Cable_Termination_DEMO_2026-08-24_1787586693106.xlsx",
);

test("imports only current DPRExport revisions from the supplied workbook", async () => {
  const file = await readFile(fixturePath);
  const parsed = await parseDprExportWorkbook(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
  );

  assert.equal(parsed.rows.length, 39);
  assert.equal(parsed.skippedNonCurrentRows, 10);
  assert.deepEqual(parsed.rows[0], {
    rowNumber: 12,
    teamRaw: "Team 1",
    activityGroupRaw: "Non-Working Time",
    activityRaw: "Standby (EDT) - Waiting on Transfer",
    locationRaw: "Vessel",
    dateRaw: "19-06-2026",
    startTime: "06:00",
    endTime: "06:30",
    notes: "Transfer delayed due to 3rd party vessel blocking access to I51",
    paxRaw: "",
  });
});

test("rejects a current-revision value other than Y or N", async () => {
  const headers = [
    "Activity Stream",
    "Activity Group",
    "Activity",
    "Location",
    "DPR Date",
    "Start",
    "Finish",
    "Remarks",
    "Is Current Revision",
    "[CD] PAX working on task",
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([headers, ["Team 1", "Extra Work", "Variation", "Vessel", 46192, 0.25, 0.5, "", "Maybe", 4]]),
    "DPRExport",
  );

  await assert.rejects(
    () => parseDprExportWorkbook(XLSX.write(workbook, { type: "array", bookType: "xlsx" })),
    /row 2 has an invalid Is Current Revision value/i,
  );
});