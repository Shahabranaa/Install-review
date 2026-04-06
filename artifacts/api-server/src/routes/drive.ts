// Google Drive integration via Replit Connectors SDK
import { Router, type IRouter } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";

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

    const data: DriveFilesResponse = await response.json();
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

    const data: DriveFilesResponse = await response.json();
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

    const data: DriveFilesResponse = await response.json();
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
