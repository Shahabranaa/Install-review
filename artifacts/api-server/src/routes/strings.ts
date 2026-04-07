import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, stringsTable, towersTable } from "@workspace/db";
import {
  ListStringsQueryParams,
  GetStringParams,
  ListTowersQueryParams,
  GetTowerParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serialize<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

router.get("/strings", async (req, res): Promise<void> => {
  try {
    const params = ListStringsQueryParams.safeParse(req.query);
    if (!params.success) {
      res.status(400).json({ error: "Invalid query params" });
      return;
    }

    let rows;
    if (params.data.locationId) {
      rows = await db
        .select()
        .from(stringsTable)
        .where(eq(stringsTable.locationId, params.data.locationId));
    } else {
      rows = await db.select().from(stringsTable);
    }

    res.json(serialize(rows));
  } catch (err) {
    console.error("GET /strings error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/strings/:id", async (req, res): Promise<void> => {
  try {
    const params = GetStringParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }

    const rows = await db
      .select()
      .from(stringsTable)
      .where(eq(stringsTable.id, params.data.id));

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

router.get("/towers", async (req, res): Promise<void> => {
  try {
    const params = ListTowersQueryParams.safeParse(req.query);
    if (!params.success) {
      res.status(400).json({ error: "Invalid query params" });
      return;
    }

    let rows;
    if (params.data.stringId) {
      rows = await db
        .select()
        .from(towersTable)
        .where(eq(towersTable.stringId, params.data.stringId));
    } else {
      rows = await db.select().from(towersTable);
    }

    res.json(serialize(rows));
  } catch (err) {
    console.error("GET /towers error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/towers/:id", async (req, res): Promise<void> => {
  try {
    const params = GetTowerParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }

    const rows = await db
      .select()
      .from(towersTable)
      .where(eq(towersTable.id, params.data.id));

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
