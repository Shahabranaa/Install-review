import { Router, type IRouter } from "express";
import { eq, inArray, ne } from "drizzle-orm";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { db, documentsTable, phasesTable, imagesTable, issuesTable, locationsTable, stringsTable, pool } from "@workspace/db";
import {
  ListDocumentsQueryParams,
  ListDocumentsResponse,
  GenerateDocumentBody,
  GetDocumentParams,
  GetDocumentResponse,
  DownloadDocumentParams,
} from "@workspace/api-zod";
import { serialize } from "../lib/serialize.js";
import { getWasabiClientAndCreds } from "../lib/wasabi.js";
import { generateHandoverPdf, type HandoverPhotoWithBuffer, type HandoverReport } from "../lib/pdf-handover.js";
import { logger } from "../lib/logger.js";
import pLimit from "p-limit";

const router: IRouter = Router();

const FIELD_REPORTS_PREFIX = "[Output] Field Reports/";

// ── Helper: parse drivePath into ParsedReport ─────────────────────────────────

interface ParsedReport {
  site: string;
  string: string;
  cable: string | null;
  name: string;
  reportType: string;
}

function parseReportType(name: string): string {
  const n = name.replace(/\.pdf$/i, "").toLowerCase();
  if (n.includes("as-found"))               return "As-Found";
  if (n.includes("as-left"))                return "As-Left";
  if (n.includes("completion check"))       return "Completion Check";
  if (n.includes("fo termination"))         return "FO Termination";
  if (n.includes("iccp"))                   return "ICCP";
  if (n.includes("pull-in preparation") || n.includes("pull in preparation")) return "Pull-in Preparation";
  if (n.includes("temporary hang off"))     return "Temporary Hang Off";
  if (n.includes("permanent hang off"))     return "Permanent Hang Off";
  if (n.includes("cable pull-in") || n.includes("cable pull in")) return "Cable Pull-in";
  if (n.includes("termination completion")) return "Termination Completion";
  if (n.includes("termination activit"))    return "FO Termination";
  return "Report";
}

function parseDrivePath(drivePath: string, fileName: string): ParsedReport | null {
  const stripped = drivePath.slice(FIELD_REPORTS_PREFIX.length);
  const parts    = stripped.split("/").filter(Boolean);
  const last     = parts[parts.length - 1];
  const pathParts = (last === fileName || last.toLowerCase() === fileName.toLowerCase())
    ? parts.slice(0, -1) : parts;
  if (pathParts.length < 2) return null;
  const [site, stringName, ...rest] = pathParts;
  return {
    site:       site       ?? "Unknown",
    string:     stringName ?? "Unknown",
    cable:      rest.length > 0 ? rest[0] : null,
    name:       fileName,
    reportType: parseReportType(fileName),
  };
}

function stripNameBlurb(name: string): string {
  const idx = name.search(/ for /i);
  return idx !== -1 ? name.slice(idx + 5) : name;
}

// ── GET /documents — phase docs only (avoids null phaseId breaking zod types) ─

router.get("/documents", async (req, res): Promise<void> => {
  const queryParams = ListDocumentsQueryParams.safeParse(req.query);
  let documents;
  if (queryParams.success && queryParams.data.phaseId) {
    documents = await db.select().from(documentsTable)
      .where(eq(documentsTable.phaseId, queryParams.data.phaseId));
  } else {
    documents = await db.select().from(documentsTable)
      .where(ne(documentsTable.packType, "handover"));
  }
  res.json(ListDocumentsResponse.parse(serialize(documents)));
});

// ── GET /documents/handover — list handover packs ──────────────────────────────

router.get("/documents/handover", async (_req, res): Promise<void> => {
  try {
    const packs = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.packType, "handover"))
      .orderBy(documentsTable.generatedAt);

    res.json({ packs: serialize(packs), total: packs.length });
  } catch (err: unknown) {
    logger.error({ err }, "Failed to list handover packs");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── POST /documents/generate ──────────────────────────────────────────────────

router.post("/documents/generate", async (req, res): Promise<void> => {
  const parsed = GenerateDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { phaseId, generatedBy, title } = parsed.data;
  const [phase] = await db.select().from(phasesTable).where(eq(phasesTable.id, phaseId));
  if (!phase) {
    res.status(400).json({ error: "Phase not found" });
    return;
  }
  if (phase.status !== "complete") {
    res.status(400).json({ error: "Phase must be approved/complete before generating a document" });
    return;
  }
  const [location] = await db.select().from(locationsTable).where(eq(locationsTable.id, phase.locationId));
  const images = await db.select().from(imagesTable).where(eq(imagesTable.phaseId, phaseId));
  const imageIds = images.map((i) => i.id);
  let allIssues: { severity: string; type: string; description: string; resolved: boolean }[] = [];
  if (imageIds.length > 0) {
    allIssues = await db.select({
      severity: issuesTable.severity,
      type: issuesTable.type,
      description: issuesTable.description,
      resolved: issuesTable.resolved,
    }).from(issuesTable).where(inArray(issuesTable.imageId, imageIds));
  }
  const approvedImages = images.filter((i) => i.reviewStatus === "approved");
  const rejectedImages = images.filter((i) => i.reviewStatus === "rejected");
  const criticalIssues = allIssues.filter((i) => i.severity === "critical" && !i.resolved);

  const docTitle = title ?? `Phase Completion Report — ${phase.phaseType}`;
  const generatedAt = new Date().toISOString();
  const content = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${docTitle}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #1a1a2e; }
    h1 { color: #1a1a2e; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; }
    h2 { color: #2d3748; margin-top: 32px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; font-size: 14px; }
    th { background: #f7fafc; font-weight: 600; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .critical { background: #fed7d7; color: #c53030; }
    .approved { background: #c6f6d5; color: #276749; }
    .rejected { background: #fed7d7; color: #c53030; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 16px 0; }
    .summary-card { background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; text-align: center; }
    .summary-card .value { font-size: 28px; font-weight: 700; color: #2d3748; }
    .summary-card .label { font-size: 13px; color: #718096; margin-top: 4px; }
    .meta { color: #718096; font-size: 13px; margin-bottom: 8px; }
  </style>
</head>
<body>
  <h1>${docTitle}</h1>
  <p class="meta">Generated: ${generatedAt} | Generated by: ${generatedBy}</p>
  <p class="meta">Phase Type: <strong>${phase.phaseType}</strong> | Status: <strong>${phase.status}</strong> | Location: <strong>${location?.name ?? "Unknown"} (${location?.type ?? ""})</strong></p>
  ${phase.approvedBy ? `<p class="meta">Approved by: <strong>${phase.approvedBy}</strong> on ${phase.approvedAt ? new Date(phase.approvedAt).toLocaleString() : "N/A"}</p>` : ""}

  <h2>Summary</h2>
  <div class="summary-grid">
    <div class="summary-card"><div class="value">${images.length}</div><div class="label">Total Images</div></div>
    <div class="summary-card"><div class="value">${approvedImages.length}</div><div class="label">Approved</div></div>
    <div class="summary-card"><div class="value">${rejectedImages.length}</div><div class="label">Rejected</div></div>
    <div class="summary-card"><div class="value">${allIssues.length}</div><div class="label">Total Issues</div></div>
    <div class="summary-card"><div class="value">${criticalIssues.length}</div><div class="label">Critical Issues</div></div>
    <div class="summary-card"><div class="value">${allIssues.filter(i => i.resolved).length}</div><div class="label">Resolved Issues</div></div>
  </div>

  <h2>Image Records (${images.length})</h2>
  <table>
    <thead><tr><th>#</th><th>Filename</th><th>Uploaded By</th><th>Uploaded At</th><th>Review Status</th><th>Reviewed By</th></tr></thead>
    <tbody>
      ${images.map((img, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${img.filename ?? img.driveFileId ?? `Image ${img.id}`}</td>
        <td>${img.uploadedBy ?? "—"}</td>
        <td>${new Date(img.uploadedAt).toLocaleString()}</td>
        <td><span class="badge ${img.reviewStatus}">${img.reviewStatus}</span></td>
        <td>${img.reviewedBy ?? "—"}</td>
      </tr>`).join("")}
    </tbody>
  </table>

  ${allIssues.length > 0 ? `
  <h2>Issues (${allIssues.length})</h2>
  <table>
    <thead><tr><th>Severity</th><th>Type</th><th>Description</th><th>Status</th></tr></thead>
    <tbody>
      ${allIssues.map((issue) => `
      <tr>
        <td><span class="badge ${issue.severity}">${issue.severity}</span></td>
        <td>${issue.type}</td>
        <td>${issue.description}</td>
        <td>${issue.resolved ? "Resolved" : "Open"}</td>
      </tr>`).join("")}
    </tbody>
  </table>
  ` : "<h2>Issues</h2><p>No issues recorded.</p>"}

  <hr style="margin-top:40px; border-color: #e2e8f0;" />
  <p style="color:#718096; font-size:12px;">This document was auto-generated by the Installation Image Review System.</p>
</body>
</html>`;

  const [doc] = await db.insert(documentsTable).values({
    phaseId,
    generatedBy,
    title: docTitle,
    content,
    generatedAt: new Date(),
  }).returning();

  res.status(201).json(GetDocumentResponse.parse(serialize(doc)));
});

// ── POST /documents/generate-handover ────────────────────────────────────────

router.post("/documents/generate-handover", async (req, res): Promise<void> => {
  // Accept stringId (preferred) or stringName (legacy fallback)
  const { stringId, stringName: rawStringName, generatedBy } = req.body as {
    stringId?: number;
    stringName?: string;
    generatedBy?: string;
  };

  if (!stringId && (!rawStringName || typeof rawStringName !== "string" || rawStringName.trim() === "")) {
    res.status(400).json({ error: "stringId or stringName is required" });
    return;
  }
  if (!generatedBy || typeof generatedBy !== "string") {
    res.status(400).json({ error: "generatedBy is required" });
    return;
  }

  try {
    // 1. Resolve string record (by ID when available, fall back to name lookup)
    let stringRecord: { name: string; locationId: number } | undefined;
    if (stringId) {
      const [row] = await db
        .select({ name: stringsTable.name, locationId: stringsTable.locationId })
        .from(stringsTable)
        .where(eq(stringsTable.id, stringId));
      stringRecord = row;
    } else {
      const nameTrimmed = rawStringName!.trim();
      const [row] = await db
        .select({ name: stringsTable.name, locationId: stringsTable.locationId })
        .from(stringsTable)
        .where(eq(stringsTable.name, nameTrimmed));
      stringRecord = row;
    }

    if (!stringRecord) {
      res.status(404).json({ error: "String not found" });
      return;
    }

    const name = stringRecord.name;

    // 1b. Resolve OSP from the string's locationId (authoritative join via ID)
    let ospName = "Unknown";
    const [loc] = await db
      .select({ name: locationsTable.name })
      .from(locationsTable)
      .where(eq(locationsTable.id, stringRecord.locationId));
    if (loc) ospName = loc.name;

    // 2. Fetch approved photos (ordered by cable → phase → req_img_order)
    const photoRows = await pool.query<{
      photo_id: string;
      cable_link: string | null;
      phase_link: string | null;
      req_img_type: string | null;
      req_img_order: string | null;
      approval: string | null;
      label: string | null;
      wasabi_key: string | null;
      image_available: boolean | null;
    }>(`
      SELECT photo_id, cable_link, phase_link, req_img_type, req_img_order,
             approval, label, wasabi_key, image_available
      FROM sheet_photos
      WHERE photo_string = $1
        AND LOWER(COALESCE(approval,'')) IN ('approved','checked','verified')
      ORDER BY cable_link NULLS LAST, phase_link NULLS LAST,
               CAST(NULLIF(regexp_replace(COALESCE(req_img_order,''),'[^0-9]','','g'),'') AS integer) NULLS LAST
    `, [name]);

    // 3. Fetch approved photo images from Wasabi (parallel, max 8 concurrent)
    const wasabi = await getWasabiClientAndCreds();
    const limit  = pLimit(8);

    const photos: HandoverPhotoWithBuffer[] = await Promise.all(
      photoRows.rows.map(r => limit(async () => {
        let imageBuffer: Buffer | null = null;
        if (wasabi && r.wasabi_key && r.image_available !== false) {
          try {
            const cmd = new GetObjectCommand({ Bucket: wasabi.creds.bucket, Key: r.wasabi_key });
            const resp = await wasabi.client.send(cmd);
            if (resp.Body) {
              const chunks: Uint8Array[] = [];
              for await (const chunk of resp.Body as AsyncIterable<Uint8Array>) {
                chunks.push(chunk);
              }
              imageBuffer = Buffer.concat(chunks);
            }
          } catch {
            // If image fetch fails, leave imageBuffer null
          }
        }
        return {
          photoId:    r.photo_id,
          cableLink:  r.cable_link,
          phaseLink:  r.phase_link,
          reqImgType: r.req_img_type,
          reqImgOrder: r.req_img_order,
          approval:   r.approval,
          label:      r.label,
          imageBuffer,
        };
      })),
    );

    // 4. Fetch field reports for the string
    const reportRows = await pool.query<{
      drive_path: string;
      file_name: string;
    }>(`
      SELECT drive_path, file_name
      FROM wasabi_mirror_tasks
      WHERE drive_path LIKE $1
        AND lower(file_name) LIKE '%.pdf'
        AND status = 'done'
      ORDER BY drive_path
    `, [FIELD_REPORTS_PREFIX + "%"]);

    const reports: HandoverReport[] = [];
    for (const row of reportRows.rows) {
      const parsed = parseDrivePath(row.drive_path, row.file_name);
      if (!parsed || parsed.string !== name) continue;
      reports.push({
        name:       stripNameBlurb(parsed.name.replace(/\.pdf$/i, "")),
        reportType: parsed.reportType,
        cable:      parsed.cable,
        string:     parsed.string,
      });
    }

    // 5. Generate PDF (async — waits for PDFKit stream to fully flush)
    const generatedAt = new Date();
    const pdfBuffer = await generateHandoverPdf({ stringName: name, ospName, generatedBy, generatedAt, photos, reports });

    // 6. Upload to Wasabi (if configured)
    const dateStr   = generatedAt.toISOString().slice(0, 10);
    const timeStr   = generatedAt.toISOString().slice(11, 16).replace(":", "");
    const safeStr   = name.replace(/[^a-zA-Z0-9\-_.()]/g, "_");
    const wasabiKey = `[Output] Handover Packs/${safeStr}/${safeStr}-${dateStr}_${timeStr}.pdf`;

    if (wasabi) {
      await wasabi.client.send(new PutObjectCommand({
        Bucket:      wasabi.creds.bucket,
        Key:         wasabiKey,
        Body:        pdfBuffer,
        ContentType: "application/pdf",
      }));
    }

    // 7. Record in DB (single insertion; non-Wasabi path stores PDF as base64 in content)
    const title = `Handover Pack — String ${name} (${dateStr})`;
    const [doc] = await db.insert(documentsTable).values({
      generatedBy,
      generatedAt,
      title,
      packType:    "handover",
      stringName:  name,
      ospName,
      wasabiKey:   wasabi ? wasabiKey : null,
      // If Wasabi is unavailable, store the PDF as base64 so /download can serve it later
      content:     wasabi ? null : pdfBuffer.toString("base64"),
      photoCount:  photos.length,
      reportCount: reports.length,
    }).returning();

    // 8. If Wasabi not configured: stream PDF directly (row is already persisted above)
    if (!wasabi) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${safeStr}-handover-${dateStr}.pdf"`);
      res.send(pdfBuffer);
      return;
    }

    res.status(201).json({
      id:          doc.id,
      title:       doc.title,
      stringName:  doc.stringName,
      ospName:     doc.ospName,
      wasabiKey:   doc.wasabiKey,
      photoCount:  doc.photoCount,
      reportCount: doc.reportCount,
      generatedAt: doc.generatedAt,
      generatedBy: doc.generatedBy,
    });
  } catch (err: unknown) {
    logger.error({ err }, "Failed to generate handover pack");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── GET /documents/:id — phase docs only (avoids zod parse failure on null phaseId) ──

router.get("/documents/:id", async (req, res): Promise<void> => {
  const params = GetDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, params.data.id));
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  // Handover packs have null phaseId — return a custom shape instead of broken zod parse
  if (doc.packType === "handover") {
    res.json({
      id:          doc.id,
      title:       doc.title,
      stringName:  doc.stringName,
      ospName:     doc.ospName,
      wasabiKey:   doc.wasabiKey,
      photoCount:  doc.photoCount,
      reportCount: doc.reportCount,
      generatedAt: doc.generatedAt,
      generatedBy: doc.generatedBy,
      packType:    "handover",
    });
    return;
  }
  res.json(GetDocumentResponse.parse(serialize(doc)));
});

// ── GET /documents/:id/download ────────────────────────────────────────────────

router.get("/documents/:id/download", async (req, res): Promise<void> => {
  const params = DownloadDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, params.data.id));
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  if (doc.packType === "handover") {
    if (doc.wasabiKey) {
      // Stored in Wasabi — proxy through the reports viewer
      res.redirect(`/api/reports/view?key=${encodeURIComponent(doc.wasabiKey)}`);
      return;
    }
    if (doc.content) {
      // Stored as base64 in DB (no Wasabi configured)
      const safeTitle = doc.title.replace(/[^a-zA-Z0-9-_.() ]/g, "_");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.pdf"`);
      res.send(Buffer.from(doc.content, "base64"));
      return;
    }
    res.status(404).json({ error: "Handover pack file not available" });
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.setHeader("Content-Disposition", `attachment; filename="${doc.title.replace(/[^a-zA-Z0-9-_]/g, "_")}.html"`);
  res.send(doc.content ?? "<html><body><p>No content</p></body></html>");
});

export default router;
