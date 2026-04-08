// Google Drive integration via Replit Connectors SDK
import { Router, type IRouter } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { eq, and } from "drizzle-orm";
import {
  db,
  projectsTable,
  sitesTable,
  locationsTable,
  phasesTable,
  imagesTable,
} from "@workspace/db";

const router: IRouter = Router();

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  webViewLink?: string;
  webContentLink?: string;
  modifiedTime?: string;
  createdTime?: string;
  size?: string;
  parents?: string[];
  imageMediaMetadata?: {
    width?: number;
    height?: number;
  };
}

interface DriveFilesResponse {
  files: DriveFile[];
  nextPageToken?: string;
}

const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/heic",
  "image/tiff",
];

// GET /api/drive/folders - list folders in Drive
// With parentId: list subfolders of that parent
// Without parentId or with parentId="root": list all accessible folders (broad search)
router.get("/drive/folders", async (req, res): Promise<void> => {
  try {
    const connectors = new ReplitConnectors();
    const parentId = req.query.parentId as string | undefined;

    let q: string;
    if (parentId && parentId !== "root") {
      q = `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    } else {
      // Broad search — returns all folders the OAuth token can see
      q = `mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    }

    const params = new URLSearchParams({
      q,
      fields: "files(id,name,mimeType,modifiedTime,createdTime,parents,webViewLink)",
      orderBy: "name",
      pageSize: "200",
      includeItemsFromAllDrives: "true",
      supportsAllDrives: "true",
    });

    const response = await connectors.proxy("google-drive", `/drive/v3/files?${params}`, {
      method: "GET",
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(response.status).json({ error: `Drive API error: ${errText}` });
      return;
    }

    const data = await response.json() as DriveFilesResponse;
    res.json({ folders: data.files ?? [], nextPageToken: data.nextPageToken });
  } catch (err: unknown) {
    console.error("Drive folders error:", err);
    res.status(500).json({ error: "Failed to fetch Drive folders" });
  }
});

// GET /api/drive/files - list image files in a folder (or broadly)
router.get("/drive/files", async (req, res): Promise<void> => {
  try {
    const connectors = new ReplitConnectors();
    const folderId = req.query.folderId as string | undefined;
    const pageToken = req.query.pageToken as string | undefined;

    const imageMimeFilter = IMAGE_MIME_TYPES.map((m) => `mimeType = '${m}'`).join(" or ");

    let q: string;
    if (folderId && folderId !== "root") {
      q = `'${folderId}' in parents and (${imageMimeFilter}) and trashed = false`;
    } else {
      // Broad search — all images accessible via token
      q = `(${imageMimeFilter}) and trashed = false`;
    }

    const params = new URLSearchParams({
      q,
      fields: "files(id,name,mimeType,thumbnailLink,webViewLink,webContentLink,modifiedTime,createdTime,size,imageMediaMetadata),nextPageToken",
      orderBy: "modifiedTime desc",
      pageSize: "100",
      includeItemsFromAllDrives: "true",
      supportsAllDrives: "true",
    });

    if (pageToken) params.set("pageToken", pageToken);

    const response = await connectors.proxy("google-drive", `/drive/v3/files?${params}`, {
      method: "GET",
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(response.status).json({ error: `Drive API error: ${errText}` });
      return;
    }

    const data = await response.json() as DriveFilesResponse;
    res.json({ files: data.files ?? [], nextPageToken: data.nextPageToken });
  } catch (err: unknown) {
    console.error("Drive files error:", err);
    res.status(500).json({ error: "Failed to fetch Drive files" });
  }
});

// GET /api/drive/search - search files/folders by name
router.get("/drive/search", async (req, res): Promise<void> => {
  try {
    const connectors = new ReplitConnectors();
    const nameQuery = req.query.name as string;
    if (!nameQuery) {
      res.status(400).json({ error: "name query parameter required" });
      return;
    }

    const imageMimeFilter = IMAGE_MIME_TYPES.map((m) => `mimeType = '${m}'`).join(" or ");
    const q = `name contains '${nameQuery.replace(/'/g, "\\'")}' and ((${imageMimeFilter}) or mimeType = 'application/vnd.google-apps.folder') and trashed = false`;

    const params = new URLSearchParams({
      q,
      fields: "files(id,name,mimeType,thumbnailLink,webViewLink,modifiedTime,size,parents)",
      orderBy: "name",
      pageSize: "50",
      includeItemsFromAllDrives: "true",
      supportsAllDrives: "true",
    });

    const response = await connectors.proxy("google-drive", `/drive/v3/files?${params}`, {
      method: "GET",
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(response.status).json({ error: `Drive API error: ${errText}` });
      return;
    }

    const data = await response.json() as DriveFilesResponse;
    res.json({ results: data.files ?? [] });
  } catch (err: unknown) {
    console.error("Drive search error:", err);
    res.status(500).json({ error: "Failed to search Drive" });
  }
});

// GET /api/drive/folder-info/:folderId - get metadata for a specific folder
router.get("/drive/folder-info/:folderId", async (req, res): Promise<void> => {
  try {
    const connectors = new ReplitConnectors();
    const { folderId } = req.params;

    const params = new URLSearchParams({
      fields: "id,name,mimeType,modifiedTime,parents,webViewLink",
      supportsAllDrives: "true",
    });

    const response = await connectors.proxy(
      "google-drive",
      `/drive/v3/files/${folderId}?${params}`,
      { method: "GET" }
    );

    if (!response.ok) {
      const errText = await response.text();
      res.status(response.status).json({ error: `Drive API error: ${errText}` });
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (err: unknown) {
    console.error("Drive folder info error:", err);
    res.status(500).json({ error: "Failed to get folder info" });
  }
});

// GET /api/drive/image/:fileId - proxy/stream image from Drive
router.get("/drive/image/:fileId", async (req, res): Promise<void> => {
  try {
    const connectors = new ReplitConnectors();
    const { fileId } = req.params;

    const response = await connectors.proxy(
      "google-drive",
      `/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
      { method: "GET" }
    );

    if (!response.ok) {
      res.status(response.status).json({ error: "Failed to fetch image" });
      return;
    }

    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");

    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err: unknown) {
    console.error("Drive image error:", err);
    res.status(500).json({ error: "Failed to proxy image" });
  }
});

// POST /api/drive/sync - import all images from a Drive folder into the DB
router.post("/drive/sync", async (req, res): Promise<void> => {
  try {
    const connectors = new ReplitConnectors();
    const { folderId, folderName = "Drive Import" } = req.body as { folderId: string; folderName?: string };

    if (!folderId) {
      res.status(400).json({ error: "folderId is required" });
      return;
    }

    // ── 1. Find or create Project ────────────────────────────────────────────
    const DRIVE_PROJECT_NAME = "Google Drive Imports";
    let project = (await db.select().from(projectsTable)
      .where(eq(projectsTable.name, DRIVE_PROJECT_NAME))
      .limit(1))[0];

    if (!project) {
      [project] = await db.insert(projectsTable).values({
        name: DRIVE_PROJECT_NAME,
        description: "Images automatically synced from Google Drive.",
      }).returning();
    }

    // ── 2. Find or create Site (one per Drive folder) ─────────────────────────
    const siteName = folderName;
    let site = (await db.select().from(sitesTable)
      .where(and(eq(sitesTable.projectId, project.id), eq(sitesTable.name, siteName)))
      .limit(1))[0];

    if (!site) {
      [site] = await db.insert(sitesTable).values({
        projectId: project.id,
        name: siteName,
        address: `Drive Folder ID: ${folderId}`,
      }).returning();
    }

    // ── 3. Find or create Location ────────────────────────────────────────────
    let location = (await db.select().from(locationsTable)
      .where(and(eq(locationsTable.siteId, site.id), eq(locationsTable.name, siteName)))
      .limit(1))[0];

    if (!location) {
      [location] = await db.insert(locationsTable).values({
        siteId: site.id,
        name: siteName,
        type: "Drive Folder",
        notes: `Google Drive folder: ${folderId}`,
      }).returning();
    }

    // ── 4. Find or create Phase ───────────────────────────────────────────────
    let phase = (await db.select().from(phasesTable)
      .where(and(eq(phasesTable.locationId, location.id), eq(phasesTable.phaseType, "Drive Sync")))
      .limit(1))[0];

    if (!phase) {
      [phase] = await db.insert(phasesTable).values({
        locationId: location.id,
        phaseType: "Drive Sync",
        status: "needs_review",
        requiredImageCount: 0,
      }).returning();
    }

    // ── 5. Fetch all images from Drive folder ─────────────────────────────────
    const imageMimeTypes = [
      "image/jpeg", "image/png", "image/gif", "image/webp",
      "image/bmp", "image/heic", "image/tiff",
    ];
    const imageMimeFilter = imageMimeTypes.map((m) => `mimeType = '${m}'`).join(" or ");
    const q = `'${folderId}' in parents and (${imageMimeFilter}) and trashed = false`;

    const params = new URLSearchParams({
      q,
      fields: "files(id,name,mimeType,modifiedTime,size)",
      orderBy: "name",
      pageSize: "200",
      includeItemsFromAllDrives: "true",
      supportsAllDrives: "true",
    });

    const driveRes = await connectors.proxy("google-drive", `/drive/v3/files?${params}`, { method: "GET" });
    if (!driveRes.ok) {
      const err = await driveRes.text();
      res.status(driveRes.status).json({ error: `Drive API error: ${err}` });
      return;
    }
    const driveData = await driveRes.json() as { files: { id: string; name: string; mimeType: string; modifiedTime?: string; size?: string }[] };
    const driveFiles = driveData.files ?? [];

    // ── 6. Get existing driveFileIds to avoid duplicates ──────────────────────
    const existingRows = await db.select({ driveFileId: imagesTable.driveFileId })
      .from(imagesTable)
      .where(eq(imagesTable.phaseId, phase.id));
    const existingIds = new Set(existingRows.map((r) => r.driveFileId).filter(Boolean));

    // ── 7. Insert new images ──────────────────────────────────────────────────
    const toInsert = driveFiles.filter((f) => !existingIds.has(f.id));
    let synced = 0;

    for (const f of toInsert) {
      await db.insert(imagesTable).values({
        driveFileId: f.id,
        imageUrl: `/api/drive/image/${f.id}`,
        projectId: project.id,
        siteId: site.id,
        locationId: location.id,
        phaseId: phase.id,
        filename: f.name,
        uploadedBy: "Google Drive Sync",
        reviewStatus: "pending",
        uploadedAt: f.modifiedTime ? new Date(f.modifiedTime) : new Date(),
      });
      synced++;
    }

    // Update phase required count
    await db.update(phasesTable)
      .set({ requiredImageCount: existingIds.size + synced })
      .where(eq(phasesTable.id, phase.id));

    res.json({
      synced,
      skipped: driveFiles.length - synced,
      total: driveFiles.length,
      phaseId: phase.id,
      projectId: project.id,
      siteId: site.id,
      folderName,
    });
  } catch (err: unknown) {
    console.error("Drive sync error:", err);
    res.status(500).json({ error: "Failed to sync from Drive" });
  }
});

// GET /api/drive/sync-status - check how many images from a folder are already imported
router.get("/drive/sync-status", async (req, res): Promise<void> => {
  try {
    const { folderId } = req.query as { folderId?: string };
    if (!folderId) {
      res.status(400).json({ error: "folderId is required" });
      return;
    }
    // Count images already in DB for this folder (by checking driveFileId prefix pattern isn't practical,
    // so we check via phase in the "Google Drive Imports" project)
    const project = (await db.select().from(projectsTable)
      .where(eq(projectsTable.name, "Google Drive Imports"))
      .limit(1))[0];

    if (!project) {
      res.json({ imported: 0 });
      return;
    }

    // Find the site whose address contains the folderId
    const sites = await db.select().from(sitesTable)
      .where(and(eq(sitesTable.projectId, project.id)));
    const matchingSite = sites.find((s) => s.address?.includes(folderId));

    if (!matchingSite) {
      res.json({ imported: 0 });
      return;
    }

    const locations = await db.select().from(locationsTable)
      .where(eq(locationsTable.siteId, matchingSite.id));
    if (locations.length === 0) {
      res.json({ imported: 0 });
      return;
    }

    const phases = await db.select().from(phasesTable)
      .where(eq(phasesTable.locationId, locations[0].id));
    if (phases.length === 0) {
      res.json({ imported: 0 });
      return;
    }

    const images = await db.select({ id: imagesTable.id })
      .from(imagesTable)
      .where(eq(imagesTable.phaseId, phases[0].id));

    res.json({ imported: images.length, phaseId: phases[0].id });
  } catch (err: unknown) {
    console.error("Drive sync-status error:", err);
    res.status(500).json({ error: "Failed to check sync status" });
  }
});

// GET /api/drive/status - check if Drive is connected
router.get("/drive/status", async (_req, res): Promise<void> => {
  try {
    const connectors = new ReplitConnectors();
    const response = await connectors.proxy("google-drive", "/drive/v3/about?fields=user,storageQuota", {
      method: "GET",
    });

    if (!response.ok) {
      res.json({ connected: false });
      return;
    }

    const data = await response.json() as {
      user?: { displayName?: string; emailAddress?: string };
      storageQuota?: { usage?: string; limit?: string };
    };
    res.json({ connected: true, user: data.user, storageQuota: data.storageQuota });
  } catch {
    res.json({ connected: false });
  }
});

export default router;
