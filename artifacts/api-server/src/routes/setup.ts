import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and, sql } from "drizzle-orm";
import {
  db,
  projectsTable,
  sitesTable,
  locationsTable,
  stringsTable,
  towersTable,
  phasesTable,
  sheetPhotosTable,
  requiredImageDefinitionsTable,
} from "@workspace/db";
import { sheetsRequest, isSheetsConfigured, SPREADSHEET_ID } from "../lib/google-sheets";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.accessLevel !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

async function fetchSheet(range: string): Promise<string[][]> {
  const response = await sheetsRequest(`/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sheets API error (${response.status}): ${text}`);
  }
  const data = (await response.json()) as { values?: string[][] };
  return data.values ?? [];
}

function parseLatLng(s: string): { lat: number | null; lng: number | null } {
  if (!s?.trim()) return { lat: null, lng: null };
  const [a, b] = s.split(",").map((x) => x.trim());
  const lat = parseFloat(a ?? "");
  const lng = parseFloat(b ?? "");
  return isNaN(lat) || isNaN(lng) ? { lat: null, lng: null } : { lat, lng };
}

function colIdx(headers: string[], name: string): number {
  return headers.findIndex((h) => h && h.trim().toLowerCase() === name.toLowerCase());
}

function bestCol(headers: string[], ...names: string[]): number {
  for (const name of names) {
    const i = colIdx(headers, name);
    if (i >= 0) return i;
  }
  return -1;
}

export interface ImportResult {
  osps: { created: number; updated: number };
  strings: { created: number; updated: number; skipped: number };
  towers: { created: number; updated: number; skipped: number };
}

export async function importFromSheet(): Promise<ImportResult> {
  const stringRows = await fetchSheet("String!A:Z");
  const locationRows = await fetchSheet("Location!A:Z");

  const sH = stringRows[0] ?? [];
  const lH = locationRows[0] ?? [];

  const sNameIdx = bestCol(sH, "String_Name", "String Name");
  const sNumIdx  = bestCol(sH, "String_Number", "String Number");
  const sOspIdx  = bestCol(sH, "String_Starting_Location", "Primary_Sub_Station", "String Starting Location");
  const sStatIdx = bestCol(sH, "String_Progress_Status", "String Progress Status", "Status");

  const lNameIdx   = Math.max(colIdx(lH, "Name"), 0);
  const lLatLngIdx = bestCol(lH, "Lat Long", "LatLong", "Lat_Long");
  const lStringIdx = bestCol(lH, "String", "String_Name");
  const lOspIdx    = bestCol(lH, "Primary_Sub_Station", "Primary Sub Station", "OSP");
  const lTypeIdx   = bestCol(lH, "Location_Type", "Location Type", "Type");
  const lStatIdx   = bestCol(lH, "Location_Progress_Status", "Location Progress Status", "Status");

  const get = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");

  const stringData = stringRows.slice(1).map((row) => ({
    name: get(row, sNameIdx),
    stringNumber: parseInt(get(row, sNumIdx)) || null,
    ospName: get(row, sOspIdx),
    status: get(row, sStatIdx) || "pending",
  })).filter((s) => s.name);

  const locationData = locationRows.slice(1).map((row) => ({
    name: get(row, lNameIdx),
    ...parseLatLng(get(row, lLatLngIdx)),
    stringName: get(row, lStringIdx),
    ospName: get(row, lOspIdx),
    locationType: get(row, lTypeIdx) || "Tower",
    progressStatus: get(row, lStatIdx),
  })).filter((l) => l.name);

  const isOspType = (t: string) =>
    /osp|substation|sub-station/i.test(t);

  const ospLocations = locationData.filter((l) => isOspType(l.locationType));
  const ospNames = Array.from(
    new Set([
      ...ospLocations.map((l) => l.name),
      ...stringData.map((s) => s.ospName).filter(Boolean),
    ])
  ).filter(Boolean);

  const result: ImportResult = {
    osps: { created: 0, updated: 0 },
    strings: { created: 0, updated: 0, skipped: 0 },
    towers: { created: 0, updated: 0, skipped: 0 },
  };

  // ─── Ensure project + site ────────────────────────────────────────────────
  let project = (await db.select().from(projectsTable).limit(1))[0];
  if (!project) {
    [project] = await db
      .insert(projectsTable)
      .values({ name: "CVOW", description: "Coastal Virginia Offshore Wind project" })
      .returning();
  }

  let site = (await db.select().from(sitesTable).where(eq(sitesTable.projectId, project.id)).limit(1))[0];
  if (!site) {
    [site] = await db
      .insert(sitesTable)
      .values({ projectId: project.id, name: "CVOW", address: null })
      .returning();
  }

  // ─── Upsert OSPs ──────────────────────────────────────────────────────────
  const ospIdMap: Record<string, number> = {};
  const existingLocations = await db.select().from(locationsTable).where(eq(locationsTable.siteId, site.id));
  const existingOspByName = new Map(existingLocations.map((l) => [l.name, l]));

  for (const ospName of ospNames) {
    const ospLoc = ospLocations.find((l) => l.name === ospName);
    const notes = ospLoc ? `${ospLoc.lat ?? ""},${ospLoc.lng ?? ""}` : null;

    const existing = existingOspByName.get(ospName);
    if (existing) {
      await db
        .update(locationsTable)
        .set({ notes, updatedAt: new Date() })
        .where(eq(locationsTable.id, existing.id));
      ospIdMap[ospName] = existing.id;
      result.osps.updated++;
    } else {
      const [loc] = await db
        .insert(locationsTable)
        .values({ siteId: site.id, name: ospName, type: "OSP", notes })
        .returning();
      ospIdMap[ospName] = loc.id;
      result.osps.created++;
    }
  }

  // ─── Upsert strings ───────────────────────────────────────────────────────
  const stringIdMap: Record<string, number> = {};
  const existingStrings = await db.select().from(stringsTable);
  const existingStringByName = new Map(existingStrings.map((s) => [s.name, s]));

  for (const s of stringData) {
    const locationId = ospIdMap[s.ospName];
    if (!locationId) {
      result.strings.skipped++;
      continue;
    }
    const existing = existingStringByName.get(s.name);
    if (existing) {
      await db
        .update(stringsTable)
        .set({ stringNumber: s.stringNumber, status: s.status, updatedAt: new Date() })
        .where(eq(stringsTable.id, existing.id));
      stringIdMap[s.name] = existing.id;
      result.strings.updated++;
    } else {
      const [row] = await db
        .insert(stringsTable)
        .values({ locationId, name: s.name, stringNumber: s.stringNumber, status: s.status })
        .returning();
      stringIdMap[s.name] = row.id;
      result.strings.created++;
    }
  }

  // ─── Upsert towers ────────────────────────────────────────────────────────
  const existingTowers = await db.select().from(towersTable);
  const existingTowerByName = new Map(existingTowers.map((t) => [t.name, t]));

  for (const loc of locationData) {
    if (isOspType(loc.locationType) && !loc.stringName) continue;
    const stringId = loc.stringName ? stringIdMap[loc.stringName] : undefined;
    if (!stringId) {
      result.towers.skipped++;
      continue;
    }
    const towerType = isOspType(loc.locationType) ? "Tower" : (loc.locationType || "Tower");
    const existing = existingTowerByName.get(loc.name);
    if (existing) {
      await db
        .update(towersTable)
        .set({
          lat: loc.lat,
          lng: loc.lng,
          progressStatus: loc.progressStatus || "",
          locationType: towerType,
          updatedAt: new Date(),
        })
        .where(eq(towersTable.id, existing.id));
      result.towers.updated++;
    } else {
      await db.insert(towersTable).values({
        stringId,
        name: loc.name,
        lat: loc.lat,
        lng: loc.lng,
        progressStatus: loc.progressStatus || "",
        locationType: towerType,
        connectedTo: null,
        countOnString: null,
      });
      result.towers.created++;
    }
  }

  logger.info({ result }, "[setup] Import from sheet complete");
  return result;
}

router.post("/setup/import-from-sheet", async (req, res): Promise<void> => {
  if (!isSheetsConfigured()) {
    res.status(503).json({ error: "Google Sheets not configured" });
    return;
  }
  try {
    const result = await importFromSheet();
    res.json(result);
  } catch (err: unknown) {
    logger.error({ err }, "Import from sheet error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

async function importPhaseDefinitions(): Promise<{ phaseTypes: number; definitions: number; created: number; updated: number }> {
  const defsMap = new Map<string, { reqImgOrder: string | null; description: string | null }>();
  // phaseTypeSet collects ALL distinct phase names (even those with no req_img_type)
  const phaseTypeSet = new Set<string>();

  // ─── Fetch spreadsheet metadata to find both the dedicated tab and Photo tab ─
  let sheetMeta: { sheets?: { properties: { sheetId: number; title: string } }[] } | null = null;
  try {
    const metaResp = await sheetsRequest(`/${SPREADSHEET_ID}?fields=sheets(properties(sheetId,title))`);
    if (metaResp.ok) {
      sheetMeta = await metaResp.json() as typeof sheetMeta;
    }
  } catch (err) {
    logger.warn({ err }, "[setup] Could not fetch spreadsheet metadata");
  }

  // ─── Try gid=8644251 dedicated definitions tab ────────────────────────────
  if (sheetMeta) {
    try {
      const defTab = sheetMeta.sheets?.find((s) => s.properties.sheetId === 8644251);
      if (defTab) {
        const rows = await fetchSheet(`${defTab.properties.title}!A:Z`);
        const headers = rows[0] ?? [];
        logger.info({ headers, tabName: defTab.properties.title }, "[setup] Phase definitions tab headers");
        const phaseTypeIdx = bestCol(headers, "phase_type", "phase type", "phasetype", "Phase_Type", "Installation_Phase");
        const reqImgTypeIdx = bestCol(headers, "req_img_type", "required_image_type", "Required_Image_Type", "Req_Img_Type", "image_type");
        const reqImgOrderIdx = bestCol(headers, "req_img_order", "Required_Image_Order", "image_order", "order");
        const descIdx = bestCol(headers, "description", "Description", "desc");
        const get = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
        if (phaseTypeIdx >= 0 && reqImgTypeIdx >= 0) {
          for (const row of rows.slice(1)) {
            const pt = get(row, phaseTypeIdx);
            const rit = get(row, reqImgTypeIdx);
            if (pt) phaseTypeSet.add(pt);
            if (!pt || !rit) continue;
            defsMap.set(`${pt}|||${rit}`, {
              reqImgOrder: reqImgOrderIdx >= 0 ? get(row, reqImgOrderIdx) || null : null,
              description: descIdx >= 0 ? get(row, descIdx) || null : null,
            });
          }
          logger.info({ count: defsMap.size }, "[setup] Definitions loaded from dedicated tab");
        }
      }
    } catch (err) {
      logger.warn({ err }, "[setup] Could not read dedicated definitions tab");
    }

    // ─── Read phaseLink column directly from the main Photo tab ──────────────
    try {
      const photoTab = sheetMeta.sheets?.find((s) =>
        /^photo/i.test(s.properties.title) && !/location|string|cable/i.test(s.properties.title)
      );
      if (photoTab) {
        const headerRows = await fetchSheet(`${photoTab.properties.title}!1:1`);
        const photoHeaders = headerRows[0] ?? [];
        const phaseLinkColIdx = bestCol(photoHeaders,
          "Photo_Installation_Phase_Link", "photo_installation_phase_link",
          "Phase_Link", "phaseLink", "phase_link"
        );
        const reqImgTypeColIdx = bestCol(photoHeaders,
          "Required_Image_Type", "req_img_type", "Req_Img_Type", "required_image_type"
        );
        const reqImgOrderColIdx = bestCol(photoHeaders,
          "Required_Image_Order", "req_img_order", "Req_Img_Order"
        );
        if (phaseLinkColIdx >= 0) {
          // Fetch only the needed columns to avoid loading the entire photo tab
          const colLetter = (n: number) => {
            let s = "";
            for (let i = n; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s;
            return s;
          };
          const rightmostCol = Math.max(phaseLinkColIdx, reqImgTypeColIdx < 0 ? 0 : reqImgTypeColIdx, reqImgOrderColIdx < 0 ? 0 : reqImgOrderColIdx);
          const photoRows = await fetchSheet(`${photoTab.properties.title}!A:${colLetter(rightmostCol)}`);
          const get = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
          for (const row of photoRows.slice(1)) {
            const pt = get(row, phaseLinkColIdx);
            if (!pt) continue;
            phaseTypeSet.add(pt);
            if (reqImgTypeColIdx < 0) continue;
            const rit = get(row, reqImgTypeColIdx);
            if (!rit) continue;
            const key = `${pt}|||${rit}`;
            if (!defsMap.has(key)) {
              defsMap.set(key, {
                reqImgOrder: reqImgOrderColIdx >= 0 ? get(row, reqImgOrderColIdx) || null : null,
                description: null,
              });
            }
          }
          logger.info({ phaseLinkColIdx, photoPhaseTypes: phaseTypeSet.size }, "[setup] Photo tab phaseLink extracted");
        }
      }
    } catch (err) {
      logger.warn({ err }, "[setup] Could not read phaseLink from Photo tab, using DB fallback");
    }
  }

  // ─── Supplement from sheet_photos DB (handles case where sheet was synced) ─
  const distinctRows = await db
    .selectDistinct({ phaseLink: sheetPhotosTable.phaseLink, reqImgType: sheetPhotosTable.reqImgType, reqImgOrder: sheetPhotosTable.reqImgOrder })
    .from(sheetPhotosTable)
    .where(sql`${sheetPhotosTable.phaseLink} IS NOT NULL`);
  for (const row of distinctRows) {
    if (!row.phaseLink) continue;
    phaseTypeSet.add(row.phaseLink);
    if (!row.reqImgType) continue;
    const key = `${row.phaseLink}|||${row.reqImgType}`;
    if (!defsMap.has(key)) {
      defsMap.set(key, { reqImgOrder: row.reqImgOrder ?? null, description: null });
    }
  }
  logger.info({ total: defsMap.size, phaseTypes: phaseTypeSet.size }, "[setup] Phase definitions total after all sources");

  // ─── Count existing rows to compute accurate created/updated ─────────────
  const beforeCountRow = await db
    .select({ count: sql<string>`COUNT(*)` })
    .from(requiredImageDefinitionsTable);
  const beforeCount = parseInt(beforeCountRow[0]?.count ?? "0");

  for (const [key, extra] of defsMap) {
    const [phaseType, reqImgType] = key.split("|||");
    if (!phaseType || !reqImgType) continue;
    await db
      .insert(requiredImageDefinitionsTable)
      .values({ phaseType, reqImgType, reqImgOrder: extra.reqImgOrder, description: extra.description })
      .onConflictDoUpdate({
        target: [requiredImageDefinitionsTable.phaseType, requiredImageDefinitionsTable.reqImgType],
        set: { reqImgOrder: extra.reqImgOrder, description: extra.description, updatedAt: new Date() },
      });
  }

  const afterCountRow = await db
    .select({ count: sql<string>`COUNT(*)` })
    .from(requiredImageDefinitionsTable);
  const afterCount = parseInt(afterCountRow[0]?.count ?? "0");
  const created = afterCount - beforeCount;
  const updated = defsMap.size - created;

  return { phaseTypes: phaseTypeSet.size, definitions: defsMap.size, created, updated };
}

async function createPhasesForAllLocations(): Promise<{ created: number; skipped: number }> {
  // Combine phase types from definitions table AND distinct phaseLink in sheet_photos
  const fromDefs = await db
    .selectDistinct({ phaseType: requiredImageDefinitionsTable.phaseType })
    .from(requiredImageDefinitionsTable);
  const fromPhotos = await db
    .selectDistinct({ phaseLink: sheetPhotosTable.phaseLink })
    .from(sheetPhotosTable)
    .where(sql`${sheetPhotosTable.phaseLink} IS NOT NULL`);

  const allPhaseTypes = new Set<string>([
    ...fromDefs.map((r) => r.phaseType).filter((v): v is string => Boolean(v)),
    ...fromPhotos.map((r) => r.phaseLink).filter((v): v is string => Boolean(v)),
  ]);

  if (allPhaseTypes.size === 0) return { created: 0, skipped: 0 };

  const osps = await db.select().from(locationsTable).where(eq(locationsTable.type, "OSP"));
  let created = 0;
  let skipped = 0;

  for (const osp of osps) {
    for (const phaseType of allPhaseTypes) {
      const existing = await db
        .select()
        .from(phasesTable)
        .where(and(eq(phasesTable.locationId, osp.id), eq(phasesTable.phaseType, phaseType)))
        .limit(1);
      if (existing.length > 0) {
        skipped++;
      } else {
        const defCount = await db
          .select()
          .from(requiredImageDefinitionsTable)
          .where(eq(requiredImageDefinitionsTable.phaseType, phaseType));
        await db.insert(phasesTable).values({
          locationId: osp.id,
          phaseType,
          status: "pending",
          requiredImageCount: defCount.length,
        });
        created++;
      }
    }
  }
  return { created, skipped };
}

router.post("/setup/import-phase-definitions", requireAdmin, async (req, res): Promise<void> => {
  if (!isSheetsConfigured()) {
    res.status(503).json({ error: "Google Sheets not configured" });
    return;
  }
  try {
    const defResult = await importPhaseDefinitions();
    const phaseResult = await createPhasesForAllLocations();
    res.json({ definitions: defResult, phases: phaseResult });
  } catch (err: unknown) {
    logger.error({ err }, "Import phase definitions error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/setup/create-phases-for-locations", requireAdmin, async (req, res): Promise<void> => {
  try {
    const result = await createPhasesForAllLocations();
    res.json(result);
  } catch (err: unknown) {
    logger.error({ err }, "Create phases for locations error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Required Image Definitions CRUD ──────────────────────────────────────────

router.get("/setup/required-image-definitions", async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(requiredImageDefinitionsTable)
      .orderBy(requiredImageDefinitionsTable.phaseType, requiredImageDefinitionsTable.reqImgOrder, requiredImageDefinitionsTable.reqImgType);
    res.json(rows);
  } catch (err: unknown) {
    logger.error({ err }, "List required image definitions error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/setup/required-image-definitions", requireAdmin, async (req, res): Promise<void> => {
  const { phaseType, reqImgType, reqImgOrder, description } = req.body as {
    phaseType?: string;
    reqImgType?: string;
    reqImgOrder?: string;
    description?: string;
  };
  if (!phaseType?.trim() || !reqImgType?.trim()) {
    res.status(400).json({ error: "phaseType and reqImgType are required" });
    return;
  }
  try {
    const [row] = await db
      .insert(requiredImageDefinitionsTable)
      .values({
        phaseType: phaseType.trim(),
        reqImgType: reqImgType.trim(),
        reqImgOrder: reqImgOrder?.trim() || null,
        description: description?.trim() || null,
      })
      .returning();
    res.status(201).json(row);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique")) {
      res.status(409).json({ error: "A definition with this phase type and image type already exists" });
    } else {
      logger.error({ err }, "Create required image definition error");
      res.status(500).json({ error: msg });
    }
  }
});

router.patch("/setup/required-image-definitions/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { phaseType, reqImgType, reqImgOrder, description } = req.body as {
    phaseType?: string;
    reqImgType?: string;
    reqImgOrder?: string | null;
    description?: string | null;
  };
  if (phaseType !== undefined && !phaseType.trim()) {
    res.status(400).json({ error: "phaseType cannot be empty" });
    return;
  }
  if (reqImgType !== undefined && !reqImgType.trim()) {
    res.status(400).json({ error: "reqImgType cannot be empty" });
    return;
  }
  const set: Partial<{ phaseType: string; reqImgType: string; reqImgOrder: string | null; description: string | null; updatedAt: Date }> = { updatedAt: new Date() };
  if (phaseType !== undefined) set.phaseType = phaseType.trim();
  if (reqImgType !== undefined) set.reqImgType = reqImgType.trim();
  if (reqImgOrder !== undefined) set.reqImgOrder = reqImgOrder?.trim() || null;
  if (description !== undefined) set.description = description?.trim() || null;

  try {
    const [row] = await db
      .update(requiredImageDefinitionsTable)
      .set(set)
      .where(eq(requiredImageDefinitionsTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(row);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique")) {
      res.status(409).json({ error: "A definition with this phase type and image type already exists" });
    } else {
      logger.error({ err }, "Update required image definition error");
      res.status(500).json({ error: msg });
    }
  }
});

router.delete("/setup/required-image-definitions/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const [row] = await db
      .delete(requiredImageDefinitionsTable)
      .where(eq(requiredImageDefinitionsTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(204).end();
  } catch (err: unknown) {
    logger.error({ err }, "Delete required image definition error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
