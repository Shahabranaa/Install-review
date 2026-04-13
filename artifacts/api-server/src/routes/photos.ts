import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, sheetPhotosTable } from "@workspace/db";
import { sheetsRequest, isSheetsConfigured, SPREADSHEET_ID } from "../lib/google-sheets";
import { driveRequest } from "../lib/google-drive";
import { isWasabiConfigured } from "../lib/wasabi.js";
import { PHOTO_IMAGES_FOLDER_ID, PHOTO_IMAGES_2_STAMPED_FOLDER_ID } from "../lib/drive-constants.js";

const router: IRouter = Router();

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PhotoRecord {
  photoId: string;
  // Files
  photoUpload: string;
  resizedPhoto: string;
  signatureCapture: string;
  drawingMarkup: string;
  // Derived
  type: "photo" | "signature" | "drawing" | "unknown";
  filePath: string;
  // Location / phase
  cableLink: string;
  cableSide: string;
  locationLink: string;
  photoType: string;
  phaseLink: string;
  phaseOrder: string;
  photoString: string;
  // Required image
  reqImgType: string;
  reqImgOrder: string;
  // Responses & notes
  photoResponse: string;
  dataCaptureResponse: string;
  comments: string;
  terminationCompletedBy: string;
  continuingNotes: string;
  previousResponseImport: string;
  // Status & review
  approval: string;
  status: string;
  reviewDetails: string;
  // Label & hierarchy
  label: string;
  parentControl: string;
  parent: string;
  // Creation info
  creationDateTime: string;
  creationDate: string;
  creationUser: string;
  creationLocation: string;
  // Edit info
  editCount: string;
  editDateTime: string;
  editDate: string;
  editUser: string;
  editLocation: string;
  // System
  updateFlag: string;
  automationTrigger: string;
  formType: string;
  testFlag: string;
  temp: string;
  temp2: string;
  temp3: string;
  temp4: string;
  resizedChecked: string;
}

// ─── In-memory caches ────────────────────────────────────────────────────────

let sheetCache: { data: PhotoRecord[]; ts: number } | null = null;
const SHEET_TTL_MS = 5 * 60 * 1000;

const fileIdCache  = new Map<string, string | null>();
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

async function resolveFileId(photo: PhotoRecord): Promise<string | null> {
  const { photoId, type, filePath } = photo;
  if (!photoId) return null;
  if (fileIdCache.has(photoId)) return fileIdCache.get(photoId)!;

  let fileId: string | null = null;

  if (type === "signature" || type === "drawing") {
    fileId = await searchFileInFolder(PHOTO_IMAGES_FOLDER_ID, photoId);
  } else if (type === "photo" && filePath) {
    const parts = filePath.replace(/^\//, "").split("/");
    if (parts.length >= 4) {
      const ospId = await findChildFolder(PHOTO_IMAGES_2_STAMPED_FOLDER_ID, parts[1]);
      if (ospId) {
        const towerId = await findChildFolder(ospId, parts[2]);
        if (towerId) {
          const stringId = await findChildFolder(towerId, parts[3]);
          if (stringId) fileId = await searchFileInFolder(stringId, photoId);
        }
      }
    }
    if (!fileId) fileId = await searchFileInFolder(PHOTO_IMAGES_FOLDER_ID, photoId);
  } else if (filePath) {
    fileId = await searchFileInFolder(PHOTO_IMAGES_FOLDER_ID, photoId);
  }

  fileIdCache.set(photoId, fileId);
  return fileId;
}

// ─── Sheet parsing ────────────────────────────────────────────────────────────

function parseRows(rows: string[][]): PhotoRecord[] {
  if (rows.length === 0) return [];
  const headers = rows[0];
  const idx = (name: string) => headers.indexOf(name);

  const H = {
    photoUpload:            idx("Photo_Upload"),
    resizedPhoto:           idx("Resized_Photo"),
    sigCapture:             idx("Signature_Capture"),
    drawMarkup:             idx("Drawing_Markup"),
    cableLink:              idx("Photo_Cable_Link"),
    cableSide:              idx("Photo_Cable_Side"),
    locationLink:           idx("Photo_Location_Link"),
    photoType:              idx("Photo_Type"),
    phaseLink:              idx("Photo_Installation_Phase_Link"),
    phaseOrder:             idx("Photo_Installation_Phase_Order"),
    reqImgType:             idx("Req_Img_Type"),
    reqImgOrder:            idx("Req_Img_Order"),
    photoResponse:          idx("Photo_Response"),
    dataCaptureResponse:    idx("Photo_Data_Capture_Response"),
    comments:               idx("Photo_Comments"),
    terminationCompletedBy: idx("Termination_Completed_By"),
    approval:               idx("Photo_Approval"),
    status:                 idx("Photo_Status"),
    reviewDetails:          idx("Photo_Review_Details"),
    previousResponseImport: idx("Previous_Response_Import"),
    continuingNotes:        idx("Continuing_Notes"),
    label:                  idx("Photo_Label"),
    parentControl:          idx("Photo_Parent_Control"),
    parent:                 idx("Photo_Parent"),
    photoId:                idx("PhotoID"),
    creationDateTime:       idx("CreationDateTime"),
    creationDate:           idx("CreationDate"),
    creationUser:           idx("CreationUser"),
    creationLocation:       idx("CreationLocation"),
    editCount:              idx("EditCount"),
    editDateTime:           idx("EditDateTime"),
    editDate:               idx("EditDate"),
    editUser:               idx("EditUser"),
    editLocation:           idx("EditLocation"),
    updateFlag:             idx("Update"),
    automationTrigger:      idx("Automation_Trigger"),
    formType:               idx("Form_Type"),
    testFlag:               idx("Test_Flag"),
    photoString:            idx("Photo_String"),
    temp:                   idx("Temp"),
    temp2:                  idx("Temp2"),
    temp3:                  idx("Temp3"),
    temp4:                  idx("Temp4"),
    resizedChecked:         idx("Resized_Checked"),
  };

  const get = (r: string[], i: number) => (i >= 0 ? r[i] ?? "" : "");

  const photos: PhotoRecord[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const photoId = get(r, H.photoId);
    const upload  = get(r, H.photoUpload);
    const sig     = get(r, H.sigCapture);
    const draw    = get(r, H.drawMarkup);
    const tower   = get(r, H.locationLink);
    const cable   = get(r, H.cableLink);

    if (!photoId && !upload && !sig && !draw) continue;
    if (!tower && !cable) continue;

    let filePath = "";
    let type: PhotoRecord["type"] = "unknown";
    if (upload)    { filePath = upload; type = "photo";     }
    else if (sig)  { filePath = sig;    type = "signature"; }
    else if (draw) { filePath = draw;   type = "drawing";   }

    photos.push({
      photoId,
      photoUpload:            upload,
      resizedPhoto:           get(r, H.resizedPhoto),
      signatureCapture:       sig,
      drawingMarkup:          draw,
      type,
      filePath,
      cableLink:              cable,
      cableSide:              get(r, H.cableSide),
      locationLink:           tower,
      photoType:              get(r, H.photoType),
      phaseLink:              get(r, H.phaseLink),
      phaseOrder:             get(r, H.phaseOrder),
      photoString:            get(r, H.photoString),
      reqImgType:             get(r, H.reqImgType),
      reqImgOrder:            get(r, H.reqImgOrder),
      photoResponse:          get(r, H.photoResponse),
      dataCaptureResponse:    get(r, H.dataCaptureResponse),
      comments:               get(r, H.comments),
      terminationCompletedBy: get(r, H.terminationCompletedBy),
      continuingNotes:        get(r, H.continuingNotes),
      previousResponseImport: get(r, H.previousResponseImport),
      approval:               get(r, H.approval),
      status:                 get(r, H.status),
      reviewDetails:          get(r, H.reviewDetails),
      label:                  get(r, H.label),
      parentControl:          get(r, H.parentControl),
      parent:                 get(r, H.parent),
      creationDateTime:       get(r, H.creationDateTime),
      creationDate:           get(r, H.creationDate),
      creationUser:           get(r, H.creationUser),
      creationLocation:       get(r, H.creationLocation),
      editCount:              get(r, H.editCount),
      editDateTime:           get(r, H.editDateTime),
      editDate:               get(r, H.editDate),
      editUser:               get(r, H.editUser),
      editLocation:           get(r, H.editLocation),
      updateFlag:             get(r, H.updateFlag),
      automationTrigger:      get(r, H.automationTrigger),
      formType:               get(r, H.formType),
      testFlag:               get(r, H.testFlag),
      temp:                   get(r, H.temp),
      temp2:                  get(r, H.temp2),
      temp3:                  get(r, H.temp3),
      temp4:                  get(r, H.temp4),
      resizedChecked:         get(r, H.resizedChecked),
    });
  }
  return photos;
}

async function fetchSheetPhotos(): Promise<PhotoRecord[]> {
  const now = Date.now();
  if (sheetCache && now - sheetCache.ts < SHEET_TTL_MS) return sheetCache.data;

  const response = await sheetsRequest(`/${SPREADSHEET_ID}/values/Photo!A1:BF2000`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sheets API ${response.status}: ${text}`);
  }

  const data = await response.json() as { values?: string[][] };
  const photos = parseRows(data.values ?? []);
  sheetCache = { data: photos, ts: now };

  // Upsert to DB in background (don't await — keep response fast)
  upsertPhotosToDb(photos).catch(e =>
    console.error("Background sheet_photos upsert error:", e)
  );

  return photos;
}

// ─── DB upsert ────────────────────────────────────────────────────────────────

async function upsertPhotosToDb(photos: PhotoRecord[]): Promise<void> {
  if (photos.length === 0) return;
  const BATCH = 50;
  for (let i = 0; i < photos.length; i += BATCH) {
    const batch = photos.slice(i, i + BATCH);
    const values = batch.map(p => ({
      photoId:                p.photoId || null,
      photoUpload:            p.photoUpload   || null,
      resizedPhoto:           p.resizedPhoto  || null,
      signatureCapture:       p.signatureCapture || null,
      drawingMarkup:          p.drawingMarkup || null,
      cableLink:              p.cableLink     || null,
      cableSide:              p.cableSide     || null,
      locationLink:           p.locationLink  || null,
      photoType:              p.photoType     || null,
      phaseLink:              p.phaseLink     || null,
      phaseOrder:             p.phaseOrder    || null,
      photoString:            p.photoString   || null,
      reqImgType:             p.reqImgType    || null,
      reqImgOrder:            p.reqImgOrder   || null,
      photoResponse:          p.photoResponse || null,
      dataCaptureResponse:    p.dataCaptureResponse || null,
      comments:               p.comments      || null,
      terminationCompletedBy: p.terminationCompletedBy || null,
      continuingNotes:        p.continuingNotes || null,
      previousResponseImport: p.previousResponseImport || null,
      approval:               p.approval      || null,
      status:                 p.status        || null,
      reviewDetails:          p.reviewDetails || null,
      label:                  p.label         || null,
      parentControl:          p.parentControl || null,
      parent:                 p.parent        || null,
      creationDateTime:       p.creationDateTime || null,
      creationDate:           p.creationDate  || null,
      creationUser:           p.creationUser  || null,
      creationLocation:       p.creationLocation || null,
      editCount:              p.editCount     || null,
      editDateTime:           p.editDateTime  || null,
      editDate:               p.editDate      || null,
      editUser:               p.editUser      || null,
      editLocation:           p.editLocation  || null,
      updateFlag:             p.updateFlag    || null,
      automationTrigger:      p.automationTrigger || null,
      formType:               p.formType      || null,
      testFlag:               p.testFlag      || null,
      temp:                   p.temp          || null,
      temp2:                  p.temp2         || null,
      temp3:                  p.temp3         || null,
      temp4:                  p.temp4         || null,
      resizedChecked:         p.resizedChecked || null,
      syncedAt:               new Date(),
    }));
    await db
      .insert(sheetPhotosTable)
      .values(values)
      .onConflictDoUpdate({
        target: sheetPhotosTable.photoId,
        set: {
          photoUpload:            sheetPhotosTable.photoUpload,
          resizedPhoto:           sheetPhotosTable.resizedPhoto,
          signatureCapture:       sheetPhotosTable.signatureCapture,
          drawingMarkup:          sheetPhotosTable.drawingMarkup,
          cableLink:              sheetPhotosTable.cableLink,
          cableSide:              sheetPhotosTable.cableSide,
          locationLink:           sheetPhotosTable.locationLink,
          photoType:              sheetPhotosTable.photoType,
          phaseLink:              sheetPhotosTable.phaseLink,
          phaseOrder:             sheetPhotosTable.phaseOrder,
          photoString:            sheetPhotosTable.photoString,
          reqImgType:             sheetPhotosTable.reqImgType,
          reqImgOrder:            sheetPhotosTable.reqImgOrder,
          photoResponse:          sheetPhotosTable.photoResponse,
          dataCaptureResponse:    sheetPhotosTable.dataCaptureResponse,
          comments:               sheetPhotosTable.comments,
          terminationCompletedBy: sheetPhotosTable.terminationCompletedBy,
          continuingNotes:        sheetPhotosTable.continuingNotes,
          previousResponseImport: sheetPhotosTable.previousResponseImport,
          // Preserve reviewer decisions (Approved/Rejected); otherwise sync from sheet
          approval: sql`CASE WHEN lower(sheet_photos.approval) IN ('approved', 'rejected') THEN sheet_photos.approval ELSE excluded.approval END`,
          status:   sql`CASE WHEN lower(sheet_photos.status)   IN ('approved', 'rejected') THEN sheet_photos.status   ELSE excluded.status   END`,
          reviewDetails:          sheetPhotosTable.reviewDetails,
          label:                  sheetPhotosTable.label,
          parentControl:          sheetPhotosTable.parentControl,
          parent:                 sheetPhotosTable.parent,
          creationDateTime:       sheetPhotosTable.creationDateTime,
          creationDate:           sheetPhotosTable.creationDate,
          creationUser:           sheetPhotosTable.creationUser,
          creationLocation:       sheetPhotosTable.creationLocation,
          editCount:              sheetPhotosTable.editCount,
          editDateTime:           sheetPhotosTable.editDateTime,
          editDate:               sheetPhotosTable.editDate,
          editUser:               sheetPhotosTable.editUser,
          editLocation:           sheetPhotosTable.editLocation,
          updateFlag:             sheetPhotosTable.updateFlag,
          automationTrigger:      sheetPhotosTable.automationTrigger,
          formType:               sheetPhotosTable.formType,
          testFlag:               sheetPhotosTable.testFlag,
          temp:                   sheetPhotosTable.temp,
          temp2:                  sheetPhotosTable.temp2,
          temp3:                  sheetPhotosTable.temp3,
          temp4:                  sheetPhotosTable.temp4,
          resizedChecked:         sheetPhotosTable.resizedChecked,
          syncedAt:               new Date(),
        },
      });
  }
  console.log(`[sheet-photos] Upserted ${photos.length} records to DB`);
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/photos/sheet
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

    if (tower)  photos = photos.filter(p => p.locationLink === tower);
    if (string) photos = photos.filter(p => p.cableLink === string);
    if (phase)  photos = photos.filter(p => p.phaseLink === phase);

    const allPhotos = await fetchSheetPhotos();
    const towers  = [...new Set(allPhotos.map(p => p.locationLink).filter(Boolean))].sort();
    const strings = [...new Set(allPhotos.map(p => p.cableLink).filter(Boolean))].sort();
    const phases  = [...new Set(allPhotos.map(p => p.phaseLink).filter(Boolean))].sort();

    res.json({ photos, meta: { total: photos.length, towers, strings, phases } });
  } catch (err: unknown) {
    console.error("Photos sheet error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/photos/reviews — return all photos with a reviewer decision (Approved/Rejected)
router.get("/photos/reviews", async (req, res): Promise<void> => {
  try {
    const reviews = await db
      .select({ photoId: sheetPhotosTable.photoId, approval: sheetPhotosTable.approval })
      .from(sheetPhotosTable)
      .where(sql`lower(approval) IN ('approved', 'rejected')`);
    res.json(reviews);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/photos/db/:photoId — read a single record from DB
router.get("/photos/db/:photoId", async (req, res): Promise<void> => {
  try {
    const record = await db
      .select()
      .from(sheetPhotosTable)
      .where(eq(sheetPhotosTable.photoId, req.params.photoId))
      .limit(1);
    if (!record[0]) { res.status(404).json({ error: "Not found" }); return; }
    res.json(record[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /api/photos/db/:photoId — update review fields
router.patch("/photos/db/:photoId", async (req, res): Promise<void> => {
  try {
    const update: {
      approval?: string | null;
      status?: string | null;
      reviewDetails?: string | null;
      comments?: string | null;
      reviewComment?: string | null;
      cropX?: number | null;
      cropY?: number | null;
      cropWidth?: number | null;
      cropHeight?: number | null;
      updatedAt: Date;
    } = { updatedAt: new Date() };

    const stringFields = ["approval", "status", "reviewDetails", "comments", "reviewComment"] as const;
    for (const k of stringFields) {
      if (req.body[k] !== undefined) {
        update[k] = typeof req.body[k] === "string" ? req.body[k] : null;
      }
    }
    const numberFields = ["cropX", "cropY", "cropWidth", "cropHeight"] as const;
    for (const k of numberFields) {
      if (req.body[k] !== undefined) {
        const n = Number(req.body[k]);
        update[k] = req.body[k] !== null && !isNaN(n) ? n : null;
      }
    }

    const fieldsToUpdate = Object.keys(update).filter(k => k !== "updatedAt");
    if (fieldsToUpdate.length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    await db
      .update(sheetPhotosTable)
      .set(update)
      .where(eq(sheetPhotosTable.photoId, req.params.photoId));
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/photos/resolve/:photoId
router.get("/photos/resolve/:photoId", async (req, res): Promise<void> => {
  if (!isSheetsConfigured()) { res.status(503).json({ error: "Drive not configured" }); return; }
  try {
    const { photoId } = req.params;
    if (!photoId || !/^[a-f0-9]{6,12}$/i.test(photoId)) {
      res.status(400).json({ error: "Invalid photoId" }); return;
    }

    // Always check DB first — covers Drive-migrated AND path-linked photos
    const dbRows = await db
      .select({ driveFileId: sheetPhotosTable.driveFileId, wasabiKey: sheetPhotosTable.wasabiKey })
      .from(sheetPhotosTable)
      .where(eq(sheetPhotosTable.photoId, photoId))
      .limit(1);

    const row = dbRows[0];
    if (row) {
      if (row.driveFileId) fileIdCache.set(photoId, row.driveFileId);

      // Photo is in Wasabi — return proxy URL (server fetches from private bucket with creds)
      if (row.wasabiKey) {
        res.json({ photoId, fileId: row.driveFileId ?? null, wasabiUrl: `/api/wasabi/image/${photoId}` });
        return;
      }

      // Not in Wasabi yet — fall back to Drive proxy only when Wasabi is not configured
      if (row.driveFileId) {
        if (await isWasabiConfigured()) {
          res.json({ photoId, fileId: row.driveFileId, wasabiUrl: null, notMigrated: true });
        } else {
          res.json({ photoId, fileId: row.driveFileId, wasabiUrl: null });
        }
        return;
      }

      // DB row exists but no source at all
      res.json({ photoId, fileId: null, wasabiUrl: null, notMigrated: true });
      return;
    }

    // No DB row — skip expensive Drive search when Wasabi is configured
    if (await isWasabiConfigured()) {
      res.json({ photoId, fileId: null, wasabiUrl: null, notMigrated: true });
      return;
    }

    // Wasabi not configured — fall through to Drive search (backward compat)
    const allPhotos = await fetchSheetPhotos();
    const record = allPhotos.find(p => p.photoId === photoId) ?? {
      photoId, photoUpload: "", resizedPhoto: "", signatureCapture: "",
      drawingMarkup: "", type: "unknown" as const, filePath: "",
      cableLink: "", cableSide: "", locationLink: "", photoType: "",
      phaseLink: "", phaseOrder: "", photoString: "", reqImgType: "",
      reqImgOrder: "", photoResponse: "", dataCaptureResponse: "",
      comments: "", terminationCompletedBy: "", continuingNotes: "",
      previousResponseImport: "", approval: "", status: "",
      reviewDetails: "", label: "", parentControl: "", parent: "",
      creationDateTime: "", creationDate: "", creationUser: "",
      creationLocation: "", editCount: "", editDateTime: "", editDate: "",
      editUser: "", editLocation: "", updateFlag: "", automationTrigger: "",
      formType: "", testFlag: "", temp: "", temp2: "", temp3: "", temp4: "",
      resizedChecked: "",
    };

    const fileId = await resolveFileId(record);
    if (!fileId) { res.status(404).json({ error: "File not found in Drive" }); return; }

    await db
      .update(sheetPhotosTable)
      .set({ driveFileId: fileId })
      .where(eq(sheetPhotosTable.photoId, photoId));

    res.json({ photoId, fileId, wasabiUrl: null });
  } catch (err: unknown) {
    console.error("Photo resolve error:", err);
    res.status(500).json({ error: "Failed to resolve photo" });
  }
});

// GET /api/photos/stats — counts for the dashboard
router.get("/photos/stats", async (_req, res): Promise<void> => {
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*)::int                                                                AS total,
        COUNT(*) FILTER (WHERE LOWER(approval) IN ('verified','approved'))::int     AS approved,
        COUNT(*) FILTER (WHERE LOWER(approval) IN ('rejected'))::int                AS rejected,
        COUNT(*) FILTER (WHERE LOWER(approval) NOT IN ('verified','approved','rejected'))::int AS pending,
        COUNT(*) FILTER (WHERE
          creation_date IS NOT NULL
          AND creation_date ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$'
          AND TO_DATE(creation_date, 'DD/MM/YYYY') >= CURRENT_DATE - INTERVAL '7 days'
        )::int AS this_week,
        COUNT(*) FILTER (WHERE
          creation_date IS NOT NULL
          AND creation_date ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$'
          AND TO_DATE(creation_date, 'DD/MM/YYYY') >= DATE_TRUNC('month', CURRENT_DATE)
        )::int AS this_month
      FROM sheet_photos
    `);
    // Drizzle execute() wraps pg QueryResult — rows live in result.rows
    const rows = Array.isArray(result) ? result : (result as unknown as { rows: unknown[] }).rows;
    const row = rows[0] as { total: number; approved: number; rejected: number; pending: number; this_week: number; this_month: number };

    res.json({
      total:     row.total     ?? 0,
      approved:  row.approved  ?? 0,
      rejected:  row.rejected  ?? 0,
      pending:   row.pending   ?? 0,
      thisWeek:  row.this_week  ?? 0,
      thisMonth: row.this_month ?? 0,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/photos/cache-clear
router.post("/photos/cache-clear", (_req, res): void => {
  sheetCache = null;
  fileIdCache.clear();
  folderIdCache.clear();
  res.json({ ok: true });
});

// GET /api/photos/counts — photo count per tower (location_link) from DB
router.get("/photos/counts", async (_req, res): Promise<void> => {
  try {
    const result = await db.execute(sql`
      SELECT location_link AS tower, COUNT(*)::int AS count
      FROM sheet_photos
      WHERE location_link IS NOT NULL AND location_link <> ''
      GROUP BY location_link
      ORDER BY location_link
    `);
    const rows = Array.isArray(result) ? result : (result as unknown as { rows: unknown[] }).rows;
    res.json(rows);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/photos/db?tower=<name> — DB listing with optional tower filter, includes driveFileId
router.get("/photos/db", async (req, res): Promise<void> => {
  const tower = req.query.tower as string | undefined;
  try {
    const rows = await db
      .select({
        photoId:     sheetPhotosTable.photoId,
        driveFileId: sheetPhotosTable.driveFileId,
        label:       sheetPhotosTable.label,
        reqImgType:  sheetPhotosTable.reqImgType,
        approval:    sheetPhotosTable.approval,
        phaseLink:   sheetPhotosTable.phaseLink,
        cableLink:   sheetPhotosTable.cableLink,
      })
      .from(sheetPhotosTable)
      .where(tower ? eq(sheetPhotosTable.locationLink, tower) : undefined);
    res.json(rows);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
