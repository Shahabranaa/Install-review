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

// ─── Reference lookups ──────────────────────────────────────────────────────

router.get("/dpr/locations", async (_req, res): Promise<void> => {
  const rows = await db.select().from(dprLocationsTable);
  res.json(ListDprLocationsResponse.parse(serialize(naturalSort(rows))));
});

router.get("/dpr/teams", async (_req, res): Promise<void> => {
  const rows = await db.select().from(dprTeamsTable);
  res.json(ListDprTeamsResponse.parse(serialize(naturalSort(rows))));
});

router.get("/dpr/activity-types", async (_req, res): Promise<void> => {
  const rows = await db.select().from(dprActivityTypesTable).orderBy(dprActivityTypesTable.name);
  res.json(ListDprActivityTypesResponse.parse(serialize(rows)));
});

router.post("/dpr/activity-types", async (req, res): Promise<void> => {
  const parsed = CreateDprActivityTypeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(dprActivityTypesTable).values(parsed.data).returning();
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
  res.sendStatus(204);
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

router.post("/dpr/activity-groups", async (req, res): Promise<void> => {
  const parsed = CreateDprActivityGroupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(dprActivityGroupsTable).values(parsed.data).returning();
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
  res.sendStatus(204);
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

router.post("/dpr/activities", async (req, res): Promise<void> => {
  const parsed = CreateDprActivityBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(dprActivitiesTable).values(parsed.data).returning();
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
  res.sendStatus(204);
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

router.post("/dpr/jdr-codes", async (req, res): Promise<void> => {
  const parsed = CreateDprJdrCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(dprJdrCodesTable).values(parsed.data).returning();
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
  res.sendStatus(204);
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
    .values({ ...parsed.data, stage: "draft" })
    .returning();
  const withJoins = await withRelations(entry);
  res.status(201).json(GetDprTimesheetEntryResponse.parse(serialize(withJoins)));
});

router.get("/dpr/timesheet-entries/summary", async (_req, res): Promise<void> => {
  const rows = await db.select({ stage: dprTimesheetEntriesTable.stage }).from(dprTimesheetEntriesTable);
  const capturedCount = rows.filter((r) => r.stage === "draft").length;
  const clarifiedCount = rows.filter((r) => r.stage === "captured").length;
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
