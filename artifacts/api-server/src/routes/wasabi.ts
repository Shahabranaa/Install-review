import { randomBytes } from "crypto";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, count, sql } from "drizzle-orm";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { db, pool, sheetPhotosTable } from "@workspace/db";
import {
  isWasabiConfigured,
  getWasabiClientAndCreds,
  uploadToWasabi,
  checkWasabiConnection,
} from "../lib/wasabi.js";
import { driveRequest, isDriveConfigured } from "../lib/google-drive.js";
import { PHOTO_SCAN_FOLDER_IDS } from "../lib/drive-constants.js";
import { logger } from "../lib/logger.js";

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
// Uses BFS with 'folderId' in parents at each level for recursive listing, then cross-references with DB.
router.post("/wasabi/scan-drive", requireAdmin, async (_req, res): Promise<void> => {
  if (!isDriveConfigured()) {
    res.status(503).json({ error: "Google Drive is not configured" });
    return;
  }

  try {
    const imageMimeFilter = IMAGE_MIME_TYPES.map((m) => `mimeType = '${m}'`).join(" or ");

    // BFS traversal — uses 'in parents' (supported) not 'in ancestors' (unsupported).
    // Queue entries: [folderId, depth]. visitedFolders prevents infinite loops.
    const allDriveFiles: Array<{ id: string; name: string }> = [];
    let partial = false;
    const MAX_DEPTH = 10;
    const visitedFolders = new Set<string>();
    const queue: Array<[string, number]> = PHOTO_SCAN_FOLDER_IDS.map((id) => [id, 0]);

    while (queue.length > 0) {
      const [folderId, depth] = queue.shift()!;
      if (visitedFolders.has(folderId) || depth > MAX_DEPTH) continue;
      visitedFolders.add(folderId);

      // ── List image files in this folder (paginated) ──────────────────────
      let filePageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          q: `'${folderId}' in parents and (${imageMimeFilter}) and trashed = false`,
          fields: "files(id,name),nextPageToken",
          pageSize: "1000",
          includeItemsFromAllDrives: "true",
          supportsAllDrives: "true",
        });
        if (filePageToken) params.set("pageToken", filePageToken);

        const resp = await driveRequest("/files", params);
        if (!resp.ok) {
          const txt = await resp.text().catch(() => resp.statusText);
          logger.warn({ folderId, depth, status: resp.status }, `Drive scan files error: ${txt}`);
          partial = true;
          break;
        }
        const data = await resp.json() as { files: Array<{ id: string; name: string }>; nextPageToken?: string };
        allDriveFiles.push(...(data.files ?? []));
        filePageToken = data.nextPageToken;
      } while (filePageToken);

      // ── List subfolders in this folder and enqueue them ──────────────────
      if (depth < MAX_DEPTH) {
        let folderPageToken: string | undefined;
        do {
          const params = new URLSearchParams({
            q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: "files(id,name),nextPageToken",
            pageSize: "1000",
            includeItemsFromAllDrives: "true",
            supportsAllDrives: "true",
          });
          if (folderPageToken) params.set("pageToken", folderPageToken);

          const resp = await driveRequest("/files", params);
          if (!resp.ok) {
            const txt = await resp.text().catch(() => resp.statusText);
            logger.warn({ folderId, depth, status: resp.status }, `Drive scan subfolders error: ${txt}`);
            partial = true;
            break;
          }
          const data = await resp.json() as { files: Array<{ id: string; name: string }>; nextPageToken?: string };
          for (const sub of (data.files ?? [])) {
            if (!visitedFolders.has(sub.id)) queue.push([sub.id, depth + 1]);
          }
          folderPageToken = data.nextPageToken;
        } while (folderPageToken);
      }
    }

    if (partial && allDriveFiles.length === 0) {
      res.status(502).json({ error: "Drive API request failed — no files were retrieved" });
      return;
    }

    logger.info({ visited: visitedFolders.size, found: allDriveFiles.length }, "Drive BFS scan complete");

    // Deduplicate by Drive file ID (possible if folder scopes overlap)
    const seenIds = new Set<string>();
    const uniqueDriveFiles = allDriveFiles.filter((f) => {
      if (seenIds.has(f.id)) return false;
      seenIds.add(f.id);
      return true;
    });

    const total = uniqueDriveFiles.length;
    logger.info({ total }, "Drive scan: total unique files found");

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

    // Files not yet tracked in DB by drive_file_id
    const newFiles = uniqueDriveFiles.filter((f) => !existingIds.has(f.id));
    const alreadyKnown = total - newFiles.length;

    let actuallyInserted = 0;

    if (newFiles.length > 0) {
      // Derive photo_id: match exactly 8 hex chars at the END of the filename stem,
      // preceded by a non-hex char (separator) or the start of string.
      // Examples: "IMG_abc12345.jpg" → "abc12345", "abc12345.jpg" → "abc12345"
      //           "photo_abc12345_v2.jpg" → no match → random fallback
      const HEX_SUFFIX_RE = /(?:^|[^a-f0-9])([a-f0-9]{8})$/i;
      const insertRows = newFiles.map((f) => {
        const stem = f.name.replace(/\.[^.]+$/, "");
        const match = HEX_SUFFIX_RE.exec(stem);
        const photoId = match ? match[1].toLowerCase() : randomBytes(4).toString("hex");
        return { driveFileId: f.id, photoId };
      });

      // Batch insert in chunks of 100; use .returning() to count actual rows inserted
      // (onConflictDoNothing silently skips photo_id collisions so we cannot trust chunk.length)
      const CHUNK = 100;
      for (let i = 0; i < insertRows.length; i += CHUNK) {
        const chunk = insertRows.slice(i, i + CHUNK);
        try {
          const returned = await db
            .insert(sheetPhotosTable)
            .values(chunk)
            .onConflictDoNothing()
            .returning({ id: sheetPhotosTable.id });
          actuallyInserted += returned.length;
        } catch (err) {
          logger.warn({ err, chunkIndex: i }, "Drive scan: insert chunk failed");
        }
      }
      logger.info({ actuallyInserted }, "Drive scan: inserted new photo rows");
    }

    const skippedConflicts = newFiles.length - actuallyInserted;
    res.json({ total, newlyDiscovered: actuallyInserted, alreadyKnown, skippedConflicts, partial });
  } catch (err: unknown) {
    logger.error({ err }, "Drive scan error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/wasabi/link-mirror — admin only
// Populates sheet_photos.wasabi_key by joining with wasabi_mirror_tasks on drive_file_id.
// Non-destructive: only updates rows where wasabi_key IS NULL.
router.post("/wasabi/link-mirror", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const result = await pool.query(`
      UPDATE sheet_photos
      SET wasabi_key = wmt.wasabi_key
      FROM wasabi_mirror_tasks wmt
      WHERE sheet_photos.drive_file_id = wmt.drive_file_id
        AND wmt.status = 'done'
        AND sheet_photos.wasabi_key IS NULL
    `);

    const linked = result.rowCount ?? 0;
    logger.info({ linked }, "sheet_photos linked to Wasabi mirror keys");
    res.json({ linked });
  } catch (err: unknown) {
    logger.error({ err }, "link-mirror failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Link failed" });
  }
});

// DELETE /api/wasabi/reset-migration — admin only
// Clears wasabi_key for all sheet_photos rows so migration status resets to 0.
// Use when files have been manually deleted from Wasabi and the DB state is stale.
router.delete("/wasabi/reset-migration", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const result = await db
      .update(sheetPhotosTable)
      .set({ wasabiKey: null })
      .where(sql`wasabi_key IS NOT NULL`)
      .returning({ id: sheetPhotosTable.id });

    logger.info({ reset: result.length }, "Wasabi migration state reset");
    res.json({ reset: result.length });
  } catch (err: unknown) {
    logger.error({ err }, "reset-migration failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Reset failed" });
  }
});

export default router;
