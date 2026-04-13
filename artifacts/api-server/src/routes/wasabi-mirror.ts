import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, sql } from "drizzle-orm";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { db, wasabiMirrorTasksTable } from "@workspace/db";
import { getWasabiClientAndCreds } from "../lib/wasabi.js";
import { driveRequest, isDriveConfigured } from "../lib/google-drive.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.accessLevel !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

const FOLDER_MIME = "application/vnd.google-apps.folder";

const MAX_DEPTH = 15;
const PAGE_SIZE = 200;

/** Normalises a user-supplied prefix: ensure it ends with "/" if non-empty. */
function normalisePrefix(raw: string): string {
  const p = raw.trim();
  if (!p) return "";
  return p.endsWith("/") ? p : `${p}/`;
}

/** Strips characters unsafe for S3 keys. */
function sanitizeSegment(s: string): string {
  return s.trim().replace(/\\/g, "/");
}

// GET /api/wasabi/mirror/status
router.get("/wasabi/mirror/status", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        status:    wasabiMirrorTasksTable.status,
        cnt:       sql<number>`cast(count(*) as int)`,
        rootFolder: sql<string>`min(${wasabiMirrorTasksTable.rootFolderId})`,
      })
      .from(wasabiMirrorTasksTable)
      .groupBy(wasabiMirrorTasksTable.status);

    let total = 0, pending = 0, done = 0, failed = 0;
    let rootFolderId = "";
    for (const r of rows) {
      total += r.cnt;
      if (r.status === "pending") pending = r.cnt;
      if (r.status === "done")    done    = r.cnt;
      if (r.status === "failed")  failed  = r.cnt;
      if (r.rootFolder) rootFolderId = r.rootFolder;
    }

    res.json({ total, pending, done, failed, rootFolderId });
  } catch (err) {
    logger.error({ err }, "mirror/status failed");
    res.status(500).json({ error: "Failed to fetch mirror status" });
  }
});

// POST /api/wasabi/mirror/scan
// Body: { folderId: string, prefix?: string }
router.post("/wasabi/mirror/scan", requireAdmin, async (req, res): Promise<void> => {
  if (!isDriveConfigured()) {
    res.status(503).json({ error: "Google Drive is not configured" });
    return;
  }

  const folderId = (req.body?.folderId as string | undefined)?.trim();
  const prefix   = normalisePrefix((req.body?.prefix as string | undefined) ?? "");

  if (!folderId) {
    res.status(400).json({ error: "folderId is required" });
    return;
  }

  try {
    // BFS: queue entries = [driveId, relativePathSoFar, depth]
    const queue: Array<[string, string, number]> = [[folderId, "", 0]];
    const visitedFolders = new Set<string>([folderId]);
    const files: Array<{ driveFileId: string; fileName: string; drivePath: string }> = [];

    while (queue.length > 0) {
      const entry = queue.shift()!;
      const [currentId, currentPath, depth] = entry;

      if (depth > MAX_DEPTH) continue;

      // List image files in this folder
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          q:              `'${currentId}' in parents and mimeType != '${FOLDER_MIME}' and trashed = false`,
          fields:         "nextPageToken, files(id, name, mimeType)",
          pageSize:       String(PAGE_SIZE),
          supportsAllDrives: "true",
          includeItemsFromAllDrives: "true",
        });
        if (pageToken) params.set("pageToken", pageToken);

        const resp = await driveRequest("/files", params);
        if (!resp.ok) {
          logger.warn({ status: resp.status }, "Drive files list failed, skipping folder");
          break;
        }
        const data = await resp.json() as { nextPageToken?: string; files?: Array<{ id: string; name: string; mimeType: string }> };

        for (const f of data.files ?? []) {
          const filePath = currentPath ? `${currentPath}/${sanitizeSegment(f.name)}` : sanitizeSegment(f.name);
          files.push({ driveFileId: f.id, fileName: f.name, drivePath: `${prefix}${filePath}` });
        }
        pageToken = data.nextPageToken;
      } while (pageToken);

      // List subfolders
      let folderPageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          q:              `'${currentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
          fields:         "nextPageToken, files(id, name)",
          pageSize:       String(PAGE_SIZE),
          supportsAllDrives: "true",
          includeItemsFromAllDrives: "true",
        });
        if (folderPageToken) params.set("pageToken", folderPageToken);

        const resp = await driveRequest("/files", params);
        if (!resp.ok) break;
        const data = await resp.json() as { nextPageToken?: string; files?: Array<{ id: string; name: string }> };

        for (const f of data.files ?? []) {
          if (visitedFolders.has(f.id)) continue;
          visitedFolders.add(f.id);
          const folderPath = currentPath ? `${currentPath}/${sanitizeSegment(f.name)}` : sanitizeSegment(f.name);
          queue.push([f.id, folderPath, depth + 1]);
        }
        folderPageToken = data.nextPageToken;
      } while (folderPageToken);
    }

    logger.info({ visited: visitedFolders.size, found: files.length }, "mirror/scan complete");

    // Insert discovered files; skip duplicates
    let inserted = 0;
    let alreadyKnown = 0;

    for (const f of files) {
      const result = await db
        .insert(wasabiMirrorTasksTable)
        .values({
          rootFolderId: folderId,
          driveFileId:  f.driveFileId,
          fileName:     f.fileName,
          drivePath:    f.drivePath,
          status:       "pending",
        })
        .onConflictDoNothing()
        .returning({ id: wasabiMirrorTasksTable.id });

      if (result.length > 0) {
        inserted++;
      } else {
        alreadyKnown++;
      }
    }

    res.json({ scanned: files.length, inserted, alreadyKnown });
  } catch (err) {
    logger.error({ err }, "mirror/scan failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Scan failed" });
  }
});

// POST /api/wasabi/mirror/batch
// Body: { batchSize?: number }
router.post("/wasabi/mirror/batch", requireAdmin, async (req, res): Promise<void> => {
  const batchSize = Math.min(Number(req.body?.batchSize) || 10, 20);

  const ctx = await getWasabiClientAndCreds();
  if (!ctx) {
    res.status(503).json({ error: "Wasabi is not configured" });
    return;
  }

  let uploaded = 0;
  let failed   = 0;

  try {
    const rows = await db
      .select()
      .from(wasabiMirrorTasksTable)
      .where(eq(wasabiMirrorTasksTable.status, "pending"))
      .limit(batchSize);

    for (const row of rows) {
      try {
        const driveResp = await driveRequest(
          `/files/${row.driveFileId}`,
          new URLSearchParams({ alt: "media", supportsAllDrives: "true" }),
        );

        if (!driveResp.ok) {
          throw new Error(`Drive returned ${driveResp.status} for fileId ${row.driveFileId}`);
        }

        const contentType = driveResp.headers.get("content-type") ?? "image/jpeg";
        const body        = Buffer.from(await driveResp.arrayBuffer());

        const wasabiKey = row.drivePath;

        await ctx.client.send(
          new PutObjectCommand({
            Bucket:      ctx.creds.bucket,
            Key:         wasabiKey,
            Body:        body,
            ContentType: contentType,
          }),
        );

        await db
          .update(wasabiMirrorTasksTable)
          .set({ status: "done", wasabiKey })
          .where(eq(wasabiMirrorTasksTable.id, row.id));

        uploaded++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error({ err, driveFileId: row.driveFileId }, "mirror/batch file failed");
        await db
          .update(wasabiMirrorTasksTable)
          .set({ status: "failed", error: errMsg })
          .where(eq(wasabiMirrorTasksTable.id, row.id));
        failed++;
      }
    }

    const remaining = await db
      .select({ cnt: sql<number>`cast(count(*) as int)` })
      .from(wasabiMirrorTasksTable)
      .where(eq(wasabiMirrorTasksTable.status, "pending"));

    res.json({ uploaded, failed, remaining: remaining[0]?.cnt ?? 0 });
  } catch (err) {
    logger.error({ err }, "mirror/batch failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Batch failed" });
  }
});

// DELETE /api/wasabi/mirror/reset
router.delete("/wasabi/mirror/reset", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const result = await db
      .delete(wasabiMirrorTasksTable)
      .returning({ id: wasabiMirrorTasksTable.id });
    res.json({ deleted: result.length });
  } catch (err) {
    logger.error({ err }, "mirror/reset failed");
    res.status(500).json({ error: "Reset failed" });
  }
});

export default router;
