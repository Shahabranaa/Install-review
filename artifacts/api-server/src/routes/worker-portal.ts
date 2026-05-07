import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import { eq, or, and } from "drizzle-orm";
import multer from "multer";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import {
  db,
  workersTable,
  workerCertificationsTable,
  certificationsTable,
  workerActivityLogsTable,
} from "@workspace/db";
import { getWasabiClientAndCreds } from "../lib/wasabi.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const certFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});

function getClientIp(req: Request): string | null {
  return (
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
    ?? req.socket.remoteAddress
    ?? null
  );
}

function requireWorkerAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.sessionType !== "worker" || !req.session.workerId) {
    res.status(401).json({ error: "Worker authentication required" });
    return;
  }
  next();
}

async function logActivity(
  workerId: number,
  action: string,
  detail: string | null,
  ipAddress: string | null,
): Promise<void> {
  await db
    .insert(workerActivityLogsTable)
    .values({ workerId, action, detail, ipAddress })
    .catch(() => {});
}

// ── Auth ─────────────────────────────────────────────────────────────────────

// POST /api/worker-portal/login
router.post("/worker-portal/login", async (req, res): Promise<void> => {
  const { identifier, password } = req.body as { identifier?: string; password?: string };

  if (!identifier?.trim() || !password) {
    res.status(400).json({ error: "Identifier and password are required" });
    return;
  }

  const lower = identifier.trim().toLowerCase();

  const [worker] = await db
    .select()
    .from(workersTable)
    .where(
      or(
        eq(workersTable.email, lower),
        eq(workersTable.portalUsername, identifier.trim()),
      ),
    )
    .limit(1);

  if (!worker || !worker.active) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (!worker.portalPasswordHash) {
    res.status(401).json({ error: "Portal access not configured. Contact your administrator." });
    return;
  }

  const valid = await bcrypt.compare(password, worker.portalPasswordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const ip = getClientIp(req);

  await db
    .update(workersTable)
    .set({ lastLoginAt: new Date(), lastLoginIp: ip, updatedAt: new Date() })
    .where(eq(workersTable.id, worker.id));

  req.session.sessionType = "worker";
  req.session.workerId = worker.id;
  req.session.workerName = worker.name;

  await logActivity(worker.id, "login", null, ip);

  res.json({
    id: worker.id,
    name: worker.name,
    email: worker.email,
    company: worker.company,
    portalUsername: worker.portalUsername,
  });
});

// POST /api/worker-portal/logout
router.post("/worker-portal/logout", (req, res): void => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// GET /api/worker-portal/me
router.get("/worker-portal/me", requireWorkerAuth, async (req, res): Promise<void> => {
  const [worker] = await db
    .select({
      id: workersTable.id,
      name: workersTable.name,
      email: workersTable.email,
      company: workersTable.company,
      portalUsername: workersTable.portalUsername,
      active: workersTable.active,
    })
    .from(workersTable)
    .where(eq(workersTable.id, req.session.workerId!));

  if (!worker || !worker.active) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Worker not found or inactive" });
    return;
  }

  res.json(worker);
});

// ── Cert types ────────────────────────────────────────────────────────────────

// GET /api/worker-portal/cert-types
router.get("/worker-portal/cert-types", requireWorkerAuth, async (_req, res): Promise<void> => {
  try {
    const certs = await db
      .select()
      .from(certificationsTable)
      .orderBy(certificationsTable.category, certificationsTable.name);
    res.json(certs);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Certifications ────────────────────────────────────────────────────────────

// GET /api/worker-portal/certifications
router.get("/worker-portal/certifications", requireWorkerAuth, async (req, res): Promise<void> => {
  try {
    const workerId = req.session.workerId!;
    const certs = await db
      .select({ wc: workerCertificationsTable, cert: certificationsTable })
      .from(workerCertificationsTable)
      .innerJoin(
        certificationsTable,
        eq(workerCertificationsTable.certificationId, certificationsTable.id),
      )
      .where(eq(workerCertificationsTable.workerId, workerId));
    res.json(certs.map(r => ({ ...r.wc, certification: r.cert })));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/worker-portal/certifications
router.post(
  "/worker-portal/certifications",
  requireWorkerAuth,
  certFileUpload.single("file"),
  async (req, res): Promise<void> => {
    try {
      const workerId = req.session.workerId!;
      const { certificationId, dateAchieved, expiryDate, notes } = req.body;
      if (!certificationId) {
        res.status(400).json({ error: "certificationId is required" });
        return;
      }

      const certIdNum = parseInt(certificationId, 10);

      let fileUrl: string | undefined;
      if (req.file) {
        const wasabi = await getWasabiClientAndCreds();
        if (wasabi) {
          const safeName = req.file.originalname
            .replace(/[\\/\r\n\t]+/g, "_")
            .replace(/\.\.+/g, "_")
            .slice(0, 120);
          const key = `workforce/certifications/worker-${workerId}-cert-${certIdNum}/${safeName}`;
          await wasabi.client.send(
            new PutObjectCommand({
              Bucket: wasabi.creds.bucket,
              Key: key,
              Body: req.file.buffer,
              ContentType: req.file.mimetype,
            }),
          );
          fileUrl = key;
        }
      }

      const [wc] = await db
        .insert(workerCertificationsTable)
        .values({
          workerId,
          certificationId: certIdNum,
          dateAchieved: dateAchieved || null,
          expiryDate: expiryDate || null,
          verified: false,
          fileUrl,
          notes: notes || null,
        })
        .onConflictDoUpdate({
          target: [workerCertificationsTable.workerId, workerCertificationsTable.certificationId],
          set: {
            dateAchieved: dateAchieved || null,
            expiryDate: expiryDate || null,
            notes: notes || null,
            ...(fileUrl ? { fileUrl } : {}),
            updatedAt: new Date(),
          },
        })
        .returning();

      const [cert] = await db
        .select({ name: certificationsTable.name })
        .from(certificationsTable)
        .where(eq(certificationsTable.id, certIdNum));
      await logActivity(workerId, "cert_added", cert?.name ?? `cert_id:${certIdNum}`, getClientIp(req));

      res.status(201).json(wc);
    } catch (err) {
      logger.error({ err }, "worker-portal cert POST error");
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);

// PATCH /api/worker-portal/certifications/:certId
router.patch(
  "/worker-portal/certifications/:certId",
  requireWorkerAuth,
  certFileUpload.single("file"),
  async (req, res): Promise<void> => {
    try {
      const workerId = req.session.workerId!;
      const certificationId = parseInt(req.params.certId ?? "");
      if (isNaN(certificationId)) {
        res.status(400).json({ error: "Invalid certId" });
        return;
      }

      const { dateAchieved, expiryDate, notes } = req.body;

      let fileUrl: string | undefined;
      if (req.file) {
        const wasabi = await getWasabiClientAndCreds();
        if (wasabi) {
          const safeName = req.file.originalname
            .replace(/[\\/\r\n\t]+/g, "_")
            .replace(/\.\.+/g, "_")
            .slice(0, 120);
          const key = `workforce/certifications/worker-${workerId}-cert-${certificationId}/${safeName}`;
          await wasabi.client.send(
            new PutObjectCommand({
              Bucket: wasabi.creds.bucket,
              Key: key,
              Body: req.file.buffer,
              ContentType: req.file.mimetype,
            }),
          );
          fileUrl = key;
        }
      }

      const updateSet: Record<string, unknown> = {
        dateAchieved: dateAchieved || null,
        expiryDate: expiryDate || null,
        notes: notes || null,
        updatedAt: new Date(),
      };
      if (fileUrl) updateSet.fileUrl = fileUrl;

      const [updated] = await db
        .update(workerCertificationsTable)
        .set(updateSet)
        .where(
          and(
            eq(workerCertificationsTable.workerId, workerId),
            eq(workerCertificationsTable.certificationId, certificationId),
          ),
        )
        .returning();
      if (!updated) {
        res.status(404).json({ error: "Certification not found" });
        return;
      }

      const [cert] = await db
        .select({ name: certificationsTable.name })
        .from(certificationsTable)
        .where(eq(certificationsTable.id, certificationId));
      await logActivity(
        workerId,
        "cert_edited",
        cert?.name ?? `cert_id:${certificationId}`,
        getClientIp(req),
      );

      res.json(updated);
    } catch (err) {
      logger.error({ err }, "worker-portal cert PATCH error");
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);

// DELETE /api/worker-portal/certifications/:certId
router.delete(
  "/worker-portal/certifications/:certId",
  requireWorkerAuth,
  async (req, res): Promise<void> => {
    try {
      const workerId = req.session.workerId!;
      const certificationId = parseInt(req.params.certId ?? "");
      if (isNaN(certificationId)) {
        res.status(400).json({ error: "Invalid certId" });
        return;
      }

      const [row] = await db
        .select()
        .from(workerCertificationsTable)
        .where(
          and(
            eq(workerCertificationsTable.workerId, workerId),
            eq(workerCertificationsTable.certificationId, certificationId),
          ),
        );
      if (!row) {
        res.status(404).json({ error: "Certification not found" });
        return;
      }

      if (row.fileUrl && !row.fileUrl.startsWith("http")) {
        const wasabi = await getWasabiClientAndCreds();
        if (wasabi) {
          await wasabi.client
            .send(new DeleteObjectCommand({ Bucket: wasabi.creds.bucket, Key: row.fileUrl }))
            .catch(() => {});
        }
      }

      await db.delete(workerCertificationsTable).where(
        and(
          eq(workerCertificationsTable.workerId, workerId),
          eq(workerCertificationsTable.certificationId, certificationId),
        ),
      );

      const [cert] = await db
        .select({ name: certificationsTable.name })
        .from(certificationsTable)
        .where(eq(certificationsTable.id, certificationId));
      await logActivity(
        workerId,
        "cert_deleted",
        cert?.name ?? `cert_id:${certificationId}`,
        getClientIp(req),
      );

      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "worker-portal cert DELETE error");
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);

// GET /api/worker-portal/certifications/:certId/file
router.get(
  "/worker-portal/certifications/:certId/file",
  requireWorkerAuth,
  async (req, res): Promise<void> => {
    try {
      const workerId = req.session.workerId!;
      const certificationId = parseInt(req.params.certId ?? "");
      if (isNaN(certificationId)) {
        res.status(400).json({ error: "Invalid certId" });
        return;
      }

      const [row] = await db
        .select()
        .from(workerCertificationsTable)
        .where(
          and(
            eq(workerCertificationsTable.workerId, workerId),
            eq(workerCertificationsTable.certificationId, certificationId),
          ),
        );
      if (!row?.fileUrl) {
        res.status(404).json({ error: "No file found" });
        return;
      }

      if (row.fileUrl.startsWith("http")) {
        res.redirect(row.fileUrl);
        return;
      }

      const wasabi = await getWasabiClientAndCreds();
      if (!wasabi) {
        res.status(503).json({ error: "Storage not configured" });
        return;
      }

      const obj = await wasabi.client.send(
        new GetObjectCommand({ Bucket: wasabi.creds.bucket, Key: row.fileUrl }),
      );
      const contentType = obj.ContentType ?? "application/octet-stream";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "private, max-age=300");
      if (obj.ContentLength) res.setHeader("Content-Length", String(obj.ContentLength));

      if (obj.Body instanceof Readable) {
        obj.Body.pipe(res);
      } else if (obj.Body) {
        const buf = Buffer.from(
          await (
            obj.Body as unknown as { transformToByteArray(): Promise<Uint8Array> }
          ).transformToByteArray(),
        );
        res.send(buf);
      } else {
        res.status(502).json({ error: "Empty body from storage" });
      }
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);

export default router;
