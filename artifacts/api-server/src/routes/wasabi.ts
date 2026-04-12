import { Router, type IRouter } from "express";
import { eq, isNull, isNotNull, count, sql } from "drizzle-orm";
import { db, sheetPhotosTable } from "@workspace/db";
import {
  isWasabiConfigured,
  uploadToWasabi,
  wasabiPublicUrl,
  checkWasabiConnection,
} from "../lib/wasabi.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

function requireAdmin(req: Parameters<Parameters<typeof router.use>[0]>[0], res: Parameters<Parameters<typeof router.use>[0]>[1], next: Parameters<Parameters<typeof router.use>[0]>[2]): void {
  if (req.session?.accessLevel !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

// GET /api/wasabi/status
router.get("/wasabi/status", async (_req, res): Promise<void> => {
  try {
    const configured = isWasabiConfigured();

    const [totalRow, migratedRow] = await Promise.all([
      db.select({ count: count() }).from(sheetPhotosTable),
      db.select({ count: count() }).from(sheetPhotosTable).where(isNotNull(sheetPhotosTable.wasabiKey)),
    ]);

    const total    = totalRow[0]?.count    ?? 0;
    const migrated = migratedRow[0]?.count ?? 0;

    let connection: { ok: boolean; error?: string } = { ok: false, error: "Not configured" };
    if (configured) {
      connection = await checkWasabiConnection();
    }

    res.json({
      configured,
      connection,
      migrated,
      total,
      remaining: total - migrated,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/wasabi/migrate — admin only
router.post("/wasabi/migrate", requireAdmin, async (req, res): Promise<void> => {
  if (!isWasabiConfigured()) {
    res.status(503).json({ error: "Wasabi credentials not configured" });
    return;
  }

  const batchSize = Math.min(Number(req.body?.batchSize ?? 20), 50);

  try {
    // Select next batch: has drive_file_id, not yet migrated
    const batch = await db
      .select({
        id:          sheetPhotosTable.id,
        photoId:     sheetPhotosTable.photoId,
        driveFileId: sheetPhotosTable.driveFileId,
      })
      .from(sheetPhotosTable)
      .where(
        sql`${sheetPhotosTable.driveFileId} IS NOT NULL
          AND ${sheetPhotosTable.wasabiKey} IS NULL`,
      )
      .limit(batchSize);

    if (batch.length === 0) {
      // Check if anything remains without a drive_file_id
      const [remainingRow] = await db
        .select({ count: count() })
        .from(sheetPhotosTable)
        .where(isNull(sheetPhotosTable.wasabiKey));
      res.json({ migrated: 0, failed: 0, remaining: remainingRow?.count ?? 0 });
      return;
    }

    let migrated = 0;
    let failed   = 0;

    // Process with concurrency 3 via manual batching
    const CONCURRENCY = 3;
    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      const chunk = batch.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map(async (row) => {
          if (!row.driveFileId || !row.photoId) throw new Error("Missing driveFileId or photoId");
          const key = await uploadToWasabi(row.driveFileId, row.photoId);
          await db
            .update(sheetPhotosTable)
            .set({ wasabiKey: key })
            .where(eq(sheetPhotosTable.id, row.id));
          logger.info({ photoId: row.photoId, key }, "Migrated photo to Wasabi");
        }),
      );
      for (const r of results) {
        if (r.status === "fulfilled") migrated++;
        else {
          failed++;
          logger.warn({ reason: r.reason }, "Failed to migrate photo to Wasabi");
        }
      }
    }

    const [remainingRow] = await db
      .select({ count: count() })
      .from(sheetPhotosTable)
      .where(isNull(sheetPhotosTable.wasabiKey));

    res.json({ migrated, failed, remaining: remainingRow?.count ?? 0 });
  } catch (err: unknown) {
    logger.error({ err }, "Wasabi migrate error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
