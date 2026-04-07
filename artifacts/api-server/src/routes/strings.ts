import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, stringsTable, insertStringSchema } from "@workspace/db";
import {
  ListStringsQueryParams,
  ListStringsResponse,
  GetStringParams,
  GetStringResponse,
} from "@workspace/api-zod";
import { serialize } from "../lib/serialize";

const router: IRouter = Router();

router.get("/strings", async (req, res): Promise<void> => {
  const params = ListStringsQueryParams.safeParse(req.query);
  const rows = params.success && params.data.locationId
    ? await db.select().from(stringsTable).where(eq(stringsTable.locationId, params.data.locationId))
    : await db.select().from(stringsTable);
  res.json(ListStringsResponse.parse(serialize(rows)));
});

router.post("/strings", async (req, res): Promise<void> => {
  const parsed = insertStringSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(stringsTable).values(parsed.data).returning();
  res.status(201).json(GetStringResponse.parse(serialize(row)));
});

router.get("/strings/:id", async (req, res): Promise<void> => {
  const params = GetStringParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.select().from(stringsTable).where(eq(stringsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "String not found" });
    return;
  }
  res.json(GetStringResponse.parse(serialize(row)));
});

export default router;
