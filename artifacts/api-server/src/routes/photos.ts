import { Router, type IRouter } from "express";
import { sheetsRequest, isSheetsConfigured, SPREADSHEET_ID } from "../lib/google-sheets";
import { driveRequest } from "../lib/google-drive";

const router: IRouter = Router();

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PhotoRecord {
  photoId: string;
  label: string;
  status: string;
  approval: string;
  type: "photo" | "signature" | "drawing" | "unknown";
  filePath: string;
  tower: string;
  string: string;
  phase: string;
  phaseOrder: string;
  reqImgType: string;
  reqImgOrder: string;
  createdAt: string;
  createdBy: string;
  comments: string;
  response: string;
}

// ─── Known folder IDs ────────────────────────────────────────────────────────

// Photo_Images (signatures / basic uploads)
const PHOTO_IMAGES_FOLDER_ID = "1xWO8A2fXJ7ztpzpt-iqUNg8Xjq6vX7a0";
// Photo_Images_2_Stamped_v2 (stamped photo uploads, organised by OSP/Tower/String)
const PHOTO_IMAGES_2_STAMPED_FOLDER_ID = "18dMOuEuKFu_prnx9FW_FW1y2nFUebW6C";

// ─── In-memory caches ────────────────────────────────────────────────────────

// Sheet data cache (5 minute TTL)
let sheetCache: { data: PhotoRecord[]; ts: number } | null = null;
const SHEET_TTL_MS = 5 * 60 * 1000;

// Drive file-id cache: photoId → fileId (permanent)
const fileIdCache = new Map<string, string | null>();

// Folder ID cache: "parentId/name" → childFolderId
const folderIdCache = new Map<string, string | null>();

// ─── Drive helpers ────────────────────────────────────────────────────────────

async function findChildFolder(parentId: string, name: string): Promise<string | null> {
  const key = `${parentId}/${name}`;
  if (folderIdCache.has(key)) return folderIdCache.get(key)!;

  try {
    const safeName = name.replace(/'/g, "\\'");
    const params = new URLSearchParams({
      q: `'${parentId}' in parents and name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id,name)",
      pageSize: "1",
      includeItemsFromAllDrives: "true",
      supportsAllDrives: "true",
    });
    const resp = await driveRequest("/files", params);
    if (!resp.ok) { folderIdCache.set(key, null); return null; }
    const data = await resp.json() as { files?: { id: string }[] };
    const id = data.files?.[0]?.id ?? null;
    folderIdCache.set(key, id);
    return id;
  } catch {
    folderIdCache.set(key, null);
    return null;
  }
}

async function searchFileInFolder(folderId: string, photoId: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and name contains '${photoId}' and trashed = false`,
      fields: "files(id,name)",
      pageSize: "1",
      includeItemsFromAllDrives: "true",
      supportsAllDrives: "true",
    });
    const resp = await driveRequest("/files", params);
    if (!resp.ok) return null;
    const data = await resp.json() as { files?: { id: string }[] };
    return data.files?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve a PhotoRecord's Drive file ID using path-aware folder navigation.
 * Signature/drawing files: search in Photo_Images/
 * Photo_Upload files: parse path, navigate OSP→Tower→String subfolders
 */
async function resolveFileId(photo: PhotoRecord): Promise<string | null> {
  const { photoId, type, filePath } = photo;
  if (!photoId) return null;

  if (fileIdCache.has(photoId)) return fileIdCache.get(photoId)!;

  let fileId: string | null = null;

  if (type === "signature" || type === "drawing") {
    // Files live in Photo_Images/
    fileId = await searchFileInFolder(PHOTO_IMAGES_FOLDER_ID, photoId);
  } else if (type === "photo" && filePath) {
    // Path format: /Photo_Images_2_Stamped_v2/{OSP}/{Tower}/{String}/filename
    // or: Photo_Images_2_Stamped_v2/{OSP}/{Tower}/{String}/filename
    const parts = filePath.replace(/^\//, "").split("/");
    // parts[0] = Photo_Images_2_Stamped_v2, parts[1] = OSP, parts[2] = Tower, parts[3] = String
    if (parts.length >= 4) {
      const ospName    = parts[1];
      const towerName  = parts[2];
      const stringName = parts[3];

      const ospId    = await findChildFolder(PHOTO_IMAGES_2_STAMPED_FOLDER_ID, ospName);
      if (ospId) {
        const towerId = await findChildFolder(ospId, towerName);
        if (towerId) {
          const stringId = await findChildFolder(towerId, stringName);
          if (stringId) {
            fileId = await searchFileInFolder(stringId, photoId);
          }
        }
      }
    }

    // Fallback: try Photo_Images
    if (!fileId) {
      fileId = await searchFileInFolder(PHOTO_IMAGES_FOLDER_ID, photoId);
    }
  } else if (filePath) {
    // Unknown type: try Photo_Images as fallback
    fileId = await searchFileInFolder(PHOTO_IMAGES_FOLDER_ID, photoId);
  }

  fileIdCache.set(photoId, fileId);
  return fileId;
}

// ─── Spreadsheet helpers ─────────────────────────────────────────────────────

async function fetchSheetPhotos(): Promise<PhotoRecord[]> {
  const now = Date.now();
  if (sheetCache && now - sheetCache.ts < SHEET_TTL_MS) return sheetCache.data;

  const response = await sheetsRequest(`/${SPREADSHEET_ID}/values/Photo!A1:AQ2000`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sheets API ${response.status}: ${text}`);
  }

  const data = await response.json() as { values?: string[][] };
  const rows = data.values ?? [];
  if (rows.length === 0) return [];

  const headers = rows[0];
  const idx = (name: string) => headers.indexOf(name);

  const H = {
    photoUpload:  idx("Photo_Upload"),
    sigCapture:   idx("Signature_Capture"),
    drawMarkup:   idx("Drawing_Markup"),
    cableLink:    idx("Photo_Cable_Link"),
    locationLink: idx("Photo_Location_Link"),
    phaseLink:    idx("Photo_Installation_Phase_Link"),
    phaseOrder:   idx("Photo_Installation_Phase_Order"),
    reqImgType:   idx("Req_Img_Type"),
    reqImgOrder:  idx("Req_Img_Order"),
    label:        idx("Photo_Label"),
    status:       idx("Photo_Status"),
    approval:     idx("Photo_Approval"),
    response:     idx("Photo_Response"),
    comments:     idx("Photo_Comments"),
    photoId:      idx("PhotoID"),
    createdAt:    idx("CreationDateTime"),
    createdBy:    idx("CreationUser"),
  };

  const photos: PhotoRecord[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const photoId = r[H.photoId] ?? "";
    const upload  = r[H.photoUpload] ?? "";
    const sig     = r[H.sigCapture]  ?? "";
    const draw    = r[H.drawMarkup]  ?? "";
    const tower   = r[H.locationLink] ?? "";
    const cable   = r[H.cableLink]   ?? "";

    if (!photoId && !upload && !sig && !draw) continue;
    if (!tower && !cable) continue;

    let filePath = "";
    let type: PhotoRecord["type"] = "unknown";

    if (upload)     { filePath = upload; type = "photo";     }
    else if (sig)   { filePath = sig;    type = "signature"; }
    else if (draw)  { filePath = draw;   type = "drawing";   }

    photos.push({
      photoId,
      label:       r[H.label]      ?? "",
      status:      r[H.status]     ?? "",
      approval:    r[H.approval]   ?? "",
      type,
      filePath,
      tower,
      string:      cable,
      phase:       r[H.phaseLink]  ?? "",
      phaseOrder:  r[H.phaseOrder] ?? "",
      reqImgType:  r[H.reqImgType] ?? "",
      reqImgOrder: r[H.reqImgOrder]?? "",
      createdAt:   r[H.createdAt]  ?? "",
      createdBy:   r[H.createdBy]  ?? "",
      comments:    r[H.comments]   ?? "",
      response:    r[H.response]   ?? "",
    });
  }

  sheetCache = { data: photos, ts: now };
  return photos;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/photos/sheet - all photo records from the spreadsheet
router.get("/photos/sheet", async (req, res): Promise<void> => {
  if (!isSheetsConfigured()) {
    res.status(503).json({ error: "Google Sheets not configured" });
    return;
  }

  try {
    let photos = await fetchSheetPhotos();

    const tower  = req.query.tower  as string | undefined;
    const string = req.query.string as string | undefined;
    const phase  = req.query.phase  as string | undefined;

    if (tower)  photos = photos.filter(p => p.tower === tower);
    if (string) photos = photos.filter(p => p.string === string);
    if (phase)  photos = photos.filter(p => p.phase === phase);

    const allPhotos = await fetchSheetPhotos();
    const towers  = [...new Set(allPhotos.map(p => p.tower).filter(Boolean))].sort();
    const strings = [...new Set(allPhotos.map(p => p.string).filter(Boolean))].sort();
    const phases  = [...new Set(allPhotos.map(p => p.phase).filter(Boolean))].sort();

    res.json({ photos, meta: { total: photos.length, towers, strings, phases } });
  } catch (err: unknown) {
    console.error("Photos sheet error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/photos/resolve/:photoId - resolve a photoId to a Drive file ID
router.get("/photos/resolve/:photoId", async (req, res): Promise<void> => {
  if (!isSheetsConfigured()) {
    res.status(503).json({ error: "Drive not configured" });
    return;
  }

  try {
    const { photoId } = req.params;
    if (!photoId || !/^[a-f0-9]{6,12}$/i.test(photoId)) {
      res.status(400).json({ error: "Invalid photoId" });
      return;
    }

    // Try to find the photo record in the cached sheet data to know the type/path
    const allPhotos = await fetchSheetPhotos();
    const record = allPhotos.find(p => p.photoId === photoId);

    if (!record && !fileIdCache.has(photoId)) {
      // Create a minimal record for fallback resolution
      const fallback: PhotoRecord = {
        photoId, label: "", status: "", approval: "", type: "unknown",
        filePath: "", tower: "", string: "", phase: "", phaseOrder: "",
        reqImgType: "", reqImgOrder: "", createdAt: "", createdBy: "",
        comments: "", response: "",
      };
      const fileId = await resolveFileId(fallback);
      if (!fileId) { res.status(404).json({ error: "File not found in Drive" }); return; }
      res.json({ photoId, fileId });
      return;
    }

    const fileId = record ? await resolveFileId(record) : fileIdCache.get(photoId) ?? null;
    if (!fileId) {
      res.status(404).json({ error: "File not found in Drive" });
      return;
    }

    res.json({ photoId, fileId });
  } catch (err: unknown) {
    console.error("Photo resolve error:", err);
    res.status(500).json({ error: "Failed to resolve photo" });
  }
});

// POST /api/photos/cache-clear - clear all caches
router.post("/photos/cache-clear", (_req, res): void => {
  sheetCache = null;
  fileIdCache.clear();
  folderIdCache.clear();
  res.json({ ok: true });
});

export default router;
