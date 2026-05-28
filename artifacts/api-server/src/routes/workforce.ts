import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and, or, ilike, inArray, sql, desc, asc } from "drizzle-orm";
import bcrypt from "bcryptjs";
import multer from "multer";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import {
  db,
  usersTable,
  workersTable,
  workforceRolesTable,
  mobSitesTable,
  certificationsTable,
  workerCertificationsTable,
  siteCertRequirementsTable,
  roleCertRequirementsTable,
  workerCertOverridesTable,
  siteAssignmentsTable,
  workerActivityLogsTable,
  emailLogsTable,
  clientsTable,
  clientCertRequirementsTable,
  ppeTypesTable,
  ppeAllocationsTable,
  workerRotationPeriodsTable,
  workerScheduleChangeRequestsTable,
  workerRoleHistoryTable,
} from "@workspace/db";
import { getWasabiClientAndCreds } from "../lib/wasabi.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const UNIQUE_CONSTRAINT_MESSAGES: Record<string, string> = {
  workers_email_unique: "A worker with this email already exists",
  workers_winda_id_unique: "A worker with this WINDA ID already exists",
  workers_portal_username_key: "A worker with this portal username already exists",
  workers_portal_username_unique: "A worker with this portal username already exists",
  worker_cert_unique: "This certification is already recorded for this worker",
  roles_name_unique: "A role with this name already exists",
  certifications_name_unique: "A certification type with this name already exists",
  clients_name_unique: "A client with this name already exists",
  ppe_types_name_unique: "A PPE type with this name already exists",
  site_assignment_unique: "This worker is already assigned to this site",
  role_cert_req_unique: "This certification requirement already exists for this role",
  site_cert_req_unique: "This certification requirement already exists for this site",
  client_cert_req_unique: "This certification requirement already exists for this client",
  worker_cert_override_unique: "An override already exists for this worker and certification",
};

function extractPgError(err: unknown): { code?: string; constraint?: string } | null {
  // Drizzle wraps the original pg error in err.cause
  for (const candidate of [err, (err as { cause?: unknown })?.cause]) {
    if (candidate && typeof candidate === "object" && "code" in candidate) {
      return candidate as { code?: string; constraint?: string };
    }
  }
  return null;
}

function handleRouteError(res: Response, err: unknown): void {
  const pgErr = extractPgError(err);
  if (pgErr?.code === "23505") {
    const constraint = pgErr.constraint ?? "";
    const message = UNIQUE_CONSTRAINT_MESSAGES[constraint] ?? "A record with these details already exists";
    res.status(409).json({ error: message });
    return;
  }
  logger.error({ err }, "Unexpected route error");
  res.status(500).json({ error: "An unexpected error occurred" });
}

const certFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Reject worker-portal sessions — workforce routes are admin-only
  if (req.session?.sessionType === "worker" || !req.session?.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  // Reject worker-portal sessions — admin routes require explicit admin accessLevel
  if (req.session?.sessionType === "worker" || req.session?.accessLevel !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

// ── Compliance logic helper ──────────────────────────────────────────────────

type CertStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "NOT_VERIFIED" | "MISSING";
// WorkerStatus extends the spec's READY|EXPIRING_SOON|NOT_COMPLIANT with NO_REQUIREMENTS:
// a worker has NO_REQUIREMENTS when no site/role/override certs are defined — treated as
// a distinct state (not READY) so the frontend can surface "no cert rules configured" UX.
type WorkerStatus = "READY" | "EXPIRING_SOON" | "NOT_COMPLIANT" | "NO_REQUIREMENTS";

class NotFoundError extends Error {
  status = 404;
  constructor(msg: string) { super(msg); this.name = "NotFoundError"; }
}

interface ComplianceItem {
  certId: number;
  name: string;
  category: string | null;
  status: CertStatus;
  expiryDate: string | null;
  dateAchieved: string | null;
  verified: boolean;
  daysUntilExpiry: number | null;
}

interface WorkerComplianceResult {
  workerId: number;
  workerName: string;
  siteId: number;
  siteName: string;
  status: WorkerStatus;
  requiredCount: number;
  validCount: number;
  expiringCount: number;
  missingCount: number;
  items: ComplianceItem[];
}

async function computeCompliance(workerId: number, siteId: number): Promise<WorkerComplianceResult> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in30Days = new Date(today);
  in30Days.setDate(in30Days.getDate() + 30);

  const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, workerId));
  const [site] = await db.select().from(mobSitesTable).where(eq(mobSitesTable.id, siteId));

  if (!worker) throw new NotFoundError(`Worker ${workerId} not found`);
  if (!site) throw new NotFoundError(`Site ${siteId} not found`);

  // Require an active (or pending) assignment to compute compliance
  const [assignment] = await db.select()
    .from(siteAssignmentsTable)
    .where(and(
      eq(siteAssignmentsTable.workerId, workerId),
      eq(siteAssignmentsTable.siteId, siteId),
      or(eq(siteAssignmentsTable.status, "active"), eq(siteAssignmentsTable.status, "pending")),
    ));
  if (!assignment) throw new NotFoundError(`No active/pending assignment for worker ${workerId} at site ${siteId}`);

  // Required cert IDs from site
  const siteReqs = await db.select()
    .from(siteCertRequirementsTable)
    .where(and(eq(siteCertRequirementsTable.siteId, siteId), eq(siteCertRequirementsTable.required, true)));

  // Required cert IDs from worker's role
  const roleReqs = worker.roleId
    ? await db.select()
        .from(roleCertRequirementsTable)
        .where(and(eq(roleCertRequirementsTable.roleId, worker.roleId), eq(roleCertRequirementsTable.required, true)))
    : [];

  // Worker overrides
  const overrides = await db.select()
    .from(workerCertOverridesTable)
    .where(eq(workerCertOverridesTable.workerId, workerId));

  // Build required cert set
  const requiredSet = new Set<number>();
  for (const r of siteReqs) requiredSet.add(r.certificationId);
  for (const r of roleReqs) requiredSet.add(r.certificationId);
  for (const o of overrides) {
    if (o.required) requiredSet.add(o.certificationId);
    else requiredSet.delete(o.certificationId);
  }

  if (requiredSet.size === 0) {
    return {
      workerId, workerName: worker.name,
      siteId, siteName: site.name,
      status: "NO_REQUIREMENTS",
      requiredCount: 0, validCount: 0, expiringCount: 0, missingCount: 0,
      items: [],
    };
  }

  // Fetch certification details
  const certIds = [...requiredSet];
  const certs = await db.select().from(certificationsTable).where(inArray(certificationsTable.id, certIds));
  const certMap = new Map(certs.map(c => [c.id, c]));

  // Fetch worker's held certifications
  const held = await db.select()
    .from(workerCertificationsTable)
    .where(and(
      eq(workerCertificationsTable.workerId, workerId),
      inArray(workerCertificationsTable.certificationId, certIds),
    ));
  const heldMap = new Map(held.map(h => [h.certificationId, h]));

  const items: ComplianceItem[] = [];
  for (const certId of certIds) {
    const cert = certMap.get(certId);
    if (!cert) continue;
    const held = heldMap.get(certId);

    let status: CertStatus;
    let daysUntilExpiry: number | null = null;

    if (!held) {
      status = "MISSING";
    } else {
      if (held.expiryDate) {
        const expiry = new Date(held.expiryDate);
        expiry.setHours(0, 0, 0, 0);
        daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
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
    }

    items.push({
      certId,
      name: cert.name,
      category: cert.category,
      status,
      expiryDate: held?.expiryDate ?? null,
      dateAchieved: held?.dateAchieved ?? null,
      verified: held?.verified ?? false,
      daysUntilExpiry,
    });
  }

  const validCount = items.filter(i => i.status === "VALID").length;
  const expiringCount = items.filter(i => i.status === "EXPIRING_SOON").length;
  const missingCount = items.filter(i => i.status === "MISSING" || i.status === "EXPIRED" || i.status === "NOT_VERIFIED").length;

  let status: WorkerStatus;
  if (missingCount > 0) {
    status = "NOT_COMPLIANT";
  } else if (expiringCount > 0) {
    status = "EXPIRING_SOON";
  } else {
    status = "READY";
  }

  return {
    workerId, workerName: worker.name,
    siteId, siteName: site.name,
    status,
    requiredCount: certIds.length,
    validCount,
    expiringCount,
    missingCount,
    items,
  };
}

// ── Workers ──────────────────────────────────────────────────────────────────

// GET /workforce/workers
// Filters: ?search= (name ilike), ?roleId=, ?siteId= (workers assigned to that site),
//          ?status=inactive (default: active workers only — worker active flag, not compliance status)
//          ?status=all — include both active and inactive workers
// All filters are composable and ANDed together.
router.get("/workforce/workers", requireAuth, async (req, res): Promise<void> => {
  try {
    const { search, roleId, siteId, status } = req.query as Record<string, string>;

    // Resolve siteId filter to a worker ID list (composable with other filters)
    let siteWorkerIds: number[] | undefined;
    if (siteId) {
      const assignments = await db.select({ workerId: siteAssignmentsTable.workerId })
        .from(siteAssignmentsTable)
        .where(eq(siteAssignmentsTable.siteId, parseInt(siteId)));
      siteWorkerIds = assignments.map(a => a.workerId);
      if (siteWorkerIds.length === 0) { res.json([]); return; }
    }

    const workers = await db.select().from(workersTable)
      .where(and(
        status === "all" ? undefined : status === "inactive" ? eq(workersTable.active, false) : eq(workersTable.active, true),
        roleId ? eq(workersTable.roleId, parseInt(roleId)) : undefined,
        search ? ilike(workersTable.name, `%${search}%`) : undefined,
        siteWorkerIds ? inArray(workersTable.id, siteWorkerIds) : undefined,
      ));

    // Attach role names
    const roleIds = [...new Set(workers.map(w => w.roleId).filter(Boolean) as number[])];
    const roles = roleIds.length > 0
      ? await db.select().from(workforceRolesTable).where(inArray(workforceRolesTable.id, roleIds))
      : [];
    const roleMap = new Map(roles.map(r => [r.id, r.name]));

    res.json(workers.map(w => ({ ...w, roleName: w.roleId ? (roleMap.get(w.roleId) ?? null) : null })));
  } catch (err) {
    logger.error({ err }, "workforce workers GET error");
    handleRouteError(res, err);
  }
});

router.post("/workforce/workers", requireAuth, async (req, res): Promise<void> => {
  try {
    const { name, email, company, windaId, roleId, notes } = req.body;
    if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
    const [worker] = await db.insert(workersTable).values({ name: name.trim(), email, company, windaId, roleId, notes }).returning();
    res.status(201).json(worker);
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.get("/workforce/workers/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, id));
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }

    const certs = await db.select({
      wc: workerCertificationsTable,
      cert: certificationsTable,
    })
      .from(workerCertificationsTable)
      .innerJoin(certificationsTable, eq(workerCertificationsTable.certificationId, certificationsTable.id))
      .where(eq(workerCertificationsTable.workerId, id));

    const assignments = await db.select({
      sa: siteAssignmentsTable,
      site: mobSitesTable,
    })
      .from(siteAssignmentsTable)
      .innerJoin(mobSitesTable, eq(siteAssignmentsTable.siteId, mobSitesTable.id))
      .where(eq(siteAssignmentsTable.workerId, id));

    const role = worker.roleId
      ? (await db.select().from(workforceRolesTable).where(eq(workforceRolesTable.id, worker.roleId)))[0] ?? null
      : null;

    res.json({
      ...worker,
      role,
      certifications: certs.map(r => ({ ...r.wc, certification: r.cert })),
      assignments: assignments.map(r => ({ ...r.sa, site: r.site })),
    });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// GET /api/workforce/workers/:id/cv — admin proxy to stream worker CV from Wasabi
router.get("/workforce/workers/:id/cv", requireAuth, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [worker] = await db
      .select({ cvWasabiKey: workersTable.cvWasabiKey })
      .from(workersTable)
      .where(eq(workersTable.id, id));

    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }
    if (!worker.cvWasabiKey) { res.status(404).json({ error: "No CV on file" }); return; }

    const wasabi = await getWasabiClientAndCreds();
    if (!wasabi) { res.status(503).json({ error: "Storage not configured" }); return; }

    const obj = await wasabi.client.send(
      new GetObjectCommand({ Bucket: wasabi.creds.bucket, Key: worker.cvWasabiKey }),
    );

    const filename = worker.cvWasabiKey.split("/").pop() ?? "cv.pdf";
    res.setHeader("Content-Type", "application/pdf");
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
    handleRouteError(res, err);
  }
});

// GET /api/workforce/workers/:id/passport — admin proxy to stream worker passport from Wasabi
router.get("/workforce/workers/:id/passport", requireAuth, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [worker] = await db
      .select({ passportWasabiKey: workersTable.passportWasabiKey })
      .from(workersTable)
      .where(eq(workersTable.id, id));

    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }
    if (!worker.passportWasabiKey) { res.status(404).json({ error: "No passport on file" }); return; }

    const wasabi = await getWasabiClientAndCreds();
    if (!wasabi) { res.status(503).json({ error: "Storage not configured" }); return; }

    const obj = await wasabi.client.send(
      new GetObjectCommand({ Bucket: wasabi.creds.bucket, Key: worker.passportWasabiKey }),
    );

    const filename = worker.passportWasabiKey.split("/").pop() ?? "passport";
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
    handleRouteError(res, err);
  }
});

router.patch("/workforce/workers/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { name, email, company, windaId, roleId, notes, active } = req.body;
    const [updated] = await db.update(workersTable)
      .set({ name, email, company, windaId, roleId, notes, active, updatedAt: new Date() })
      .where(eq(workersTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Worker not found" }); return; }
    res.json(updated);
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.delete("/workforce/workers/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [updated] = await db.update(workersTable)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(workersTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Worker not found" }); return; }
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// ── Roles ────────────────────────────────────────────────────────────────────

router.get("/workforce/roles", requireAuth, async (_req, res): Promise<void> => {
  try {
    const roles = await db.select().from(workforceRolesTable).orderBy(workforceRolesTable.name);
    res.json(roles);
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.post("/workforce/roles", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { name, description } = req.body;
    if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
    const [role] = await db.insert(workforceRolesTable).values({ name: name.trim(), description }).returning();
    res.status(201).json(role);
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.patch("/workforce/roles/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { name, description } = req.body;
    const [updated] = await db.update(workforceRolesTable)
      .set({ name, description, updatedAt: new Date() })
      .where(eq(workforceRolesTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Role not found" }); return; }
    res.json(updated);
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.delete("/workforce/roles/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(workforceRolesTable).where(eq(workforceRolesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// ── Sites ────────────────────────────────────────────────────────────────────

router.get("/workforce/sites", requireAuth, async (_req, res): Promise<void> => {
  try {
    const sites = await db.select().from(mobSitesTable).orderBy(mobSitesTable.name);
    res.json(sites);
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.get("/workforce/sites/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [row] = await db
      .select({
        id: mobSitesTable.id,
        name: mobSitesTable.name,
        location: mobSitesTable.location,
        description: mobSitesTable.description,
        active: mobSitesTable.active,
        expectedCompletionDate: mobSitesTable.expectedCompletionDate,
        mobilisationDate: mobSitesTable.mobilisationDate,
        clientId: mobSitesTable.clientId,
        clientName: clientsTable.name,
        createdAt: mobSitesTable.createdAt,
        updatedAt: mobSitesTable.updatedAt,
      })
      .from(mobSitesTable)
      .leftJoin(clientsTable, eq(clientsTable.id, mobSitesTable.clientId))
      .where(eq(mobSitesTable.id, id));
    if (!row) { res.status(404).json({ error: "Site not found" }); return; }
    res.json(row);
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.post("/workforce/sites", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { name, location, description, expectedCompletionDate, mobilisationDate, clientId } = req.body;
    if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
    const parsedClientId = clientId != null && clientId !== "" ? parseInt(clientId) : null;
    if (parsedClientId !== null && isNaN(parsedClientId)) {
      res.status(400).json({ error: "clientId must be a valid integer" }); return;
    }

    const site = await db.transaction(async (tx) => {
      const [newSite] = await tx.insert(mobSitesTable)
        .values({ name: name.trim(), location, description, expectedCompletionDate: expectedCompletionDate || null, mobilisationDate: mobilisationDate || null, clientId: parsedClientId })
        .returning();

      // If a client was linked, stamp its cert requirements onto the new site
      if (parsedClientId) {
        const clientReqs = await tx.select().from(clientCertRequirementsTable)
          .where(eq(clientCertRequirementsTable.clientId, parsedClientId));
        if (clientReqs.length > 0) {
          await tx.insert(siteCertRequirementsTable)
            .values(clientReqs.map(r => ({ siteId: newSite.id, certificationId: r.certificationId, required: true })));
        }
      }

      return newSite;
    });

    res.status(201).json(site);
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.patch("/workforce/sites/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { name, location, description, active, expectedCompletionDate, mobilisationDate, clientId } = req.body;
    const parsedClientId = clientId != null && clientId !== "" ? parseInt(clientId) : null;
    if (clientId !== undefined && parsedClientId !== null && isNaN(parsedClientId)) {
      res.status(400).json({ error: "clientId must be a valid integer" }); return;
    }
    const [updated] = await db.update(mobSitesTable)
      .set({
        name, location, description, active,
        ...(expectedCompletionDate !== undefined ? { expectedCompletionDate: expectedCompletionDate || null } : {}),
        ...(mobilisationDate !== undefined ? { mobilisationDate: mobilisationDate || null } : {}),
        ...(clientId !== undefined ? { clientId: parsedClientId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(mobSitesTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Site not found" }); return; }

    // If a new client was linked, additively stamp its cert requirements
    if (clientId) {
      const parsedClientId = parseInt(clientId);
      const clientReqs = await db.select().from(clientCertRequirementsTable)
        .where(eq(clientCertRequirementsTable.clientId, parsedClientId));
      if (clientReqs.length > 0) {
        const existingReqs = await db.select({ certificationId: siteCertRequirementsTable.certificationId })
          .from(siteCertRequirementsTable).where(eq(siteCertRequirementsTable.siteId, id));
        const existingIds = new Set(existingReqs.map(r => r.certificationId));
        const toAdd = clientReqs.filter(r => !existingIds.has(r.certificationId));
        if (toAdd.length > 0) {
          await db.insert(siteCertRequirementsTable)
            .values(toAdd.map(r => ({ siteId: id, certificationId: r.certificationId, required: true })));
        }
      }
    }

    res.json(updated);
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.delete("/workforce/sites/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [updated] = await db.update(mobSitesTable)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(mobSitesTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Site not found" }); return; }
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// ── Certifications ───────────────────────────────────────────────────────────

router.get("/workforce/certifications", requireAuth, async (_req, res): Promise<void> => {
  try {
    const certs = await db.select().from(certificationsTable).orderBy(certificationsTable.category, certificationsTable.name);

    // Attach holder count per cert
    const counts = await db.select({
      certificationId: workerCertificationsTable.certificationId,
      cnt: sql<number>`count(*)::int`,
    })
      .from(workerCertificationsTable)
      .groupBy(workerCertificationsTable.certificationId);
    const countMap = new Map(counts.map(c => [c.certificationId, c.cnt]));

    res.json(certs.map(c => ({ ...c, holderCount: countMap.get(c.id) ?? 0 })));
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.post("/workforce/certifications", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { name, description, validityMonths, category, autoCalculateExpiry } = req.body;
    if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
    const [cert] = await db.insert(certificationsTable)
      .values({ name: name.trim(), description, validityMonths, category, autoCalculateExpiry: autoCalculateExpiry ?? false }).returning();
    res.status(201).json(cert);
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.patch("/workforce/certifications/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { name, description, validityMonths, category, autoCalculateExpiry } = req.body;
    const [updated] = await db.update(certificationsTable)
      .set({ name, description, validityMonths, category, autoCalculateExpiry: autoCalculateExpiry ?? false, updatedAt: new Date() })
      .where(eq(certificationsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Certification not found" }); return; }
    res.json(updated);
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.delete("/workforce/certifications/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(certificationsTable).where(eq(certificationsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// ── Clients ──────────────────────────────────────────────────────────────────

router.get("/workforce/clients", requireAuth, async (_req, res): Promise<void> => {
  try {
    const clients = await db.select().from(clientsTable).orderBy(clientsTable.name);
    res.json(clients);
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.post("/workforce/clients", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { name, notes } = req.body;
    if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
    const [client] = await db.insert(clientsTable).values({ name: name.trim(), notes: notes || null }).returning();
    res.status(201).json(client);
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.patch("/workforce/clients/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { name, notes } = req.body;
    const [updated] = await db.update(clientsTable)
      .set({ name, notes: notes ?? null, updatedAt: new Date() })
      .where(eq(clientsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Client not found" }); return; }
    res.json(updated);
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.delete("/workforce/clients/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(clientsTable).where(eq(clientsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.get("/workforce/clients/:id/cert-requirements", requireAuth, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const reqs = await db.select({ req: clientCertRequirementsTable, cert: certificationsTable })
      .from(clientCertRequirementsTable)
      .innerJoin(certificationsTable, eq(clientCertRequirementsTable.certificationId, certificationsTable.id))
      .where(eq(clientCertRequirementsTable.clientId, id));
    res.json(reqs.map(r => ({ ...r.req, certification: r.cert })));
  } catch (err) {
    handleRouteError(res, err);
  }
});

// PUT /workforce/clients/:id/cert-requirements — replace-set: send full desired list
router.put("/workforce/clients/:id/cert-requirements", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const certIds = req.body as number[];
    if (!Array.isArray(certIds)) { res.status(400).json({ error: "Body must be an array of certificationId numbers" }); return; }
    await db.transaction(async (tx) => {
      await tx.delete(clientCertRequirementsTable).where(eq(clientCertRequirementsTable.clientId, id));
      if (certIds.length > 0) {
        await tx.insert(clientCertRequirementsTable)
          .values(certIds.map(certificationId => ({ clientId: id, certificationId })));
      }
    });
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// POST /workforce/sites/:id/apply-client-template — stamp client cert requirements onto a site (additive, not replacing)
router.post("/workforce/sites/:id/apply-client-template", requireAdmin, async (req, res): Promise<void> => {
  try {
    const siteId = parseInt(req.params.id ?? "");
    const { clientId } = req.body as { clientId: number };
    if (isNaN(siteId) || !clientId) { res.status(400).json({ error: "siteId and clientId are required" }); return; }

    const [site] = await db.select({ id: mobSitesTable.id }).from(mobSitesTable).where(eq(mobSitesTable.id, siteId));
    if (!site) { res.status(404).json({ error: "Site not found" }); return; }

    const [client] = await db.select({ id: clientsTable.id }).from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!client) { res.status(404).json({ error: "Client not found" }); return; }

    const clientReqs = await db.select().from(clientCertRequirementsTable)
      .where(eq(clientCertRequirementsTable.clientId, clientId));

    const existingReqs = await db.select({ certificationId: siteCertRequirementsTable.certificationId })
      .from(siteCertRequirementsTable).where(eq(siteCertRequirementsTable.siteId, siteId));

    const existingIds = new Set(existingReqs.map(r => r.certificationId));
    const toAdd = clientReqs.filter(r => !existingIds.has(r.certificationId));

    if (toAdd.length > 0) {
      await db.insert(siteCertRequirementsTable)
        .values(toAdd.map(r => ({ siteId, certificationId: r.certificationId, required: true })));
    }

    res.json({ added: toAdd.length });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// ── Worker Certifications ────────────────────────────────────────────────────

router.get("/workforce/workers/:id/certifications", requireAuth, async (req, res): Promise<void> => {
  try {
    const workerId = parseInt(req.params.id ?? "");
    if (isNaN(workerId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [worker] = await db.select({ id: workersTable.id }).from(workersTable).where(eq(workersTable.id, workerId));
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }
    const certs = await db.select({
      wc: workerCertificationsTable,
      cert: certificationsTable,
    })
      .from(workerCertificationsTable)
      .innerJoin(certificationsTable, eq(workerCertificationsTable.certificationId, certificationsTable.id))
      .where(eq(workerCertificationsTable.workerId, workerId));
    res.json(certs.map(r => ({ ...r.wc, certification: r.cert })));
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.post("/workforce/workers/:id/certifications", requireAuth, async (req, res): Promise<void> => {
  try {
    const workerId = parseInt(req.params.id ?? "");
    if (isNaN(workerId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { certificationId, dateAchieved, expiryDate, verified, fileUrl, notes } = req.body;
    if (!certificationId) { res.status(400).json({ error: "certificationId is required" }); return; }
    const [wc] = await db.insert(workerCertificationsTable)
      .values({ workerId, certificationId, dateAchieved, expiryDate, verified: verified ?? false, fileUrl, notes })
      .onConflictDoUpdate({
        target: [workerCertificationsTable.workerId, workerCertificationsTable.certificationId],
        set: { dateAchieved, expiryDate, verified: verified ?? false, fileUrl, notes, updatedAt: new Date() },
      })
      .returning();
    res.status(201).json(wc);
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.patch("/workforce/workers/:id/certifications/:certId", requireAuth, async (req, res): Promise<void> => {
  try {
    const workerId = parseInt(req.params.id ?? "");
    const certificationId = parseInt(req.params.certId ?? "");
    if (isNaN(workerId) || isNaN(certificationId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { dateAchieved, expiryDate, verified, verifiedAt, fileUrl, notes } = req.body;
    const [updated] = await db.update(workerCertificationsTable)
      .set({ dateAchieved, expiryDate, verified, verifiedAt, fileUrl, notes, updatedAt: new Date() })
      .where(and(
        eq(workerCertificationsTable.workerId, workerId),
        eq(workerCertificationsTable.certificationId, certificationId),
      )).returning();
    if (!updated) { res.status(404).json({ error: "Worker certification not found" }); return; }
    res.json(updated);
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.delete("/workforce/workers/:id/certifications/:certId", requireAdmin, async (req, res): Promise<void> => {
  try {
    const workerId = parseInt(req.params.id ?? "");
    const certificationId = parseInt(req.params.certId ?? "");
    if (isNaN(workerId) || isNaN(certificationId)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(workerCertificationsTable)
      .where(and(
        eq(workerCertificationsTable.workerId, workerId),
        eq(workerCertificationsTable.certificationId, certificationId),
      ));
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// POST /workforce/workers/:id/certifications/:certId/file
// Upload a file for a worker certification. Stores in Wasabi and updates file_url.
router.post(
  "/workforce/workers/:id/certifications/:certId/file",
  requireAuth,
  certFileUpload.single("file"),
  async (req, res): Promise<void> => {
    try {
      const workerId = parseInt(req.params.id ?? "");
      const certificationId = parseInt(req.params.certId ?? "");
      if (isNaN(workerId) || isNaN(certificationId)) { res.status(400).json({ error: "Invalid id" }); return; }
      if (!req.file) { res.status(400).json({ error: "Missing 'file' field" }); return; }

      // Enforce ownership: admins may upload to any worker; non-admins may only
      // upload to the worker record whose email matches their own account email.
      if (req.session.accessLevel !== "admin") {
        const [authUser] = await db.select({ email: usersTable.email })
          .from(usersTable)
          .where(eq(usersTable.id, req.session.userId!));
        const [targetWorker] = await db.select({ email: workersTable.email })
          .from(workersTable)
          .where(eq(workersTable.id, workerId));
        const userEmail = authUser?.email?.toLowerCase() ?? "";
        const workerEmail = targetWorker?.email?.toLowerCase() ?? "";
        if (!userEmail || !workerEmail || userEmail !== workerEmail) {
          res.status(403).json({ error: "You may only upload files to your own certification records" });
          return;
        }
      }

      const [row] = await db.select()
        .from(workerCertificationsTable)
        .where(and(
          eq(workerCertificationsTable.workerId, workerId),
          eq(workerCertificationsTable.certificationId, certificationId),
        ));
      if (!row) { res.status(404).json({ error: "Worker certification not found" }); return; }

      const wasabi = await getWasabiClientAndCreds();
      if (!wasabi) { res.status(503).json({ error: "Wasabi not configured" }); return; }

      const safeName = req.file.originalname
        .replace(/[\\/\r\n\t]+/g, "_")
        .replace(/\.\.+/g, "_")
        .slice(0, 120);
      const key = `workforce/certifications/${row.id}/${safeName}`;

      await wasabi.client.send(new PutObjectCommand({
        Bucket: wasabi.creds.bucket,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      }));

      const [updated] = await db.update(workerCertificationsTable)
        .set({ fileUrl: key, updatedAt: new Date() })
        .where(eq(workerCertificationsTable.id, row.id))
        .returning();

      logger.info({ workerId, certificationId, key }, "Cert file uploaded to Wasabi");
      res.status(201).json({ fileUrl: key, workerCertification: updated });
    } catch (err) {
      logger.error({ err }, "Failed to upload cert file");
      handleRouteError(res, err);
    }
  },
);

/** Shared helper: stream a cert file from Wasabi (or redirect legacy http URLs). */
async function streamCertFile(fileUrl: string, res: Response): Promise<void> {
  if (fileUrl.startsWith("http")) {
    res.redirect(fileUrl);
    return;
  }
  const wasabi = await getWasabiClientAndCreds();
  if (!wasabi) { res.status(503).json({ error: "Wasabi not configured" }); return; }

  const obj = await wasabi.client.send(new GetObjectCommand({
    Bucket: wasabi.creds.bucket,
    Key: fileUrl,
  }));

  const contentType = obj.ContentType ?? "application/octet-stream";
  res.setHeader("Content-Type", contentType);
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
}

// GET /workforce/workers/:id/certifications/:certId/file
// Stream the stored certification file from Wasabi.
router.get("/workforce/workers/:id/certifications/:certId/file", requireAuth, async (req, res): Promise<void> => {
  try {
    const workerId = parseInt(req.params.id ?? "");
    const certificationId = parseInt(req.params.certId ?? "");
    if (isNaN(workerId) || isNaN(certificationId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [row] = await db.select()
      .from(workerCertificationsTable)
      .where(and(
        eq(workerCertificationsTable.workerId, workerId),
        eq(workerCertificationsTable.certificationId, certificationId),
      ));
    if (!row) { res.status(404).json({ error: "Worker certification not found" }); return; }
    if (!row.fileUrl) { res.status(404).json({ error: "No file attached to this certification" }); return; }

    await streamCertFile(row.fileUrl, res);
  } catch (err) {
    logger.error({ err }, "Failed to fetch cert file");
    handleRouteError(res, err);
  }
});

// GET /workforce/certifications/:id/file (alias — :id is the PK of worker_certifications)
router.get("/workforce/certifications/:id/file", requireAuth, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [row] = await db.select()
      .from(workerCertificationsTable)
      .where(eq(workerCertificationsTable.id, id));
    if (!row) { res.status(404).json({ error: "Worker certification not found" }); return; }
    if (!row.fileUrl) { res.status(404).json({ error: "No file attached to this certification" }); return; }

    await streamCertFile(row.fileUrl, res);
  } catch (err) {
    logger.error({ err }, "Failed to fetch cert file (alias)");
    handleRouteError(res, err);
  }
});

// ── Requirements ─────────────────────────────────────────────────────────────

router.get("/workforce/sites/:id/requirements", requireAuth, async (req, res): Promise<void> => {
  try {
    const siteId = parseInt(req.params.id ?? "");
    if (isNaN(siteId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [site] = await db.select({ id: mobSitesTable.id }).from(mobSitesTable).where(eq(mobSitesTable.id, siteId));
    if (!site) { res.status(404).json({ error: "Site not found" }); return; }
    const reqs = await db.select({
      req: siteCertRequirementsTable,
      cert: certificationsTable,
    })
      .from(siteCertRequirementsTable)
      .innerJoin(certificationsTable, eq(siteCertRequirementsTable.certificationId, certificationsTable.id))
      .where(eq(siteCertRequirementsTable.siteId, siteId));
    res.json(reqs.map(r => ({ ...r.req, certification: r.cert })));
  } catch (err) {
    handleRouteError(res, err);
  }
});

// PUT /sites/:id/requirements — REPLACE-SET semantics: deletes all existing requirements
// for the site and inserts the supplied array. Send the full desired set each time.
router.put("/workforce/sites/:id/requirements", requireAdmin, async (req, res): Promise<void> => {
  try {
    const siteId = parseInt(req.params.id ?? "");
    if (isNaN(siteId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const items = req.body as { certificationId: number; required: boolean }[];
    if (!Array.isArray(items)) { res.status(400).json({ error: "Body must be an array" }); return; }

    await db.transaction(async (tx) => {
      await tx.delete(siteCertRequirementsTable).where(eq(siteCertRequirementsTable.siteId, siteId));
      if (items.length > 0) {
        await tx.insert(siteCertRequirementsTable)
          .values(items.map(i => ({ siteId, certificationId: i.certificationId, required: i.required })));
      }
    });
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// GET /workforce/sites/:id/role-requirements — roles assigned to this site with their cert requirements
router.get("/workforce/sites/:id/role-requirements", requireAuth, async (req, res): Promise<void> => {
  try {
    const siteId = parseInt(req.params.id ?? "");
    if (isNaN(siteId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [site] = await db.select({ id: mobSitesTable.id }).from(mobSitesTable).where(eq(mobSitesTable.id, siteId));
    if (!site) { res.status(404).json({ error: "Site not found" }); return; }

    // Find unique role IDs of workers with active/pending assignments at this site
    const assignments = await db.select({ workerId: siteAssignmentsTable.workerId })
      .from(siteAssignmentsTable)
      .where(and(
        eq(siteAssignmentsTable.siteId, siteId),
        or(eq(siteAssignmentsTable.status, "active"), eq(siteAssignmentsTable.status, "pending")),
      ));

    const workerIds = assignments.map(a => a.workerId);
    if (workerIds.length === 0) { res.json([]); return; }

    const workers = await db.select({ roleId: workersTable.roleId })
      .from(workersTable)
      .where(and(inArray(workersTable.id, workerIds), eq(workersTable.active, true)));

    const roleIds = [...new Set(workers.map(w => w.roleId).filter((id): id is number => id !== null && id !== undefined))];
    if (roleIds.length === 0) { res.json([]); return; }

    const roles = await db.select().from(workforceRolesTable).where(inArray(workforceRolesTable.id, roleIds));
    const roleMap = new Map(roles.map(r => [r.id, r]));

    const reqs = await db.select({ req: roleCertRequirementsTable, cert: certificationsTable })
      .from(roleCertRequirementsTable)
      .innerJoin(certificationsTable, eq(roleCertRequirementsTable.certificationId, certificationsTable.id))
      .where(inArray(roleCertRequirementsTable.roleId, roleIds));

    const grouped = new Map<number, { roleId: number; roleName: string; certifications: { certificationId: number; required: boolean; certification: { id: number; name: string; category: string | null } }[] }>();
    for (const roleId of roleIds) {
      const role = roleMap.get(roleId);
      if (role) grouped.set(roleId, { roleId, roleName: role.name, certifications: [] });
    }
    for (const r of reqs) {
      const group = grouped.get(r.req.roleId);
      if (group) group.certifications.push({ certificationId: r.req.certificationId, required: r.req.required, certification: r.cert });
    }

    res.json([...grouped.values()]);
  } catch (err) {
    handleRouteError(res, err);
  }
});

// GET /workforce/sites/:id/readiness-forecast
// Returns a per-month compliance snapshot from the current month to the site's expectedCompletionDate.
router.get("/workforce/sites/:id/readiness-forecast", requireAuth, async (req, res): Promise<void> => {
  try {
    const siteId = parseInt(req.params.id ?? "");
    if (isNaN(siteId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [site] = await db.select().from(mobSitesTable).where(eq(mobSitesTable.id, siteId));
    if (!site) { res.status(404).json({ error: "Site not found" }); return; }
    if (!site.expectedCompletionDate) { res.json([]); return; }

    // Fetch all workers at this site and their required cert data in a single query
    const certRows = await db.execute(sql`
      WITH active_workers AS (
        SELECT DISTINCT sa.worker_id
        FROM site_assignments sa
        JOIN workers w ON w.id = sa.worker_id AND w.active = true
        WHERE sa.site_id = ${siteId} AND sa.status IN ('active', 'pending')
      ),
      required_certs AS (
        SELECT aw.worker_id, scr.certification_id
        FROM active_workers aw
        CROSS JOIN site_cert_requirements scr
        WHERE scr.site_id = ${siteId} AND scr.required = true
        UNION
        SELECT aw.worker_id, rcr.certification_id
        FROM active_workers aw
        JOIN workers w ON w.id = aw.worker_id AND w.role_id IS NOT NULL
        JOIN role_cert_requirements rcr ON rcr.role_id = w.role_id AND rcr.required = true
        UNION
        SELECT aw.worker_id, wco.certification_id
        FROM active_workers aw
        JOIN worker_cert_overrides wco ON wco.worker_id = aw.worker_id AND wco.required = true
      ),
      final_required AS (
        SELECT rc.worker_id, rc.certification_id
        FROM required_certs rc
        WHERE NOT EXISTS (
          SELECT 1 FROM worker_cert_overrides wco2
          WHERE wco2.worker_id = rc.worker_id
            AND wco2.certification_id = rc.certification_id
            AND wco2.required = false
        )
      )
      SELECT
        w.id        AS worker_id,
        w.name      AS worker_name,
        c.id        AS cert_id,
        c.name      AS cert_name,
        wc.expiry_date,
        wc.verified
      FROM final_required fr
      JOIN workers w ON w.id = fr.worker_id
      JOIN certifications c ON c.id = fr.certification_id
      LEFT JOIN worker_certifications wc
        ON wc.worker_id = fr.worker_id AND wc.certification_id = fr.certification_id
      ORDER BY w.name, c.name
    `);

    // Also get all assigned workers (including those with no requirements)
    const allWorkersRows = await db.execute(sql`
      SELECT DISTINCT w.id AS worker_id, w.name AS worker_name
      FROM site_assignments sa
      JOIN workers w ON w.id = sa.worker_id AND w.active = true
      WHERE sa.site_id = ${siteId} AND sa.status IN ('active', 'pending')
    `);

    type CertRow = { worker_id: unknown; worker_name: string; cert_id: unknown; cert_name: string; expiry_date: string | null; verified: boolean | null };
    type WorkerRow = { worker_id: unknown; worker_name: string };

    const rawCertRows = certRows.rows as CertRow[];
    const allWorkers = allWorkersRows.rows as WorkerRow[];

    // Build a map: workerId → { name, certs[] }
    const workerMap = new Map<number, { name: string; certs: CertRow[] }>();
    for (const w of allWorkers) {
      workerMap.set(Number(w.worker_id), { name: w.worker_name, certs: [] });
    }
    for (const row of rawCertRows) {
      const wId = Number(row.worker_id);
      if (!workerMap.has(wId)) workerMap.set(wId, { name: row.worker_name, certs: [] });
      workerMap.get(wId)!.certs.push(row);
    }

    // Generate month range: current month → expectedCompletionDate
    // Parse date-only strings (YYYY-MM-DD) in UTC to avoid timezone day-shift
    const parseUTCDate = (s: string) => new Date(`${s}T00:00:00Z`);
    const today = new Date();
    const completionDate = parseUTCDate(site.expectedCompletionDate);

    type ForecastIssue = { certName: string; status: string; expiryDate: string | null };
    type ForecastDetail = { workerId: number; name: string; issues: ForecastIssue[] };
    type ForecastMonth = {
      month: string;
      readyCount: number;
      expiringCount: number;
      nonCompliantCount: number;
      noReqCount: number;
      details: ForecastDetail[];
    };

    const forecast: ForecastMonth[] = [];
    // Start from UTC first day of the current month
    const current = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

    while (current <= completionDate) {
      const yr = current.getUTCFullYear();
      const mo = current.getUTCMonth();
      // Last day of month in UTC (evaluated "as of month-end")
      const monthEnd = new Date(Date.UTC(yr, mo + 1, 0));
      // 30-day lookahead window after month-end
      const expiryWindow = new Date(Date.UTC(yr, mo + 1, 30));
      const monthKey = `${yr}-${String(mo + 1).padStart(2, "0")}`;

      let readyCount = 0, expiringCount = 0, nonCompliantCount = 0, noReqCount = 0;
      const details: ForecastDetail[] = [];

      for (const [wId, { name, certs }] of workerMap) {
        if (certs.length === 0) { noReqCount++; continue; }

        const issues: ForecastIssue[] = [];
        let workerStatus = "ready";

        for (const cert of certs) {
          // verified===null means LEFT JOIN found no held cert (MISSING)
          if (cert.verified === null) {
            issues.push({ certName: cert.cert_name, status: "MISSING", expiryDate: null });
            workerStatus = "non_compliant";
            continue;
          }
          if (!cert.verified) {
            issues.push({ certName: cert.cert_name, status: "NOT_VERIFIED", expiryDate: null });
            workerStatus = "non_compliant";
            continue;
          }
          // verified = true — evaluate as of month-end
          if (!cert.expiry_date) continue; // no expiry → valid indefinitely
          const expiry = parseUTCDate(cert.expiry_date);
          if (expiry <= monthEnd) {
            // Cert is expired by the last day of this month (includes certs expiring mid-month)
            issues.push({ certName: cert.cert_name, status: "EXPIRED", expiryDate: cert.expiry_date });
            workerStatus = "non_compliant";
          } else if (expiry <= expiryWindow) {
            // Cert expires within 30 days after month-end — flag as expiring soon
            issues.push({ certName: cert.cert_name, status: "EXPIRING", expiryDate: cert.expiry_date });
            if (workerStatus !== "non_compliant") workerStatus = "expiring";
          }
        }

        if (workerStatus === "ready") readyCount++;
        else if (workerStatus === "expiring") expiringCount++;
        else nonCompliantCount++;

        if (issues.length > 0) {
          details.push({ workerId: wId, name, issues });
        }
      }

      forecast.push({ month: monthKey, readyCount, expiringCount, nonCompliantCount, noReqCount, details });
      current.setUTCMonth(current.getUTCMonth() + 1);
    }

    res.json(forecast);
  } catch (err) {
    handleRouteError(res, err);
  }
});

// GET /workforce/sites/:id/mob-readiness
// Returns per-worker cert compliance status as it will stand on the site's mobilisation date.
router.get("/workforce/sites/:id/mob-readiness", requireAuth, async (req, res): Promise<void> => {
  try {
    const siteId = parseInt(req.params.id ?? "");
    if (isNaN(siteId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [site] = await db.select().from(mobSitesTable).where(eq(mobSitesTable.id, siteId));
    if (!site) { res.status(404).json({ error: "Site not found" }); return; }
    if (!site.mobilisationDate) { res.status(400).json({ error: "No mobilisation date set for this site" }); return; }

    const parseUTCDate = (s: string) => new Date(`${s}T00:00:00Z`);
    const mobDate = parseUTCDate(site.mobilisationDate);
    const expiryWindow = new Date(mobDate);
    expiryWindow.setUTCDate(expiryWindow.getUTCDate() + 30);

    // Fetch required cert data per assigned worker (same CTE as readiness-forecast)
    const certRows = await db.execute(sql`
      WITH active_workers AS (
        SELECT DISTINCT sa.worker_id
        FROM site_assignments sa
        JOIN workers w ON w.id = sa.worker_id AND w.active = true
        WHERE sa.site_id = ${siteId} AND sa.status IN ('active', 'pending')
      ),
      required_certs AS (
        SELECT aw.worker_id, scr.certification_id
        FROM active_workers aw
        CROSS JOIN site_cert_requirements scr
        WHERE scr.site_id = ${siteId} AND scr.required = true
        UNION
        SELECT aw.worker_id, rcr.certification_id
        FROM active_workers aw
        JOIN workers w ON w.id = aw.worker_id AND w.role_id IS NOT NULL
        JOIN role_cert_requirements rcr ON rcr.role_id = w.role_id AND rcr.required = true
        UNION
        SELECT aw.worker_id, wco.certification_id
        FROM active_workers aw
        JOIN worker_cert_overrides wco ON wco.worker_id = aw.worker_id AND wco.required = true
      ),
      final_required AS (
        SELECT rc.worker_id, rc.certification_id
        FROM required_certs rc
        WHERE NOT EXISTS (
          SELECT 1 FROM worker_cert_overrides wco2
          WHERE wco2.worker_id = rc.worker_id
            AND wco2.certification_id = rc.certification_id
            AND wco2.required = false
        )
      )
      SELECT
        w.id        AS worker_id,
        w.name      AS worker_name,
        c.id        AS cert_id,
        c.name      AS cert_name,
        wc.expiry_date,
        wc.verified
      FROM final_required fr
      JOIN workers w ON w.id = fr.worker_id
      JOIN certifications c ON c.id = fr.certification_id
      LEFT JOIN worker_certifications wc
        ON wc.worker_id = fr.worker_id AND wc.certification_id = fr.certification_id
      ORDER BY w.name, c.name
    `);

    const allWorkersRows = await db.execute(sql`
      SELECT DISTINCT w.id AS worker_id, w.name AS worker_name
      FROM site_assignments sa
      JOIN workers w ON w.id = sa.worker_id AND w.active = true
      WHERE sa.site_id = ${siteId} AND sa.status IN ('active', 'pending')
    `);

    type CertRow = { worker_id: unknown; worker_name: string; cert_id: unknown; cert_name: string; expiry_date: string | null; verified: boolean | null };
    type WorkerRow = { worker_id: unknown; worker_name: string };

    const rawCertRows = certRows.rows as CertRow[];
    const allWorkers = allWorkersRows.rows as WorkerRow[];

    const workerMap = new Map<number, { name: string; certs: CertRow[] }>();
    for (const w of allWorkers) {
      workerMap.set(Number(w.worker_id), { name: w.worker_name, certs: [] });
    }
    for (const row of rawCertRows) {
      const wId = Number(row.worker_id);
      if (!workerMap.has(wId)) workerMap.set(wId, { name: row.worker_name, certs: [] });
      workerMap.get(wId)!.certs.push(row);
    }

    type ReadinessIssue = { certName: string; status: string; expiryDate: string | null };
    type WorkerReadiness = { workerId: number; name: string; status: "ready" | "expiring" | "non_compliant" | "no_req"; issues: ReadinessIssue[] };

    let readyCount = 0, expiringCount = 0, nonCompliantCount = 0, noReqCount = 0;
    const workers: WorkerReadiness[] = [];

    for (const [wId, { name, certs }] of workerMap) {
      if (certs.length === 0) {
        noReqCount++;
        workers.push({ workerId: wId, name, status: "no_req", issues: [] });
        continue;
      }

      const issues: ReadinessIssue[] = [];
      let workerStatus: "ready" | "expiring" | "non_compliant" = "ready";

      for (const cert of certs) {
        if (cert.verified === null) {
          issues.push({ certName: cert.cert_name, status: "MISSING", expiryDate: null });
          workerStatus = "non_compliant";
          continue;
        }
        if (!cert.verified) {
          issues.push({ certName: cert.cert_name, status: "NOT_VERIFIED", expiryDate: null });
          workerStatus = "non_compliant";
          continue;
        }
        if (!cert.expiry_date) continue; // no expiry → valid indefinitely
        const expiry = parseUTCDate(cert.expiry_date);
        if (expiry <= mobDate) {
          issues.push({ certName: cert.cert_name, status: "EXPIRED", expiryDate: cert.expiry_date });
          workerStatus = "non_compliant";
        } else if (expiry <= expiryWindow) {
          issues.push({ certName: cert.cert_name, status: "EXPIRING", expiryDate: cert.expiry_date });
          if (workerStatus !== "non_compliant") workerStatus = "expiring";
        }
      }

      if (workerStatus === "ready") readyCount++;
      else if (workerStatus === "expiring") expiringCount++;
      else nonCompliantCount++;

      workers.push({ workerId: wId, name, status: workerStatus, issues });
    }

    // Sort: non_compliant first, then expiring, then ready, then no_req; within group alphabetical
    const statusOrder = { non_compliant: 0, expiring: 1, ready: 2, no_req: 3 };
    workers.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.name.localeCompare(b.name));

    res.json({ mobilisationDate: site.mobilisationDate, readyCount, expiringCount, nonCompliantCount, noReqCount, workers });
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.get("/workforce/roles/:id/requirements", requireAuth, async (req, res): Promise<void> => {
  try {
    const roleId = parseInt(req.params.id ?? "");
    if (isNaN(roleId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [role] = await db.select({ id: workforceRolesTable.id }).from(workforceRolesTable).where(eq(workforceRolesTable.id, roleId));
    if (!role) { res.status(404).json({ error: "Role not found" }); return; }
    const reqs = await db.select({
      req: roleCertRequirementsTable,
      cert: certificationsTable,
    })
      .from(roleCertRequirementsTable)
      .innerJoin(certificationsTable, eq(roleCertRequirementsTable.certificationId, certificationsTable.id))
      .where(eq(roleCertRequirementsTable.roleId, roleId));
    res.json(reqs.map(r => ({ ...r.req, certification: r.cert })));
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.put("/workforce/roles/:id/requirements", requireAdmin, async (req, res): Promise<void> => {
  try {
    const roleId = parseInt(req.params.id ?? "");
    if (isNaN(roleId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const items = req.body as { certificationId: number; required: boolean }[];
    if (!Array.isArray(items)) { res.status(400).json({ error: "Body must be an array" }); return; }

    await db.transaction(async (tx) => {
      await tx.delete(roleCertRequirementsTable).where(eq(roleCertRequirementsTable.roleId, roleId));
      if (items.length > 0) {
        await tx.insert(roleCertRequirementsTable)
          .values(items.map(i => ({ roleId, certificationId: i.certificationId, required: i.required })));
      }
    });
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.get("/workforce/workers/:id/overrides", requireAuth, async (req, res): Promise<void> => {
  try {
    const workerId = parseInt(req.params.id ?? "");
    if (isNaN(workerId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [worker] = await db.select({ id: workersTable.id }).from(workersTable).where(eq(workersTable.id, workerId));
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }
    const overrides = await db.select({
      override: workerCertOverridesTable,
      cert: certificationsTable,
    })
      .from(workerCertOverridesTable)
      .innerJoin(certificationsTable, eq(workerCertOverridesTable.certificationId, certificationsTable.id))
      .where(eq(workerCertOverridesTable.workerId, workerId));
    res.json(overrides.map(r => ({ ...r.override, certification: r.cert })));
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.put("/workforce/workers/:id/overrides", requireAdmin, async (req, res): Promise<void> => {
  try {
    const workerId = parseInt(req.params.id ?? "");
    if (isNaN(workerId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const items = req.body as { certificationId: number; required: boolean; reason?: string }[];
    if (!Array.isArray(items)) { res.status(400).json({ error: "Body must be an array" }); return; }

    await db.transaction(async (tx) => {
      await tx.delete(workerCertOverridesTable).where(eq(workerCertOverridesTable.workerId, workerId));
      if (items.length > 0) {
        await tx.insert(workerCertOverridesTable)
          .values(items.map(i => ({
            workerId,
            certificationId: i.certificationId,
            required: i.required,
            reason: i.reason ?? null,
            createdBy: req.session?.username ?? null,
          })));
      }
    });
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// ── Assignments ───────────────────────────────────────────────────────────────

router.get("/workforce/assignments", requireAuth, async (req, res): Promise<void> => {
  try {
    const { siteId, workerId } = req.query as Record<string, string>;
    const parsedSiteId = siteId ? parseInt(siteId) : NaN;
    const parsedWorkerId = workerId ? parseInt(workerId) : NaN;
    if (siteId && isNaN(parsedSiteId)) { res.status(400).json({ error: "Invalid siteId" }); return; }
    if (workerId && isNaN(parsedWorkerId)) { res.status(400).json({ error: "Invalid workerId" }); return; }
    const conditions = [];
    if (!isNaN(parsedSiteId)) conditions.push(eq(siteAssignmentsTable.siteId, parsedSiteId));
    if (!isNaN(parsedWorkerId)) conditions.push(eq(siteAssignmentsTable.workerId, parsedWorkerId));

    const assignments = await db.select({
      sa: siteAssignmentsTable,
      worker: workersTable,
      site: mobSitesTable,
    })
      .from(siteAssignmentsTable)
      .innerJoin(workersTable, eq(siteAssignmentsTable.workerId, workersTable.id))
      .innerJoin(mobSitesTable, eq(siteAssignmentsTable.siteId, mobSitesTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    res.json(assignments.map(r => ({ ...r.sa, worker: r.worker, site: r.site })));
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.post("/workforce/assignments", requireAuth, async (req, res): Promise<void> => {
  try {
    const { workerId, siteId, assignedDate, mobilisationDate, status, notes } = req.body;
    if (!workerId || !siteId) { res.status(400).json({ error: "workerId and siteId are required" }); return; }
    const [assignment] = await db.insert(siteAssignmentsTable)
      .values({ workerId, siteId, assignedDate, mobilisationDate, status: status ?? "active", notes })
      .onConflictDoUpdate({
        target: [siteAssignmentsTable.workerId, siteAssignmentsTable.siteId],
        set: { assignedDate, mobilisationDate, status: status ?? "active", notes, updatedAt: new Date() },
      })
      .returning();
    res.status(201).json(assignment);
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.patch("/workforce/assignments/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { assignedDate, mobilisationDate, status, notes } = req.body;
    const [updated] = await db.update(siteAssignmentsTable)
      .set({ assignedDate, mobilisationDate, status, notes, updatedAt: new Date() })
      .where(eq(siteAssignmentsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Assignment not found" }); return; }
    res.json(updated);
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.delete("/workforce/assignments/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(siteAssignmentsTable).where(eq(siteAssignmentsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// ── Rotation Periods ──────────────────────────────────────────────────────────

router.get("/workforce/assignments/:id/rotations", requireAuth, async (req, res): Promise<void> => {
  try {
    const assignmentId = parseInt(req.params.id ?? "");
    if (isNaN(assignmentId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const rows = await db.select().from(workerRotationPeriodsTable)
      .where(eq(workerRotationPeriodsTable.assignmentId, assignmentId))
      .orderBy(workerRotationPeriodsTable.plannedStart);
    res.json(rows);
  } catch (err) {
    handleRouteError(res, err);
  }
});

const VALID_ROTATION_STATUSES = ["planned", "on-site", "completed", "cancelled"] as const;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateRotationFields(
  res: Response,
  fields: { plannedStart?: unknown; plannedEnd?: unknown; status?: unknown },
  requireStart = false,
): fields is { plannedStart: string; plannedEnd?: string | null; status?: string } {
  const { plannedStart, plannedEnd, status } = fields;
  if (requireStart) {
    if (!plannedStart || typeof plannedStart !== "string" || !ISO_DATE_RE.test(plannedStart)) {
      res.status(400).json({ error: "plannedStart must be a valid date (YYYY-MM-DD)" });
      return false;
    }
  } else if (plannedStart !== undefined) {
    if (typeof plannedStart !== "string" || !ISO_DATE_RE.test(plannedStart)) {
      res.status(400).json({ error: "plannedStart must be a valid date (YYYY-MM-DD)" });
      return false;
    }
  }
  if (plannedEnd !== undefined && plannedEnd !== null && plannedEnd !== "") {
    if (typeof plannedEnd !== "string" || !ISO_DATE_RE.test(plannedEnd)) {
      res.status(400).json({ error: "plannedEnd must be a valid date (YYYY-MM-DD) or null" });
      return false;
    }
    const start = (plannedStart as string | undefined) ?? "";
    if (start && plannedEnd < start) {
      res.status(400).json({ error: "plannedEnd must not be before plannedStart" });
      return false;
    }
  }
  if (status !== undefined && !VALID_ROTATION_STATUSES.includes(status as typeof VALID_ROTATION_STATUSES[number])) {
    res.status(400).json({ error: `status must be one of: ${VALID_ROTATION_STATUSES.join(", ")}` });
    return false;
  }
  return true;
}

router.post("/workforce/assignments/:id/rotations", requireAdmin, async (req, res): Promise<void> => {
  try {
    const assignmentId = parseInt(req.params.id ?? "");
    if (isNaN(assignmentId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { plannedStart, plannedEnd, status, notes } = req.body;
    if (!validateRotationFields(res, { plannedStart, plannedEnd, status }, true)) return;
    const [row] = await db.insert(workerRotationPeriodsTable).values({
      assignmentId,
      plannedStart,
      plannedEnd: plannedEnd || null,
      status: status || "planned",
      notes: notes || null,
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    handleRouteError(res, err);
  }
});

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

router.post("/workforce/assignments/:id/rotations/generate", requireAdmin, async (req, res): Promise<void> => {
  try {
    const assignmentId = parseInt(req.params.id ?? "");
    if (isNaN(assignmentId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { startDate, onDays, offDays, count } = req.body;
    if (!startDate || typeof startDate !== "string" || !ISO_DATE_RE.test(startDate)) {
      res.status(400).json({ error: "startDate must be a valid date (YYYY-MM-DD)" }); return;
    }
    const onDaysNum = parseInt(onDays);
    const offDaysNum = parseInt(offDays);
    const countNum = parseInt(count);
    if (!Number.isInteger(onDaysNum) || onDaysNum < 1 || onDaysNum > 365) {
      res.status(400).json({ error: "onDays must be between 1 and 365" }); return;
    }
    if (!Number.isInteger(offDaysNum) || offDaysNum < 0 || offDaysNum > 365) {
      res.status(400).json({ error: "offDays must be between 0 and 365" }); return;
    }
    if (!Number.isInteger(countNum) || countNum < 1 || countNum > 52) {
      res.status(400).json({ error: "count must be between 1 and 52" }); return;
    }
    const periods: { assignmentId: number; plannedStart: string; plannedEnd: string; status: "planned" }[] = [];
    let currentStart = startDate;
    for (let i = 0; i < countNum; i++) {
      const currentEnd = addDaysISO(currentStart, onDaysNum - 1);
      periods.push({ assignmentId, plannedStart: currentStart, plannedEnd: currentEnd, status: "planned" });
      currentStart = addDaysISO(currentEnd, offDaysNum + 1);
    }
    const rows = await db.insert(workerRotationPeriodsTable).values(periods).returning();
    res.status(201).json(rows);
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.patch("/workforce/rotations/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { plannedStart, plannedEnd, status, notes } = req.body;
    if (!validateRotationFields(res, { plannedStart, plannedEnd, status }, false)) return;
    const [updated] = await db.update(workerRotationPeriodsTable)
      .set({
        ...(plannedStart !== undefined && { plannedStart }),
        ...(plannedEnd !== undefined && { plannedEnd: plannedEnd || null }),
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes: notes || null }),
        updatedAt: new Date(),
      })
      .where(eq(workerRotationPeriodsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Rotation not found" }); return; }
    res.json(updated);
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.delete("/workforce/rotations/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(workerRotationPeriodsTable).where(eq(workerRotationPeriodsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// Returns the next upcoming rotation (planned_start >= today) per assignment for a given site
router.get("/workforce/sites/:siteId/next-rotations", requireAuth, async (req, res): Promise<void> => {
  try {
    const siteId = parseInt(req.params.siteId ?? "");
    if (isNaN(siteId)) { res.status(400).json({ error: "Invalid siteId" }); return; }
    const rows = await db.execute<{ worker_id: number; assignment_id: number; planned_start: string }>(sql`
      SELECT sa.worker_id, wrp.assignment_id, MIN(wrp.planned_start) AS planned_start
      FROM site_assignments sa
      JOIN worker_rotation_periods wrp ON wrp.assignment_id = sa.id
      WHERE sa.site_id = ${siteId}
        AND wrp.planned_start >= CURRENT_DATE
        AND wrp.status NOT IN ('completed', 'cancelled')
      GROUP BY sa.worker_id, wrp.assignment_id
    `);
    res.json(rows.rows ?? rows);
  } catch (err) {
    handleRouteError(res, err);
  }
});

// ── Compliance Engine ─────────────────────────────────────────────────────────

router.get("/workforce/compliance", requireAuth, async (req, res): Promise<void> => {
  try {
    const workerId = parseInt((req.query.workerId as string) ?? "");
    const siteId = parseInt((req.query.siteId as string) ?? "");
    if (isNaN(workerId) || isNaN(siteId)) {
      res.status(400).json({ error: "workerId and siteId query params required" });
      return;
    }
    const result = await computeCompliance(workerId, siteId);
    res.json(result);
  } catch (err) {
    const status = err instanceof NotFoundError ? 404 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/workforce/compliance/site/:siteId", requireAuth, async (req, res): Promise<void> => {
  try {
    const siteId = parseInt(req.params.siteId ?? "");
    if (isNaN(siteId)) { res.status(400).json({ error: "Invalid siteId" }); return; }

    // Include both active and pending assignments — mirrors computeCompliance behaviour
    const assignments = await db.select()
      .from(siteAssignmentsTable)
      .where(and(
        eq(siteAssignmentsTable.siteId, siteId),
        or(eq(siteAssignmentsTable.status, "active"), eq(siteAssignmentsTable.status, "pending")),
      ));

    const results = await Promise.all(
      assignments.map(a => computeCompliance(a.workerId, siteId).catch(err => ({
        workerId: a.workerId, siteId, error: err.message,
      }))),
    );
    res.json(results);
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.get("/workforce/compliance/worker/:workerId", requireAuth, async (req, res): Promise<void> => {
  try {
    const workerId = parseInt(req.params.workerId ?? "");
    if (isNaN(workerId)) { res.status(400).json({ error: "Invalid workerId" }); return; }

    // Include both active and pending assignments — mirrors computeCompliance behaviour
    const assignments = await db.select()
      .from(siteAssignmentsTable)
      .where(and(
        eq(siteAssignmentsTable.workerId, workerId),
        or(eq(siteAssignmentsTable.status, "active"), eq(siteAssignmentsTable.status, "pending")),
      ));

    const results = await Promise.all(
      assignments.map(a => computeCompliance(workerId, a.siteId).catch(err => ({
        workerId, siteId: a.siteId, error: err.message,
      }))),
    );
    res.json(results);
  } catch (err) {
    handleRouteError(res, err);
  }
});

// ── Dashboard Summary ─────────────────────────────────────────────────────────
// GET /workforce/dashboard
// Counting model: readyCount/expiringCount/nonCompliantCount are based on workers
// with at least one active assignment (worst compliance status wins per worker).
// Active workers with NO assignments (or only NO_REQUIREMENTS sites) are surfaced
// via unassignedCount instead.
// Two CTE queries, all CTEs fully inlined — no SQL fragment composition.
router.get("/workforce/dashboard", requireAuth, async (req, res): Promise<void> => {
  try {
    const rawSiteId = req.query.siteId;
    const siteId = rawSiteId ? parseInt(rawSiteId as string) : null;
    const siteFilter = siteId ? sql` AND sa.site_id = ${siteId}` : sql``;

    const rawDays = parseInt((req.query.expiryDays as string) ?? "30");
    const expiryDays = [30, 60, 90].includes(rawDays) ? rawDays : 30;
    const expiryInterval = sql`INTERVAL '1 day' * ${expiryDays}`;

    // Both queries run in parallel — start both before awaiting either
    // Dashboard uses status='active' only (matching original behavior; workers-compliance-summary
    // uses ('active','pending') to match the computeCompliance predecessor behavior there).
    const countsRowsPromise = db.execute(sql`
      WITH worker_site_pairs AS (
        SELECT sa.worker_id, sa.site_id, wr.role_id
        FROM site_assignments sa
        JOIN workers wr ON wr.id = sa.worker_id AND wr.active = true
        WHERE sa.status = 'active'${siteFilter}
      ),
      required_certs AS (
        SELECT wsp.worker_id, wsp.site_id, scr.certification_id
        FROM worker_site_pairs wsp
        JOIN site_cert_requirements scr ON scr.site_id = wsp.site_id AND scr.required = true
        UNION
        SELECT wsp.worker_id, wsp.site_id, rcr.certification_id
        FROM worker_site_pairs wsp
        JOIN role_cert_requirements rcr ON rcr.role_id = wsp.role_id AND rcr.required = true
        WHERE wsp.role_id IS NOT NULL
        UNION
        SELECT wsp.worker_id, wsp.site_id, wco.certification_id
        FROM worker_site_pairs wsp
        JOIN worker_cert_overrides wco ON wco.worker_id = wsp.worker_id AND wco.required = true
      ),
      final_required AS (
        SELECT rc.worker_id, rc.site_id, rc.certification_id
        FROM required_certs rc
        WHERE NOT EXISTS (
          SELECT 1 FROM worker_cert_overrides wco2
          WHERE wco2.worker_id = rc.worker_id
            AND wco2.certification_id = rc.certification_id
            AND wco2.required = false
        )
      ),
      cert_eval AS (
        SELECT
          fr.worker_id,
          fr.site_id,
          fr.certification_id,
          CASE
            WHEN wc.id IS NULL                                                    THEN 'bad'
            WHEN NOT wc.verified                                                  THEN 'bad'
            WHEN wc.expiry_date IS NOT NULL AND wc.expiry_date < CURRENT_DATE    THEN 'bad'
            WHEN wc.expiry_date IS NOT NULL
              AND wc.expiry_date <= (CURRENT_DATE + ${expiryInterval})          THEN 'expiring'
            ELSE 'good'
          END AS cert_status
        FROM final_required fr
        LEFT JOIN worker_certifications wc
          ON wc.worker_id = fr.worker_id AND wc.certification_id = fr.certification_id
      ),
      site_compliance AS (
        SELECT
          wsp.worker_id,
          wsp.site_id,
          CASE
            WHEN COUNT(fr.certification_id) = 0                                         THEN 'no_req'
            WHEN MAX(CASE WHEN ce.cert_status = 'bad'      THEN 1 ELSE 0 END) = 1      THEN 'non_compliant'
            WHEN MAX(CASE WHEN ce.cert_status = 'expiring' THEN 1 ELSE 0 END) = 1      THEN 'expiring'
            ELSE 'ready'
          END AS compliance
        FROM worker_site_pairs wsp
        LEFT JOIN final_required fr ON fr.worker_id = wsp.worker_id AND fr.site_id = wsp.site_id
        LEFT JOIN cert_eval ce
          ON ce.worker_id = fr.worker_id AND ce.site_id = fr.site_id
          AND ce.certification_id = fr.certification_id
        GROUP BY wsp.worker_id, wsp.site_id
      ),
      worker_status AS (
        SELECT
          w.id AS worker_id,
          CASE
            WHEN MAX(CASE WHEN sc.compliance = 'non_compliant' THEN 1 ELSE 0 END) = 1  THEN 'non_compliant'
            WHEN MAX(CASE WHEN sc.compliance = 'expiring'      THEN 1 ELSE 0 END) = 1  THEN 'expiring'
            WHEN MAX(CASE WHEN sc.compliance = 'ready'         THEN 1 ELSE 0 END) = 1  THEN 'ready'
            ELSE 'unassigned'
          END AS overall_status
        FROM workers w
        LEFT JOIN site_compliance sc ON sc.worker_id = w.id
        WHERE w.active = true
        GROUP BY w.id
      )
      SELECT
        COUNT(*)::int                                                            AS total_workers,
        COUNT(CASE WHEN overall_status = 'ready'         THEN 1 END)::int      AS ready_count,
        COUNT(CASE WHEN overall_status = 'expiring'      THEN 1 END)::int      AS expiring_count,
        COUNT(CASE WHEN overall_status = 'non_compliant' THEN 1 END)::int      AS non_compliant_count,
        COUNT(CASE WHEN overall_status = 'unassigned'    THEN 1 END)::int      AS unassigned_count
      FROM worker_status
    `);

    // Query 2: per-cert breakdown + expiring items (with names) — run parallel to query 1
    const certRowsPromise = db.execute(sql`
      WITH worker_site_pairs AS (
        SELECT sa.worker_id, sa.site_id, wr.role_id
        FROM site_assignments sa
        JOIN workers wr ON wr.id = sa.worker_id AND wr.active = true
        WHERE sa.status = 'active'${siteFilter}
      ),
      required_certs AS (
        SELECT wsp.worker_id, wsp.site_id, scr.certification_id
        FROM worker_site_pairs wsp
        JOIN site_cert_requirements scr ON scr.site_id = wsp.site_id AND scr.required = true
        UNION
        SELECT wsp.worker_id, wsp.site_id, rcr.certification_id
        FROM worker_site_pairs wsp
        JOIN role_cert_requirements rcr ON rcr.role_id = wsp.role_id AND rcr.required = true
        WHERE wsp.role_id IS NOT NULL
        UNION
        SELECT wsp.worker_id, wsp.site_id, wco.certification_id
        FROM worker_site_pairs wsp
        JOIN worker_cert_overrides wco ON wco.worker_id = wsp.worker_id AND wco.required = true
      ),
      -- INTENTIONAL BEHAVIOR: DISTINCT collapses multi-site workers so each (worker, cert)
      -- pair is counted once in certificationsByStatus, regardless of how many sites require
      -- that cert. This differs from the prior loop which accumulated one count per site
      -- assignment, causing multi-site workers to inflate totals. The current behavior is
      -- more correct for a "how many workers are missing cert X?" question.
      final_required AS (
        SELECT DISTINCT rc.worker_id, rc.certification_id
        FROM required_certs rc
        WHERE NOT EXISTS (
          SELECT 1 FROM worker_cert_overrides wco2
          WHERE wco2.worker_id = rc.worker_id
            AND wco2.certification_id = rc.certification_id
            AND wco2.required = false
        )
      ),
      cert_eval_detail AS (
        SELECT
          fr.worker_id,
          c.name                                                          AS cert_name,
          w2.name                                                         AS worker_name,
          wc.expiry_date,
          CASE
            WHEN wc.id IS NULL                                            THEN 'missing'
            WHEN wc.expiry_date IS NOT NULL AND wc.expiry_date < CURRENT_DATE  THEN 'expired'
            WHEN wc.expiry_date IS NOT NULL
              AND wc.expiry_date <= (CURRENT_DATE + ${expiryInterval})  THEN 'expiring'
            WHEN NOT wc.verified                                          THEN 'not_verified'
            ELSE 'valid'
          END                                                             AS cert_status,
          CASE
            WHEN wc.expiry_date IS NOT NULL
            THEN CEIL(EXTRACT(EPOCH FROM (wc.expiry_date::timestamptz - NOW())) / 86400)::int
            ELSE NULL
          END                                                             AS days_until_expiry
        FROM final_required fr
        LEFT JOIN worker_certifications wc
          ON wc.worker_id = fr.worker_id AND wc.certification_id = fr.certification_id
        JOIN certifications c ON c.id = fr.certification_id
        JOIN workers w2 ON w2.id = fr.worker_id
      )
      SELECT
        'breakdown'                                                       AS row_type,
        cert_name,
        NULL::int                                                         AS worker_id,
        NULL::text                                                        AS worker_name,
        NULL::date                                                        AS expiry_date,
        NULL::int                                                         AS days_until_expiry,
        COUNT(CASE WHEN cert_status IN ('missing','not_verified') THEN 1 END)::int  AS missing_count,
        COUNT(CASE WHEN cert_status = 'expired'  THEN 1 END)::int        AS expired_count,
        COUNT(CASE WHEN cert_status = 'expiring' THEN 1 END)::int        AS expiring_count
      FROM cert_eval_detail
      GROUP BY cert_name
      HAVING COUNT(CASE WHEN cert_status IN ('missing','not_verified','expired','expiring') THEN 1 END) > 0

      UNION ALL

      SELECT
        'expiring'                                                        AS row_type,
        cert_name,
        worker_id,
        worker_name,
        expiry_date,
        days_until_expiry,
        NULL::int                                                         AS missing_count,
        NULL::int                                                         AS expired_count,
        NULL::int                                                         AS expiring_count
      FROM cert_eval_detail
      WHERE cert_status = 'expiring'
      ORDER BY row_type, expiry_date NULLS LAST
    `);

    const [countsRows, certRows] = await Promise.all([countsRowsPromise, certRowsPromise]);
    const counts = (countsRows.rows[0] ?? {}) as Record<string, unknown>;

    const certificationsByStatus: { name: string; missing: number; expired: number; expiring: number }[] = [];
    const expiringInNext30Days: { workerId: number; workerName: string; certName: string; expiryDate: string; daysUntilExpiry: number }[] = [];

    for (const row of certRows.rows as Record<string, unknown>[]) {
      if (row.row_type === "breakdown") {
        certificationsByStatus.push({
          name: String(row.cert_name),
          missing: Number(row.missing_count),
          expired: Number(row.expired_count),
          expiring: Number(row.expiring_count),
        });
      } else {
        expiringInNext30Days.push({
          workerId: Number(row.worker_id),
          workerName: String(row.worker_name),
          certName: String(row.cert_name),
          expiryDate: String(row.expiry_date),
          daysUntilExpiry: Number(row.days_until_expiry),
        });
      }
    }
    expiringInNext30Days.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

    res.json({
      totalWorkers: Number(counts.total_workers ?? 0),
      readyCount: Number(counts.ready_count ?? 0),
      expiringCount: Number(counts.expiring_count ?? 0),
      nonCompliantCount: Number(counts.non_compliant_count ?? 0),
      unassignedCount: Number(counts.unassigned_count ?? 0),
      certificationsByStatus,
      expiringInNext30Days,
    });
  } catch (err) {
    logger.error({ err }, "workforce dashboard error");
    handleRouteError(res, err);
  }
});

// ── Cert issue workers — who has a specific cert in a given status ─────────────
// GET /workforce/cert-issue-workers?certName=Medical&status=expired&siteId=2
// status: "expired" | "expiring" | "missing" | "not_verified"
router.get("/workforce/cert-issue-workers", requireAuth, async (req, res): Promise<void> => {
  try {
    const certName = req.query.certName as string | undefined;
    const status   = req.query.status   as string | undefined;
    const rawSiteId = req.query.siteId;
    const siteId = rawSiteId ? parseInt(rawSiteId as string) : null;

    if (!certName || !status) { res.status(400).json({ error: "certName and status are required" }); return; }

    const siteFilter = siteId ? sql` AND sa.site_id = ${siteId}` : sql``;
    const rawDays2 = parseInt((req.query.expiryDays as string) ?? "30");
    const expiryDays2 = [30, 60, 90].includes(rawDays2) ? rawDays2 : 30;
    const expiryInterval2 = sql`INTERVAL '1 day' * ${expiryDays2}`;

    // Map incoming status to the CASE logic used in cert_eval_detail
    let statusFilter: ReturnType<typeof sql>;
    if (status === "expired")      statusFilter = sql`wc.expiry_date IS NOT NULL AND wc.expiry_date < CURRENT_DATE`;
    else if (status === "expiring") statusFilter = sql`wc.expiry_date IS NOT NULL AND wc.expiry_date <= (CURRENT_DATE + ${expiryInterval2}) AND wc.expiry_date >= CURRENT_DATE`;
    else if (status === "missing")  statusFilter = sql`wc.id IS NULL`;
    else if (status === "not_verified") statusFilter = sql`wc.id IS NOT NULL AND NOT wc.verified AND (wc.expiry_date IS NULL OR wc.expiry_date > (CURRENT_DATE + ${expiryInterval2}))`;
    else { res.status(400).json({ error: "Invalid status" }); return; }

    const rows = await db.execute(sql`
      WITH worker_site_pairs AS (
        SELECT sa.worker_id, sa.site_id, wr.role_id
        FROM site_assignments sa
        JOIN workers wr ON wr.id = sa.worker_id AND wr.active = true
        WHERE sa.status = 'active'${siteFilter}
      ),
      required_certs AS (
        SELECT wsp.worker_id, wsp.site_id, scr.certification_id
        FROM worker_site_pairs wsp
        JOIN site_cert_requirements scr ON scr.site_id = wsp.site_id AND scr.required = true
        UNION
        SELECT wsp.worker_id, wsp.site_id, rcr.certification_id
        FROM worker_site_pairs wsp
        JOIN role_cert_requirements rcr ON rcr.role_id = wsp.role_id AND rcr.required = true
        WHERE wsp.role_id IS NOT NULL
        UNION
        SELECT wsp.worker_id, wsp.site_id, wco.certification_id
        FROM worker_site_pairs wsp
        JOIN worker_cert_overrides wco ON wco.worker_id = wsp.worker_id AND wco.required = true
      ),
      final_required AS (
        SELECT DISTINCT rc.worker_id, rc.certification_id
        FROM required_certs rc
        WHERE NOT EXISTS (
          SELECT 1 FROM worker_cert_overrides wco2
          WHERE wco2.worker_id = rc.worker_id
            AND wco2.certification_id = rc.certification_id
            AND wco2.required = false
        )
      )
      SELECT DISTINCT
        w.id         AS worker_id,
        w.name       AS worker_name,
        wc.expiry_date
      FROM final_required fr
      JOIN workers w ON w.id = fr.worker_id
      JOIN certifications c ON c.id = fr.certification_id AND c.name = ${certName}
      LEFT JOIN worker_certifications wc
        ON wc.worker_id = fr.worker_id AND wc.certification_id = fr.certification_id
      WHERE ${statusFilter}
      ORDER BY w.name
    `);

    res.json((rows.rows as Record<string, unknown>[]).map(r => ({
      workerId: Number(r.worker_id),
      workerName: String(r.worker_name),
      expiryDate: r.expiry_date ? String(r.expiry_date) : null,
    })));
  } catch (err) {
    logger.error({ err }, "cert-issue-workers error");
    handleRouteError(res, err);
  }
});

// ── Workers compliance summary (for workers list page) ───────────────────────
// GET /workforce/workers-compliance-summary
// Returns all active workers with their overall compliance status.
// Status is the WORST status across all active site assignments:
//   NOT_COMPLIANT > EXPIRING_SOON > READY > NO_REQUIREMENTS > UNASSIGNED (no assignments)
// Workers assigned only to sites with no cert requirements return NO_REQUIREMENTS.
// Workers with zero active/pending assignments return UNASSIGNED.
// Single CTE query — one DB round-trip regardless of worker count.
router.get("/workforce/workers-compliance-summary", requireAuth, async (_req, res): Promise<void> => {
  try {
    const rows = await db.execute(sql`
      WITH worker_site_pairs AS (
        SELECT sa.worker_id, sa.site_id, wr.role_id
        FROM site_assignments sa
        JOIN workers wr ON wr.id = sa.worker_id AND wr.active = true
        WHERE sa.status IN ('active', 'pending')
      ),
      required_certs AS (
        SELECT wsp.worker_id, wsp.site_id, scr.certification_id
        FROM worker_site_pairs wsp
        JOIN site_cert_requirements scr ON scr.site_id = wsp.site_id AND scr.required = true
        UNION
        SELECT wsp.worker_id, wsp.site_id, rcr.certification_id
        FROM worker_site_pairs wsp
        JOIN role_cert_requirements rcr ON rcr.role_id = wsp.role_id AND rcr.required = true
        WHERE wsp.role_id IS NOT NULL
        UNION
        SELECT wsp.worker_id, wsp.site_id, wco.certification_id
        FROM worker_site_pairs wsp
        JOIN worker_cert_overrides wco ON wco.worker_id = wsp.worker_id AND wco.required = true
      ),
      final_required AS (
        SELECT rc.worker_id, rc.site_id, rc.certification_id
        FROM required_certs rc
        WHERE NOT EXISTS (
          SELECT 1 FROM worker_cert_overrides wco2
          WHERE wco2.worker_id = rc.worker_id
            AND wco2.certification_id = rc.certification_id
            AND wco2.required = false
        )
      ),
      cert_eval AS (
        SELECT
          fr.worker_id,
          fr.site_id,
          fr.certification_id,
          CASE
            WHEN wc.id IS NULL                                                    THEN 'bad'
            WHEN NOT wc.verified                                                  THEN 'bad'
            WHEN wc.expiry_date IS NOT NULL AND wc.expiry_date < CURRENT_DATE    THEN 'bad'
            WHEN wc.expiry_date IS NOT NULL
              AND wc.expiry_date <= (CURRENT_DATE + INTERVAL '30 days')          THEN 'expiring'
            ELSE 'good'
          END AS cert_status
        FROM final_required fr
        LEFT JOIN worker_certifications wc
          ON wc.worker_id = fr.worker_id AND wc.certification_id = fr.certification_id
      ),
      site_compliance AS (
        SELECT
          wsp.worker_id,
          CASE
            WHEN COUNT(fr.certification_id) = 0                                         THEN 'NO_REQUIREMENTS'
            WHEN MAX(CASE WHEN ce.cert_status = 'bad'      THEN 1 ELSE 0 END) = 1      THEN 'NOT_COMPLIANT'
            WHEN MAX(CASE WHEN ce.cert_status = 'expiring' THEN 1 ELSE 0 END) = 1      THEN 'EXPIRING_SOON'
            ELSE 'READY'
          END AS compliance
        FROM worker_site_pairs wsp
        LEFT JOIN final_required fr ON fr.worker_id = wsp.worker_id AND fr.site_id = wsp.site_id
        LEFT JOIN cert_eval ce
          ON ce.worker_id = fr.worker_id AND ce.site_id = fr.site_id
          AND ce.certification_id = fr.certification_id
        GROUP BY wsp.worker_id, wsp.site_id
      ),
      worker_worst AS (
        SELECT
          sc.worker_id,
          CASE
            WHEN MAX(CASE WHEN sc.compliance = 'NOT_COMPLIANT'  THEN 1 ELSE 0 END) = 1 THEN 'NOT_COMPLIANT'
            WHEN MAX(CASE WHEN sc.compliance = 'EXPIRING_SOON'  THEN 1 ELSE 0 END) = 1 THEN 'EXPIRING_SOON'
            WHEN MAX(CASE WHEN sc.compliance = 'READY'          THEN 1 ELSE 0 END) = 1 THEN 'READY'
            WHEN MAX(CASE WHEN sc.compliance = 'NO_REQUIREMENTS' THEN 1 ELSE 0 END) = 1 THEN 'NO_REQUIREMENTS'
            ELSE 'UNASSIGNED'
          END AS status
        FROM site_compliance sc
        GROUP BY sc.worker_id
      )
      SELECT
        w.id                   AS worker_id,
        w.name,
        w.email,
        w.company,
        w.active,
        r.name                 AS role_name,
        COALESCE(ww.status, 'UNASSIGNED') AS status
      FROM workers w
      LEFT JOIN worker_worst ww ON ww.worker_id = w.id
      LEFT JOIN roles r ON r.id = w.role_id
      WHERE w.active = true
      ORDER BY w.name
    `);

    const results = (rows.rows as Record<string, unknown>[]).map(r => ({
      workerId: Number(r.worker_id),
      name: r.name,
      email: r.email,
      company: r.company,
      active: r.active,
      roleName: r.role_name ?? null,
      status: r.status,
    }));

    res.json(results);
  } catch (err) {
    logger.error({ err }, "workforce workers-compliance-summary error");
    handleRouteError(res, err);
  }
});

// ── Sites with compliance stats ───────────────────────────────────────────────
// GET /workforce/sites-with-stats
// Returns all sites with assigned worker count and compliance breakdown.
// Single CTE query — one DB round-trip regardless of worker/site count.
router.get("/workforce/sites-with-stats", requireAuth, async (_req, res): Promise<void> => {
  try {
    const rows = await db.execute(sql`
      WITH active_assignments AS (
        SELECT sa.site_id, sa.worker_id
        FROM site_assignments sa
        WHERE sa.status IN ('active', 'pending')
      ),
      site_required AS (
        SELECT aa.site_id, aa.worker_id, scr.certification_id
        FROM active_assignments aa
        JOIN site_cert_requirements scr ON scr.site_id = aa.site_id AND scr.required = true
      ),
      role_required AS (
        SELECT aa.site_id, aa.worker_id, rcr.certification_id
        FROM active_assignments aa
        JOIN workers w ON w.id = aa.worker_id AND w.role_id IS NOT NULL
        JOIN role_cert_requirements rcr ON rcr.role_id = w.role_id AND rcr.required = true
      ),
      override_add AS (
        SELECT aa.site_id, aa.worker_id, wco.certification_id
        FROM active_assignments aa
        JOIN worker_cert_overrides wco ON wco.worker_id = aa.worker_id AND wco.required = true
      ),
      all_required_pre AS (
        SELECT site_id, worker_id, certification_id FROM site_required
        UNION
        SELECT site_id, worker_id, certification_id FROM role_required
        UNION
        SELECT site_id, worker_id, certification_id FROM override_add
      ),
      override_remove AS (
        SELECT aa.site_id, aa.worker_id, wco.certification_id
        FROM active_assignments aa
        JOIN worker_cert_overrides wco ON wco.worker_id = aa.worker_id AND wco.required = false
      ),
      all_required AS (
        SELECT arp.site_id, arp.worker_id, arp.certification_id
        FROM all_required_pre arp
        WHERE NOT EXISTS (
          SELECT 1 FROM override_remove orr
          WHERE orr.site_id = arp.site_id
            AND orr.worker_id = arp.worker_id
            AND orr.certification_id = arp.certification_id
        )
      ),
      cert_eval AS (
        SELECT
          ar.site_id,
          ar.worker_id,
          ar.certification_id,
          CASE
            WHEN wc.id IS NULL                                                      THEN 'bad'
            WHEN NOT wc.verified                                                    THEN 'bad'
            WHEN wc.expiry_date IS NOT NULL AND wc.expiry_date < CURRENT_DATE      THEN 'bad'
            WHEN wc.expiry_date IS NOT NULL
              AND wc.expiry_date <= (CURRENT_DATE + INTERVAL '30 days')            THEN 'expiring'
            ELSE 'good'
          END AS cert_status
        FROM all_required ar
        LEFT JOIN worker_certifications wc
          ON wc.worker_id = ar.worker_id AND wc.certification_id = ar.certification_id
      ),
      worker_compliance AS (
        SELECT
          aa.site_id,
          aa.worker_id,
          CASE
            WHEN COUNT(ar.certification_id) = 0                                               THEN 'no_req'
            WHEN MAX(CASE WHEN ce.cert_status = 'bad'      THEN 1 ELSE 0 END) = 1            THEN 'non_compliant'
            WHEN MAX(CASE WHEN ce.cert_status = 'expiring' THEN 1 ELSE 0 END) = 1            THEN 'expiring'
            ELSE 'ready'
          END AS compliance_status
        FROM active_assignments aa
        LEFT JOIN all_required ar
          ON ar.site_id = aa.site_id AND ar.worker_id = aa.worker_id
        LEFT JOIN cert_eval ce
          ON ce.site_id = aa.site_id AND ce.worker_id = aa.worker_id
          AND ce.certification_id = ar.certification_id
        GROUP BY aa.site_id, aa.worker_id
      )
      SELECT
        ms.id,
        ms.name,
        ms.location,
        ms.description,
        ms.active,
        ms.expected_completion_date AS "expectedCompletionDate",
        ms.mobilisation_date        AS "mobilisationDate",
        ms.client_id                AS "clientId",
        c.name                      AS "clientName",
        ms.created_at  AS "createdAt",
        ms.updated_at  AS "updatedAt",
        COUNT(wc.worker_id)                                          AS "workerCount",
        COUNT(CASE WHEN wc.compliance_status = 'ready'        THEN 1 END) AS "readyCount",
        COUNT(CASE WHEN wc.compliance_status = 'expiring'     THEN 1 END) AS "expiringCount",
        COUNT(CASE WHEN wc.compliance_status = 'non_compliant' THEN 1 END) AS "nonCompliantCount",
        COUNT(CASE WHEN wc.compliance_status = 'no_req'       THEN 1 END) AS "noReqCount"
      FROM mob_sites ms
      LEFT JOIN clients c ON c.id = ms.client_id
      LEFT JOIN worker_compliance wc ON wc.site_id = ms.id
      GROUP BY ms.id, ms.name, ms.location, ms.description, ms.active, ms.expected_completion_date, ms.mobilisation_date, ms.client_id, c.name, ms.created_at, ms.updated_at
      ORDER BY ms.name
    `);

    // drizzle execute returns { rows: [...] } — cast counts to numbers
    const results = rows.rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      location: r.location,
      description: r.description,
      active: r.active,
      expectedCompletionDate: r.expectedCompletionDate ?? null,
      mobilisationDate: r.mobilisationDate ?? null,
      clientId: r.clientId ?? null,
      clientName: r.clientName ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      workerCount: Number(r.workerCount),
      readyCount: Number(r.readyCount),
      expiringCount: Number(r.expiringCount),
      nonCompliantCount: Number(r.nonCompliantCount),
      noReqCount: Number(r.noReqCount),
    }));

    res.json(results);
  } catch (err) {
    logger.error({ err }, "workforce sites-with-stats error");
    handleRouteError(res, err);
  }
});

// ── Admin: worker activity log ────────────────────────────────────────────────

const ALLOWED_ACTIVITY_ACTIONS = ["login", "logout", "cert_added", "cert_edited", "cert_deleted", "credentials_set"] as const;

// GET /api/workforce/worker-activity?page=1&pageSize=25&search=&workerId=&action=
router.get("/workforce/worker-activity", requireAdmin, async (req, res): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "25"), 10)));
    const search = String(req.query.search ?? "").trim();
    const workerIdRaw = parseInt(String(req.query.workerId ?? ""), 10);
    const workerIdFilter = isNaN(workerIdRaw) ? null : workerIdRaw;
    const actionRaw = String(req.query.action ?? "").trim();
    const actionFilter = (ALLOWED_ACTIVITY_ACTIONS as readonly string[]).includes(actionRaw) ? actionRaw : null;
    const offset = (page - 1) * pageSize;

    // Build conditions array for Drizzle query builder
    const conditions = [];
    if (search) conditions.push(ilike(workersTable.name, `%${search}%`));
    if (workerIdFilter !== null) conditions.push(eq(workerActivityLogsTable.workerId, workerIdFilter));
    if (actionFilter !== null) conditions.push(eq(workerActivityLogsTable.action, actionFilter));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(workerActivityLogsTable)
      .innerJoin(workersTable, eq(workersTable.id, workerActivityLogsTable.workerId))
      .where(whereClause);
    const total = countResult?.total ?? 0;

    const rows = await db
      .select({
        id: workerActivityLogsTable.id,
        workerId: workerActivityLogsTable.workerId,
        workerName: workersTable.name,
        action: workerActivityLogsTable.action,
        detail: workerActivityLogsTable.detail,
        ipAddress: workerActivityLogsTable.ipAddress,
        createdAt: workerActivityLogsTable.createdAt,
      })
      .from(workerActivityLogsTable)
      .innerJoin(workersTable, eq(workersTable.id, workerActivityLogsTable.workerId))
      .where(whereClause)
      .orderBy(desc(workerActivityLogsTable.createdAt))
      .limit(pageSize)
      .offset(offset);

    res.json({ data: rows, total, page, pageSize });
  } catch (err) {
    logger.error({ err }, "workforce worker-activity error");
    handleRouteError(res, err);
  }
});

// ── Admin: set portal credentials ────────────────────────────────────────────

// POST /api/workforce/workers/:id/set-portal-credentials
router.post("/workforce/workers/:id/set-portal-credentials", requireAdmin, async (req, res): Promise<void> => {
  const workerId = parseInt(req.params.id ?? "");
  if (isNaN(workerId)) { res.status(400).json({ error: "Invalid worker id" }); return; }

  const { portalUsername, password } = req.body as { portalUsername?: string; password?: string };
  if (!password || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const [worker] = await db.select({ id: workersTable.id }).from(workersTable).where(eq(workersTable.id, workerId));
  if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }

  const hash = await bcrypt.hash(password, 12);
  const username = portalUsername?.trim() || null;

  await db.update(workersTable).set({
    portalPasswordHash: hash,
    ...(username !== null ? { portalUsername: username } : {}),
    updatedAt: new Date(),
  }).where(eq(workersTable.id, workerId));

  // Log the credential change in worker activity
  await db.insert(workerActivityLogsTable).values({
    workerId,
    action: "credentials_set",
    detail: `Admin set portal credentials${username ? ` (username: ${username})` : ""}`,
    ipAddress: null,
  }).catch(() => {});

  res.json({ ok: true });
});

// ── Unified activity feed (portal events + email events) ──────────────────────

const ALLOWED_FEED_SOURCES = ["portal", "email"] as const;
const ALLOWED_FEED_EVENT_TYPES = [
  "login", "logout", "cert_added", "cert_edited", "cert_deleted", "credentials_set",
  "email_sent", "email_opened", "ppe_issued", "ppe_returned",
] as const;

// GET /api/workforce/activity-feed
// Unified feed: worker_activity_logs (portal) + email_logs (email_sent / email_opened)
// Filters: ?page= ?pageSize= ?search= ?workerId= ?source=portal|email ?eventType=<type>
router.get("/workforce/activity-feed", requireAdmin, async (req, res): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "25"), 10)));
    const search = String(req.query.search ?? "").trim();
    const workerIdRaw = parseInt(String(req.query.workerId ?? ""), 10);
    const workerIdFilter = isNaN(workerIdRaw) ? null : workerIdRaw;
    const sourceRaw = String(req.query.source ?? "").trim();
    const sourceFilter = (ALLOWED_FEED_SOURCES as readonly string[]).includes(sourceRaw) ? sourceRaw : null;
    const eventTypeRaw = String(req.query.eventType ?? "").trim();
    const eventTypeFilter = (ALLOWED_FEED_EVENT_TYPES as readonly string[]).includes(eventTypeRaw) ? eventTypeRaw : null;
    const offset = (page - 1) * pageSize;

    // Build outer WHERE fragments (applied after the UNION ALL)
    const searchFrag  = search          ? sql`AND worker_name ILIKE ${'%' + search + '%'}`   : sql``;
    const workerFrag  = workerIdFilter  !== null ? sql`AND worker_id = ${workerIdFilter}`    : sql``;
    const sourceFrag  = sourceFilter    !== null ? sql`AND source = ${sourceFilter}`          : sql``;
    const eventFrag   = eventTypeFilter !== null ? sql`AND event_type = ${eventTypeFilter}`   : sql``;

    const result = await db.execute(sql`
      SELECT
        id,
        source,
        worker_id    AS "workerId",
        worker_name  AS "workerName",
        event_type   AS "eventType",
        detail,
        ip_address   AS "ipAddress",
        created_at   AS "createdAt",
        COUNT(*) OVER () AS total_count
      FROM (
        -- Portal activity events
        SELECT
          wal.id,
          'portal'::text                AS source,
          wal.worker_id,
          w.name                        AS worker_name,
          wal.action                    AS event_type,
          wal.detail,
          wal.ip_address,
          wal.created_at
        FROM worker_activity_logs wal
        INNER JOIN workers w ON w.id = wal.worker_id

        UNION ALL

        -- Email sent events
        SELECT
          el.id,
          'email'::text                 AS source,
          el.worker_id,
          w.name                        AS worker_name,
          'email_sent'::text            AS event_type,
          el.subject                    AS detail,
          NULL::text                    AS ip_address,
          el.sent_at                    AS created_at
        FROM email_logs el
        INNER JOIN workers w ON w.id = el.worker_id
        WHERE el.worker_id IS NOT NULL
          AND el.status = 'sent'

        UNION ALL

        -- Email opened events (one row per opened email)
        SELECT
          el.id,
          'email'::text                 AS source,
          el.worker_id,
          w.name                        AS worker_name,
          'email_opened'::text          AS event_type,
          el.subject                    AS detail,
          el.seen_ip                    AS ip_address,
          el.seen_at                    AS created_at
        FROM email_logs el
        INNER JOIN workers w ON w.id = el.worker_id
        WHERE el.worker_id IS NOT NULL
          AND el.seen_at IS NOT NULL
      ) AS feed
      WHERE 1=1
        ${searchFrag}
        ${workerFrag}
        ${sourceFrag}
        ${eventFrag}
      ORDER BY created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `);

    const rows = result.rows as Array<Record<string, unknown>>;
    const data = rows.map(({ total_count: _tc, ...rest }) => rest);

    // When the page is out of range, rows is empty — fall back to a separate count query
    // so pagination metadata stays accurate (e.g. client can reset to page 1).
    let total: number;
    if (rows.length > 0) {
      total = Number(rows[0].total_count);
    } else {
      const countResult = await db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM (
          SELECT wal.id, 'portal'::text AS source, wal.worker_id,
                 w.name AS worker_name, wal.action AS event_type
          FROM worker_activity_logs wal
          INNER JOIN workers w ON w.id = wal.worker_id

          UNION ALL

          SELECT el.id, 'email'::text AS source, el.worker_id,
                 w.name AS worker_name, 'email_sent'::text AS event_type
          FROM email_logs el
          INNER JOIN workers w ON w.id = el.worker_id
          WHERE el.worker_id IS NOT NULL AND el.status = 'sent'

          UNION ALL

          SELECT el.id, 'email'::text AS source, el.worker_id,
                 w.name AS worker_name, 'email_opened'::text AS event_type
          FROM email_logs el
          INNER JOIN workers w ON w.id = el.worker_id
          WHERE el.worker_id IS NOT NULL AND el.seen_at IS NOT NULL
        ) AS feed
        WHERE 1=1
          ${searchFrag}
          ${workerFrag}
          ${sourceFrag}
          ${eventFrag}
      `);
      total = Number((countResult.rows[0] as { total: number }).total ?? 0);
    }

    res.json({ data, total, page, pageSize });
  } catch (err) {
    logger.error({ err }, "workforce activity-feed error");
    handleRouteError(res, err);
  }
});

// ── PPE Types ─────────────────────────────────────────────────────────────────

router.get("/workforce/ppe-types", requireAuth, async (_req, res): Promise<void> => {
  try {
    const types = await db.select().from(ppeTypesTable).orderBy(ppeTypesTable.name);
    res.json(types);
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.post("/workforce/ppe-types", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { name, description } = req.body;
    if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
    const [type] = await db.insert(ppeTypesTable)
      .values({ name: name.trim(), description: description || null })
      .returning();
    res.status(201).json(type);
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.patch("/workforce/ppe-types/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { name, description } = req.body;
    const [updated] = await db.update(ppeTypesTable)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description: description || null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(ppeTypesTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "PPE type not found" }); return; }
    res.json(updated);
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.delete("/workforce/ppe-types/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(ppeTypesTable).where(eq(ppeTypesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    // FK violation — existing allocations reference this type
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23503") {
      res.status(409).json({ error: "Cannot delete: this PPE type has existing allocation records. Remove all allocations first." });
      return;
    }
    handleRouteError(res, err);
  }
});

// ── PPE Allocations ───────────────────────────────────────────────────────────

// GET /workforce/workers/:id/ppe — all allocations for a worker, newest first
router.get("/workforce/workers/:id/ppe", requireAuth, async (req, res): Promise<void> => {
  try {
    const workerId = parseInt(req.params.id ?? "");
    if (isNaN(workerId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const rows = await db.execute(sql`
      SELECT pa.id, pa.worker_id, pa.ppe_type_id, pa.site_id, pa.issued_at,
             pa.issued_by_user_id, pa.size_spec, pa.returned_at, pa.notes,
             pt.name AS ppe_type_name, pt.description AS ppe_type_description,
             ms.name AS site_name,
             u.display_name AS issued_by_name
      FROM ppe_allocations pa
      JOIN ppe_types pt ON pt.id = pa.ppe_type_id
      LEFT JOIN mob_sites ms ON ms.id = pa.site_id
      LEFT JOIN users u ON u.id = pa.issued_by_user_id
      WHERE pa.worker_id = ${workerId}
      ORDER BY pa.issued_at DESC, pa.id DESC
    `);
    res.json((rows.rows as Record<string, unknown>[]).map(r => ({
      id: r.id,
      workerId: r.worker_id,
      ppeTypeId: r.ppe_type_id,
      ppeType: { id: r.ppe_type_id, name: r.ppe_type_name, description: r.ppe_type_description },
      siteId: r.site_id ?? null,
      site: r.site_id ? { id: r.site_id, name: r.site_name } : null,
      issuedAt: r.issued_at,
      issuedByUserId: r.issued_by_user_id ?? null,
      issuedByUser: r.issued_by_name ? { displayName: r.issued_by_name } : null,
      sizeSpec: r.size_spec ?? null,
      returnedAt: r.returned_at ?? null,
      notes: r.notes ?? null,
    })));
  } catch (err) {
    handleRouteError(res, err);
  }
});

// POST /workforce/workers/:id/ppe — issue PPE to a worker
router.post("/workforce/workers/:id/ppe", requireAdmin, async (req, res): Promise<void> => {
  try {
    const workerId = parseInt(req.params.id ?? "");
    if (isNaN(workerId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { ppeTypeId, siteId, issuedAt, sizeSpec, notes } = req.body;
    if (!ppeTypeId || !issuedAt) { res.status(400).json({ error: "ppeTypeId and issuedAt are required" }); return; }
    const parsedTypeId = parseInt(String(ppeTypeId));
    if (isNaN(parsedTypeId) || parsedTypeId < 1) { res.status(400).json({ error: "Invalid ppeTypeId" }); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(issuedAt))) { res.status(400).json({ error: "issuedAt must be a date in YYYY-MM-DD format" }); return; }

    const [allocation] = await db.insert(ppeAllocationsTable).values({
      workerId,
      ppeTypeId: parsedTypeId,
      siteId: siteId ? parseInt(String(siteId)) : null,
      issuedAt,
      issuedByUserId: req.session?.userId ?? null,
      sizeSpec: sizeSpec || null,
      notes: notes || null,
    }).returning();

    // Log to activity feed
    const [ppeType] = await db.select().from(ppeTypesTable).where(eq(ppeTypesTable.id, parsedTypeId));
    const siteRow = siteId ? await db.select({ name: mobSitesTable.name }).from(mobSitesTable).where(eq(mobSitesTable.id, parseInt(String(siteId)))) : [];
    await db.insert(workerActivityLogsTable).values({
      workerId,
      action: "ppe_issued",
      detail: `PPE issued: ${ppeType?.name ?? "item"}${sizeSpec ? ` (${sizeSpec})` : ""}${siteRow[0] ? ` at ${siteRow[0].name}` : ""}`,
      ipAddress: null,
    }).catch(() => {});

    res.status(201).json(allocation);
  } catch (err) {
    handleRouteError(res, err);
  }
});

// PATCH /workforce/ppe-allocations/:id — update allocation (mark returned, edit notes/size)
router.patch("/workforce/ppe-allocations/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { returnedAt, sizeSpec, notes } = req.body;
    if (returnedAt && !/^\d{4}-\d{2}-\d{2}$/.test(String(returnedAt))) {
      res.status(400).json({ error: "returnedAt must be a date in YYYY-MM-DD format" }); return;
    }

    const [existing] = await db.select().from(ppeAllocationsTable).where(eq(ppeAllocationsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Allocation not found" }); return; }

    const [updated] = await db.update(ppeAllocationsTable)
      .set({
        ...(returnedAt !== undefined ? { returnedAt: returnedAt || null } : {}),
        ...(sizeSpec !== undefined ? { sizeSpec: sizeSpec || null } : {}),
        ...(notes !== undefined ? { notes: notes || null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(ppeAllocationsTable.id, id))
      .returning();

    // Log return event only when returnedAt is newly set
    if (returnedAt && !existing.returnedAt) {
      const [ppeType] = await db.select().from(ppeTypesTable).where(eq(ppeTypesTable.id, existing.ppeTypeId));
      await db.insert(workerActivityLogsTable).values({
        workerId: existing.workerId,
        action: "ppe_returned",
        detail: `PPE returned: ${ppeType?.name ?? "item"}`,
        ipAddress: null,
      }).catch(() => {});
    }

    res.json(updated);
  } catch (err) {
    handleRouteError(res, err);
  }
});

// GET /workforce/sites/:id/ppe-summary — totals per PPE type for a site
router.get("/workforce/sites/:id/ppe-summary", requireAuth, async (req, res): Promise<void> => {
  try {
    const siteId = parseInt(req.params.id ?? "");
    if (isNaN(siteId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const rows = await db.execute(sql`
      SELECT pt.id AS ppe_type_id, pt.name AS ppe_type_name,
             COUNT(*)::int             AS issued_count,
             COUNT(pa.returned_at)::int AS returned_count,
             (COUNT(*) - COUNT(pa.returned_at))::int AS active_count
      FROM ppe_allocations pa
      JOIN ppe_types pt ON pt.id = pa.ppe_type_id
      WHERE pa.site_id = ${siteId}
      GROUP BY pt.id, pt.name
      ORDER BY pt.name
    `);
    res.json((rows.rows as Record<string, unknown>[]).map(r => ({
      ppeTypeId: Number(r.ppe_type_id),
      ppeTypeName: r.ppe_type_name,
      issuedCount: Number(r.issued_count),
      returnedCount: Number(r.returned_count),
      activeCount: Number(r.active_count),
    })));
  } catch (err) {
    handleRouteError(res, err);
  }
});

// ── Schedule Change Requests (admin) ─────────────────────────────────────────

// GET /workforce/change-requests?status=pending|approved|rejected|withdrawn|all
router.get("/workforce/change-requests", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { status } = req.query as Record<string, string>;

    const rows = await db
      .select({
        cr: workerScheduleChangeRequestsTable,
        worker: { id: workersTable.id, name: workersTable.name },
        period: workerRotationPeriodsTable,
        site: mobSitesTable,
      })
      .from(workerScheduleChangeRequestsTable)
      .innerJoin(workersTable, eq(workerScheduleChangeRequestsTable.workerId, workersTable.id))
      .innerJoin(
        workerRotationPeriodsTable,
        eq(workerScheduleChangeRequestsTable.rotationPeriodId, workerRotationPeriodsTable.id),
      )
      .innerJoin(
        siteAssignmentsTable,
        eq(workerRotationPeriodsTable.assignmentId, siteAssignmentsTable.id),
      )
      .innerJoin(mobSitesTable, eq(siteAssignmentsTable.siteId, mobSitesTable.id))
      .where(
        status && status !== "all"
          ? eq(workerScheduleChangeRequestsTable.status, status)
          : undefined,
      )
      .orderBy(desc(workerScheduleChangeRequestsTable.createdAt));

    res.json({
      requests: rows.map((r) => ({
        id: r.cr.id,
        workerId: r.worker.id,
        workerName: r.worker.name,
        rotationPeriodId: r.cr.rotationPeriodId,
        requestedStart: r.cr.requestedStart,
        requestedEnd: r.cr.requestedEnd,
        reason: r.cr.reason,
        status: r.cr.status,
        adminNotes: r.cr.adminNotes,
        createdAt: r.cr.createdAt,
        siteId: r.site.id,
        siteName: r.site.name,
        originalStart: r.period.plannedStart,
        originalEnd: r.period.plannedEnd,
      })),
    });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// PATCH /workforce/change-requests/:id
router.patch(
  "/workforce/change-requests/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    try {
      const id = parseInt(req.params.id ?? "");
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }

      const { status, adminNotes } = req.body as {
        status?: string;
        adminNotes?: string | null;
      };

      const VALID_STATUSES = ["approved", "rejected"];
      if (!status || !VALID_STATUSES.includes(status)) {
        res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
        return;
      }

      const [row] = await db
        .select()
        .from(workerScheduleChangeRequestsTable)
        .where(eq(workerScheduleChangeRequestsTable.id, id));

      if (!row) {
        res.status(404).json({ error: "Change request not found" });
        return;
      }

      if (row.status !== "pending") {
        res.status(409).json({ error: "Only pending requests can be approved or rejected" });
        return;
      }

      const [updated] = await db
        .update(workerScheduleChangeRequestsTable)
        .set({
          status,
          adminNotes: adminNotes !== undefined ? adminNotes : row.adminNotes,
          updatedAt: new Date(),
        })
        .where(eq(workerScheduleChangeRequestsTable.id, id))
        .returning();

      res.json(updated);
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

// ── Worker Role History ────────────────────────────────────────────────────────

// GET /api/workforce/workers/:id/role-history
router.get(
  "/workforce/workers/:id/role-history",
  requireAdmin,
  async (req, res): Promise<void> => {
    try {
      const workerId = parseInt(req.params.id ?? "");
      if (isNaN(workerId)) {
        res.status(400).json({ error: "Invalid worker id" });
        return;
      }
      const rows = await db
        .select()
        .from(workerRoleHistoryTable)
        .where(eq(workerRoleHistoryTable.workerId, workerId))
        .orderBy(desc(workerRoleHistoryTable.startDate));
      res.json(rows);
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

// POST /api/workforce/workers/:id/role-history
router.post(
  "/workforce/workers/:id/role-history",
  requireAdmin,
  async (req, res): Promise<void> => {
    try {
      const workerId = parseInt(req.params.id ?? "");
      if (isNaN(workerId)) {
        res.status(400).json({ error: "Invalid worker id" });
        return;
      }
      const { roleId, startDate, endDate, notes, closeOpenEntry } = req.body as {
        roleId?: number | null;
        startDate?: string;
        endDate?: string | null;
        notes?: string | null;
        closeOpenEntry?: boolean;
      };
      if (!startDate) {
        res.status(400).json({ error: "startDate is required" });
        return;
      }

      let roleNameSnapshot = "Unknown";
      if (roleId) {
        const [role] = await db
          .select({ name: workforceRolesTable.name })
          .from(workforceRolesTable)
          .where(eq(workforceRolesTable.id, roleId));
        if (!role) {
          res.status(400).json({ error: "Role not found" });
          return;
        }
        roleNameSnapshot = role.name;
      }

      // Optionally close the current open entry
      if (closeOpenEntry) {
        const openEntries = await db
          .select()
          .from(workerRoleHistoryTable)
          .where(
            and(
              eq(workerRoleHistoryTable.workerId, workerId),
              sql`${workerRoleHistoryTable.endDate} IS NULL`,
            ),
          );
        for (const entry of openEntries) {
          await db
            .update(workerRoleHistoryTable)
            .set({ endDate: startDate, updatedAt: new Date() })
            .where(eq(workerRoleHistoryTable.id, entry.id));
        }
      }

      const [row] = await db
        .insert(workerRoleHistoryTable)
        .values({
          workerId,
          roleId: roleId ?? null,
          roleNameSnapshot,
          startDate,
          endDate: endDate ?? null,
          notes: notes ?? null,
        })
        .returning();

      // Sync workers.role_id if this is a current (open-ended) entry — even if roleId is null
      if (!endDate) {
        await db
          .update(workersTable)
          .set({ roleId: roleId ?? null, updatedAt: new Date() })
          .where(eq(workersTable.id, workerId));
      }

      res.status(201).json(row);
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

// PATCH /api/workforce/workers/:id/role-history/:entryId
router.patch(
  "/workforce/workers/:id/role-history/:entryId",
  requireAdmin,
  async (req, res): Promise<void> => {
    try {
      const workerId = parseInt(req.params.id ?? "");
      const entryId = parseInt(req.params.entryId ?? "");
      if (isNaN(workerId) || isNaN(entryId)) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }

      const { startDate, endDate, notes } = req.body as {
        startDate?: string;
        endDate?: string | null;
        notes?: string | null;
      };

      const [existing] = await db
        .select()
        .from(workerRoleHistoryTable)
        .where(
          and(
            eq(workerRoleHistoryTable.id, entryId),
            eq(workerRoleHistoryTable.workerId, workerId),
          ),
        );
      if (!existing) {
        res.status(404).json({ error: "Entry not found" });
        return;
      }

      const [updated] = await db
        .update(workerRoleHistoryTable)
        .set({
          startDate: startDate ?? existing.startDate,
          endDate: endDate !== undefined ? (endDate ?? null) : existing.endDate,
          notes: notes !== undefined ? (notes ?? null) : existing.notes,
          updatedAt: new Date(),
        })
        .where(eq(workerRoleHistoryTable.id, entryId))
        .returning();

      // Recalculate and sync workers.role_id after any date change
      const [latestOpen] = await db
        .select()
        .from(workerRoleHistoryTable)
        .where(
          and(
            eq(workerRoleHistoryTable.workerId, workerId),
            sql`${workerRoleHistoryTable.endDate} IS NULL`,
          ),
        )
        .orderBy(desc(workerRoleHistoryTable.startDate))
        .limit(1);

      await db
        .update(workersTable)
        .set({ roleId: latestOpen?.roleId ?? null, updatedAt: new Date() })
        .where(eq(workersTable.id, workerId));

      res.json(updated);
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

// DELETE /api/workforce/workers/:id/role-history/:entryId
router.delete(
  "/workforce/workers/:id/role-history/:entryId",
  requireAdmin,
  async (req, res): Promise<void> => {
    try {
      const workerId = parseInt(req.params.id ?? "");
      const entryId = parseInt(req.params.entryId ?? "");
      if (isNaN(workerId) || isNaN(entryId)) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }

      const [existing] = await db
        .select()
        .from(workerRoleHistoryTable)
        .where(
          and(
            eq(workerRoleHistoryTable.id, entryId),
            eq(workerRoleHistoryTable.workerId, workerId),
          ),
        );
      if (!existing) {
        res.status(404).json({ error: "Entry not found" });
        return;
      }

      await db
        .delete(workerRoleHistoryTable)
        .where(eq(workerRoleHistoryTable.id, entryId));

      // Recalculate and sync workers.role_id
      const [latestOpen] = await db
        .select()
        .from(workerRoleHistoryTable)
        .where(
          and(
            eq(workerRoleHistoryTable.workerId, workerId),
            sql`${workerRoleHistoryTable.endDate} IS NULL`,
          ),
        )
        .orderBy(desc(workerRoleHistoryTable.startDate))
        .limit(1);

      await db
        .update(workersTable)
        .set({ roleId: latestOpen?.roleId ?? null, updatedAt: new Date() })
        .where(eq(workersTable.id, workerId));

      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

export default router;

