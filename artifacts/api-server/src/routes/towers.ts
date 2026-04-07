import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, towersTable, stringsTable, insertTowerSchema } from "@workspace/db";
import {
  ListTowersQueryParams,
  ListTowersResponse,
  GetTowerParams,
  GetTowerResponse,
} from "@workspace/api-zod";
import { serialize } from "../lib/serialize";

const router: IRouter = Router();

router.get("/towers", async (req, res): Promise<void> => {
  const params = ListTowersQueryParams.safeParse(req.query);
  let rows;

  if (params.success && params.data.stringId) {
    rows = await db.select().from(towersTable).where(eq(towersTable.stringId, params.data.stringId));
  } else if (params.success && params.data.locationId) {
    // Filter towers by OSP location: join through strings
    const strings = await db.select().from(stringsTable).where(eq(stringsTable.locationId, params.data.locationId));
    const stringIds = strings.map((s) => s.id);
    if (stringIds.length === 0) {
      res.json([]);
      return;
    }
    rows = await db.select().from(towersTable).where(inArray(towersTable.stringId, stringIds));
  } else {
    rows = await db.select().from(towersTable);
  }

  res.json(ListTowersResponse.parse(serialize(rows)));
});

router.post("/towers", async (req, res): Promise<void> => {
  const parsed = insertTowerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(towersTable).values(parsed.data).returning();
  res.status(201).json(GetTowerResponse.parse(serialize(row)));
});

router.get("/towers/:id", async (req, res): Promise<void> => {
  const params = GetTowerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.select().from(towersTable).where(eq(towersTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Tower not found" });
    return;
  }
  res.json(GetTowerResponse.parse(serialize(row)));
});

export default router;
