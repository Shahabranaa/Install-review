// Hand-written Zod schemas for API routes not covered by the OpenAPI spec.
// This file is preserved by restore-handwritten.mjs and must not be deleted.
import * as zod from "zod";

// ── DPR Shift Attendance ──────────────────────────────────────────────────────

export const DprShiftStatus = zod.enum(["off_shift", "signing_on", "on_shift", "signing_off"]);
export type DprShiftStatusType = zod.infer<typeof DprShiftStatus>;

export const DprShiftAttendanceItem = zod.object({
  id: zod.number(),
  firstName: zod.string(),
  lastName: zod.string(),
  role: zod.string().nullish(),
  company: zod.string().nullish(),
  active: zod.boolean(),
  teamIds: zod.array(zod.number()),
  // null means no record exists → implicit off_shift
  shiftStatus: zod.enum(["off_shift", "signing_on", "on_shift", "signing_off"]),
  signOnTime: zod.string().nullish(),
  signOffTime: zod.string().nullish(),
});
export type DprShiftAttendanceItemType = zod.infer<typeof DprShiftAttendanceItem>;

export const ListDprShiftAttendanceResponse = zod.array(DprShiftAttendanceItem);

export const GetDprShiftAttendanceQueryParams = zod.object({
  date: zod.string(),
});

export const UpdateDprShiftAttendanceParams = zod.object({
  workerId: zod.coerce.number(),
});

export const UpdateDprShiftAttendanceBody = zod.object({
  date: zod.string(),
  status: DprShiftStatus,
  signOnTime: zod.string().nullish(),
  signOffTime: zod.string().nullish(),
});

export const CopyDprShiftAttendanceQueryParams = zod.object({
  date: zod.string(),
});

export const CopyDprShiftAttendanceResponse = zod.object({
  copied: zod.number(),
});

export const DprShiftSessionResponse = zod.object({
  saved: zod.boolean(),
  savedAt: zod.string().nullable(),
});
export type DprShiftSessionResponseType = zod.infer<typeof DprShiftSessionResponse>;

export const SaveDprShiftAttendanceBody = zod.object({ date: zod.string() });
export type SaveDprShiftAttendanceBodyType = zod.infer<typeof SaveDprShiftAttendanceBody>;

export const GetDprShiftSessionQueryParams = zod.object({ date: zod.string() });

// ── Issues ────────────────────────────────────────────────────────────────────

export const ResolveIssueBody = zod.object({
  resolvedBy: zod.string().nullish(),
});

// ── Strings ───────────────────────────────────────────────────────────────────

export const ListStringsQueryParams = zod.object({
  locationId: zod.coerce.number().optional(),
});

export const ListStringsResponseItem = zod.object({
  id: zod.number(),
  locationId: zod.number(),
  name: zod.string(),
  stringNumber: zod.number().nullish(),
  status: zod.string(),
  createdAt: zod.string(),
  updatedAt: zod.string(),
});
export const ListStringsResponse = zod.array(ListStringsResponseItem);

export const GetStringParams = zod.object({
  id: zod.coerce.number(),
});

export const GetStringResponse = zod.object({
  id: zod.number(),
  locationId: zod.number(),
  name: zod.string(),
  stringNumber: zod.number().nullish(),
  status: zod.string(),
  createdAt: zod.string(),
  updatedAt: zod.string(),
});

// ── Towers ────────────────────────────────────────────────────────────────────

export const ListTowersQueryParams = zod.object({
  stringId: zod.coerce.number().optional(),
  locationId: zod.coerce.number().optional(),
});

export const ListTowersResponseItem = zod.object({
  id: zod.number(),
  stringId: zod.number(),
  name: zod.string(),
  lat: zod.number().nullish(),
  lng: zod.number().nullish(),
  progressStatus: zod.string(),
  locationType: zod.string(),
  connectedTo: zod.string().nullish(),
  countOnString: zod.number().nullish(),
  createdAt: zod.string(),
  updatedAt: zod.string(),
});
export const ListTowersResponse = zod.array(ListTowersResponseItem);

export const GetTowerParams = zod.object({
  id: zod.coerce.number(),
});

export const GetTowerResponse = zod.object({
  id: zod.number(),
  stringId: zod.number(),
  name: zod.string(),
  lat: zod.number().nullish(),
  lng: zod.number().nullish(),
  progressStatus: zod.string(),
  locationType: zod.string(),
  connectedTo: zod.string().nullish(),
  countOnString: zod.number().nullish(),
  createdAt: zod.string(),
  updatedAt: zod.string(),
});

// ── DPR — date summary ────────────────────────────────────────────────────────

export const GetDprDateSummaryResponse = zod.object({
  totalTeams: zod.number(),
  items: zod.array(
    zod.object({
      date: zod.string(),
      noTime: zod.number(),
      partial: zod.number(),
      complete: zod.number(),
      captured: zod.number(),
    })
  ),
});

// ── DPR — lock entries ────────────────────────────────────────────────────────

export const LockDprTimesheetEntriesBody = zod.object({
  teamId: zod.number(),
  date: zod.string(),
});

// Response mirrors DprTimesheetEntry array; permissive shape since the
// full entry shape is validated by the GET endpoint schema.
export const LockDprTimesheetEntriesResponse = zod.array(zod.record(zod.unknown()));

// ── DPR — team date exceptions ────────────────────────────────────────────────

export const DprTeamDateException = zod.object({
  id: zod.number(),
  teamId: zod.number(),
  date: zod.string(),
  status: zod.string(),
});

export const GetDprTeamDateExceptionsQueryParams = zod.object({
  date: zod.string().optional(),
});

export const GetDprTeamDateExceptionsResponse = zod.array(DprTeamDateException);

export const CreateDprTeamDateExceptionBody = zod.object({
  teamId: zod.number(),
  date: zod.string(),
});

export const DeleteDprTeamDateExceptionParams = zod.object({
  id: zod.coerce.number(),
});
