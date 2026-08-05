import { Router, type IRouter } from "express";
import { eq, and, gte, lte, inArray, sql, isNull, isNotNull, or, type SQL } from "drizzle-orm";
import {
  db,
  dprLocationsTable,
  dprTeamsTable,
  dprActivityTypesTable,
  dprActivityGroupsTable,
  dprActivitiesTable,
  dprJdrCodesTable,
  dprTimesheetEntriesTable,
  dprTeamDateExceptionsTable,
  dprWorkersTable,
  dprTeamWorkersTable,
  dprTeamRoleSlotsTable,
  dprDailyAssignmentsTable,
  dprRosterVisibleTeamsTable,
} from "@workspace/db";
import {
  ListDprActivityGroupsQueryParams,
  ListDprActivityGroupsResponse,
  ListDprActivitiesQueryParams,
  ListDprActivitiesResponse,
  ListDprJdrCodesQueryParams,
  ListDprJdrCodesResponse,
  ListDprLocationsResponse,
  ListDprTeamsResponse,
  ListDprActivityTypesResponse,
  ListDprTimesheetEntriesQueryParams,
  ListDprTimesheetEntriesResponse,
  CreateDprTimesheetEntryBody,
  GetDprTimesheetSummaryResponse,
  GetDprDateSummaryResponse,
  GetDprTimesheetEntryParams,
  GetDprTimesheetEntryResponse,
  UpdateDprTimesheetEntryParams,
  UpdateDprTimesheetEntryBody,
  UpdateDprTimesheetEntryResponse,
  DeleteDprTimesheetEntryParams,
  LockDprTimesheetEntriesBody,
  LockDprTimesheetEntriesResponse,
  GetDprTeamDateExceptionsQueryParams,
  GetDprTeamDateExceptionsResponse,
  CreateDprTeamDateExceptionBody,
  DeleteDprTeamDateExceptionParams,
  DprTeamDateException,
  CreateDprActivityTypeBody,
  UpdateDprActivityTypeParams,
  UpdateDprActivityTypeBody,
  UpdateDprActivityTypeResponse,
  DeleteDprActivityTypeParams,
  CreateDprActivityGroupBody,
  UpdateDprActivityGroupParams,
  UpdateDprActivityGroupBody,
  UpdateDprActivityGroupResponse,
  DeleteDprActivityGroupParams,
  CreateDprActivityBody,
  UpdateDprActivityParams,
  UpdateDprActivityBody,
  UpdateDprActivityResponse,
  DeleteDprActivityParams,
  CreateDprJdrCodeBody,
  UpdateDprJdrCodeParams,
  UpdateDprJdrCodeBody,
  UpdateDprJdrCodeResponse,
  DeleteDprJdrCodeParams,
  CreateDprLocationBody,
  UpdateDprLocationParams,
  UpdateDprLocationBody,
  UpdateDprLocationResponse,
  DeleteDprLocationParams,
  ListDprWorkersResponse,
  ListDprWorkersResponseItem,
  CreateDprWorkerBody,
  ImportDprWorkersBody,
  ImportDprWorkersResponse,
  DeleteDprWorkerParams,
  SetDprWorkerTeamsParams,
  SetDprWorkerTeamsBody,
  SetDprWorkerTeamsResponse,
  GetDprRosterQueryParams,
  CopyDprRosterBody,
  ClearDprRosterBody,
  ListDprTeamRoleSlotsParams,
  CreateDprTeamRoleSlotParams,
  CreateDprTeamRoleSlotBody,
  DeleteDprTeamRoleSlotParams,
  UpsertDprDailyAssignmentBody,
  DeleteDprDailyAssignmentParams,
} from "@workspace/api-zod";
import { serialize } from "../lib/serialize";

const router: IRouter = Router();

function parseId(raw: unknown): number | null {
  const n = parseInt(String(raw), 10);
  return isNaN(n) || n <= 0 ? null : n;
}

// Sorts names naturally so numeric suffixes order correctly
// (e.g. "Team 2" before "Team 10" instead of alphabetical "Team 10" before "Team 2").
function naturalSort<T extends { name: string }>(rows: T[]): T[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  return [...rows].sort((a, b) => collator.compare(a.name, b.name));
}

// ─── Server-side TTL cache for rarely-changing reference data ───────────────
// Eliminates repeated DB round-trips for lookups that change only when an
// admin edits them.  TTL = 60 s; mutations call .invalidate() on the relevant
// cache so the next read is always fresh.

function makeTTLCache<T>(ttlMs: number) {
  let cached: T | null = null;
  let expiresAt = 0;
  return {
    get(): T | null { return Date.now() < expiresAt ? cached : null; },
    set(v: T) { cached = v; expiresAt = Date.now() + ttlMs; },
    invalidate() { cached = null; expiresAt = 0; },
  };
}

const TTL = 60_000;
const refCache = {
  locations:      makeTTLCache<{ id: number; name: string }[]>(TTL),
  teams:          makeTTLCache<{ id: number; name: string }[]>(TTL),
  activityTypes:  makeTTLCache<(typeof dprActivityTypesTable.$inferSelect)[]>(TTL),
  activityGroups: makeTTLCache<(typeof dprActivityGroupsTable.$inferSelect)[]>(TTL),
  activities:     makeTTLCache<(typeof dprActivitiesTable.$inferSelect)[]>(TTL),
  jdrCodes:       makeTTLCache<(typeof dprJdrCodesTable.$inferSelect)[]>(TTL),
};

// ─── Reference lookups ──────────────────────────────────────────────────────

router.get("/dpr/locations", async (_req, res): Promise<void> => {
  let rows = refCache.locations.get();
  if (!rows) {
    rows = await db.select().from(dprLocationsTable);
    refCache.locations.set(rows);
  }
  res.json(ListDprLocationsResponse.parse(serialize(naturalSort(rows))));
});

router.post("/dpr/locations", async (req, res): Promise<void> => {
  const parsed = CreateDprLocationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(dprLocationsTable).values(parsed.data).returning();
  refCache.locations.invalidate();
  res.status(201).json(UpdateDprLocationResponse.parse(serialize(row)));
});

router.patch("/dpr/locations/:id", async (req, res): Promise<void> => {
  const params = UpdateDprLocationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateDprLocationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(dprLocationsTable)
    .set(parsed.data)
    .where(eq(dprLocationsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Location not found" });
    return;
  }
  refCache.locations.invalidate();
  res.json(UpdateDprLocationResponse.parse(serialize(row)));
});

router.delete("/dpr/locations/:id", async (req, res): Promise<void> => {
  const params = DeleteDprLocationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(dprLocationsTable)
    .where(eq(dprLocationsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Location not found" });
    return;
  }
  refCache.locations.invalidate();
  res.sendStatus(204);
});

router.get("/dpr/teams", async (_req, res): Promise<void> => {
  let rows = refCache.teams.get();
  if (!rows) {
    rows = await db.select().from(dprTeamsTable);
    refCache.teams.set(rows);
  }
  res.json(ListDprTeamsResponse.parse(serialize(naturalSort(rows))));
});

router.post("/dpr/teams", async (req, res): Promise<void> => {
  const { name } = req.body as { name?: string };
  if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
  const [row] = await db.insert(dprTeamsTable).values({ name: name.trim() }).returning();
  refCache.teams.invalidate();
  res.status(201).json(row);
});

router.patch("/dpr/teams/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
  const { name } = req.body as { name?: string };
  if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
  const [updated] = await db.update(dprTeamsTable).set({ name: name.trim() }).where(eq(dprTeamsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Team not found" }); return; }
  refCache.teams.invalidate();
  res.json(updated);
});

router.delete("/dpr/teams/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(dprTeamsTable).where(eq(dprTeamsTable.id, id));
  refCache.teams.invalidate();
  res.status(204).send();
});

router.get("/dpr/activity-types", async (_req, res): Promise<void> => {
  let rows = refCache.activityTypes.get();
  if (!rows) {
    rows = await db.select().from(dprActivityTypesTable).orderBy(dprActivityTypesTable.name);
    refCache.activityTypes.set(rows);
  }
  res.json(ListDprActivityTypesResponse.parse(serialize(rows)));
});

router.post("/dpr/activity-types", async (req, res): Promise<void> => {
  const parsed = CreateDprActivityTypeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(dprActivityTypesTable).values(parsed.data).returning();
  refCache.activityTypes.invalidate();
  res.status(201).json(UpdateDprActivityTypeResponse.parse(serialize(row)));
});

router.patch("/dpr/activity-types/:id", async (req, res): Promise<void> => {
  const params = UpdateDprActivityTypeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateDprActivityTypeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(dprActivityTypesTable)
    .set(parsed.data)
    .where(eq(dprActivityTypesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Activity type not found" });
    return;
  }
  refCache.activityTypes.invalidate();
  res.json(UpdateDprActivityTypeResponse.parse(serialize(row)));
});

router.delete("/dpr/activity-types/:id", async (req, res): Promise<void> => {
  const params = DeleteDprActivityTypeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(dprActivityTypesTable)
    .where(eq(dprActivityTypesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Activity type not found" });
    return;
  }
  refCache.activityTypes.invalidate();
  res.sendStatus(204);
});

router.get("/dpr/activity-groups", async (req, res): Promise<void> => {
  const queryParams = ListDprActivityGroupsQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }
  // Serve from cache (full list) and filter in-process when a typeId is given
  let all = refCache.activityGroups.get();
  if (!all) {
    all = await db.select().from(dprActivityGroupsTable).orderBy(dprActivityGroupsTable.name);
    refCache.activityGroups.set(all);
  }
  const rows = queryParams.data.activityTypeId
    ? all.filter((r) => r.activityTypeId === queryParams.data.activityTypeId)
    : all;
  res.json(ListDprActivityGroupsResponse.parse(serialize(rows)));
});

router.post("/dpr/activity-groups", async (req, res): Promise<void> => {
  const parsed = CreateDprActivityGroupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(dprActivityGroupsTable).values(parsed.data).returning();
  refCache.activityGroups.invalidate();
  res.status(201).json(UpdateDprActivityGroupResponse.parse(serialize(row)));
});

router.patch("/dpr/activity-groups/:id", async (req, res): Promise<void> => {
  const params = UpdateDprActivityGroupParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateDprActivityGroupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(dprActivityGroupsTable)
    .set(parsed.data)
    .where(eq(dprActivityGroupsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Activity group not found" });
    return;
  }
  refCache.activityGroups.invalidate();
  res.json(UpdateDprActivityGroupResponse.parse(serialize(row)));
});

router.delete("/dpr/activity-groups/:id", async (req, res): Promise<void> => {
  const params = DeleteDprActivityGroupParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(dprActivityGroupsTable)
    .where(eq(dprActivityGroupsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Activity group not found" });
    return;
  }
  refCache.activityGroups.invalidate();
  res.sendStatus(204);
});

router.get("/dpr/activities", async (req, res): Promise<void> => {
  const queryParams = ListDprActivitiesQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }
  let all = refCache.activities.get();
  if (!all) {
    all = await db.select().from(dprActivitiesTable).orderBy(dprActivitiesTable.name);
    refCache.activities.set(all);
  }
  const rows = queryParams.data.activityGroupId
    ? all.filter((r) => r.activityGroupId === queryParams.data.activityGroupId)
    : all;
  res.json(ListDprActivitiesResponse.parse(serialize(rows)));
});

router.post("/dpr/activities", async (req, res): Promise<void> => {
  const parsed = CreateDprActivityBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(dprActivitiesTable).values(parsed.data).returning();
  refCache.activities.invalidate();
  res.status(201).json(UpdateDprActivityResponse.parse(serialize(row)));
});

router.patch("/dpr/activities/:id", async (req, res): Promise<void> => {
  const params = UpdateDprActivityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateDprActivityBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(dprActivitiesTable)
    .set(parsed.data)
    .where(eq(dprActivitiesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Activity not found" });
    return;
  }
  refCache.activities.invalidate();
  res.json(UpdateDprActivityResponse.parse(serialize(row)));
});

router.delete("/dpr/activities/:id", async (req, res): Promise<void> => {
  const params = DeleteDprActivityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(dprActivitiesTable)
    .where(eq(dprActivitiesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Activity not found" });
    return;
  }
  refCache.activities.invalidate();
  res.sendStatus(204);
});

router.get("/dpr/jdr-codes", async (req, res): Promise<void> => {
  const queryParams = ListDprJdrCodesQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }
  let all = refCache.jdrCodes.get();
  if (!all) {
    all = await db.select().from(dprJdrCodesTable).orderBy(dprJdrCodesTable.jdrWorkActivity);
    refCache.jdrCodes.set(all);
  }
  const rows = queryParams.data.activityId
    ? all.filter((r) => r.activityId === queryParams.data.activityId)
    : all;
  res.json(ListDprJdrCodesResponse.parse(serialize(rows)));
});

router.post("/dpr/jdr-codes", async (req, res): Promise<void> => {
  const parsed = CreateDprJdrCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(dprJdrCodesTable).values(parsed.data).returning();
  refCache.jdrCodes.invalidate();
  res.status(201).json(UpdateDprJdrCodeResponse.parse(serialize(row)));
});

router.patch("/dpr/jdr-codes/:id", async (req, res): Promise<void> => {
  const params = UpdateDprJdrCodeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateDprJdrCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(dprJdrCodesTable)
    .set(parsed.data)
    .where(eq(dprJdrCodesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "JDR code not found" });
    return;
  }
  refCache.jdrCodes.invalidate();
  res.json(UpdateDprJdrCodeResponse.parse(serialize(row)));
});

router.delete("/dpr/jdr-codes/:id", async (req, res): Promise<void> => {
  const params = DeleteDprJdrCodeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(dprJdrCodesTable)
    .where(eq(dprJdrCodesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "JDR code not found" });
    return;
  }
  refCache.jdrCodes.invalidate();
  res.sendStatus(204);
});

// ─── Timesheet entries ──────────────────────────────────────────────────────

// Single JOIN query that replaces the old N+1 withRelations helper.
// Used for the list endpoint; single-row operations (GET /:id, PATCH, lock)
// use withRelationsSingle which does two targeted queries — fast enough for
// one row but avoids the Drizzle join complexity on mutations.
async function fetchEntriesWithJoins(where?: SQL) {
  const rows = await db
    .select({
      entry: dprTimesheetEntriesTable,
      team: dprTeamsTable,
      location: dprLocationsTable,
    })
    .from(dprTimesheetEntriesTable)
    .leftJoin(dprTeamsTable, eq(dprTimesheetEntriesTable.teamId, dprTeamsTable.id))
    .leftJoin(dprLocationsTable, eq(dprTimesheetEntriesTable.locationId, dprLocationsTable.id))
    .where(where)
    .orderBy(
      sql`COALESCE(${dprTimesheetEntriesTable.shiftDate}, ${dprTimesheetEntriesTable.date})`,
      dprTimesheetEntriesTable.date,
      dprTimesheetEntriesTable.startTime,
      dprTimesheetEntriesTable.id,
    );

  return rows.map(({ entry, team, location }) => ({
    ...entry,
    team: team ?? undefined,
    location: entry.locationId ? (location ?? null) : undefined,
  }));
}

// For single-row mutations: two targeted queries — negligible for one row.
async function withRelations(entry: typeof dprTimesheetEntriesTable.$inferSelect) {
  const [team] = entry.teamId
    ? await db.select().from(dprTeamsTable).where(eq(dprTeamsTable.id, entry.teamId))
    : [undefined];
  const [location] = entry.locationId
    ? await db.select().from(dprLocationsTable).where(eq(dprLocationsTable.id, entry.locationId))
    : [undefined];
  return {
    ...entry,
    team: team ?? undefined,
    location: entry.locationId ? (location ?? null) : undefined,
  };
}

router.get("/dpr/timesheet-entries", async (req, res): Promise<void> => {
  const queryParams = ListDprTimesheetEntriesQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }
  const { stage, teamId, dateFrom, dateTo } = queryParams.data;
  const conditions: SQL[] = [];
  if (stage) conditions.push(eq(dprTimesheetEntriesTable.stage, stage));
  if (teamId) conditions.push(eq(dprTimesheetEntriesTable.teamId, teamId));
  if (dateFrom) conditions.push(gte(dprTimesheetEntriesTable.date, dateFrom));
  if (dateTo) conditions.push(lte(dprTimesheetEntriesTable.date, dateTo));

  const withJoins = await fetchEntriesWithJoins(conditions.length ? and(...conditions) : undefined);
  res.json(ListDprTimesheetEntriesResponse.parse(serialize(withJoins)));
});

router.post("/dpr/timesheet-entries", async (req, res): Promise<void> => {
  const parsed = CreateDprTimesheetEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [entry] = await db
    .insert(dprTimesheetEntriesTable)
    .values({ ...parsed.data, stage: "draft" })
    .returning();
  const withJoins = await withRelations(entry);
  res.status(201).json(GetDprTimesheetEntryResponse.parse(serialize(withJoins)));
});

router.get("/dpr/timesheet-entries/summary", async (_req, res): Promise<void> => {
  // Use SQL aggregation instead of fetching all rows and counting in JS
  const [counts] = await db
    .select({
      total:     sql<number>`COUNT(*)::int`,
      captured:  sql<number>`COUNT(*) FILTER (WHERE stage = 'draft')::int`,
      clarified: sql<number>`COUNT(*) FILTER (WHERE stage = 'captured')::int`,
    })
    .from(dprTimesheetEntriesTable);
  res.json(
    GetDprTimesheetSummaryResponse.parse({
      totalEntries:  counts?.total     ?? 0,
      capturedCount: counts?.captured  ?? 0,
      clarifiedCount: counts?.clarified ?? 0,
    }),
  );
});

router.get("/dpr/timesheet-entries/date-summary", async (_req, res): Promise<void> => {
  // Fixed 10-day window
  const windowDates = Array.from({ length: 10 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().substring(0, 10);
  });
  const windowStart = windowDates[windowDates.length - 1];
  const windowEnd = windowDates[0];

  const [teamRows, entryRows, exceptionRows] = await Promise.all([
    db.select({ id: dprTeamsTable.id }).from(dprTeamsTable),
    db
      .select({
        date: dprTimesheetEntriesTable.date,
        shiftDate: dprTimesheetEntriesTable.shiftDate,
        teamId: dprTimesheetEntriesTable.teamId,
        stage: dprTimesheetEntriesTable.stage,
      })
      .from(dprTimesheetEntriesTable)
      // Only fetch entries whose effective date (shiftDate ?? date) falls within
      // the 10-day window — avoids a full-table scan of all historical entries.
      .where(
        or(
          and(
            isNull(dprTimesheetEntriesTable.shiftDate),
            gte(dprTimesheetEntriesTable.date, windowStart),
            lte(dprTimesheetEntriesTable.date, windowEnd),
          ),
          and(
            isNotNull(dprTimesheetEntriesTable.shiftDate),
            gte(dprTimesheetEntriesTable.shiftDate, windowStart),
            lte(dprTimesheetEntriesTable.shiftDate, windowEnd),
          ),
        )
      ),
    db
      .select({ teamId: dprTeamDateExceptionsTable.teamId, date: dprTeamDateExceptionsTable.date })
      .from(dprTeamDateExceptionsTable)
      .where(
        and(
          gte(dprTeamDateExceptionsTable.date, windowStart),
          lte(dprTeamDateExceptionsTable.date, windowEnd)
        )
      ),
  ]);

  const allTeamIds = new Set(teamRows.map((t) => t.id));
  const totalTeams = allTeamIds.size;

  // exceptions per date
  const exceptionsMap = new Map<string, Set<number>>();
  for (const ex of exceptionRows) {
    const d = String(ex.date).substring(0, 10);
    if (!exceptionsMap.has(d)) exceptionsMap.set(d, new Set());
    exceptionsMap.get(d)!.add(ex.teamId);
  }

  // per-date, per-team stage sets — group by shiftDate when set, else date
  type StageSet = { hasDraft: boolean; hasSubmitted: boolean };
  const datemap = new Map<string, Map<number, StageSet>>();
  // captured entry counts per date (for the clarify queue indicator)
  const capturedCountMap = new Map<string, number>();
  for (const row of entryRows) {
    if (row.teamId === null) continue;
    const rawGroupDate = row.shiftDate ?? row.date;
    const d = String(rawGroupDate).substring(0, 10);
    if (!datemap.has(d)) datemap.set(d, new Map());
    const teamMap = datemap.get(d)!;
    if (!teamMap.has(row.teamId)) teamMap.set(row.teamId, { hasDraft: false, hasSubmitted: false });
    const s = teamMap.get(row.teamId)!;
    if (row.stage === "draft") s.hasDraft = true;
    else s.hasSubmitted = true;
    if (row.stage === "captured") {
      capturedCountMap.set(d, (capturedCountMap.get(d) ?? 0) + 1);
    }
  }

  const items = windowDates.map((date) => {
    const excluded = exceptionsMap.get(date) ?? new Set<number>();
    const teamMap = datemap.get(date) ?? new Map<number, StageSet>();
    let partial = 0;
    let complete = 0;
    for (const id of allTeamIds) {
      if (excluded.has(id)) continue; // not expected this date
      const s = teamMap.get(id);
      if (!s) continue; // no entries → noTime
      if (s.hasDraft) partial++;
      else complete++;
    }
    const expectedCount = totalTeams - excluded.size;
    const noTime = expectedCount - partial - complete;
    const captured = capturedCountMap.get(date) ?? 0;
    return { date, noTime, partial, complete, captured };
  });

  res.json(GetDprDateSummaryResponse.parse({ totalTeams, items }));
});

// ── Lock entries for Clarify ─────────────────────────────────────────────

router.post("/dpr/timesheet-entries/lock", async (req, res): Promise<void> => {
  const parsed = LockDprTimesheetEntriesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { teamId, date } = parsed.data;

  // Find all draft entries for this team whose shift date (or calendar date) matches
  const targets = await db
    .select({ id: dprTimesheetEntriesTable.id })
    .from(dprTimesheetEntriesTable)
    .where(
      and(
        eq(dprTimesheetEntriesTable.stage, "draft"),
        eq(dprTimesheetEntriesTable.teamId, teamId),
        sql`COALESCE(${dprTimesheetEntriesTable.shiftDate}, ${dprTimesheetEntriesTable.date}) = ${date}`
      )
    );

  if (targets.length === 0) {
    res.json(LockDprTimesheetEntriesResponse.parse([]));
    return;
  }

  const ids = targets.map((r) => r.id);
  const updated = await db
    .update(dprTimesheetEntriesTable)
    .set({ stage: "captured", updatedAt: new Date() })
    .where(inArray(dprTimesheetEntriesTable.id, ids))
    .returning();

  const withJoins = await Promise.all(updated.map(withRelations));
  res.json(LockDprTimesheetEntriesResponse.parse(serialize(withJoins)));
});

// ── Team date exceptions ──────────────────────────────────────────────────

router.get("/dpr/team-date-exceptions", async (req, res): Promise<void> => {
  const query = GetDprTeamDateExceptionsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const conditions: SQL[] = [];
  if (query.data.date) conditions.push(eq(dprTeamDateExceptionsTable.date, query.data.date));
  const rows = await db.select().from(dprTeamDateExceptionsTable).where(and(...conditions));
  res.json(GetDprTeamDateExceptionsResponse.parse(rows.map((r) => ({
    id: r.id,
    teamId: r.teamId,
    date: String(r.date).substring(0, 10),
    status: r.status,
  }))));
});

router.post("/dpr/team-date-exceptions", async (req, res): Promise<void> => {
  const body = CreateDprTeamDateExceptionBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [row] = await db
    .insert(dprTeamDateExceptionsTable)
    .values({ teamId: body.data.teamId, date: body.data.date, status: "not_working" })
    .onConflictDoNothing()
    .returning();
  if (!row) {
    // Already exists — return existing row
    const [existing] = await db
      .select()
      .from(dprTeamDateExceptionsTable)
      .where(
        and(
          eq(dprTeamDateExceptionsTable.teamId, body.data.teamId),
          eq(dprTeamDateExceptionsTable.date, body.data.date)
        )
      );
    res.status(200).json(DprTeamDateException.parse({ ...existing, date: String(existing.date).substring(0, 10) }));
    return;
  }
  res.status(201).json(DprTeamDateException.parse({ ...row, date: String(row.date).substring(0, 10) }));
});

router.delete("/dpr/team-date-exceptions/:id", async (req, res): Promise<void> => {
  const params = DeleteDprTeamDateExceptionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(dprTeamDateExceptionsTable).where(eq(dprTeamDateExceptionsTable.id, params.data.id));
  res.status(204).send();
});

// ── Timesheet entries ─────────────────────────────────────────────────────

router.get("/dpr/timesheet-entries/:id", async (req, res): Promise<void> => {
  const params = GetDprTimesheetEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [entry] = await db
    .select()
    .from(dprTimesheetEntriesTable)
    .where(eq(dprTimesheetEntriesTable.id, params.data.id));
  if (!entry) {
    res.status(404).json({ error: "Timesheet entry not found" });
    return;
  }
  const withJoins = await withRelations(entry);
  res.json(GetDprTimesheetEntryResponse.parse(serialize(withJoins)));
});

router.patch("/dpr/timesheet-entries/:id", async (req, res): Promise<void> => {
  const params = UpdateDprTimesheetEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateDprTimesheetEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }
  const [entry] = await db
    .update(dprTimesheetEntriesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(dprTimesheetEntriesTable.id, params.data.id))
    .returning();
  if (!entry) {
    res.status(404).json({ error: "Timesheet entry not found" });
    return;
  }
  const withJoins = await withRelations(entry);
  res.json(UpdateDprTimesheetEntryResponse.parse(serialize(withJoins)));
});

router.delete("/dpr/timesheet-entries/:id", async (req, res): Promise<void> => {
  const params = DeleteDprTimesheetEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [entry] = await db
    .delete(dprTimesheetEntriesTable)
    .where(eq(dprTimesheetEntriesTable.id, params.data.id))
    .returning();
  if (!entry) {
    res.status(404).json({ error: "Timesheet entry not found" });
    return;
  }
  res.sendStatus(204);
});

// ── Roster & Role Slots ───────────────────────────────────────────────────────

// Helper: build full roster response for a date
async function buildRoster(date: string) {
  const [teams, slots, assignments, workers] = await Promise.all([
    db.select().from(dprTeamsTable),
    db.select().from(dprTeamRoleSlotsTable).orderBy(dprTeamRoleSlotsTable.teamId, dprTeamRoleSlotsTable.displayOrder),
    db.select().from(dprDailyAssignmentsTable).where(eq(dprDailyAssignmentsTable.date, date)),
    db.select().from(dprWorkersTable).where(eq(dprWorkersTable.active, true)),
  ]);

  const assignedWorkerIds = new Set(assignments.map((a) => a.workerId));

  // worker lookup by id
  const workerById = new Map(workers.map((w) => [w.id, w]));

  // assignment lookup: slotId → assignment
  const assignBySlot = new Map(assignments.map((a) => [a.slotId, a]));

  // group slots by team
  const slotsByTeam = new Map<number, typeof slots>();
  for (const slot of slots) {
    if (!slotsByTeam.has(slot.teamId)) slotsByTeam.set(slot.teamId, []);
    slotsByTeam.get(slot.teamId)!.push(slot);
  }

  const rosterTeams = teams.map((team) => {
    const teamSlots = slotsByTeam.get(team.id) ?? [];
    return {
      teamId: team.id,
      teamName: team.name,
      slots: teamSlots.map((slot) => {
        const assignment = assignBySlot.get(slot.id);
        const worker = assignment ? workerById.get(assignment.workerId) : null;
        return {
          slotId: slot.id,
          role: slot.role,
          displayOrder: slot.displayOrder,
          assignmentId: assignment?.id ?? null,
          worker: worker
            ? { ...worker, teamIds: [] as number[] }
            : null,
        };
      }),
    };
  });

  const unassigned = workers
    .filter((w) => !assignedWorkerIds.has(w.id))
    .map((w) => ({ ...w, teamIds: [] as number[] }));

  return { date, teams: rosterTeams, unassigned };
}

router.get("/dpr/roster", async (req, res): Promise<void> => {
  const query = GetDprRosterQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const roster = await buildRoster(query.data.date);
  res.json(roster);
});

router.get("/dpr/roster-visible-teams", async (req, res): Promise<void> => {
  const date = req.query.date as string | undefined;
  if (!date) { res.status(400).json({ error: "date is required" }); return; }
  const rows = await db
    .select({ teamId: dprRosterVisibleTeamsTable.teamId })
    .from(dprRosterVisibleTeamsTable)
    .where(eq(dprRosterVisibleTeamsTable.date, date));
  res.json({ teamIds: rows.map((r) => r.teamId) });
});

router.post("/dpr/roster-visible-teams", async (req, res): Promise<void> => {
  const { date, teamIds } = req.body as { date?: string; teamIds?: number[] };
  if (!date || !Array.isArray(teamIds)) { res.status(400).json({ error: "date and teamIds are required" }); return; }
  await db.delete(dprRosterVisibleTeamsTable).where(eq(dprRosterVisibleTeamsTable.date, date));
  if (teamIds.length > 0) {
    await db.insert(dprRosterVisibleTeamsTable).values(teamIds.map((teamId) => ({ date, teamId }))).onConflictDoNothing();
  }
  res.json({ teamIds });
});

router.post("/dpr/roster/copy", async (req, res): Promise<void> => {
  const body = CopyDprRosterBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const { fromDate, toDate } = body.data;

  // Copy visible team selection from source date to target date
  const sourceVisible = await db
    .select({ teamId: dprRosterVisibleTeamsTable.teamId })
    .from(dprRosterVisibleTeamsTable)
    .where(eq(dprRosterVisibleTeamsTable.date, fromDate));
  if (sourceVisible.length > 0) {
    await db.delete(dprRosterVisibleTeamsTable).where(eq(dprRosterVisibleTeamsTable.date, toDate));
    await db.insert(dprRosterVisibleTeamsTable).values(sourceVisible.map((r) => ({ date: toDate, teamId: r.teamId }))).onConflictDoNothing();
  }

  // Get source assignments
  const sourceAssignments = await db
    .select()
    .from(dprDailyAssignmentsTable)
    .where(eq(dprDailyAssignmentsTable.date, fromDate));

  if (sourceAssignments.length > 0) {
    // Get workers still active
    const activeWorkers = await db
      .select({ id: dprWorkersTable.id })
      .from(dprWorkersTable)
      .where(eq(dprWorkersTable.active, true));
    const activeIds = new Set(activeWorkers.map((w) => w.id));

    const toInsert = sourceAssignments
      .filter((a) => activeIds.has(a.workerId))
      .map((a) => ({ date: toDate, slotId: a.slotId, workerId: a.workerId }));

    if (toInsert.length > 0) {
      // Delete existing assignments for toDate first, then insert copied ones
      await db.delete(dprDailyAssignmentsTable).where(eq(dprDailyAssignmentsTable.date, toDate));
      await db.insert(dprDailyAssignmentsTable).values(toInsert).onConflictDoNothing();
    }
  }

  const roster = await buildRoster(toDate);
  res.json(roster);
});

router.post("/dpr/roster/clear", async (req, res): Promise<void> => {
  const body = ClearDprRosterBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  await db.delete(dprDailyAssignmentsTable).where(eq(dprDailyAssignmentsTable.date, body.data.date));
  res.status(204).send();
});

router.get("/dpr/team-role-slots/:teamId", async (req, res): Promise<void> => {
  const params = ListDprTeamRoleSlotsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const rows = await db
    .select()
    .from(dprTeamRoleSlotsTable)
    .where(eq(dprTeamRoleSlotsTable.teamId, params.data.teamId))
    .orderBy(dprTeamRoleSlotsTable.displayOrder);
  res.json(rows);
});

router.post("/dpr/team-role-slots/:teamId", async (req, res): Promise<void> => {
  const params = CreateDprTeamRoleSlotParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = CreateDprTeamRoleSlotBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  // Display order = max + 1
  const [maxRow] = await db
    .select({ maxOrder: sql<number>`MAX(display_order)` })
    .from(dprTeamRoleSlotsTable)
    .where(eq(dprTeamRoleSlotsTable.teamId, params.data.teamId));
  const nextOrder = (maxRow?.maxOrder ?? -1) + 1;

  const [slot] = await db
    .insert(dprTeamRoleSlotsTable)
    .values({ teamId: params.data.teamId, role: body.data.role, displayOrder: nextOrder })
    .returning();
  res.status(201).json(slot);
});

router.delete("/dpr/team-role-slots/:teamId/:slotId", async (req, res): Promise<void> => {
  const params = DeleteDprTeamRoleSlotParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db
    .delete(dprTeamRoleSlotsTable)
    .where(
      and(
        eq(dprTeamRoleSlotsTable.id, params.data.slotId),
        eq(dprTeamRoleSlotsTable.teamId, params.data.teamId)
      )
    );
  res.status(204).send();
});

router.put("/dpr/daily-assignments", async (req, res): Promise<void> => {
  const body = UpsertDprDailyAssignmentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [row] = await db
    .insert(dprDailyAssignmentsTable)
    .values(body.data)
    .onConflictDoUpdate({
      target: [dprDailyAssignmentsTable.date, dprDailyAssignmentsTable.slotId],
      set: { workerId: body.data.workerId },
    })
    .returning();
  res.json(row);
});

router.delete("/dpr/daily-assignments/:id", async (req, res): Promise<void> => {
  const params = DeleteDprDailyAssignmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(dprDailyAssignmentsTable).where(eq(dprDailyAssignmentsTable.id, params.data.id));
  res.status(204).send();
});

// ── DPR Workers ───────────────────────────────────────────────────────────────

async function workerWithTeams(workerId: number) {
  const [worker] = await db.select().from(dprWorkersTable).where(eq(dprWorkersTable.id, workerId));
  if (!worker) return null;
  const assignments = await db.select({ teamId: dprTeamWorkersTable.teamId }).from(dprTeamWorkersTable).where(eq(dprTeamWorkersTable.workerId, workerId));
  return { ...worker, teamIds: assignments.map((a) => a.teamId) };
}

router.get("/dpr/workers", async (_req, res): Promise<void> => {
  const workers = await db.select().from(dprWorkersTable).orderBy(dprWorkersTable.lastName, dprWorkersTable.firstName);
  const assignments = await db.select().from(dprTeamWorkersTable);
  const teamMap = new Map<number, number[]>();
  for (const a of assignments) {
    if (!teamMap.has(a.workerId)) teamMap.set(a.workerId, []);
    teamMap.get(a.workerId)!.push(a.teamId);
  }
  const result = workers.map((w) => ({ ...w, teamIds: teamMap.get(w.id) ?? [] }));
  res.json(ListDprWorkersResponse.parse(serialize(result)));
});

router.post("/dpr/workers", async (req, res): Promise<void> => {
  const body = CreateDprWorkerBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [worker] = await db.insert(dprWorkersTable).values(body.data).returning();
  const result = { ...worker, teamIds: [] as number[] };
  res.status(201).json(ListDprWorkersResponseItem.parse(serialize(result)));
});

// Must be defined before /dpr/workers/:id so Express matches it first
router.post("/dpr/workers/import", async (req, res): Promise<void> => {
  const body = ImportDprWorkersBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  if (body.data.length === 0) { res.json(ImportDprWorkersResponse.parse({ inserted: 0, total: 0 })); return; }
  const inserted = await db
    .insert(dprWorkersTable)
    .values(body.data)
    .onConflictDoNothing()
    .returning();
  res.json(ImportDprWorkersResponse.parse({ inserted: inserted.length, total: body.data.length }));
});

router.delete("/dpr/workers/:id", async (req, res): Promise<void> => {
  const params = DeleteDprWorkerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(dprWorkersTable).where(eq(dprWorkersTable.id, params.data.id));
  res.status(204).send();
});

router.patch("/dpr/workers/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
  const { active } = req.body as { active?: boolean };
  if (typeof active !== "boolean") { res.status(400).json({ error: "active must be a boolean" }); return; }
  const [updated] = await db
    .update(dprWorkersTable)
    .set({ active })
    .where(eq(dprWorkersTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Worker not found" }); return; }
  res.json({ ...updated, teamIds: [] });
});

router.put("/dpr/workers/:id/teams", async (req, res): Promise<void> => {
  const params = SetDprWorkerTeamsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = SetDprWorkerTeamsBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const workerId = params.data.id;
  // Replace all team assignments atomically
  await db.delete(dprTeamWorkersTable).where(eq(dprTeamWorkersTable.workerId, workerId));
  if (body.data.teamIds.length > 0) {
    await db.insert(dprTeamWorkersTable).values(body.data.teamIds.map((teamId) => ({ teamId, workerId }))).onConflictDoNothing();
  }
  const result = await workerWithTeams(workerId);
  if (!result) { res.status(404).json({ error: "Worker not found" }); return; }
  res.json(SetDprWorkerTeamsResponse.parse(serialize(result)));
});

export default router;
