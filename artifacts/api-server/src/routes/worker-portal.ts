import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import { eq, or, and, inArray, desc, asc, sql } from "drizzle-orm";
import multer from "multer";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import {
  db,
  workersTable,
  workerCertificationsTable,
  certificationsTable,
  workerActivityLogsTable,
  siteAssignmentsTable,
  mobSitesTable,
  siteCertRequirementsTable,
  roleCertRequirementsTable,
  workerCertOverridesTable,
  workerRotationPeriodsTable,
  workerScheduleChangeRequestsTable,
  workerUnavailabilityPeriodsTable,
  workforceRolesTable,
  workerRoleHistoryTable,
} from "@workspace/db";
import { getWasabiClientAndCreds } from "../lib/wasabi.js";
import { logger } from "../lib/logger.js";
import { extractPassportFields, extractCvData, extractCvDataFromPdfBuffer, extractCertFromPdf } from "../lib/ai-extract.js";
import { extractText } from "unpdf";
import mammoth from "mammoth";

const router: IRouter = Router();

const certFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});

const certBatchUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 12 },
});

const CV_ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword", // .doc
  "text/csv",
  "text/plain",
  "application/rtf",
  "text/rtf",
]);

const cvFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    if (CV_ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Accepted formats: PDF, Word (DOCX/DOC), CSV, TXT, RTF"));
    }
  },
});

const passportFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    const allowed = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF or image files (JPEG, PNG, WebP) are accepted"));
    }
  },
});

function passportUploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  passportFileUpload.single("file")(req, res, (err) => {
    if (err) {
      const message =
        err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
          ? "File exceeds the 10 MB limit"
          : err instanceof Error
          ? err.message
          : "Upload error";
      res.status(400).json({ error: message });
      return;
    }
    next();
  });
}

function cvUploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  cvFileUpload.single("file")(req, res, (err) => {
    if (err) {
      const message =
        err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
          ? "File exceeds the 10 MB limit"
          : err instanceof Error
          ? err.message
          : "Upload error";
      res.status(400).json({ error: message });
      return;
    }
    next();
  });
}

function getClientIp(req: Request): string | null {
  return (
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
    ?? req.socket.remoteAddress
    ?? null
  );
}

function requireWorkerAuth(req: Request, res: Response, next: NextFunction): void {
  // Must be explicitly a worker session — reject admin sessions attempting worker-portal access
  if (
    req.session?.sessionType !== "worker" ||
    !req.session.workerId ||
    req.session.userId !== undefined ||
    req.session.accessLevel !== undefined
  ) {
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

  // Regenerate session to prevent session-fixation and clear any admin-portal state
  await new Promise<void>((resolve, reject) =>
    req.session.regenerate((err) => (err ? reject(err) : resolve()))
  );
  req.session.sessionType = "worker";
  req.session.workerId = worker.id;
  req.session.workerName = worker.name;
  // Explicitly ensure no admin fields leak into this worker session
  delete req.session.userId;
  delete req.session.username;
  delete req.session.displayName;
  delete req.session.accessLevel;

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

// POST /api/worker-portal/certifications/ai-scan
router.post(
  "/worker-portal/certifications/ai-scan",
  requireWorkerAuth,
  certBatchUpload.array("files", 12),
  async (req, res): Promise<void> => {
    try {
      const certTypes = await db
        .select()
        .from(certificationsTable)
        .orderBy(certificationsTable.name);
      const typeNames = certTypes.map((ct) => ct.name);
      const files = (req.files ?? []) as Express.Multer.File[];
      if (files.length === 0) {
        res.status(400).json({ error: "No files uploaded" });
        return;
      }

      const results = await Promise.all(
        files.map(async (file) => {
          try {
            const extracted = await extractCertFromPdf(file.buffer, typeNames, file.mimetype);
            if (!extracted) {
              return {
                filename: file.originalname,
                certificationId: null,
                certTypeName: null,
                dateAchieved: null,
                expiryDate: null,
                noExpiry: false,
                notes: null,
                confidence: "low" as const,
                error: "AI extraction failed — fill in manually",
              };
            }
            const lower = (extracted.certTypeName ?? "").toLowerCase();
            const matched =
              certTypes.find((ct) => ct.name.toLowerCase() === lower) ??
              certTypes.find(
                (ct) =>
                  ct.name.toLowerCase().includes(lower) ||
                  lower.includes(ct.name.toLowerCase()),
              );
            return {
              filename: file.originalname,
              certificationId: matched?.id ?? null,
              certTypeName: extracted.certTypeName,
              dateAchieved: extracted.dateAchieved,
              expiryDate: extracted.expiryDate,
              noExpiry: extracted.noExpiry,
              notes: extracted.notes,
              confidence: extracted.confidence,
              error: null,
            };
          } catch (err) {
            return {
              filename: file.originalname,
              certificationId: null,
              certTypeName: null,
              dateAchieved: null,
              expiryDate: null,
              noExpiry: false,
              notes: null,
              confidence: "low" as const,
              error: err instanceof Error ? err.message : "Unknown error",
            };
          }
        }),
      );

      res.json(results);
    } catch (err) {
      logger.error({ err }, "cert ai-scan error");
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);

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

// GET /api/worker-portal/compliance
router.get("/worker-portal/compliance", requireWorkerAuth, async (req, res): Promise<void> => {
  try {
    const workerId = req.session.workerId!;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);

    const [worker] = await db
      .select()
      .from(workersTable)
      .where(eq(workersTable.id, workerId));
    if (!worker) {
      res.status(401).json({ error: "Worker not found" });
      return;
    }

    const assignments = await db
      .select({ sa: siteAssignmentsTable, site: mobSitesTable })
      .from(siteAssignmentsTable)
      .innerJoin(mobSitesTable, eq(siteAssignmentsTable.siteId, mobSitesTable.id))
      .where(
        and(
          eq(siteAssignmentsTable.workerId, workerId),
          or(
            eq(siteAssignmentsTable.status, "active"),
            eq(siteAssignmentsTable.status, "pending"),
          ),
        ),
      );

    if (assignments.length === 0) {
      res.json({ sites: [] });
      return;
    }

    const overrides = await db
      .select()
      .from(workerCertOverridesTable)
      .where(eq(workerCertOverridesTable.workerId, workerId));

    const roleReqs = worker.roleId
      ? await db
          .select()
          .from(roleCertRequirementsTable)
          .where(
            and(
              eq(roleCertRequirementsTable.roleId, worker.roleId),
              eq(roleCertRequirementsTable.required, true),
            ),
          )
      : [];

    const allHeld = await db
      .select({ wc: workerCertificationsTable })
      .from(workerCertificationsTable)
      .where(eq(workerCertificationsTable.workerId, workerId));
    const heldMap = new Map(allHeld.map((r) => [r.wc.certificationId, r.wc]));

    const results = [];

    for (const { sa, site } of assignments) {
      const siteReqs = await db
        .select()
        .from(siteCertRequirementsTable)
        .where(
          and(
            eq(siteCertRequirementsTable.siteId, sa.siteId),
            eq(siteCertRequirementsTable.required, true),
          ),
        );

      const requiredSet = new Set<number>();
      for (const r of siteReqs) requiredSet.add(r.certificationId);
      for (const r of roleReqs) requiredSet.add(r.certificationId);
      for (const o of overrides) {
        if (o.required) requiredSet.add(o.certificationId);
        else requiredSet.delete(o.certificationId);
      }

      if (requiredSet.size === 0) {
        results.push({
          siteId: sa.siteId,
          siteName: site.name,
          overallStatus: "NO_REQUIREMENTS",
          requiredCount: 0,
          validCount: 0,
          expiringCount: 0,
          missingCount: 0,
          awaitingReviewCount: 0,
          items: [],
        });
        continue;
      }

      const certIds = [...requiredSet];
      const certs = await db
        .select()
        .from(certificationsTable)
        .where(inArray(certificationsTable.id, certIds));
      const certMap = new Map(certs.map((c) => [c.id, c]));

      const items: {
        certId: number;
        certName: string;
        category: string | null;
        status: string;
        expiryDate: string | null;
        daysUntilExpiry: number | null;
        verified: boolean;
      }[] = [];

      for (const certId of certIds) {
        const cert = certMap.get(certId);
        if (!cert) continue;
        const held = heldMap.get(certId);

        let status: string;
        let daysUntilExpiry: number | null = null;

        if (!held) {
          status = "MISSING";
        } else if (held.rejected) {
          status = "MISSING";
        } else if (held.expiryDate) {
          const expiry = new Date(held.expiryDate);
          expiry.setHours(0, 0, 0, 0);
          daysUntilExpiry = Math.ceil(
            (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
          );
          if (expiry < today) {
            status = "EXPIRED";
          } else if (expiry <= in30Days) {
            status = held.verified ? "EXPIRING_SOON" : "NOT_VERIFIED";
          } else {
            status = held.verified ? "VALID" : "NOT_VERIFIED";
          }
        } else {
          status = held.verified ? "VALID" : "NOT_VERIFIED";
        }

        items.push({
          certId,
          certName: cert.name,
          category: cert.category ?? null,
          status,
          expiryDate: held?.expiryDate ?? null,
          daysUntilExpiry,
          verified: held?.verified ?? false,
        });
      }

      items.sort((a, b) => {
        const order: Record<string, number> = {
          MISSING: 0,
          EXPIRED: 1,
          NOT_VERIFIED: 2,
          EXPIRING_SOON: 3,
          VALID: 4,
        };
        return (order[a.status] ?? 5) - (order[b.status] ?? 5);
      });

      // From the worker's perspective: submitted = VALID + EXPIRING_SOON + NOT_VERIFIED
      const validCount = items.filter(
        (i) => i.status === "VALID" || i.status === "EXPIRING_SOON" || i.status === "NOT_VERIFIED",
      ).length;
      const expiringCount = items.filter((i) => i.status === "EXPIRING_SOON").length;
      // Only what the worker still needs to action (not certs already submitted for review)
      const missingCount = items.filter(
        (i) => i.status === "MISSING" || i.status === "EXPIRED",
      ).length;
      const awaitingReviewCount = items.filter((i) => i.status === "NOT_VERIFIED").length;

      let overallStatus: string;
      if (missingCount > 0) overallStatus = "NOT_COMPLIANT";
      else if (expiringCount > 0) overallStatus = "EXPIRING_SOON";
      else if (awaitingReviewCount > 0) overallStatus = "AWAITING_REVIEW";
      else overallStatus = "READY";

      results.push({
        siteId: sa.siteId,
        siteName: site.name,
        overallStatus,
        requiredCount: certIds.length,
        validCount,
        expiringCount,
        missingCount,
        awaitingReviewCount,
        items,
      });
    }

    res.json({ sites: results });
  } catch (err) {
    logger.error({ err }, "worker-portal compliance GET error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Schedule ──────────────────────────────────────────────────────────────────

// GET /api/worker-portal/schedule
router.get("/worker-portal/schedule", requireWorkerAuth, async (req, res): Promise<void> => {
  try {
    const workerId = req.session.workerId!;

    const assignments = await db
      .select({ sa: siteAssignmentsTable, site: mobSitesTable })
      .from(siteAssignmentsTable)
      .innerJoin(mobSitesTable, eq(siteAssignmentsTable.siteId, mobSitesTable.id))
      .where(eq(siteAssignmentsTable.workerId, workerId));

    if (assignments.length === 0) {
      res.json({ rotations: [] });
      return;
    }

    const assignmentIds = assignments.map((a) => a.sa.id);
    const assignmentSiteMap = new Map(assignments.map((a) => [a.sa.id, { site: a.site, assignment: a.sa }]));

    const periods = await db
      .select()
      .from(workerRotationPeriodsTable)
      .where(inArray(workerRotationPeriodsTable.assignmentId, assignmentIds))
      .orderBy(workerRotationPeriodsTable.plannedStart);

    const rotations = periods.map((p) => {
      const entry = assignmentSiteMap.get(p.assignmentId);
      return {
        id: p.id,
        assignmentId: p.assignmentId,
        plannedStart: p.plannedStart,
        plannedEnd: p.plannedEnd,
        status: p.status,
        notes: p.notes,
        siteId: entry?.site?.id ?? null,
        siteName: entry?.site?.name ?? "Unknown site",
        siteLocation: entry?.site?.location ?? null,
      };
    });

    res.json({ rotations });
  } catch (err) {
    logger.error({ err }, "worker-portal schedule GET error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Schedule change requests ──────────────────────────────────────────────────

// GET /api/worker-portal/change-requests
router.get("/worker-portal/change-requests", requireWorkerAuth, async (req, res): Promise<void> => {
  try {
    const workerId = req.session.workerId!;

    const rows = await db
      .select({
        cr: workerScheduleChangeRequestsTable,
        period: workerRotationPeriodsTable,
        site: mobSitesTable,
      })
      .from(workerScheduleChangeRequestsTable)
      .innerJoin(
        workerRotationPeriodsTable,
        eq(workerScheduleChangeRequestsTable.rotationPeriodId, workerRotationPeriodsTable.id),
      )
      .innerJoin(
        siteAssignmentsTable,
        eq(workerRotationPeriodsTable.assignmentId, siteAssignmentsTable.id),
      )
      .innerJoin(mobSitesTable, eq(siteAssignmentsTable.siteId, mobSitesTable.id))
      .where(eq(workerScheduleChangeRequestsTable.workerId, workerId))
      .orderBy(workerScheduleChangeRequestsTable.createdAt);

    const requests = rows.map((r) => ({
      id: r.cr.id,
      rotationPeriodId: r.cr.rotationPeriodId,
      requestedStart: r.cr.requestedStart,
      requestedEnd: r.cr.requestedEnd,
      reason: r.cr.reason,
      status: r.cr.status,
      adminNotes: r.cr.adminNotes,
      createdAt: r.cr.createdAt,
      siteName: r.site.name,
      originalStart: r.period.plannedStart,
      originalEnd: r.period.plannedEnd,
    }));

    res.json({ requests });
  } catch (err) {
    logger.error({ err }, "worker-portal change-requests GET error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/worker-portal/change-requests
router.post("/worker-portal/change-requests", requireWorkerAuth, async (req, res): Promise<void> => {
  try {
    const workerId = req.session.workerId!;
    const { rotationPeriodId, requestedStart, requestedEnd, reason } = req.body as {
      rotationPeriodId?: number;
      requestedStart?: string | null;
      requestedEnd?: string | null;
      reason?: string | null;
    };

    if (!rotationPeriodId) {
      res.status(400).json({ error: "rotationPeriodId is required" });
      return;
    }

    const reasonTrimmed = typeof reason === "string" ? reason.trim() : "";
    if (!reasonTrimmed) {
      res.status(400).json({ error: "reason is required" });
      return;
    }

    if (requestedStart && requestedEnd && requestedEnd < requestedStart) {
      res.status(400).json({ error: "requestedEnd must be on or after requestedStart" });
      return;
    }

    // Verify the rotation period belongs to this worker
    const [period] = await db
      .select({ p: workerRotationPeriodsTable, sa: siteAssignmentsTable })
      .from(workerRotationPeriodsTable)
      .innerJoin(
        siteAssignmentsTable,
        eq(workerRotationPeriodsTable.assignmentId, siteAssignmentsTable.id),
      )
      .where(
        and(
          eq(workerRotationPeriodsTable.id, rotationPeriodId),
          eq(siteAssignmentsTable.workerId, workerId),
        ),
      );

    if (!period) {
      res.status(404).json({ error: "Rotation period not found" });
      return;
    }

    // Reject requests for completed or cancelled rotations
    if (period.p.status === "completed" || period.p.status === "cancelled") {
      res.status(409).json({ error: "Cannot request a change for a completed or cancelled rotation" });
      return;
    }

    // Check no pending request already exists for this period
    const [existing] = await db
      .select()
      .from(workerScheduleChangeRequestsTable)
      .where(
        and(
          eq(workerScheduleChangeRequestsTable.workerId, workerId),
          eq(workerScheduleChangeRequestsTable.rotationPeriodId, rotationPeriodId),
          eq(workerScheduleChangeRequestsTable.status, "pending"),
        ),
      );
    if (existing) {
      res.status(409).json({ error: "A pending change request already exists for this rotation" });
      return;
    }

    const [cr] = await db
      .insert(workerScheduleChangeRequestsTable)
      .values({
        workerId,
        rotationPeriodId,
        requestedStart: requestedStart || null,
        requestedEnd: requestedEnd || null,
        reason: reasonTrimmed,
        status: "pending",
      })
      .returning();

    await logActivity(workerId, "schedule_change_request", `period:${rotationPeriodId}`, getClientIp(req));

    res.status(201).json(cr);
  } catch (err) {
    logger.error({ err }, "worker-portal change-requests POST error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// DELETE /api/worker-portal/change-requests/:id (withdraw)
router.delete(
  "/worker-portal/change-requests/:id",
  requireWorkerAuth,
  async (req, res): Promise<void> => {
    try {
      const workerId = req.session.workerId!;
      const id = parseInt(req.params.id ?? "");
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }

      const [row] = await db
        .select()
        .from(workerScheduleChangeRequestsTable)
        .where(
          and(
            eq(workerScheduleChangeRequestsTable.id, id),
            eq(workerScheduleChangeRequestsTable.workerId, workerId),
          ),
        );

      if (!row) {
        res.status(404).json({ error: "Change request not found" });
        return;
      }

      if (row.status !== "pending") {
        res.status(409).json({ error: "Only pending requests can be withdrawn" });
        return;
      }

      await db
        .update(workerScheduleChangeRequestsTable)
        .set({ status: "withdrawn", updatedAt: new Date() })
        .where(eq(workerScheduleChangeRequestsTable.id, id));

      await logActivity(workerId, "change_request_withdrawn", `request:${id}`, getClientIp(req));

      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "worker-portal change-requests DELETE error");
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);

// ── Unavailability periods ──────────────────────────────────────────────────

// GET /api/worker-portal/unavailability
router.get("/worker-portal/unavailability", requireWorkerAuth, async (req, res): Promise<void> => {
  try {
    const workerId = req.session.workerId!;
    const rows = await db
      .select()
      .from(workerUnavailabilityPeriodsTable)
      .where(eq(workerUnavailabilityPeriodsTable.workerId, workerId))
      .orderBy(workerUnavailabilityPeriodsTable.startDate);
    res.json({ periods: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/worker-portal/unavailability
router.post("/worker-portal/unavailability", requireWorkerAuth, async (req, res): Promise<void> => {
  try {
    const workerId = req.session.workerId!;
    const { label, startDate, endDate } = req.body as {
      label?: string | null;
      startDate?: string;
      endDate?: string;
    };
    if (!startDate || !endDate) {
      res.status(400).json({ error: "startDate and endDate are required" });
      return;
    }
    if (endDate < startDate) {
      res.status(400).json({ error: "endDate must be on or after startDate" });
      return;
    }
    const [row] = await db
      .insert(workerUnavailabilityPeriodsTable)
      .values({ workerId, label: label?.trim() || null, startDate, endDate })
      .returning();
    await logActivity(workerId, "unavailability_added", `${startDate}→${endDate}`, getClientIp(req));
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// DELETE /api/worker-portal/unavailability/:id
router.delete(
  "/worker-portal/unavailability/:id",
  requireWorkerAuth,
  async (req, res): Promise<void> => {
    try {
      const workerId = req.session.workerId!;
      const id = parseInt(req.params.id ?? "");
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const [row] = await db
        .select()
        .from(workerUnavailabilityPeriodsTable)
        .where(
          and(
            eq(workerUnavailabilityPeriodsTable.id, id),
            eq(workerUnavailabilityPeriodsTable.workerId, workerId),
          ),
        );
      if (!row) {
        res.status(404).json({ error: "Period not found" });
        return;
      }
      await db
        .delete(workerUnavailabilityPeriodsTable)
        .where(eq(workerUnavailabilityPeriodsTable.id, id));
      await logActivity(workerId, "unavailability_removed", `${row.startDate}→${row.endDate}`, getClientIp(req));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);

// ── Profile ───────────────────────────────────────────────────────────────────

// GET /api/worker-portal/profile
router.get("/worker-portal/profile", requireWorkerAuth, async (req, res): Promise<void> => {
  try {
    const workerId = req.session.workerId!;
    const [row] = await db
      .select({
        id: workersTable.id,
        name: workersTable.name,
        email: workersTable.email,
        phone: workersTable.phone,
        company: workersTable.company,
        preferredAirport: workersTable.preferredAirport,
        qualifications: workersTable.qualifications,
        notes: workersTable.notes,
        passportNo: workersTable.passportNo,
        passportIssueDate: workersTable.passportIssueDate,
        passportExpiryDate: workersTable.passportExpiryDate,
        passportPlaceOfBirth: workersTable.passportPlaceOfBirth,
        passportWasabiKey: workersTable.passportWasabiKey,
        nokName: workersTable.nokName,
        nokRelationship: workersTable.nokRelationship,
        nokPhone: workersTable.nokPhone,
        portalUsername: workersTable.portalUsername,
        windaId: workersTable.windaId,
        cvWasabiKey: workersTable.cvWasabiKey,
        cvUploadedAt: workersTable.cvUploadedAt,
        roleName: workforceRolesTable.name,
      })
      .from(workersTable)
      .leftJoin(workforceRolesTable, eq(workersTable.roleId, workforceRolesTable.id))
      .where(eq(workersTable.id, workerId));

    if (!row) {
      res.status(404).json({ error: "Worker not found" });
      return;
    }

    res.json(row);
  } catch (err) {
    logger.error({ err }, "worker-portal profile GET error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /api/worker-portal/profile
router.patch("/worker-portal/profile", requireWorkerAuth, async (req, res): Promise<void> => {
  try {
    const workerId = req.session.workerId!;
    const { name, email, phone, company, preferredAirport, qualifications, notes, passportNo, passportIssueDate, passportExpiryDate, passportPlaceOfBirth, nokName, nokRelationship, nokPhone } = req.body as {
      name?: string;
      email?: string;
      phone?: string;
      company?: string;
      preferredAirport?: string[];
      qualifications?: string;
      notes?: string;
      passportNo?: string;
      passportIssueDate?: string;
      passportExpiryDate?: string;
      passportPlaceOfBirth?: string;
      nokName?: string;
      nokRelationship?: string;
      nokPhone?: string;
    };

    const nameTrimmed = typeof name === "string" ? name.trim() : undefined;
    if (nameTrimmed !== undefined && !nameTrimmed) {
      res.status(400).json({ error: "Name cannot be empty" });
      return;
    }

    const emailTrimmed = typeof email === "string" ? email.trim().toLowerCase() : undefined;

    const updateSet: Record<string, unknown> = { updatedAt: new Date() };
    if (nameTrimmed !== undefined) updateSet.name = nameTrimmed;
    if (emailTrimmed !== undefined) updateSet.email = emailTrimmed || null;
    if (typeof phone === "string") updateSet.phone = phone.trim() || null;
    if (typeof company === "string") updateSet.company = company.trim() || null;
    if (Array.isArray(preferredAirport)) updateSet.preferredAirport = preferredAirport.length > 0 ? preferredAirport : null;
    if (typeof qualifications === "string") updateSet.qualifications = qualifications.trim() || null;
    if (typeof notes === "string") updateSet.notes = notes.trim() || null;
    if (typeof passportNo === "string") updateSet.passportNo = passportNo.trim() || null;
    if (typeof passportIssueDate === "string") updateSet.passportIssueDate = passportIssueDate.trim() || null;
    if (typeof passportExpiryDate === "string") updateSet.passportExpiryDate = passportExpiryDate.trim() || null;
    if (typeof passportPlaceOfBirth === "string") updateSet.passportPlaceOfBirth = passportPlaceOfBirth.trim() || null;
    if (typeof nokName === "string") updateSet.nokName = nokName.trim() || null;
    if (typeof nokRelationship === "string") updateSet.nokRelationship = nokRelationship.trim() || null;
    if (typeof nokPhone === "string") updateSet.nokPhone = nokPhone.trim() || null;

    const [updated] = await db
      .update(workersTable)
      .set(updateSet)
      .where(eq(workersTable.id, workerId))
      .returning({
        id: workersTable.id,
        name: workersTable.name,
        email: workersTable.email,
        phone: workersTable.phone,
        company: workersTable.company,
        preferredAirport: workersTable.preferredAirport,
        qualifications: workersTable.qualifications,
        notes: workersTable.notes,
        passportNo: workersTable.passportNo,
        passportIssueDate: workersTable.passportIssueDate,
        passportExpiryDate: workersTable.passportExpiryDate,
        passportPlaceOfBirth: workersTable.passportPlaceOfBirth,
        passportWasabiKey: workersTable.passportWasabiKey,
        nokName: workersTable.nokName,
        nokRelationship: workersTable.nokRelationship,
        nokPhone: workersTable.nokPhone,
        portalUsername: workersTable.portalUsername,
        windaId: workersTable.windaId,
      });

    if (!updated) {
      res.status(404).json({ error: "Worker not found" });
      return;
    }

    // Keep session name in sync
    if (nameTrimmed) {
      req.session.workerName = nameTrimmed;
    }

    await logActivity(workerId, "profile_updated", null, getClientIp(req));

    res.json(updated);
  } catch (err) {
    logger.error({ err }, "worker-portal profile PATCH error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/worker-portal/profile/cv
router.post(
  "/worker-portal/profile/cv",
  requireWorkerAuth,
  cvUploadMiddleware,
  async (req, res): Promise<void> => {
    try {
      const workerId = req.session.workerId!;

      if (!req.file) {
        res.status(400).json({ error: "A CV file is required" });
        return;
      }

      const wasabi = await getWasabiClientAndCreds();
      if (!wasabi) {
        res.status(503).json({ error: "Storage not configured" });
        return;
      }

      const safeName = req.file.originalname
        .replace(/[\\/\r\n\t]+/g, "_")
        .replace(/\.\.+/g, "_")
        .slice(0, 120);
      const key = `workers/${workerId}/cv/${safeName}`;

      await wasabi.client.send(
        new PutObjectCommand({
          Bucket: wasabi.creds.bucket,
          Key: key,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        }),
      );

      await db
        .update(workersTable)
        .set({ cvWasabiKey: key, cvUploadedAt: new Date(), updatedAt: new Date() })
        .where(eq(workersTable.id, workerId));

      await logActivity(workerId, "cv_uploaded", safeName, getClientIp(req));

      // Run AI extraction immediately after upload — extract text by file type then call AI
      let cvExtracted: { roles: { project: string; role: string; dateFrom: string; dateTo: string }[]; qualifications: string | null; notes: string | null } | null = null;
      try {
        let cvText = "";
        const mime = req.file.mimetype;

        if (mime === "application/pdf") {
          const { text } = await extractText(new Uint8Array(req.file.buffer), { mergePages: true });
          cvText = Array.isArray(text) ? text.join("\n") : (text ?? "");
          // If unpdf found no text (scanned/image-based PDF), use OpenAI vision directly
          if (!cvText.trim()) {
            cvExtracted = await extractCvDataFromPdfBuffer(req.file.buffer);
          }
        } else if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
          const result = await mammoth.extractRawText({ buffer: req.file.buffer });
          cvText = result.value;
        } else if (
          mime === "text/plain" ||
          mime === "text/csv" ||
          mime === "application/rtf" ||
          mime === "text/rtf"
        ) {
          cvText = req.file.buffer.toString("utf-8");
        }
        // application/msword (.doc) binary format — skip extraction, just store

        if (cvText.trim()) {
          cvExtracted = await extractCvData(cvText);
        }
      } catch (extractErr) {
        logger.warn({ extractErr }, "CV text extraction failed — skipping AI parse");
      }

      // Persist extracted data if we got results
      if (cvExtracted) {
        // Update qualifications and notes fields on the worker record
        const qualUpdate: Record<string, unknown> = { updatedAt: new Date() };
        if (cvExtracted.qualifications) qualUpdate.qualifications = cvExtracted.qualifications;
        if (cvExtracted.notes) qualUpdate.notes = cvExtracted.notes;
        if (Object.keys(qualUpdate).length > 1) {
          await db.update(workersTable).set(qualUpdate).where(eq(workersTable.id, workerId));
        }

        // Replace AI-extracted roles: delete previous cv_ai rows then insert fresh ones
        await db
          .delete(workerRoleHistoryTable)
          .where(
            and(
              eq(workerRoleHistoryTable.workerId, workerId),
              eq(workerRoleHistoryTable.source, "cv_ai"),
            ),
          );

        if (cvExtracted.roles.length > 0) {
          // Normalize sortOrder for all surviving manual rows first.
          // Rows with null sortOrder sort NULLS LAST in the GET query, meaning they would
          // appear AFTER any row with an explicit sortOrder — including newly inserted AI rows.
          // To guarantee AI rows always appear after manual rows, we must give every manual
          // row an explicit sortOrder before inserting the AI rows.
          const manualRows = await db
            .select({ id: workerRoleHistoryTable.id, sortOrder: workerRoleHistoryTable.sortOrder, startDate: workerRoleHistoryTable.startDate })
            .from(workerRoleHistoryTable)
            .where(eq(workerRoleHistoryTable.workerId, workerId))
            .orderBy(
              sql`${workerRoleHistoryTable.sortOrder} ASC NULLS LAST`,
              desc(workerRoleHistoryTable.startDate),
            );

          for (let i = 0; i < manualRows.length; i++) {
            const row = manualRows[i]!;
            if (row.sortOrder !== i) {
              await db
                .update(workerRoleHistoryTable)
                .set({ sortOrder: i })
                .where(eq(workerRoleHistoryTable.id, row.id));
            }
          }

          const aiSortBase = manualRows.length;
          let aiOffset = 0;
          for (const r of cvExtracted.roles) {
            const startDate = r.dateFrom?.match(/^\d{4}-\d{2}$/)
              ? `${r.dateFrom}-01`
              : r.dateFrom?.match(/^\d{4}$/)
              ? `${r.dateFrom}-01-01`
              : r.dateFrom ?? "2000-01-01";
            const endDate =
              r.dateTo === "Present" || r.dateTo === "present" || !r.dateTo
                ? null
                : r.dateTo?.match(/^\d{4}-\d{2}$/)
                ? `${r.dateTo}-01`
                : r.dateTo?.match(/^\d{4}$/)
                ? `${r.dateTo}-12-31`
                : r.dateTo;
            await db.insert(workerRoleHistoryTable).values({
              workerId,
              roleNameSnapshot: [r.role, r.project].filter(Boolean).join(" @ "),
              startDate,
              endDate: endDate ?? null,
              notes: null,
              source: "cv_ai",
              sortOrder: aiSortBase + aiOffset++,
            });
          }
        }
      }

      res.json({ cvWasabiKey: key, filename: safeName, extracted: cvExtracted ?? null });
    } catch (err) {
      logger.error({ err }, "worker-portal cv POST error");
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);

// GET /api/worker-portal/profile/cv
router.get("/worker-portal/profile/cv", requireWorkerAuth, async (req, res): Promise<void> => {
  try {
    const workerId = req.session.workerId!;

    const [row] = await db
      .select({ cvWasabiKey: workersTable.cvWasabiKey })
      .from(workersTable)
      .where(eq(workersTable.id, workerId));

    if (!row?.cvWasabiKey) {
      res.status(404).json({ error: "No CV on file" });
      return;
    }

    const wasabi = await getWasabiClientAndCreds();
    if (!wasabi) {
      res.status(503).json({ error: "Storage not configured" });
      return;
    }

    const obj = await wasabi.client.send(
      new GetObjectCommand({ Bucket: wasabi.creds.bucket, Key: row.cvWasabiKey }),
    );

    const filename = row.cvWasabiKey.split("/").pop() ?? "cv";
    const ext = filename.split(".").pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      doc: "application/msword",
      csv: "text/csv",
      txt: "text/plain",
      rtf: "application/rtf",
    };
    const contentType = (ext && mimeMap[ext]) ?? "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, max-age=300");
    if (obj.ContentLength) res.setHeader("Content-Length", String(obj.ContentLength));

    if (obj.Body instanceof Readable) {
      obj.Body.pipe(res);
    } else if (obj.Body) {
      const buf = Buffer.from(
        await (obj.Body as unknown as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray(),
      );
      res.send(buf);
    } else {
      res.status(502).json({ error: "Empty body from storage" });
    }
  } catch (err) {
    logger.error({ err }, "worker-portal cv GET error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// DELETE /api/worker-portal/profile/cv
router.delete("/worker-portal/profile/cv", requireWorkerAuth, async (req, res): Promise<void> => {
  try {
    const workerId = req.session.workerId!;

    const [row] = await db
      .select({ cvWasabiKey: workersTable.cvWasabiKey })
      .from(workersTable)
      .where(eq(workersTable.id, workerId));

    if (!row?.cvWasabiKey) {
      res.status(404).json({ error: "No CV on file" });
      return;
    }

    const wasabi = await getWasabiClientAndCreds();
    if (wasabi) {
      try {
        await wasabi.client.send(
          new DeleteObjectCommand({ Bucket: wasabi.creds.bucket, Key: row.cvWasabiKey }),
        );
      } catch (storageErr: unknown) {
        const code = (storageErr as { Code?: string; name?: string })?.Code ?? (storageErr as { name?: string })?.name;
        if (code !== "NoSuchKey" && code !== "NotFound") {
          logger.error({ storageErr }, "Failed to delete CV from storage");
          res.status(502).json({ error: "Failed to delete CV from storage" });
          return;
        }
        logger.warn({ storageErr }, "CV file not found in storage — continuing with DB cleanup");
      }
    }

    await db
      .update(workersTable)
      .set({ cvWasabiKey: null, cvUploadedAt: null, qualifications: null, notes: null, updatedAt: new Date() })
      .where(eq(workersTable.id, workerId));

    await db
      .delete(workerRoleHistoryTable)
      .where(eq(workerRoleHistoryTable.workerId, workerId));

    await logActivity(workerId, "cv_removed", row.cvWasabiKey.split("/").pop() ?? "", getClientIp(req));

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "worker-portal cv DELETE error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// DELETE /api/worker-portal/passport
router.delete("/worker-portal/passport", requireWorkerAuth, async (req, res): Promise<void> => {
  try {
    const workerId = req.session.workerId!;

    const [row] = await db
      .select({ passportWasabiKey: workersTable.passportWasabiKey })
      .from(workersTable)
      .where(eq(workersTable.id, workerId));

    if (!row?.passportWasabiKey) {
      res.status(404).json({ error: "No passport on file" });
      return;
    }

    const wasabi = await getWasabiClientAndCreds();
    if (wasabi) {
      try {
        await wasabi.client.send(
          new DeleteObjectCommand({ Bucket: wasabi.creds.bucket, Key: row.passportWasabiKey }),
        );
      } catch (storageErr: unknown) {
        const code = (storageErr as { Code?: string; name?: string })?.Code ?? (storageErr as { name?: string })?.name;
        if (code !== "NoSuchKey" && code !== "NotFound") {
          logger.error({ storageErr }, "Failed to delete passport from storage");
          res.status(502).json({ error: "Failed to delete passport from storage" });
          return;
        }
        logger.warn({ storageErr }, "Passport file not found in storage — continuing with DB cleanup");
      }
    }

    await db
      .update(workersTable)
      .set({ passportWasabiKey: null, updatedAt: new Date() })
      .where(eq(workersTable.id, workerId));

    await logActivity(workerId, "passport_removed", row.passportWasabiKey.split("/").pop() ?? "", getClientIp(req));

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "worker-portal passport DELETE error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/worker-portal/passport-upload
router.post(
  "/worker-portal/passport-upload",
  requireWorkerAuth,
  passportUploadMiddleware,
  async (req, res): Promise<void> => {
    try {
      const workerId = req.session.workerId!;

      if (!req.file) {
        res.status(400).json({ error: "A file is required" });
        return;
      }

      const wasabi = await getWasabiClientAndCreds();
      if (!wasabi) {
        res.status(503).json({ error: "Storage not configured" });
        return;
      }

      const [existing] = await db
        .select({ passportWasabiKey: workersTable.passportWasabiKey })
        .from(workersTable)
        .where(eq(workersTable.id, workerId));

      if (existing?.passportWasabiKey) {
        try {
          await wasabi.client.send(
            new DeleteObjectCommand({ Bucket: wasabi.creds.bucket, Key: existing.passportWasabiKey }),
          );
        } catch { /* ignore stale-key errors */ }
      }

      const safeName = req.file.originalname
        .replace(/[\\/\r\n\t]+/g, "_")
        .replace(/\.\.+/g, "_")
        .slice(0, 120);
      const key = `workers/${workerId}/passport/${safeName}`;

      await wasabi.client.send(
        new PutObjectCommand({
          Bucket: wasabi.creds.bucket,
          Key: key,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        }),
      );

      await db
        .update(workersTable)
        .set({ passportWasabiKey: key, updatedAt: new Date() })
        .where(eq(workersTable.id, workerId));

      await logActivity(workerId, "passport_uploaded", safeName, getClientIp(req));

      // Run AI extraction immediately after upload — return result in response
      const extracted = await extractPassportFields(req.file.buffer, req.file.mimetype);

      // Persist extracted passport fields to DB so the profile re-fetch picks them up
      if (extracted) {
        const passUpdate: Record<string, unknown> = { updatedAt: new Date() };
        if (extracted.passportNo) passUpdate.passportNo = extracted.passportNo;
        if (extracted.passportPlaceOfBirth) passUpdate.passportPlaceOfBirth = extracted.passportPlaceOfBirth;
        if (extracted.passportIssueDate) passUpdate.passportIssueDate = extracted.passportIssueDate;
        if (extracted.passportExpiryDate) passUpdate.passportExpiryDate = extracted.passportExpiryDate;
        if (Object.keys(passUpdate).length > 1) {
          await db.update(workersTable).set(passUpdate).where(eq(workersTable.id, workerId));
        }
      }

      res.json({ passportWasabiKey: key, filename: safeName, extracted: extracted ?? null });
    } catch (err) {
      logger.error({ err }, "worker-portal passport upload POST error");
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);

// GET /api/worker-portal/passport
router.get("/worker-portal/passport", requireWorkerAuth, async (req, res): Promise<void> => {
  try {
    const workerId = req.session.workerId!;

    const [row] = await db
      .select({ passportWasabiKey: workersTable.passportWasabiKey })
      .from(workersTable)
      .where(eq(workersTable.id, workerId));

    if (!row?.passportWasabiKey) {
      res.status(404).json({ error: "No passport on file" });
      return;
    }

    const wasabi = await getWasabiClientAndCreds();
    if (!wasabi) {
      res.status(503).json({ error: "Storage not configured" });
      return;
    }

    const obj = await wasabi.client.send(
      new GetObjectCommand({ Bucket: wasabi.creds.bucket, Key: row.passportWasabiKey }),
    );

    const filename = row.passportWasabiKey.split("/").pop() ?? "passport";
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const mimeMap: Record<string, string> = {
      pdf: "application/pdf",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
    };
    const contentType = mimeMap[ext] ?? "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, max-age=300");
    if (obj.ContentLength) res.setHeader("Content-Length", String(obj.ContentLength));

    if (obj.Body instanceof Readable) {
      obj.Body.pipe(res);
    } else if (obj.Body) {
      const buf = Buffer.from(
        await (obj.Body as unknown as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray(),
      );
      res.send(buf);
    } else {
      res.status(502).json({ error: "Empty body from storage" });
    }
  } catch (err) {
    logger.error({ err }, "worker-portal passport GET error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/worker-portal/change-password
router.post("/worker-portal/change-password", requireWorkerAuth, async (req, res): Promise<void> => {
  try {
    const workerId = req.session.workerId!;
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "currentPassword and newPassword are required" });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ error: "New password must be at least 8 characters" });
      return;
    }

    const [worker] = await db
      .select({ portalPasswordHash: workersTable.portalPasswordHash })
      .from(workersTable)
      .where(eq(workersTable.id, workerId));

    if (!worker?.portalPasswordHash) {
      res.status(400).json({ error: "No password configured for this account" });
      return;
    }

    const valid = await bcrypt.compare(currentPassword, worker.portalPasswordHash);
    if (!valid) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await db
      .update(workersTable)
      .set({ portalPasswordHash: hash, updatedAt: new Date() })
      .where(eq(workersTable.id, workerId));

    await logActivity(workerId, "password_changed", null, getClientIp(req));

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "worker-portal change-password POST error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

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

// GET /api/worker-portal/role-history
router.get("/worker-portal/role-history", requireWorkerAuth, async (req, res): Promise<void> => {
  try {
    const workerId = req.session.workerId!;
    const rows = await db
      .select()
      .from(workerRoleHistoryTable)
      .where(eq(workerRoleHistoryTable.workerId, workerId))
      .orderBy(
        sql`${workerRoleHistoryTable.sortOrder} ASC NULLS LAST`,
        desc(workerRoleHistoryTable.startDate),
      );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /api/worker-portal/role-history/reorder
router.patch("/worker-portal/role-history/reorder", requireWorkerAuth, async (req, res): Promise<void> => {
  try {
    const workerId = req.session.workerId!;
    const { orderedIds } = req.body as { orderedIds?: unknown };

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      res.status(400).json({ error: "orderedIds must be a non-empty array" });
      return;
    }

    const ids = orderedIds.map((v) => Number(v));
    if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
      res.status(400).json({ error: "All ids must be positive integers" });
      return;
    }

    // Verify all rows belong to this worker
    const existing = await db
      .select({ id: workerRoleHistoryTable.id })
      .from(workerRoleHistoryTable)
      .where(and(eq(workerRoleHistoryTable.workerId, workerId), inArray(workerRoleHistoryTable.id, ids)));

    if (existing.length !== ids.length) {
      res.status(403).json({ error: "One or more role IDs are invalid or don't belong to you" });
      return;
    }

    // Update sort_order for each id based on its position
    for (let i = 0; i < ids.length; i++) {
      await db
        .update(workerRoleHistoryTable)
        .set({ sortOrder: i })
        .where(eq(workerRoleHistoryTable.id, ids[i]!));
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/worker-portal/role-history
router.post("/worker-portal/role-history", requireWorkerAuth, async (req, res): Promise<void> => {
  try {
    const workerId = req.session.workerId!;
    const { roleNameSnapshot, startDate, endDate, notes } = req.body as {
      roleNameSnapshot: string;
      startDate: string;
      endDate?: string | null;
      notes?: string | null;
    };
    if (!roleNameSnapshot?.trim()) {
      res.status(400).json({ error: "Role title is required" });
      return;
    }
    if (!startDate?.match(/^\d{4}-\d{2}-\d{2}$/)) {
      res.status(400).json({ error: "Start date must be YYYY-MM-DD" });
      return;
    }
    const [row] = await db
      .insert(workerRoleHistoryTable)
      .values({
        workerId,
        roleNameSnapshot: roleNameSnapshot.trim(),
        startDate,
        endDate: endDate || null,
        notes: notes?.trim() || null,
        source: "manual",
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /api/worker-portal/role-history/:id
router.patch("/worker-portal/role-history/:id", requireWorkerAuth, async (req, res): Promise<void> => {
  try {
    const workerId = req.session.workerId!;
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [existing] = await db
      .select({ id: workerRoleHistoryTable.id, workerId: workerRoleHistoryTable.workerId })
      .from(workerRoleHistoryTable)
      .where(eq(workerRoleHistoryTable.id, id));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (existing.workerId !== workerId) { res.status(403).json({ error: "Forbidden" }); return; }

    const { roleNameSnapshot, startDate, endDate, notes } = req.body as {
      roleNameSnapshot?: string;
      startDate?: string;
      endDate?: string | null;
      notes?: string | null;
    };
    if (roleNameSnapshot !== undefined && !roleNameSnapshot.trim()) {
      res.status(400).json({ error: "Role title cannot be empty" });
      return;
    }
    if (startDate !== undefined && !startDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      res.status(400).json({ error: "Start date must be YYYY-MM-DD" });
      return;
    }

    const update: Record<string, unknown> = { source: "manual" };
    if (roleNameSnapshot !== undefined) update.roleNameSnapshot = roleNameSnapshot.trim();
    if (startDate !== undefined) update.startDate = startDate;
    if ("endDate" in req.body) update.endDate = endDate || null;
    if ("notes" in req.body) update.notes = notes?.trim() || null;

    const [updated] = await db
      .update(workerRoleHistoryTable)
      .set(update)
      .where(eq(workerRoleHistoryTable.id, id))
      .returning();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// DELETE /api/worker-portal/role-history/:id
router.delete("/worker-portal/role-history/:id", requireWorkerAuth, async (req, res): Promise<void> => {
  try {
    const workerId = req.session.workerId!;
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [existing] = await db
      .select({ id: workerRoleHistoryTable.id, workerId: workerRoleHistoryTable.workerId })
      .from(workerRoleHistoryTable)
      .where(eq(workerRoleHistoryTable.id, id));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (existing.workerId !== workerId) { res.status(403).json({ error: "Forbidden" }); return; }

    await db.delete(workerRoleHistoryTable).where(eq(workerRoleHistoryTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
