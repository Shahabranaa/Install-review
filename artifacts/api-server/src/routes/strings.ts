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

function parseId(raw: unknown): number | null {
  const n = parseInt(String(raw), 10);
  return isNaN(n) || n <= 0 ? null : n;
}

const UpdateStringBody = insertStringSchema.partial().omit({ locationId: true });

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

router.patch("/strings/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateStringBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }
  const [row] = await db
    .update(stringsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(stringsTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "String not found" });
    return;
  }
  res.json(GetStringResponse.parse(serialize(row)));
});

router.delete("/strings/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db
    .delete(stringsTable)
    .where(eq(stringsTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "String not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
