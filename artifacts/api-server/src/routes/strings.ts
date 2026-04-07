import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, stringsTable, insertStringSchema } from "@workspace/db";
import { ListStringsQueryParams, GetStringParams } from "@workspace/api-zod";
import { z } from "zod";

const router: IRouter = Router();

function serialize<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// GET /strings
router.get("/strings", async (req, res): Promise<void> => {
  try {
    const params = ListStringsQueryParams.safeParse(req.query);
    if (!params.success) {
      res.status(400).json({ error: "Invalid query params" });
      return;
    }

    const rows = params.data.locationId
      ? await db.select().from(stringsTable).where(eq(stringsTable.locationId, params.data.locationId))
      : await db.select().from(stringsTable);

    res.json(serialize(rows));
  } catch (err) {
    console.error("GET /strings error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /strings
router.post("/strings", async (req, res): Promise<void> => {
  try {
    const body = insertStringSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request body", details: body.error.issues });
      return;
    }

    const [row] = await db.insert(stringsTable).values(body.data).returning();
    res.status(201).json(serialize(row));
  } catch (err) {
    console.error("POST /strings error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /strings/:id
router.get("/strings/:id", async (req, res): Promise<void> => {
  try {
    const params = GetStringParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }

    const rows = await db.select().from(stringsTable).where(eq(stringsTable.id, params.data.id));
    if (rows.length === 0) {
      res.status(404).json({ error: "String not found" });
      return;
    }

    res.json(serialize(rows[0]));
  } catch (err) {
    console.error("GET /strings/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
