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
import { driveRequest, isDriveConfigured } from "../lib/google-drive.js";
import { logger } from "../lib/logger.js";

const PHOTO_IMAGES_FOLDER_ID          = "1xWO8A2fXJ7ztpzpt-iqUNg8Xjq6vX7a0";
const PHOTO_IMAGES_2_STAMPED_FOLDER_ID = "18dMOuEuKFu_prnx9FW_FW1y2nFUebW6C";

const SCAN_FOLDER_IDS = [PHOTO_IMAGES_FOLDER_ID, PHOTO_IMAGES_2_STAMPED_FOLDER_ID];

const IMAGE_MIME_TYPES = [
  "image/jpeg", "image/png", "image/gif",
  "image/webp", "image/bmp", "image/heic", "image/tiff",
];

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

// POST /api/wasabi/scan-drive — admin only
// Scans Google Drive source folders for image files not yet tracked in sheet_photos.
// Uses 'FOLDER_ID' in ancestors for recursive listing, then cross-references with DB.
router.post("/wasabi/scan-drive", requireAdmin, async (_req, res): Promise<void> => {
  if (!isDriveConfigured()) {
    res.status(503).json({ error: "Google Drive is not configured" });
    return;
  }

  try {
    const imageMimeFilter = IMAGE_MIME_TYPES.map((m) => `mimeType = '${m}'`).join(" or ");

    // Collect all Drive file IDs from both source folders (recursive via 'in ancestors')
    const allDriveFiles: Array<{ id: string; name: string }> = [];

    for (const folderId of SCAN_FOLDER_IDS) {
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          q: `'${folderId}' in ancestors and (${imageMimeFilter}) and trashed = false`,
          fields: "files(id,name),nextPageToken",
          pageSize: "1000",
          includeItemsFromAllDrives: "true",
          supportsAllDrives: "true",
        });
        if (pageToken) params.set("pageToken", pageToken);

        const resp = await driveRequest("/files", params);
        if (!resp.ok) {
          const txt = await resp.text().catch(() => resp.statusText);
          logger.warn({ folderId, status: resp.status }, `Drive scan page error: ${txt}`);
          break;
        }
        const data = await resp.json() as { files: Array<{ id: string; name: string }>; nextPageToken?: string };
        allDriveFiles.push(...(data.files ?? []));
        pageToken = data.nextPageToken;
      } while (pageToken);
    }

    const total = allDriveFiles.length;
    logger.info({ total }, "Drive scan: total files found");

    if (total === 0) {
      res.json({ total: 0, newlyDiscovered: 0, alreadyKnown: 0 });
      return;
    }

    // Get all existing drive_file_id values from DB
    const existingRows = await db
      .select({ driveFileId: sheetPhotosTable.driveFileId })
      .from(sheetPhotosTable)
      .where(sql`${sheetPhotosTable.driveFileId} IS NOT NULL`);

    const existingIds = new Set(existingRows.map((r) => r.driveFileId as string));

    // Find files not yet in DB
    const newFiles = allDriveFiles.filter((f) => !existingIds.has(f.id));
    const newlyDiscovered = newFiles.length;

    if (newlyDiscovered > 0) {
      // Insert new rows — derive photo_id from file name (8-char hex) if pattern matches,
      // otherwise fall back to first 8 chars of the Drive file ID.
      const PHOTO_ID_RE = /([a-f0-9]{8})/i;
      const insertRows = newFiles.map((f) => {
        const match = PHOTO_ID_RE.exec(f.name);
        const photoId = match ? match[1].toLowerCase() : f.id.replace(/[^a-f0-9]/gi, "").slice(0, 8).toLowerCase();
        return { driveFileId: f.id, photoId: photoId || undefined };
      });

      // Batch insert in chunks of 100 to avoid query size limits
      const CHUNK = 100;
      let inserted = 0;
      for (let i = 0; i < insertRows.length; i += CHUNK) {
        const chunk = insertRows.slice(i, i + CHUNK);
        try {
          await db
            .insert(sheetPhotosTable)
            .values(chunk)
            .onConflictDoNothing();
          inserted += chunk.length;
        } catch (err) {
          logger.warn({ err, chunkIndex: i }, "Drive scan: insert chunk failed");
        }
      }
      logger.info({ inserted }, "Drive scan: inserted new photo rows");
    }

    res.json({ total, newlyDiscovered, alreadyKnown: total - newlyDiscovered });
  } catch (err: unknown) {
    logger.error({ err }, "Drive scan error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
