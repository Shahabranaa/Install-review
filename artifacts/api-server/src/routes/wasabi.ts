import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, count, sql } from "drizzle-orm";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { db, sheetPhotosTable } from "@workspace/db";
import {
  isWasabiConfigured,
  getWasabiClientAndCreds,
  uploadToWasabi,
  checkWasabiConnection,
} from "../lib/wasabi.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.accessLevel !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

// GET /api/wasabi/image/:photoId — proxy a Wasabi object through the server
// (bucket is private; this endpoint authenticates with stored credentials)
router.get("/wasabi/image/:photoId", async (req, res): Promise<void> => {
  const { photoId } = req.params;
  if (!photoId || !/^[a-f0-9]{6,12}$/i.test(photoId)) {
    res.status(400).json({ error: "Invalid photoId" }); return;
  }

  try {
    const rows = await db
      .select({ wasabiKey: sheetPhotosTable.wasabiKey })
      .from(sheetPhotosTable)
      .where(eq(sheetPhotosTable.photoId, photoId))
      .limit(1);

    const wasabiKey = rows[0]?.wasabiKey;
    if (!wasabiKey) {
      res.status(404).json({ error: "Photo not found or not yet migrated to Wasabi" }); return;
    }

    const ctx = await getWasabiClientAndCreds();
    if (!ctx) {
      res.status(503).json({ error: "Wasabi not configured" }); return;
    }

    const obj = await ctx.client.send(
      new GetObjectCommand({ Bucket: ctx.creds.bucket, Key: wasabiKey }),
    );

    const contentType = obj.ContentType ?? "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    if (obj.ContentLength) res.setHeader("Content-Length", obj.ContentLength);

    const body = obj.Body;
    if (!body || typeof (body as { pipe?: unknown }).pipe !== "function") {
      res.status(502).json({ error: "Empty response from Wasabi" }); return;
    }
    (body as NodeJS.ReadableStream).pipe(res);
  } catch (err: unknown) {
    const code = (err as { name?: string }).name;
    if (code === "NoSuchKey" || code === "NotFound") {
      res.status(404).json({ error: "Object not found in Wasabi" }); return;
    }
    logger.error({ err, photoId }, "Wasabi image proxy error");
    res.status(500).json({ error: "Failed to fetch image from Wasabi" });
  }
});

// GET /api/wasabi/status
router.get("/wasabi/status", async (_req, res): Promise<void> => {
  try {
    const configured = await isWasabiConfigured();

    const [
      migratedViaDriveRow,
      linkedRow,
      pendingDriveRow,
      pendingLinkRow,
      unmigrateableRow,
    ] = await Promise.all([
      db.select({ count: count() }).from(sheetPhotosTable)
        .where(sql`${sheetPhotosTable.driveFileId} IS NOT NULL AND ${sheetPhotosTable.wasabiKey} IS NOT NULL`),
      db.select({ count: count() }).from(sheetPhotosTable)
        .where(sql`${sheetPhotosTable.driveFileId} IS NULL AND ${sheetPhotosTable.wasabiKey} IS NOT NULL`),
      db.select({ count: count() }).from(sheetPhotosTable)
        .where(sql`${sheetPhotosTable.driveFileId} IS NOT NULL AND ${sheetPhotosTable.wasabiKey} IS NULL`),
      db.select({ count: count() }).from(sheetPhotosTable)
        .where(sql`${sheetPhotosTable.driveFileId} IS NULL AND ${sheetPhotosTable.wasabiKey} IS NULL AND ${sheetPhotosTable.photoUpload} IS NOT NULL AND ${sheetPhotosTable.photoUpload} != ''`),
      db.select({ count: count() }).from(sheetPhotosTable)
        .where(sql`${sheetPhotosTable.driveFileId} IS NULL AND (${sheetPhotosTable.photoUpload} IS NULL OR ${sheetPhotosTable.photoUpload} = '')`),
    ]);

    const migratedViaDrive = migratedViaDriveRow[0]?.count ?? 0;
    const linked           = linkedRow[0]?.count            ?? 0;
    const pendingDrive     = pendingDriveRow[0]?.count      ?? 0;
    const pendingLink      = pendingLinkRow[0]?.count       ?? 0;
    const unmigrateable    = unmigrateableRow[0]?.count     ?? 0;

    const migrated  = migratedViaDrive + linked;
    const remaining = pendingDrive + pendingLink;
    const total     = migrated + remaining;

    let connection: { ok: boolean; error?: string } = { ok: false, error: "Not configured" };
    if (configured) {
      connection = await checkWasabiConnection();
    }

    res.json({
      configured,
      connection,
      migrated,
      total,
      remaining,
      breakdown: { migratedViaDrive, linked, pendingDrive, pendingLink, unmigrateable },
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/wasabi/migrate — admin only
router.post("/wasabi/migrate", requireAdmin, async (req, res): Promise<void> => {
  if (!(await isWasabiConfigured())) {
    res.status(503).json({ error: "Wasabi credentials not configured" });
    return;
  }

  const batchSize = Math.min(Number(req.body?.batchSize ?? 20), 50);

  try {
    // ── Step 1: Link photos that already exist in storage via photo_upload paths ──
    const linkResult = await db.execute(
      sql`UPDATE sheet_photos
          SET wasabi_key = LTRIM(photo_upload, '/')
          WHERE drive_file_id IS NULL
            AND wasabi_key IS NULL
            AND photo_upload IS NOT NULL
            AND photo_upload != ''`,
    );
    const linked = Number((linkResult as unknown as { rowCount?: number }).rowCount ?? 0);
    if (linked > 0) {
      logger.info({ linked }, "Linked existing photos from photo_upload paths");
    }

    // ── Step 2: Download from Google Drive and upload to Wasabi ───────────────
    const batch = await db
      .select({
        id:           sheetPhotosTable.id,
        photoId:      sheetPhotosTable.photoId,
        driveFileId:  sheetPhotosTable.driveFileId,
        cableLink:    sheetPhotosTable.cableLink,
        locationLink: sheetPhotosTable.locationLink,
        phaseLink:    sheetPhotosTable.phaseLink,
      })
      .from(sheetPhotosTable)
      .where(
        sql`${sheetPhotosTable.driveFileId} IS NOT NULL
          AND ${sheetPhotosTable.wasabiKey} IS NULL`,
      )
      .limit(batchSize);

    let migrated = 0;
    let failed   = 0;

    if (batch.length > 0) {
      const CONCURRENCY = 3;
      for (let i = 0; i < batch.length; i += CONCURRENCY) {
        const chunk = batch.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          chunk.map(async (row) => {
            if (!row.driveFileId || !row.photoId) throw new Error("Missing driveFileId or photoId");
            const key = await uploadToWasabi(row.driveFileId, row.photoId, {
              cableLink:    row.cableLink,
              locationLink: row.locationLink,
              phaseLink:    row.phaseLink,
            });
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
    }

    // ── Remaining: anything still migratable but not yet done ─────────────────
    const [remainingRow] = await db
      .select({ count: count() })
      .from(sheetPhotosTable)
      .where(
        sql`${sheetPhotosTable.wasabiKey} IS NULL
          AND (
            ${sheetPhotosTable.driveFileId} IS NOT NULL
            OR (${sheetPhotosTable.photoUpload} IS NOT NULL AND ${sheetPhotosTable.photoUpload} != '')
          )`,
      );

    res.json({ linked, migrated, failed, remaining: remainingRow?.count ?? 0 });
  } catch (err: unknown) {
    logger.error({ err }, "Wasabi migrate error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
