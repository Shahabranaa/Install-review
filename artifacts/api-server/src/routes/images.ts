import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, imagesTable, issuesTable, decisionsTable } from "@workspace/db";
import {
  ListImagesQueryParams,
  ListImagesResponse,
  CreateImageBody,
  GetImageParams,
  GetImageResponse,
  UpdateImageParams,
  UpdateImageBody,
  UpdateImageResponse,
  ApproveImageParams,
  ApproveImageBody,
  ApproveImageResponse,
  RejectImageParams,
  RejectImageBody,
  RejectImageResponse,
} from "@workspace/api-zod";
import { serialize } from "../lib/serialize";

const router: IRouter = Router();

router.get("/images", async (req, res): Promise<void> => {
  const queryParams = ListImagesQueryParams.safeParse(req.query);
  let images;
  if (queryParams.success) {
    const { projectId, siteId, locationId, phaseId, reviewStatus } = queryParams.data;
    const conditions = [];
    if (phaseId) conditions.push(eq(imagesTable.phaseId, phaseId));
    if (locationId) conditions.push(eq(imagesTable.locationId, locationId));
    if (siteId) conditions.push(eq(imagesTable.siteId, siteId));
    if (projectId) conditions.push(eq(imagesTable.projectId, projectId));
    if (reviewStatus) conditions.push(eq(imagesTable.reviewStatus, reviewStatus));
    images = conditions.length > 0
      ? await db.select().from(imagesTable).where(and(...conditions))
      : await db.select().from(imagesTable);
  } else {
    images = await db.select().from(imagesTable);
  }
  res.json(ListImagesResponse.parse(serialize(images)));
});

router.post("/images", async (req, res): Promise<void> => {
  const parsed = CreateImageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [image] = await db.insert(imagesTable).values({
    ...parsed.data,
    uploadedAt: new Date(),
  }).returning();
  res.status(201).json(GetImageResponse.parse(serialize({ ...image, issues: [], decisions: [] })));
});

router.get("/images/:id", async (req, res): Promise<void> => {
  const params = GetImageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [image] = await db.select().from(imagesTable).where(eq(imagesTable.id, params.data.id));
  if (!image) {
    res.status(404).json({ error: "Image not found" });
    return;
  }
  const issues = await db.select().from(issuesTable).where(eq(issuesTable.imageId, image.id));
  const imageDecisions = await db.select().from(decisionsTable).where(eq(decisionsTable.imageId, image.id));
  res.json(GetImageResponse.parse(serialize({ ...image, issues, decisions: imageDecisions })));
});

router.patch("/images/:id", async (req, res): Promise<void> => {
  const params = UpdateImageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateImageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [image] = await db.update(imagesTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(imagesTable.id, params.data.id)).returning();
  if (!image) {
    res.status(404).json({ error: "Image not found" });
    return;
  }
  res.json(UpdateImageResponse.parse(serialize(image)));
});

router.post("/images/:id/approve", async (req, res): Promise<void> => {
  const params = ApproveImageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = ApproveImageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [image] = await db.update(imagesTable).set({
    reviewStatus: "approved",
    reviewedBy: parsed.data.reviewedBy,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(imagesTable.id, params.data.id)).returning();
  if (!image) {
    res.status(404).json({ error: "Image not found" });
    return;
  }
  await db.insert(decisionsTable).values({
    imageId: image.id,
    approvedBy: parsed.data.reviewedBy,
    decision: "approved",
    notes: parsed.data.notes ?? null,
  });
  res.json(ApproveImageResponse.parse(serialize(image)));
});

router.post("/images/:id/reject", async (req, res): Promise<void> => {
  const params = RejectImageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = RejectImageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [image] = await db.update(imagesTable).set({
    reviewStatus: "rejected",
    reviewedBy: parsed.data.reviewedBy,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(imagesTable.id, params.data.id)).returning();
  if (!image) {
    res.status(404).json({ error: "Image not found" });
    return;
  }
  await db.insert(decisionsTable).values({
    imageId: image.id,
    approvedBy: parsed.data.reviewedBy,
    decision: "rejected",
    notes: parsed.data.reason,
  });
  res.json(RejectImageResponse.parse(serialize(image)));
});

export default router;
