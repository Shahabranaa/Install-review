import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import multer from "multer";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { db, fieldReportsTable } from "@workspace/db";
import { getWasabiClientAndCreds } from "../lib/wasabi.js";
import { getTemplate } from "../lib/report-templates.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

export interface FieldReportImage {
  wasabiKey:    string;
  contentType:  string;
  originalName: string;
  uploadedAt:   string;
  size:         number;
}
export type FieldReportImages = Record<string, FieldReportImage>; // key = placeholder index

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.sessionType === "worker" || !req.session?.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  next();
}
router.use("/field-reports", requireAuth);

function sanitizeSegment(s: string | null | undefined): string {
  return (s ?? "").replace(/[\\/\r\n\t]+/g, "_").replace(/\.\.+/g, "_").trim();
}
function slugify(s: string): string {
  return s.replace(/[^a-zA-Z0-9-_]+/g, "_").replace(/_+/g, "_").slice(0, 40) || "image";
}
function extFromContentType(ct: string): string {
  if (ct.includes("png"))  return ".png";
  if (ct.includes("webp")) return ".webp";
  if (ct.includes("gif"))  return ".gif";
  return ".jpg";
}

function imageWasabiKey(reportId: number, ospName: string, stringName: string, cableName: string | null, index: number, ext: string): string {
  const parts = [
    "[Output] Field Reports",
    sanitizeSegment(ospName),
    sanitizeSegment(stringName),
  ];
  if (cableName) parts.push(sanitizeSegment(cableName));
  parts.push("_images");
  parts.push(`${reportId}-${index}-${slugify(`img-${index}`)}${ext}`);
  return parts.join("/");
}

// ── POST /api/field-reports/:id/images/:index — upload one image (multipart/form-data, field "file") ──
router.post("/field-reports/:id/images/:index", upload.single("file"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const index = Number(req.params.index);
  if (!Number.isFinite(id) || !Number.isInteger(index) || index < 0) {
    res.status(400).json({ error: "Invalid id or index" }); return;
  }
  if (!req.file) { res.status(400).json({ error: "Missing 'file' field" }); return; }
  if (!ALLOWED.includes(req.file.mimetype)) {
    res.status(400).json({ error: `Unsupported image type: ${req.file.mimetype}` }); return;
  }

  const [row] = await db.select().from(fieldReportsTable).where(eq(fieldReportsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (row.status === "final") { res.status(409).json({ error: "Cannot edit a finalized report" }); return; }

  const template = getTemplate(row.templateId);
  const placeholders = template?.imagePlaceholders ?? [];
  if (index >= placeholders.length) {
    res.status(400).json({ error: `Index ${index} is out of range for this template` }); return;
  }

  const wasabi = await getWasabiClientAndCreds();
  if (!wasabi) { res.status(503).json({ error: "Wasabi not configured" }); return; }

  const ext = extFromContentType(req.file.mimetype);
  const key = imageWasabiKey(id, row.ospName, row.stringName, row.cableName, index, ext);

  try {
    await wasabi.client.send(new PutObjectCommand({
      Bucket:      wasabi.creds.bucket,
      Key:         key,
      Body:        req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    const existing = (row.images as FieldReportImages | null) ?? {};

    // If a previous image existed at this slot with a different key, delete the old object.
    const prev = existing[String(index)];
    if (prev && prev.wasabiKey !== key) {
      try {
        await wasabi.client.send(new DeleteObjectCommand({
          Bucket: wasabi.creds.bucket, Key: prev.wasabiKey,
        }));
      } catch (err) {
        logger.warn({ err, key: prev.wasabiKey }, "Failed to delete previous field-report image");
      }
    }

    const next: FieldReportImages = {
      ...existing,
      [String(index)]: {
        wasabiKey:    key,
        contentType:  req.file.mimetype,
        originalName: req.file.originalname,
        uploadedAt:   new Date().toISOString(),
        size:         req.file.size,
      },
    };

    const [updated] = await db.update(fieldReportsTable)
      .set({ images: next, updatedAt: new Date() })
      .where(eq(fieldReportsTable.id, id))
      .returning();

    res.status(201).json({
      index,
      caption: placeholders[index],
      image: next[String(index)],
      report: updated,
    });
  } catch (err: unknown) {
    logger.error({ err, id, index }, "Failed to upload field-report image");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── GET /api/field-reports/:id/images/:index — proxy bytes from Wasabi (editor preview) ──
router.get("/field-reports/:id/images/:index", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const index = Number(req.params.index);
  if (!Number.isFinite(id) || !Number.isInteger(index)) {
    res.status(400).json({ error: "Invalid id or index" }); return;
  }
  const [row] = await db.select().from(fieldReportsTable).where(eq(fieldReportsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const images = (row.images as FieldReportImages | null) ?? {};
  const img = images[String(index)];
  if (!img) { res.status(404).json({ error: "Image not uploaded" }); return; }

  const wasabi = await getWasabiClientAndCreds();
  if (!wasabi) { res.status(503).json({ error: "Wasabi not configured" }); return; }

  try {
    const obj = await wasabi.client.send(new GetObjectCommand({
      Bucket: wasabi.creds.bucket, Key: img.wasabiKey,
    }));
    res.setHeader("Content-Type", img.contentType);
    res.setHeader("Cache-Control", "private, max-age=60");
    if (obj.ContentLength) res.setHeader("Content-Length", String(obj.ContentLength));
    if (obj.Body instanceof Readable) {
      obj.Body.pipe(res);
    } else if (obj.Body) {
      const buf = Buffer.from(await (obj.Body as unknown as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray());
      res.send(buf);
    } else {
      res.status(502).json({ error: "Empty body from storage" });
    }
  } catch (err: unknown) {
    logger.error({ err, id, index }, "Failed to fetch field-report image");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── DELETE /api/field-reports/:id/images/:index ──
router.delete("/field-reports/:id/images/:index", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const index = Number(req.params.index);
  if (!Number.isFinite(id) || !Number.isInteger(index)) {
    res.status(400).json({ error: "Invalid id or index" }); return;
  }

  const [row] = await db.select().from(fieldReportsTable).where(eq(fieldReportsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (row.status === "final") { res.status(409).json({ error: "Cannot edit a finalized report" }); return; }

  const images = { ...((row.images as FieldReportImages | null) ?? {}) };
  const existing = images[String(index)];
  if (!existing) { res.status(204).end(); return; }

  const wasabi = await getWasabiClientAndCreds();
  if (wasabi) {
    try {
      await wasabi.client.send(new DeleteObjectCommand({
        Bucket: wasabi.creds.bucket, Key: existing.wasabiKey,
      }));
    } catch (err) {
      logger.warn({ err, key: existing.wasabiKey }, "Failed to delete field-report image from Wasabi");
    }
  }

  delete images[String(index)];
  const [updated] = await db.update(fieldReportsTable)
    .set({ images, updatedAt: new Date() })
    .where(eq(fieldReportsTable.id, id))
    .returning();

  res.json({ index, report: updated });
});

export default router;
