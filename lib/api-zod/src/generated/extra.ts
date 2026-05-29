// Hand-written Zod schemas for API routes not covered by the OpenAPI spec.
// This file is preserved by restore-handwritten.mjs and must not be deleted.
import * as zod from "zod";

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
