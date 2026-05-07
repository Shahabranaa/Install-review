import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and, or, ilike, inArray, sql, desc } from "drizzle-orm";
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
} from "@workspace/db";
import { getWasabiClientAndCreds } from "../lib/wasabi.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/workforce/workers", requireAuth, async (req, res): Promise<void> => {
  try {
    const { name, email, company, windaId, roleId, notes } = req.body;
    if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
    const [worker] = await db.insert(workersTable).values({ name: name.trim(), email, company, windaId, roleId, notes }).returning();
    res.status(201).json(worker);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Roles ────────────────────────────────────────────────────────────────────

router.get("/workforce/roles", requireAuth, async (_req, res): Promise<void> => {
  try {
    const roles = await db.select().from(workforceRolesTable).orderBy(workforceRolesTable.name);
    res.json(roles);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/workforce/roles", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { name, description } = req.body;
    if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
    const [role] = await db.insert(workforceRolesTable).values({ name: name.trim(), description }).returning();
    res.status(201).json(role);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.delete("/workforce/roles/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(workforceRolesTable).where(eq(workforceRolesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Sites ────────────────────────────────────────────────────────────────────

router.get("/workforce/sites", requireAuth, async (_req, res): Promise<void> => {
  try {
    const sites = await db.select().from(mobSitesTable).orderBy(mobSitesTable.name);
    res.json(sites);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/workforce/sites/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [site] = await db.select().from(mobSitesTable).where(eq(mobSitesTable.id, id));
    if (!site) { res.status(404).json({ error: "Site not found" }); return; }
    res.json(site);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/workforce/sites", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { name, location, description } = req.body;
    if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
    const [site] = await db.insert(mobSitesTable).values({ name: name.trim(), location, description }).returning();
    res.status(201).json(site);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.patch("/workforce/sites/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { name, location, description, active } = req.body;
    const [updated] = await db.update(mobSitesTable)
      .set({ name, location, description, active, updatedAt: new Date() })
      .where(eq(mobSitesTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Site not found" }); return; }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/workforce/certifications", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { name, description, validityMonths, category } = req.body;
    if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
    const [cert] = await db.insert(certificationsTable)
      .values({ name: name.trim(), description, validityMonths, category }).returning();
    res.status(201).json(cert);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.patch("/workforce/certifications/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { name, description, validityMonths, category } = req.body;
    const [updated] = await db.update(certificationsTable)
      .set({ name, description, validityMonths, category, updatedAt: new Date() })
      .where(eq(certificationsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Certification not found" }); return; }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.delete("/workforce/certifications/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(certificationsTable).where(eq(certificationsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.delete("/workforce/assignments/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(siteAssignmentsTable).where(eq(siteAssignmentsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
        ms.created_at  AS "createdAt",
        ms.updated_at  AS "updatedAt",
        COUNT(wc.worker_id)                                          AS "workerCount",
        COUNT(CASE WHEN wc.compliance_status = 'ready'        THEN 1 END) AS "readyCount",
        COUNT(CASE WHEN wc.compliance_status = 'expiring'     THEN 1 END) AS "expiringCount",
        COUNT(CASE WHEN wc.compliance_status = 'non_compliant' THEN 1 END) AS "nonCompliantCount",
        COUNT(CASE WHEN wc.compliance_status = 'no_req'       THEN 1 END) AS "noReqCount"
      FROM mob_sites ms
      LEFT JOIN worker_compliance wc ON wc.site_id = ms.id
      GROUP BY ms.id, ms.name, ms.location, ms.description, ms.active, ms.created_at, ms.updated_at
      ORDER BY ms.name
    `);

    // drizzle execute returns { rows: [...] } — cast counts to numbers
    const results = rows.rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      location: r.location,
      description: r.description,
      active: r.active,
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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

export default router;

