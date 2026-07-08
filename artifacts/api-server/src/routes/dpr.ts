import { Router, type IRouter } from "express";
import { eq, and, gte, lte, type SQL } from "drizzle-orm";
import {
  db,
  dprLocationsTable,
  dprTeamsTable,
  dprActivityTypesTable,
  dprActivityGroupsTable,
  dprActivitiesTable,
  dprJdrCodesTable,
  dprTimesheetEntriesTable,
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
  GetDprTimesheetEntryParams,
  GetDprTimesheetEntryResponse,
  UpdateDprTimesheetEntryParams,
  UpdateDprTimesheetEntryBody,
  UpdateDprTimesheetEntryResponse,
  DeleteDprTimesheetEntryParams,
} from "@workspace/api-zod";
import { serialize } from "../lib/serialize";

const router: IRouter = Router();

function parseId(raw: unknown): number | null {
  const n = parseInt(String(raw), 10);
  return isNaN(n) || n <= 0 ? null : n;
}

// ─── Reference lookups ──────────────────────────────────────────────────────

router.get("/dpr/locations", async (_req, res): Promise<void> => {
  const rows = await db.select().from(dprLocationsTable).orderBy(dprLocationsTable.name);
  res.json(ListDprLocationsResponse.parse(serialize(rows)));
});

router.get("/dpr/teams", async (_req, res): Promise<void> => {
  const rows = await db.select().from(dprTeamsTable).orderBy(dprTeamsTable.name);
  res.json(ListDprTeamsResponse.parse(serialize(rows)));
});

router.get("/dpr/activity-types", async (_req, res): Promise<void> => {
  const rows = await db.select().from(dprActivityTypesTable).orderBy(dprActivityTypesTable.name);
  res.json(ListDprActivityTypesResponse.parse(serialize(rows)));
});

router.get("/dpr/activity-groups", async (req, res): Promise<void> => {
  const queryParams = ListDprActivityGroupsQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }
  let rows;
  if (queryParams.data.activityTypeId) {
    rows = await db
      .select()
      .from(dprActivityGroupsTable)
      .where(eq(dprActivityGroupsTable.activityTypeId, queryParams.data.activityTypeId))
      .orderBy(dprActivityGroupsTable.name);
  } else {
    rows = await db.select().from(dprActivityGroupsTable).orderBy(dprActivityGroupsTable.name);
  }
  res.json(ListDprActivityGroupsResponse.parse(serialize(rows)));
});

router.get("/dpr/activities", async (req, res): Promise<void> => {
  const queryParams = ListDprActivitiesQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }
  let rows;
  if (queryParams.data.activityGroupId) {
    rows = await db
      .select()
      .from(dprActivitiesTable)
      .where(eq(dprActivitiesTable.activityGroupId, queryParams.data.activityGroupId))
      .orderBy(dprActivitiesTable.name);
  } else {
    rows = await db.select().from(dprActivitiesTable).orderBy(dprActivitiesTable.name);
  }
  res.json(ListDprActivitiesResponse.parse(serialize(rows)));
});

router.get("/dpr/jdr-codes", async (req, res): Promise<void> => {
  const queryParams = ListDprJdrCodesQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }
  let rows;
  if (queryParams.data.activityId) {
    rows = await db
      .select()
      .from(dprJdrCodesTable)
      .where(eq(dprJdrCodesTable.activityId, queryParams.data.activityId))
      .orderBy(dprJdrCodesTable.jdrWorkActivity);
  } else {
    rows = await db.select().from(dprJdrCodesTable).orderBy(dprJdrCodesTable.jdrWorkActivity);
  }
  res.json(ListDprJdrCodesResponse.parse(serialize(rows)));
});

// ─── Timesheet entries ──────────────────────────────────────────────────────

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

  const rows = await db
    .select()
    .from(dprTimesheetEntriesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(dprTimesheetEntriesTable.date, dprTimesheetEntriesTable.id);

  const withJoins = await Promise.all(rows.map(withRelations));
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
    .values({ ...parsed.data, stage: "captured" })
    .returning();
  const withJoins = await withRelations(entry);
  res.status(201).json(GetDprTimesheetEntryResponse.parse(serialize(withJoins)));
});

router.get("/dpr/timesheet-entries/summary", async (_req, res): Promise<void> => {
  const rows = await db.select({ stage: dprTimesheetEntriesTable.stage }).from(dprTimesheetEntriesTable);
  const capturedCount = rows.filter((r) => r.stage === "captured").length;
  const clarifiedCount = rows.filter((r) => r.stage === "clarified").length;
  res.json(
    GetDprTimesheetSummaryResponse.parse({
      totalEntries: rows.length,
      capturedCount,
      clarifiedCount,
    }),
  );
});

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

export default router;
