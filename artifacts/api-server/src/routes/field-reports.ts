import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, desc } from "drizzle-orm";
import { PutObjectCommand, GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { db, fieldReportsTable, wasabiMirrorTasksTable, locationsTable, stringsTable } from "@workspace/db";
import { getWasabiClientAndCreds } from "../lib/wasabi.js";
import { generateFieldReportPdf, type FieldReportFormData, type FieldReportPdfImage } from "../lib/pdf-field-report.js";
import type { FieldReportImages } from "./field-report-images.js";
import { REPORT_TEMPLATES, getTemplate } from "../lib/report-templates.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const FIELD_REPORTS_PREFIX = "[Output] Field Reports/";

function sanitizeSegment(s: string | null | undefined): string {
  return (s ?? "").replace(/[\\/\r\n\t]+/g, "_").replace(/\.\.+/g, "_").trim();
}

async function loadReportImages(
  client: S3Client,
  bucket: string,
  template: { imagePlaceholders?: string[] | null },
  raw:    FieldReportImages | null,
): Promise<FieldReportPdfImage[]> {
  const placeholders = template.imagePlaceholders ?? [];
  if (!raw || placeholders.length === 0) return [];
  const out: FieldReportPdfImage[] = [];
  for (let i = 0; i < placeholders.length; i++) {
    const meta = raw[String(i)];
    if (!meta) continue;
    try {
      const obj = await client.send(new GetObjectCommand({ Bucket: bucket, Key: meta.wasabiKey }));
      const body = obj.Body as unknown as { transformToByteArray(): Promise<Uint8Array> } | undefined;
      if (!body) continue;
      const buffer = Buffer.from(await body.transformToByteArray());
      out.push({ index: i, caption: placeholders[i], buffer });
    } catch (err) {
      logger.warn({ err, key: meta.wasabiKey, index: i }, "Skipping unreadable field-report image");
    }
  }
  return out;
}

async function resolveOspForString(stringName: string): Promise<string> {
  const [stringRow] = await db
    .select({ locationId: stringsTable.locationId })
    .from(stringsTable)
    .where(eq(stringsTable.name, stringName));
  if (!stringRow) return "Unknown";
  const [loc] = await db
    .select({ name: locationsTable.name })
    .from(locationsTable)
    .where(eq(locationsTable.id, stringRow.locationId));
  return loc?.name ?? "Unknown";
}

// All /api/field-reports* endpoints require an authenticated session.
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.sessionType === "worker" || !req.session?.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  next();
}
router.use("/field-reports", requireAuth);

// ── GET /api/field-reports/templates — return template registry for the UI ──
router.get("/field-reports/templates", (_req, res): void => {
  // Strip the fileNamePattern function — UI just needs the schema.
  const out = REPORT_TEMPLATES.map(t => ({
    id: t.id,
    label: t.label,
    reportTypeTag: t.reportTypeTag,
    scope: t.scope,
    documentTitle: t.documentTitle,
    documentRefs: t.documentRefs ?? null,
    header: t.header,
    phases: t.phases ?? null,
    checklists: t.checklists,
    numericFields: t.numericFields ?? null,
    imagePlaceholders: t.imagePlaceholders ?? null,
    hasRemarks: t.hasRemarks ?? false,
  }));
  res.json({ templates: out });
});

// ── GET /api/field-reports — list (drafts + finalized) ──
router.get("/field-reports", async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const rows = await db
    .select()
    .from(fieldReportsTable)
    .orderBy(desc(fieldReportsTable.updatedAt));
  const filtered = status ? rows.filter(r => r.status === status) : rows;
  res.json({ reports: filtered, total: filtered.length });
});

// ── GET /api/field-reports/:id ──
router.get("/field-reports/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(fieldReportsTable).where(eq(fieldReportsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

interface CreateBody {
  templateId:  string;
  stringName:  string;
  cableName?:  string | null;
  formData:    FieldReportFormData;
}

// ── POST /api/field-reports — save as draft ──
router.post("/field-reports", async (req, res): Promise<void> => {
  const body = req.body as CreateBody;
  if (!body?.templateId || !body?.stringName || !body?.formData) {
    res.status(400).json({ error: "templateId, stringName and formData are required" });
    return;
  }
  const template = getTemplate(body.templateId);
  if (!template) { res.status(400).json({ error: "Unknown templateId" }); return; }
  if (template.scope === "cable" && !body.cableName) {
    res.status(400).json({ error: "cableName is required for cable-scope templates" });
    return;
  }

  const ospName = await resolveOspForString(body.stringName);
  const createdBy = req.session.username ?? `user:${req.session.userId}`;

  try {
    const [row] = await db.insert(fieldReportsTable).values({
      templateId:  body.templateId,
      ospName,
      stringName:  body.stringName,
      cableName:   body.cableName ?? null,
      formData:    body.formData,
      status:      "draft",
      createdBy,
    }).returning();
    res.status(201).json(row);
  } catch (err: unknown) {
    const cause = err && typeof err === "object" && "cause" in err ? (err as { cause: unknown }).cause : null;
    logger.error({ err, cause }, "Failed to create field report");
    const detail = cause && typeof cause === "object" && "message" in cause ? String((cause as { message: unknown }).message) : String(err);
    res.status(500).json({ error: detail });
  }
});

// ── PATCH /api/field-reports/:id — update draft ──
router.patch("/field-reports/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db.select().from(fieldReportsTable).where(eq(fieldReportsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.status === "final") { res.status(409).json({ error: "Cannot edit a finalized report" }); return; }

  const body = req.body as Partial<CreateBody>;
  const nextStringName = body.stringName ?? existing.stringName;
  // If string changes, re-resolve OSP so the eventual Wasabi path matches the string's site.
  const ospName = body.stringName && body.stringName !== existing.stringName
    ? await resolveOspForString(body.stringName)
    : existing.ospName;

  const [row] = await db.update(fieldReportsTable)
    .set({
      formData:   body.formData   ?? existing.formData,
      cableName:  body.cableName  ?? existing.cableName,
      stringName: nextStringName,
      ospName,
      updatedAt:  new Date(),
    })
    .where(eq(fieldReportsTable.id, id))
    .returning();
  res.json(row);
});

// ── DELETE /api/field-reports/:id — only drafts ──
router.delete("/field-reports/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db.select().from(fieldReportsTable).where(eq(fieldReportsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.status === "final") { res.status(409).json({ error: "Cannot delete a finalized report" }); return; }
  await db.delete(fieldReportsTable).where(eq(fieldReportsTable.id, id));
  res.status(204).end();
});

// ── POST /api/field-reports/:id/finalize — render PDF + push to Wasabi ──
router.post("/field-reports/:id/finalize", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(fieldReportsTable).where(eq(fieldReportsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (row.status === "final") { res.status(409).json({ error: "Report is already finalized" }); return; }
  const template = getTemplate(row.templateId);
  if (!template) { res.status(400).json({ error: "Unknown template" }); return; }

  const wasabi = await getWasabiClientAndCreds();
  if (!wasabi) {
    res.status(503).json({ error: "Wasabi not configured — cannot finalize without storage." });
    return;
  }

  try {
    const generatedBy = req.session.username ?? `user:${req.session.userId}`;
    const generatedAt = new Date();
    const images = await loadReportImages(
      wasabi.client, wasabi.creds.bucket, template, row.images as FieldReportImages | null,
    );
    const pdf = await generateFieldReportPdf({
      template,
      data: row.formData as FieldReportFormData,
      generatedBy,
      generatedAt,
      images,
    });

    const safeString = sanitizeSegment(row.stringName);
    const safeCable  = sanitizeSegment(row.cableName);
    const safeOsp    = sanitizeSegment(row.ospName);

    const rawFileName = template.fileNamePattern({
      stringName: safeString,
      cableName:  safeCable || null,
    });
    const fileName = sanitizeSegment(rawFileName);

    const pathParts = [safeOsp, safeString];
    if (template.scope === "cable" && safeCable) pathParts.push(safeCable);
    const safePath = pathParts.join("/");
    const wasabiKey = `${FIELD_REPORTS_PREFIX}${safePath}/${fileName}`;
    const drivePath = wasabiKey;

    await wasabi.client.send(new PutObjectCommand({
      Bucket:      wasabi.creds.bucket,
      Key:         wasabiKey,
      Body:        pdf,
      ContentType: "application/pdf",
    }));

    // Insert mirror task row so this PDF flows into existing /api/reports listings
    // and into Handover Pack generation alongside Drive-mirrored PDFs.
    const driveFileId = `manual:${row.id}`;
    const [mirror] = await db.insert(wasabiMirrorTasksTable).values({
      rootFolderId: "manual",
      driveFileId,
      fileName,
      drivePath,
      wasabiKey,
      status: "done",
    }).onConflictDoUpdate({
      target: wasabiMirrorTasksTable.driveFileId,
      set: { fileName, drivePath, wasabiKey, status: "done", error: null },
    }).returning();

    const [updated] = await db.update(fieldReportsTable).set({
      status:       "final",
      finalizedAt:  generatedAt,
      wasabiKey,
      mirrorTaskId: mirror?.id ?? null,
      updatedAt:    generatedAt,
    }).where(eq(fieldReportsTable.id, id)).returning();

    res.json(updated);
  } catch (err: unknown) {
    logger.error({ err, id }, "Failed to finalize field report");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── GET /api/field-reports/:id/pdf — re-render preview (no upload) ──
router.get("/field-reports/:id/pdf", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(fieldReportsTable).where(eq(fieldReportsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const template = getTemplate(row.templateId);
  if (!template) { res.status(400).json({ error: "Unknown template" }); return; }

  try {
    const wasabi = await getWasabiClientAndCreds();
    const images = wasabi
      ? await loadReportImages(wasabi.client, wasabi.creds.bucket, template, row.images as FieldReportImages | null)
      : [];
    const pdf = await generateFieldReportPdf({
      template,
      data: row.formData as FieldReportFormData,
      generatedBy: row.createdBy,
      generatedAt: row.finalizedAt ?? row.updatedAt,
      images,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="preview-${row.id}.pdf"`);
    res.send(pdf);
  } catch (err: unknown) {
    logger.error({ err, id }, "Failed to render field-report preview");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
