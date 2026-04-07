import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, towersTable, insertTowerSchema } from "@workspace/db";
import { ListTowersQueryParams, GetTowerParams } from "@workspace/api-zod";

const router: IRouter = Router();

function serialize<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// GET /towers
router.get("/towers", async (req, res): Promise<void> => {
  try {
    const params = ListTowersQueryParams.safeParse(req.query);
    if (!params.success) {
      res.status(400).json({ error: "Invalid query params" });
      return;
    }

    const rows = params.data.stringId
      ? await db.select().from(towersTable).where(eq(towersTable.stringId, params.data.stringId))
      : await db.select().from(towersTable);

    res.json(serialize(rows));
  } catch (err) {
    console.error("GET /towers error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /towers
router.post("/towers", async (req, res): Promise<void> => {
  try {
    const body = insertTowerSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request body", details: body.error.issues });
      return;
    }

    const [row] = await db.insert(towersTable).values(body.data).returning();
    res.status(201).json(serialize(row));
  } catch (err) {
    console.error("POST /towers error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /towers/:id
router.get("/towers/:id", async (req, res): Promise<void> => {
  try {
    const params = GetTowerParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }

    const rows = await db.select().from(towersTable).where(eq(towersTable.id, params.data.id));
    if (rows.length === 0) {
      res.status(404).json({ error: "Tower not found" });
      return;
    }

    res.json(serialize(rows[0]));
  } catch (err) {
    console.error("GET /towers/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
