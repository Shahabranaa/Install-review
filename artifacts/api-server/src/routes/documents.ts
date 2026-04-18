import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { db, documentsTable, phasesTable, imagesTable, issuesTable, locationsTable, pool } from "@workspace/db";
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
import { generateHandoverPdf, type HandoverPhoto, type HandoverReport } from "../lib/pdf-handover.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const FIELD_REPORTS_PREFIX = "[Output] Field Reports/";

// ── Helper: parse drivePath into {site, string, cable, name} ─────────────────

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
  const parts = stripped.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  const pathParts = (last === fileName || last.toLowerCase() === fileName.toLowerCase())
    ? parts.slice(0, -1)
    : parts;
  if (pathParts.length < 2) return null;
  const [site, stringName, ...rest] = pathParts;
  const cable = rest.length > 0 ? rest[0] : null;
  const name = fileName;
  return {
    site: site ?? "Unknown",
    string: stringName ?? "Unknown",
    cable,
    name,
    reportType: parseReportType(name),
  };
}

function stripNameBlurb(name: string): string {
  const idx = name.search(/ for /i);
  return idx !== -1 ? name.slice(idx + 5) : name;
}

// ── GET /documents ─────────────────────────────────────────────────────────────

router.get("/documents", async (req, res): Promise<void> => {
  const queryParams = ListDocumentsQueryParams.safeParse(req.query);
  let documents;
  if (queryParams.success && queryParams.data.phaseId) {
    documents = await db.select().from(documentsTable).where(eq(documentsTable.phaseId, queryParams.data.phaseId));
  } else {
    documents = await db.select().from(documentsTable);
  }
  res.json(ListDocumentsResponse.parse(serialize(documents)));
});

// ── GET /documents/handover — list handover packs only ────────────────────────

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

// ── POST /documents/generate ─────────────────────────────────────────────────

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
    .warning { background: #fefcbf; color: #b7791f; }
    .info { background: #bee3f8; color: #2b6cb0; }
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

// ── POST /documents/generate-handover — PDF handover pack for a string ────────

router.post("/documents/generate-handover", async (req, res): Promise<void> => {
  const { stringName, generatedBy } = req.body as { stringName?: string; generatedBy?: string };

  if (!stringName || typeof stringName !== "string" || stringName.trim() === "") {
    res.status(400).json({ error: "stringName is required" });
    return;
  }
  if (!generatedBy || typeof generatedBy !== "string") {
    res.status(400).json({ error: "generatedBy is required" });
    return;
  }

  const name = stringName.trim();

  try {
    // 1. Fetch approved photos for the string (ordered by cable → phase → req_img_order)
    const photoRows = await pool.query<{
      photo_id: string;
      cable_link: string | null;
      phase_link: string | null;
      req_img_type: string | null;
      req_img_order: string | null;
      approval: string | null;
      label: string | null;
    }>(`
      SELECT photo_id, cable_link, phase_link, req_img_type, req_img_order, approval, label
      FROM sheet_photos
      WHERE photo_string = $1
        AND LOWER(COALESCE(approval,'')) IN ('approved','checked','verified')
      ORDER BY cable_link NULLS LAST, phase_link NULLS LAST,
               CAST(NULLIF(regexp_replace(req_img_order,'[^0-9]','','g'),'') AS integer) NULLS LAST
    `, [name]);

    const photos: HandoverPhoto[] = photoRows.rows.map(r => ({
      photoId:    r.photo_id,
      cableLink:  r.cable_link,
      phaseLink:  r.phase_link,
      reqImgType: r.req_img_type,
      reqImgOrder: r.req_img_order,
      approval:   r.approval,
      label:      r.label,
    }));

    // 2. Fetch field reports for the string from the wasabi mirror table
    const reportRows = await pool.query<{
      drive_path: string;
      file_name: string;
      wasabi_key: string;
    }>(`
      SELECT drive_path, file_name, wasabi_key
      FROM wasabi_mirror_tasks
      WHERE drive_path LIKE $1
        AND lower(file_name) LIKE '%.pdf'
        AND status = 'done'
      ORDER BY drive_path
    `, [FIELD_REPORTS_PREFIX + "%"]);

    const reports: HandoverReport[] = [];
    for (const row of reportRows.rows) {
      const parsed = parseDrivePath(row.drive_path, row.file_name);
      if (!parsed) continue;
      if (parsed.string !== name) continue;
      reports.push({
        name:       stripNameBlurb(parsed.name.replace(/\.pdf$/i, "")),
        reportType: parsed.reportType,
        cable:      parsed.cable,
        string:     parsed.string,
      });
    }

    // 3. Generate PDF
    const generatedAt = new Date();
    const pdfBuffer = generateHandoverPdf({ stringName: name, generatedBy, generatedAt, photos, reports });

    // 4. Upload to Wasabi (if configured)
    const dateStr = generatedAt.toISOString().slice(0, 10);
    const timeStr = generatedAt.toISOString().slice(11, 16).replace(":", "");
    const safeString = name.replace(/[^a-zA-Z0-9\-_.()]/g, "_");
    const wasabiKey = `[Output] Handover Packs/${safeString}/${safeString}-${dateStr}_${timeStr}.pdf`;

    const wasabi = await getWasabiClientAndCreds();
    if (wasabi) {
      await wasabi.client.send(new PutObjectCommand({
        Bucket:      wasabi.creds.bucket,
        Key:         wasabiKey,
        Body:        pdfBuffer,
        ContentType: "application/pdf",
      }));
    }

    // 5. Record in documents table
    const title = `Handover Pack — String ${name} (${dateStr})`;
    const [doc] = await db.insert(documentsTable).values({
      generatedBy,
      generatedAt,
      title,
      packType:    "handover",
      stringName:  name,
      wasabiKey:   wasabi ? wasabiKey : null,
      photoCount:  photos.length,
      reportCount: reports.length,
    }).returning();

    // 6. If Wasabi not configured, send the PDF directly as download
    if (!wasabi) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${safeString}-handover-${dateStr}.pdf"`);
      res.send(pdfBuffer);
      return;
    }

    res.status(201).json({
      id:          doc.id,
      title:       doc.title,
      stringName:  doc.stringName,
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

// ── GET /documents/:id ────────────────────────────────────────────────────────

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
  res.json(GetDocumentResponse.parse(serialize(doc)));
});

// ── GET /documents/:id/download ───────────────────────────────────────────────

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

  // Handover packs are stored as PDFs in Wasabi — redirect to the view endpoint
  if (doc.packType === "handover" && doc.wasabiKey) {
    res.redirect(`/api/reports/view?key=${encodeURIComponent(doc.wasabiKey)}`);
    return;
  }

  res.setHeader("Content-Type", "text/html");
  res.setHeader("Content-Disposition", `attachment; filename="${doc.title.replace(/[^a-zA-Z0-9-_]/g, "_")}.html"`);
  res.send(doc.content ?? "<html><body><p>No content</p></body></html>");
});

export default router;
