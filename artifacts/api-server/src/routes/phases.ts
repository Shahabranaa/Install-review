import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, phasesTable, locationsTable, imagesTable, issuesTable, decisionsTable } from "@workspace/db";
import {
  ListPhasesQueryParams,
  ListPhasesResponse,
  CreatePhaseBody,
  GetPhaseParams,
  GetPhaseResponse,
  UpdatePhaseParams,
  UpdatePhaseBody,
  UpdatePhaseResponse,
  ApprovePhaseParams,
  ApprovePhaseBody,
  ApprovePhaseResponse,
  RejectPhaseParams,
  RejectPhaseBody,
  RejectPhaseResponse,
} from "@workspace/api-zod";
import { serialize } from "../lib/serialize";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.accessLevel !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

router.get("/phases", async (req, res): Promise<void> => {
  const queryParams = ListPhasesQueryParams.safeParse(req.query);
  let phases;
  if (queryParams.success) {
    const { locationId, siteId, status } = queryParams.data;
    if (locationId) {
      phases = await db.select().from(phasesTable).where(eq(phasesTable.locationId, locationId));
    } else if (siteId || status) {
      const locationRows = await db.select({ id: locationsTable.id })
        .from(locationsTable)
        .where(siteId ? eq(locationsTable.siteId, siteId) : undefined);
      const locationIds = locationRows.map((l) => l.id);
      if (locationIds.length === 0) {
        res.json(ListPhasesResponse.parse([]));
        return;
      }
      const conditions = [inArray(phasesTable.locationId, locationIds)];
      if (status) conditions.push(eq(phasesTable.status, status));
      phases = await db.select().from(phasesTable).where(and(...conditions));
    } else {
      phases = await db.select().from(phasesTable);
    }
  } else {
    phases = await db.select().from(phasesTable);
  }
  res.json(ListPhasesResponse.parse(serialize(phases)));
});

router.post("/phases", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreatePhaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = { ...parsed.data, requiredImageCount: parsed.data.requiredImageCount ?? 0 };
  const [phase] = await db.insert(phasesTable).values(data).returning();
  res.status(201).json(GetPhaseResponse.parse(serialize(phase)));
});

router.get("/phases/:id", async (req, res): Promise<void> => {
  const params = GetPhaseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [phase] = await db.select().from(phasesTable).where(eq(phasesTable.id, params.data.id));
  if (!phase) {
    res.status(404).json({ error: "Phase not found" });
    return;
  }
  const [location] = await db.select().from(locationsTable).where(eq(locationsTable.id, phase.locationId));
  const images = await db.select().from(imagesTable).where(eq(imagesTable.phaseId, phase.id));
  const imageIds = images.map((i) => i.id);
  let allIssues: { severity: string }[] = [];
  if (imageIds.length > 0) {
    allIssues = await db.select({ severity: issuesTable.severity })
      .from(issuesTable)
      .where(and(inArray(issuesTable.imageId, imageIds), eq(issuesTable.resolved, false)));
  }
  const totalImages = images.length;
  const approvedImages = images.filter((i) => i.reviewStatus === "approved").length;
  const rejectedImages = images.filter((i) => i.reviewStatus === "rejected").length;
  const pendingImages = images.filter((i) => i.reviewStatus === "pending").length;
  const criticalIssues = allIssues.filter((i) => i.severity === "critical").length;
  const warningIssues = allIssues.filter((i) => i.severity === "warning").length;
  const infoIssues = allIssues.filter((i) => i.severity === "info").length;

  const detail = {
    ...phase,
    totalImages,
    approvedImages,
    rejectedImages,
    pendingImages,
    criticalIssues,
    warningIssues,
    infoIssues,
    location: location!,
  };
  res.json(GetPhaseResponse.parse(serialize(detail)));
});

router.patch("/phases/:id", async (req, res): Promise<void> => {
  const params = UpdatePhaseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePhaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [phase] = await db.update(phasesTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(phasesTable.id, params.data.id)).returning();
  if (!phase) {
    res.status(404).json({ error: "Phase not found" });
    return;
  }
  res.json(UpdatePhaseResponse.parse(serialize(phase)));
});

router.post("/phases/:id/approve", async (req, res): Promise<void> => {
  const params = ApprovePhaseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = ApprovePhaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [phase] = await db.update(phasesTable).set({
    status: "complete",
    approvedBy: parsed.data.approvedBy,
    approvedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(phasesTable.id, params.data.id)).returning();
  if (!phase) {
    res.status(404).json({ error: "Phase not found" });
    return;
  }
  await db.insert(decisionsTable).values({
    phaseId: phase.id,
    approvedBy: parsed.data.approvedBy,
    decision: "approved",
    notes: parsed.data.notes ?? null,
  });
  res.json(ApprovePhaseResponse.parse(serialize(phase)));
});

router.post("/phases/:id/reject", async (req, res): Promise<void> => {
  const params = RejectPhaseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = RejectPhaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [phase] = await db.update(phasesTable).set({
    status: "incomplete",
    rejectedBy: parsed.data.rejectedBy,
    rejectedAt: new Date(),
    rejectionReason: parsed.data.reason,
    updatedAt: new Date(),
  }).where(eq(phasesTable.id, params.data.id)).returning();
  if (!phase) {
    res.status(404).json({ error: "Phase not found" });
    return;
  }
  await db.insert(decisionsTable).values({
    phaseId: phase.id,
    approvedBy: parsed.data.rejectedBy,
    decision: "rejected",
    notes: parsed.data.reason,
  });
  res.json(RejectPhaseResponse.parse(serialize(phase)));
});

router.delete("/phases/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid phase id" });
    return;
  }
  const [deleted] = await db.delete(phasesTable).where(eq(phasesTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Phase not found" });
    return;
  }
  res.json({ success: true, id });
});

export default router;
