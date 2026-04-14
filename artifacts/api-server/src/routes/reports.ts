import { Router, type IRouter } from "express";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { pool } from "@workspace/db";
import { getWasabiClientAndCreds } from "../lib/wasabi.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const FIELD_REPORTS_PREFIX = "[Output] Field Reports/";

interface ReportRow {
  id: number;
  drive_file_id: string;
  file_name: string;
  drive_path: string;
  wasabi_key: string;
}

interface ReportRecord {
  id: number;
  driveFileId: string;
  fileName: string;
  drivePath: string;
  wasabiKey: string;
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
  if (n.includes("pull-in preparation") || n.includes("pull in preparation"))
                                             return "Pull-in Preparation";
  if (n.includes("temporary hang off"))     return "Temporary Hang Off";
  if (n.includes("permanent hang off"))     return "Permanent Hang Off";
  if (n.includes("cable pull-in") || n.includes("cable pull in"))
                                             return "Cable Pull-in";
  if (n.includes("termination completion")) return "Termination Completion";
  if (n.includes("termination activit"))    return "FO Termination";
  return "Report";
}

function parsePath(drivePath: string, fileName: string): { site: string; string: string; cable: string | null; name: string } | null {
  const stripped = drivePath.slice(FIELD_REPORTS_PREFIX.length);
  const parts = stripped.split("/").filter(Boolean);
  // Remove trailing filename from path if it's the same as file_name
  const last = parts[parts.length - 1];
  const pathParts = (last === fileName || last.toLowerCase() === fileName.toLowerCase())
    ? parts.slice(0, -1)
    : parts;

  if (pathParts.length === 2) {
    // Site/String/report.pdf
    return { site: pathParts[0], string: pathParts[1], cable: null, name: fileName };
  }
  if (pathParts.length === 3) {
    // Site/String/Cable/report.pdf
    return { site: pathParts[0], string: pathParts[1], cable: pathParts[2], name: fileName };
  }
  if (pathParts.length === 1) {
    // Site-level report (rare)
    return { site: pathParts[0], string: "", cable: null, name: fileName };
  }
  return null;
}

// GET /api/reports — list all field reports from the mirror table
router.get("/reports", async (_req, res): Promise<void> => {
  try {
    const result = await pool.query<ReportRow>(`
      SELECT id, drive_file_id, file_name, drive_path, wasabi_key
      FROM wasabi_mirror_tasks
      WHERE drive_path LIKE $1
        AND lower(file_name) LIKE '%.pdf'
        AND status = 'done'
      ORDER BY drive_path
    `, [FIELD_REPORTS_PREFIX + "%"]);

    const reports: ReportRecord[] = [];
    for (const row of result.rows) {
      const parsed = parsePath(row.drive_path, row.file_name);
      if (!parsed) continue;
      reports.push({
        id:          row.id,
        driveFileId: row.drive_file_id,
        fileName:    row.file_name,
        drivePath:   row.drive_path,
        wasabiKey:   row.wasabi_key,
        site:        parsed.site,
        string:      parsed.string,
        cable:       parsed.cable,
        name:        parsed.name.replace(/\.pdf$/i, ""),
        reportType:  parseReportType(parsed.name),
      });
    }

    res.json({ reports, total: reports.length });
  } catch (err: unknown) {
    logger.error({ err }, "Failed to list reports");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/reports/view?key=<wasabi_key> — stream a PDF from Wasabi
router.get("/reports/view", async (req, res): Promise<void> => {
  const key = req.query.key as string | undefined;
  if (!key) {
    res.status(400).json({ error: "Missing key parameter" }); return;
  }

  // Validate the key exists in the mirror table as a done field report PDF
  // (DB-level check rather than prefix-only, prevents any path traversal)
  try {
    const check = await pool.query<{ wasabi_key: string }>(
      `SELECT wasabi_key FROM wasabi_mirror_tasks
       WHERE wasabi_key = $1
         AND status = 'done'
         AND lower(file_name) LIKE '%.pdf'
         AND drive_path LIKE $2
       LIMIT 1`,
      [key, FIELD_REPORTS_PREFIX + "%"],
    );
    if (check.rows.length === 0) {
      res.status(403).json({ error: "Access denied" }); return;
    }
  } catch {
    res.status(500).json({ error: "Validation failed" }); return;
  }

  try {
    const ctx = await getWasabiClientAndCreds();
    if (!ctx) {
      res.status(503).json({ error: "Wasabi not configured" }); return;
    }

    const obj = await ctx.client.send(
      new GetObjectCommand({ Bucket: ctx.creds.bucket, Key: key }),
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(key.split("/").pop() ?? "report.pdf")}"`);
    if (obj.ContentLength) res.setHeader("Content-Length", obj.ContentLength);

    const body = obj.Body;
    if (!body || typeof (body as { pipe?: unknown }).pipe !== "function") {
      res.status(502).json({ error: "Empty response from Wasabi" }); return;
    }
    (body as NodeJS.ReadableStream).pipe(res);
  } catch (err: unknown) {
    const code = (err as { name?: string }).name;
    if (code === "NoSuchKey" || code === "NotFound") {
      res.status(404).json({ error: "Report not found in storage" }); return;
    }
    logger.error({ err, key }, "Report view proxy error");
    res.status(500).json({ error: "Failed to fetch report" });
  }
});

export default router;
