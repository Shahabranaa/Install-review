import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, locationsTable } from "@workspace/db";
import {
  ListLocationsQueryParams,
  ListLocationsResponse,
  CreateLocationBody,
  GetLocationParams,
  GetLocationResponse,
} from "@workspace/api-zod";
import { serialize } from "../lib/serialize";

const router: IRouter = Router();

router.get("/locations", async (req, res): Promise<void> => {
  const queryParams = ListLocationsQueryParams.safeParse(req.query);
  let locations;
  if (queryParams.success && queryParams.data.siteId) {
    locations = await db.select().from(locationsTable).where(eq(locationsTable.siteId, queryParams.data.siteId));
  } else {
    locations = await db.select().from(locationsTable);
  }
  res.json(ListLocationsResponse.parse(serialize(locations)));
});

router.post("/locations", async (req, res): Promise<void> => {
  const parsed = CreateLocationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [location] = await db.insert(locationsTable).values(parsed.data).returning();
  res.status(201).json(GetLocationResponse.parse(serialize(location)));
});

router.get("/locations/:id", async (req, res): Promise<void> => {
  const params = GetLocationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [location] = await db.select().from(locationsTable).where(eq(locationsTable.id, params.data.id));
  if (!location) {
    res.status(404).json({ error: "Location not found" });
    return;
  }
  res.json(GetLocationResponse.parse(serialize(location)));
});

export default router;
