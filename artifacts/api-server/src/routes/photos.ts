import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, sheetPhotosTable, requiredImageDefinitionsTable, towersTable, stringsTable, locationsTable } from "@workspace/db";
import { sheetsRequest, isSheetsConfigured, SPREADSHEET_ID } from "../lib/google-sheets";
import { driveRequest } from "../lib/google-drive";
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

  const response = await sheetsRequest(`/${SPREADSHEET_ID}/values/Photo!A1:BF`);
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
          // Use excluded.* to pull in the NEW (incoming) sheet values on conflict.
          // Referencing sheetPhotosTable.column in this context keeps the EXISTING
          // value unchanged — so we must use sql`excluded.col` for all sheet-sourced fields.
          photoUpload:            sql`excluded.photo_upload`,
          resizedPhoto:           sql`excluded.resized_photo`,
          signatureCapture:       sql`excluded.signature_capture`,
          drawingMarkup:          sql`excluded.drawing_markup`,
          cableLink:              sql`excluded.cable_link`,
          cableSide:              sql`excluded.cable_side`,
          locationLink:           sql`excluded.location_link`,
          photoType:              sql`excluded.photo_type`,
          phaseLink:              sql`excluded.phase_link`,
          phaseOrder:             sql`excluded.phase_order`,
          photoString:            sql`excluded.photo_string`,
          reqImgType:             sql`excluded.req_img_type`,
          reqImgOrder:            sql`excluded.req_img_order`,
          photoResponse:          sql`excluded.photo_response`,
          dataCaptureResponse:    sql`excluded.data_capture_response`,
          comments:               sql`excluded.comments`,
          terminationCompletedBy: sql`excluded.termination_completed_by`,
          continuingNotes:        sql`excluded.continuing_notes`,
          previousResponseImport: sql`excluded.previous_response_import`,
          // Preserve reviewer decisions (Approved/Rejected); otherwise sync from sheet
          approval: sql`CASE WHEN lower(sheet_photos.approval) IN ('approved', 'rejected') THEN sheet_photos.approval ELSE excluded.approval END`,
          status:   sql`CASE WHEN lower(sheet_photos.status)   IN ('approved', 'rejected') THEN sheet_photos.status   ELSE excluded.status   END`,
          reviewDetails:          sql`excluded.review_details`,
          label:                  sql`excluded.label`,
          parentControl:          sql`excluded.parent_control`,
          parent:                 sql`excluded.parent`,
          creationDateTime:       sql`excluded.creation_date_time`,
          creationDate:           sql`excluded.creation_date`,
          creationUser:           sql`excluded.creation_user`,
          creationLocation:       sql`excluded.creation_location`,
          editCount:              sql`excluded.edit_count`,
          editDateTime:           sql`excluded.edit_date_time`,
          editDate:               sql`excluded.edit_date`,
          editUser:               sql`excluded.edit_user`,
          editLocation:           sql`excluded.edit_location`,
          updateFlag:             sql`excluded.update_flag`,
          automationTrigger:      sql`excluded.automation_trigger`,
          formType:               sql`excluded.form_type`,
          testFlag:               sql`excluded.test_flag`,
          temp:                   sql`excluded.temp`,
          temp2:                  sql`excluded.temp2`,
          temp3:                  sql`excluded.temp3`,
          temp4:                  sql`excluded.temp4`,
          resizedChecked:         sql`excluded.resized_checked`,
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

      // Not in Wasabi yet — always fall back to Drive proxy (photo may not be mirrored yet)
      if (row.driveFileId) {
        res.json({ photoId, fileId: row.driveFileId, wasabiUrl: null });
        return;
      }

      // DB row exists but no source at all — genuinely unavailable
      res.json({ photoId, fileId: null, wasabiUrl: null, notMigrated: true });
      return;
    }

    // No DB row — fall through to Drive search (photo may exist in Drive but not yet indexed)
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

// POST /api/photos/scan-availability — bulk-mark image_available in DB
// TRUE  if wasabi_key IS NOT NULL OR drive_file_id IS NOT NULL
// FALSE if both are NULL (genuinely no source)
// This is purely DB-computed: no external network calls needed.
export async function scanImageAvailability(): Promise<{ scanned: number; available: number; unavailable: number }> {
  // Update available: has wasabi_key or drive_file_id
  await db.execute(sql`
    UPDATE sheet_photos
    SET image_available = TRUE
    WHERE (wasabi_key IS NOT NULL OR drive_file_id IS NOT NULL)
      AND (image_available IS DISTINCT FROM TRUE)
  `);

  // Update unavailable: no source at all
  await db.execute(sql`
    UPDATE sheet_photos
    SET image_available = FALSE
    WHERE wasabi_key IS NULL AND drive_file_id IS NULL
      AND (image_available IS DISTINCT FROM FALSE)
  `);

  // Return totals of classified records (not "changed this run"), so re-runs return
  // meaningful counts rather than zeros when records were already up-to-date.
  const counts = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE image_available IS NOT NULL)::int AS scanned,
      COUNT(*) FILTER (WHERE image_available = TRUE)::int      AS available,
      COUNT(*) FILTER (WHERE image_available = FALSE)::int     AS unavailable
    FROM sheet_photos
  `);
  const rows = Array.isArray(counts) ? counts : (counts as unknown as { rows: unknown[] }).rows;
  const row = rows[0] as { scanned: number; available: number; unavailable: number };
  return { scanned: row.scanned ?? 0, available: row.available ?? 0, unavailable: row.unavailable ?? 0 };
}

// GET /api/photos/availability-map — returns { [photoId]: boolean } for all scanned photos
// Used by the frontend to immediately filter unavailable images without per-photo resolve calls.
router.get("/photos/availability-map", async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select({ photoId: sheetPhotosTable.photoId, imageAvailable: sheetPhotosTable.imageAvailable })
      .from(sheetPhotosTable)
      .where(sql`image_available IS NOT NULL AND photo_id IS NOT NULL`);

    const map: Record<string, boolean> = {};
    for (const row of rows) {
      if (row.photoId) map[row.photoId] = row.imageAvailable!;
    }
    res.json(map);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/photos/scan-availability", async (_req, res): Promise<void> => {
  try {
    const result = await scanImageAvailability();
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/photos/compliance — per-tower compliance against required_image_definitions
// Query params: tower (optional, single tower name), ospId (optional int), stringId (optional int)
router.get("/photos/compliance", async (req, res): Promise<void> => {
  try {
    const ospIdParam    = req.query.ospId    ? parseInt(req.query.ospId as string)    : undefined;
    const stringIdParam = req.query.stringId ? parseInt(req.query.stringId as string) : undefined;
    const towerParam    = req.query.tower    as string | undefined;
    const phaseParam    = req.query.phase    as string | undefined;

    // ── 1. Determine expected req_img_types (with phase context) ────────────
    const defRows = await db
      .select({
        phaseType:  requiredImageDefinitionsTable.phaseType,
        reqImgType: requiredImageDefinitionsTable.reqImgType,
        reqImgOrder: requiredImageDefinitionsTable.reqImgOrder,
      })
      .from(requiredImageDefinitionsTable)
      .orderBy(requiredImageDefinitionsTable.phaseType, requiredImageDefinitionsTable.reqImgType);

    // hasPhaseData: true = use phase-aware mode from required_image_definitions
    const hasPhaseData = defRows.length > 0;

    // Phase-aware: { phaseType, reqImgType }[]
    // Flat: string[]
    type ExpectedItem = { phaseType: string; reqImgType: string };
    let expectedItems: ExpectedItem[];
    let expectedTypes: string[];

    if (hasPhaseData) {
      expectedItems = defRows.map(r => ({ phaseType: r.phaseType, reqImgType: r.reqImgType }));
      expectedTypes = [...new Set(expectedItems.map(e => e.reqImgType))];
    } else {
      // Fallback: global distinct req_img_types from sheet_photos (no phase info)
      const globalRows = await db.execute(sql`
        SELECT DISTINCT req_img_type FROM sheet_photos
        WHERE req_img_type IS NOT NULL ORDER BY req_img_type
      `);
      const globalArr = Array.isArray(globalRows) ? globalRows : (globalRows as unknown as { rows: unknown[] }).rows;
      expectedTypes = (globalArr as { req_img_type: string }[]).map(r => r.req_img_type);
      expectedItems = expectedTypes.map(t => ({ phaseType: "General", reqImgType: t }));
    }

    // Group expected items by phase for phase-aware display
    const expectedByPhase = new Map<string, string[]>();
    for (const item of expectedItems) {
      if (!expectedByPhase.has(item.phaseType)) expectedByPhase.set(item.phaseType, []);
      expectedByPhase.get(item.phaseType)!.push(item.reqImgType);
    }

    // ── 2. Get tower metadata (name → string → OSP) with optional filters ──
    const towerMeta = await db
      .select({
        name:       towersTable.name,
        stringId:   stringsTable.id,
        stringName: stringsTable.name,
        ospId:      locationsTable.id,
        ospName:    locationsTable.name,
      })
      .from(towersTable)
      .innerJoin(stringsTable,   eq(towersTable.stringId,   stringsTable.id))
      .innerJoin(locationsTable, eq(stringsTable.locationId, locationsTable.id));

    const filtered = towerMeta.filter(t =>
      (!ospIdParam    || t.ospId    === ospIdParam)    &&
      (!stringIdParam || t.stringId === stringIdParam) &&
      (!towerParam    || t.name     === towerParam)
    );
    const filteredNames = new Set(filtered.map(t => t.name));
    const metaByName = new Map(filtered.map(t => [t.name, t]));

    // ── 3. Get per-tower actual req_img_types from sheet_photos ────────────
    const actualRows = await db.execute(sql`
      SELECT location_link, req_img_type
      FROM sheet_photos
      WHERE location_link IS NOT NULL AND req_img_type IS NOT NULL
      GROUP BY location_link, req_img_type
      ORDER BY location_link, req_img_type
    `);
    const actualArr = Array.isArray(actualRows) ? actualRows : (actualRows as unknown as { rows: unknown[] }).rows;

    // Group by tower
    const actualByTower = new Map<string, Set<string>>();
    for (const row of actualArr as { location_link: string; req_img_type: string }[]) {
      const { location_link: towerName, req_img_type: reqType } = row;
      if (filteredNames.size > 0 && !filteredNames.has(towerName)) continue;
      if (!actualByTower.has(towerName)) actualByTower.set(towerName, new Set());
      actualByTower.get(towerName)!.add(reqType);
    }

    // ── 4. Build compliance response ────────────────────────────────────────
    // Only fall back to sheet_photos-only towers when no filter is active.
    // If a filter is specified, respect it strictly (even if it yields 0 towers).
    const hasActiveFilter = !!(ospIdParam || stringIdParam || towerParam);
    const towerNames = new Set<string>([
      ...filteredNames,
      ...(!hasActiveFilter ? actualByTower.keys() : []),
    ]);

    // When phaseParam is set, compute per-tower phase-specific coverage:
    // "does this tower have at least one photo with this phase_link?"
    // ALL towers in scope are retained; towers missing the phase appear with pct=0.
    let towersWithPhase: Set<string> | undefined;
    if (phaseParam) {
      const phaseResult = await db.execute(sql`
        SELECT DISTINCT location_link FROM sheet_photos
        WHERE phase_link = ${phaseParam} AND location_link IS NOT NULL
      `);
      const phaseArr = Array.isArray(phaseResult)
        ? phaseResult
        : (phaseResult as unknown as { rows: unknown[] }).rows;
      towersWithPhase = new Set(
        (phaseArr as { location_link: string }[]).map(r => r.location_link)
      );
    }

    type PhaseCompliance = {
      phase: string;
      expected: string[];
      present: string[];
      missing: string[];
    };

    // Label used in phase-specific mode
    const phaseLabel = phaseParam ? `Photos in phase: ${phaseParam}` : undefined;

    const towers = Array.from(towerNames).map(name => {
      const meta = metaByName.get(name);

      if (towersWithPhase !== undefined && phaseLabel) {
        // Phase-specific mode: coverage = "has this tower contributed photos for this phase?"
        const hasPhotos = towersWithPhase.has(name);
        return {
          tower:      name,
          stringId:   meta?.stringId   ?? null,
          stringName: meta?.stringName ?? null,
          ospId:      meta?.ospId      ?? null,
          ospName:    meta?.ospName    ?? null,
          expected:   1,
          actual:     hasPhotos ? 1 : 0,
          missing:    hasPhotos ? [] : [phaseLabel],
          present:    hasPhotos ? [phaseLabel] : [],
          pct:        hasPhotos ? 100 : 0,
          byPhase:    [],
          hasPhaseData: false,
        };
      }

      // Standard req_img_type compliance mode
      const actual     = actualByTower.get(name) ?? new Set<string>();
      const presentAll = expectedTypes.filter(t => actual.has(t));
      const missingAll = expectedTypes.filter(t => !actual.has(t));
      const pct        = expectedTypes.length > 0
        ? Math.round(presentAll.length / expectedTypes.length * 100)
        : (actual.size > 0 ? 100 : 0);

      // Build per-phase breakdown
      const byPhase: PhaseCompliance[] = Array.from(expectedByPhase.entries()).map(([phase, types]) => ({
        phase,
        expected: types,
        present:  types.filter(t => actual.has(t)),
        missing:  types.filter(t => !actual.has(t)),
      }));

      return {
        tower:      name,
        stringId:   meta?.stringId   ?? null,
        stringName: meta?.stringName ?? null,
        ospId:      meta?.ospId      ?? null,
        ospName:    meta?.ospName    ?? null,
        expected:   expectedTypes.length,
        actual:     presentAll.length,
        missing:    missingAll,
        present:    presentAll,
        pct,
        byPhase,
        hasPhaseData,
      };
    }).sort((a, b) => a.pct - b.pct || (a.tower < b.tower ? -1 : 1));

    // In phase-specific mode, expectedTypes reflects the phase metric (1 item)
    const responseExpectedTypes = phaseLabel ? [phaseLabel] : expectedTypes;
    res.json({
      expectedTypes: responseExpectedTypes,
      hasPhaseData: phaseLabel ? false : hasPhaseData,
      towers,
      phaseContext: phaseParam ?? null,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Phase matrix & velocity endpoints ───────────────────────────────────────

// GET /api/photos/phase-matrix
// Returns: phases[], matrix (string × phase coverage pct), summary (zero/gaps/full tower counts)
router.get("/photos/phase-matrix", async (_req, res): Promise<void> => {
  try {
    // 1. Tower counts + string IDs from DB
    const stringRows = await db
      .select({
        stringId:   stringsTable.id,
        stringName: stringsTable.name,
        towerCount: sql<number>`count(${towersTable.id})::int`,
      })
      .from(stringsTable)
      .leftJoin(towersTable, eq(towersTable.stringId, stringsTable.id))
      .groupBy(stringsTable.id, stringsTable.name)
      .orderBy(stringsTable.name);

    const towerCountByString = new Map(stringRows.map(s => [s.stringName, s.towerCount]));
    const stringIdByName     = new Map(stringRows.map(s => [s.stringName, s.stringId]));

    // 2. All towers for summary
    const allTowerRows = await db.select({ name: towersTable.name }).from(towersTable);

    // 3. (photo_string × phase_link) distinct towers with photos
    const cellResult = await db.execute(sql`
      SELECT photo_string, phase_link,
        COUNT(DISTINCT location_link)::int AS towers_with_photos
      FROM sheet_photos
      WHERE photo_string IS NOT NULL
        AND phase_link    IS NOT NULL
        AND location_link IS NOT NULL
      GROUP BY photo_string, phase_link
      ORDER BY photo_string, phase_link
    `);
    const cells = Array.isArray(cellResult) ? cellResult : (cellResult as unknown as { rows: unknown[] }).rows;
    type CellRow = { photo_string: string; phase_link: string; towers_with_photos: number };

    // 4. Phases — derived from observed sheet_photos.phase_link values.
    // NOTE: the `phases` DB table (0 rows) and `required_image_definitions` (0 rows) provide no
    // canonical phase list, so phases with zero global submissions are absent as columns.
    // When a canonical phase master list is populated in the DB, union it here to expose 0% columns.
    const allPhases = [...new Set((cells as CellRow[]).map(r => r.phase_link))];
    const phaseOrder = (ph: string): [string, number] => {
      const m = ph.match(/^([A-Z]+)_(\d+)_/);
      return m ? [m[1], parseInt(m[2])] : [ph, 99];
    };
    const phases = allPhases.sort((a, b) => {
      const [pfxA, numA] = phaseOrder(a);
      const [pfxB, numB] = phaseOrder(b);
      if (pfxA !== pfxB) return pfxA < pfxB ? -1 : 1;
      return numA - numB;
    });

    // 5. Strings — use ALL strings from DB so zero-photo strings appear in the matrix
    // Include any photo_string values not in the DB (e.g. "T2G07_EXP") as well
    const dbStringNames = stringRows.map(s => s.stringName);
    const photoOnlyStrings = (cells as CellRow[])
      .map(r => r.photo_string)
      .filter(s => !dbStringNames.includes(s));
    const allStrings = [...new Set([...dbStringNames, ...photoOnlyStrings])].sort();

    // 6. Build cell lookup
    const cellMap = new Map<string, number>();
    for (const c of cells as CellRow[]) {
      cellMap.set(`${c.photo_string}|${c.phase_link}`, c.towers_with_photos);
    }

    // 7. Matrix rows
    const matrix = allStrings.map(str => {
      const total    = towerCountByString.get(str) ?? 0;
      const stringId = stringIdByName.get(str) ?? null;
      return {
        string:      str,
        stringId,
        totalTowers: total,
        cells: phases.map(ph => {
          const n   = cellMap.get(`${str}|${ph}`) ?? 0;
          const pct = total > 0 ? Math.round(n / total * 100) : 0;
          return { phase: ph, towersWithPhotos: n, pct };
        }),
      };
    });

    // 8. Tower-level summary
    const towerPhaseResult = await db.execute(sql`
      SELECT location_link, COUNT(DISTINCT phase_link)::int AS phase_count
      FROM sheet_photos
      WHERE location_link IS NOT NULL AND phase_link IS NOT NULL
      GROUP BY location_link
    `);
    type TowerPhaseRow = { location_link: string; phase_count: number };
    const towerPhaseArr = Array.isArray(towerPhaseResult)
      ? towerPhaseResult
      : (towerPhaseResult as unknown as { rows: unknown[] }).rows;

    const towerPhaseCounts = new Map(
      (towerPhaseArr as TowerPhaseRow[]).map(r => [r.location_link, r.phase_count])
    );
    const towersWithAnyPhoto = new Set(towerPhaseCounts.keys());
    const totalPhaseCount    = phases.length;

    const zeroPhotos      = allTowerRows.filter(t => !towersWithAnyPhoto.has(t.name)).length;
    // Guard: when no phase data exists, no tower can be "fully documented"
    const fullyDocumented = totalPhaseCount > 0
      ? allTowerRows.filter(t => (towerPhaseCounts.get(t.name) ?? 0) >= totalPhaseCount).length
      : 0;
    const withGaps        = allTowerRows.filter(t => {
      const n = towerPhaseCounts.get(t.name) ?? 0;
      return n > 0 && (totalPhaseCount === 0 || n < totalPhaseCount);
    }).length;

    res.json({
      phases,
      matrix,
      summary: {
        total: allTowerRows.length,
        zeroPhotos,
        withGaps,
        fullyDocumented,
      },
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/photos/velocity
// Returns daily photo submission counts for the rolling 60-day window
router.get("/photos/velocity", async (_req, res): Promise<void> => {
  try {
    const result = await db.execute(sql`
      SELECT creation_date, COUNT(*)::int AS count
      FROM sheet_photos
      WHERE creation_date IS NOT NULL
      GROUP BY creation_date
    `);
    const rows = Array.isArray(result) ? result : (result as unknown as { rows: unknown[] }).rows;

    // Parse "M/D/YYYY" → Date and filter last 60 days (inclusive today = 60 points)
    const now    = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 59);  // day -59 through day 0 = 60 entries
    cutoff.setHours(0, 0, 0, 0);

    type DateRow = { creation_date: string; count: number };
    const countByKey = new Map<string, number>();
    for (const r of rows as DateRow[]) {
      const parts = (r.creation_date ?? "").split("/");
      if (parts.length !== 3) continue;
      const [mStr, dStr, yStr] = parts;
      const d = new Date(parseInt(yStr), parseInt(mStr) - 1, parseInt(dStr));
      if (d < cutoff || d > now) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      countByKey.set(key, (countByKey.get(key) ?? 0) + r.count);
    }

    // Build complete 60-day array (fill gaps with 0)
    const velocity: { date: string; count: number }[] = [];
    const cur = new Date(cutoff);
    while (cur <= now) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
      velocity.push({ date: key, count: countByKey.get(key) ?? 0 });
      cur.setDate(cur.getDate() + 1);
    }

    res.json({ velocity });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/photos/db?tower=<name> — DB listing with optional tower filter, includes driveFileId + imageAvailable
router.get("/photos/db", async (req, res): Promise<void> => {
  const tower = req.query.tower as string | undefined;
  try {
    const rows = await db
      .select({
        photoId:        sheetPhotosTable.photoId,
        driveFileId:    sheetPhotosTable.driveFileId,
        label:          sheetPhotosTable.label,
        reqImgType:     sheetPhotosTable.reqImgType,
        approval:       sheetPhotosTable.approval,
        phaseLink:      sheetPhotosTable.phaseLink,
        cableLink:      sheetPhotosTable.cableLink,
        photoUpload:    sheetPhotosTable.photoUpload,
        imageAvailable: sheetPhotosTable.imageAvailable,
      })
      .from(sheetPhotosTable)
      .where(tower ? eq(sheetPhotosTable.locationLink, tower) : undefined);
    res.json(rows);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/photos/batch-review — atomically save multiple review decisions
interface BatchDecision {
  photoId: string;
  approval: "Approved" | "Rejected";
  reviewComment?: string | null;
}

router.post("/photos/batch-review", async (req, res): Promise<void> => {
  const body = req.body as { decisions?: unknown };
  if (!Array.isArray(body.decisions) || body.decisions.length === 0 || body.decisions.length > 500) {
    res.status(400).json({ error: "decisions must be a non-empty array of up to 500 items" });
    return;
  }
  const valid: BatchDecision[] = [];
  for (const d of body.decisions) {
    if (
      typeof d !== "object" || d === null ||
      typeof (d as Record<string, unknown>).photoId !== "string" ||
      !(["Approved", "Rejected"].includes((d as Record<string, unknown>).approval as string))
    ) {
      res.status(400).json({ error: "Each decision must have photoId (string) and approval ('Approved'|'Rejected')" });
      return;
    }
    const item = d as Record<string, unknown>;
    valid.push({
      photoId:       item.photoId as string,
      approval:      item.approval as "Approved" | "Rejected",
      reviewComment: typeof item.reviewComment === "string" ? item.reviewComment : null,
    });
  }
  try {
    let updatedCount = 0;
    await db.transaction(async (tx) => {
      for (const d of valid) {
        const rows = await tx
          .update(sheetPhotosTable)
          .set({
            approval:      d.approval,
            status:        d.approval,
            reviewComment: d.reviewComment ?? null,
            updatedAt:     new Date(),
          })
          .where(eq(sheetPhotosTable.photoId, d.photoId))
          .returning({ id: sheetPhotosTable.id });
        if (rows.length === 0) {
          // Unknown photoId — abort entire transaction (all-or-fail)
          throw new Error(`Photo not found: ${d.photoId}`);
        }
        updatedCount += rows.length;
      }
    });
    res.json({ updated: updatedCount });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.startsWith("Photo not found:") ? 422 : 500;
    res.status(status).json({ error: msg });
  }
});

export default router;
