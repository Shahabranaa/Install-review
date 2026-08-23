import assert from "node:assert/strict";
import test from "node:test";
import { ListDprShiftAttendanceResponse } from "@workspace/api-zod";

test("shift attendance responses retain workers' role arrays", () => {
  const parsed = ListDprShiftAttendanceResponse.parse([{
    id: 1,
    firstName: "Ava",
    lastName: "Worker",
    roles: ["Supervisor", "Rigger"],
    company: null,
    active: true,
    teamIds: [4],
    shiftStatus: "on_shift",
    signOnTime: "2026-08-21T07:00:00.000Z",
    signOffTime: null,
  }]);
  assert.deepEqual(parsed[0].roles, ["Supervisor", "Rigger"]);
});