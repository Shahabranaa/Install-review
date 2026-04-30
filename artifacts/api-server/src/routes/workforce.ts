import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and, or, ilike, inArray, sql } from "drizzle-orm";
import {
  db,
  workersTable,
  workforceRolesTable,
  mobSitesTable,
  certificationsTable,
  workerCertificationsTable,
  siteCertRequirementsTable,
  roleCertRequirementsTable,
  workerCertOverridesTable,
  siteAssignmentsTable,
} from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.accessLevel !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

// ── Compliance logic helper ──────────────────────────────────────────────────

type CertStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "NOT_VERIFIED" | "MISSING";
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
        status === "inactive" ? eq(workersTable.active, false) : eq(workersTable.active, true),
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

// ── Requirements ─────────────────────────────────────────────────────────────

router.get("/workforce/sites/:id/requirements", requireAuth, async (req, res): Promise<void> => {
  try {
    const siteId = parseInt(req.params.id ?? "");
    if (isNaN(siteId)) { res.status(400).json({ error: "Invalid id" }); return; }
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

router.get("/workforce/roles/:id/requirements", requireAuth, async (req, res): Promise<void> => {
  try {
    const roleId = parseInt(req.params.id ?? "");
    if (isNaN(roleId)) { res.status(400).json({ error: "Invalid id" }); return; }
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
    const conditions = [];
    if (siteId) conditions.push(eq(siteAssignmentsTable.siteId, parseInt(siteId)));
    if (workerId) conditions.push(eq(siteAssignmentsTable.workerId, parseInt(workerId)));

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

router.get("/workforce/dashboard", requireAuth, async (_req, res): Promise<void> => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);

    const [totalRow] = await db.select({ cnt: sql<number>`count(*)::int` })
      .from(workersTable).where(eq(workersTable.active, true));
    const totalWorkers = totalRow?.cnt ?? 0;

    // Get all active assignments
    const assignments = await db.select()
      .from(siteAssignmentsTable)
      .where(eq(siteAssignmentsTable.status, "active"));

    // Compute compliance for all unique worker+site pairs
    const pairs = assignments.map(a => ({ workerId: a.workerId, siteId: a.siteId }));
    const complianceResults = await Promise.allSettled(
      pairs.map(p => computeCompliance(p.workerId, p.siteId)),
    );

    const resolved = complianceResults
      .filter((r): r is PromiseFulfilledResult<WorkerComplianceResult> => r.status === "fulfilled")
      .map(r => r.value);

    // Deduplicate by worker (use worst status per worker)
    const byWorker = new Map<number, WorkerStatus>();
    const statusPriority: Record<WorkerStatus, number> = {
      NOT_COMPLIANT: 3, EXPIRING_SOON: 2, READY: 1, NO_REQUIREMENTS: 0,
    };
    for (const r of resolved) {
      const current = byWorker.get(r.workerId);
      if (!current || statusPriority[r.status] > statusPriority[current]) {
        byWorker.set(r.workerId, r.status);
      }
    }

    const readyCount = [...byWorker.values()].filter(s => s === "READY").length;
    const expiringCount = [...byWorker.values()].filter(s => s === "EXPIRING_SOON").length;
    const nonCompliantCount = [...byWorker.values()].filter(s => s === "NOT_COMPLIANT").length;

    // Expiring within 30 days
    const expiringItems: { workerId: number; workerName: string; certName: string; expiryDate: string; daysUntilExpiry: number }[] = [];
    // Per-cert breakdown: [{name, missing, expired, expiring}]
    const certBreakdown = new Map<string, { name: string; missing: number; expired: number; expiring: number }>();
    for (const r of resolved) {
      for (const item of r.items) {
        if (!certBreakdown.has(item.name)) {
          certBreakdown.set(item.name, { name: item.name, missing: 0, expired: 0, expiring: 0 });
        }
        const entry = certBreakdown.get(item.name)!;
        if (item.status === "MISSING" || item.status === "NOT_VERIFIED") entry.missing++;
        else if (item.status === "EXPIRED") entry.expired++;
        else if (item.status === "EXPIRING_SOON") entry.expiring++;
        if (item.status === "EXPIRING_SOON" && item.expiryDate && item.daysUntilExpiry !== null) {
          expiringItems.push({
            workerId: r.workerId,
            workerName: r.workerName,
            certName: item.name,
            expiryDate: item.expiryDate,
            daysUntilExpiry: item.daysUntilExpiry,
          });
        }
      }
    }
    expiringItems.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

    res.json({
      totalWorkers,
      readyCount,
      expiringCount,
      nonCompliantCount,
      unassignedCount: totalWorkers - byWorker.size,
      certificationsByStatus: [...certBreakdown.values()],
      expiringInNext30Days: expiringItems,
    });
  } catch (err) {
    logger.error({ err }, "workforce dashboard error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
