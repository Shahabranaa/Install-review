import assert from "node:assert/strict";
import test from "node:test";
import { filterWhatsappRowsByDate, normaliseSheetDate } from "./dpr-whatsapp.js";

test("normalises spreadsheet dates with slash, hyphen, and dot separators", () => {
  const expected = "2026-09-02";

  assert.equal(normaliseSheetDate("02/09/2026"), expected);
  assert.equal(normaliseSheetDate("02-09-2026"), expected);
  assert.equal(normaliseSheetDate("02.09.2026"), expected);
});

test("date filtering includes WhatsApp rows entered with slash-formatted dates", () => {
  const slashDateRow = { date: "02/09/2026", team: "Team 1" };
  const otherDateRow = { date: "01/09/2026", team: "Team 1" };

  assert.deepEqual(
    filterWhatsappRowsByDate([slashDateRow, otherDateRow], "2026-09-02"),
    [slashDateRow],
  );
});