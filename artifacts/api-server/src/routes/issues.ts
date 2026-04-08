import { Router, type IRouter } from "express";
import { eq, and, inArray, type SQL } from "drizzle-orm";
import { db, issuesTable, imagesTable } from "@workspace/db";
import {
  ListIssuesQueryParams,
  ListIssuesResponse,
  CreateIssueBody,
  GetIssueParams,
  GetIssueResponse,
  UpdateIssueParams,
  UpdateIssueBody,
  UpdateIssueResponse,
  DeleteIssueParams,
} from "@workspace/api-zod";
import { serialize } from "../lib/serialize";

const router: IRouter = Router();

router.get("/issues", async (req, res): Promise<void> => {
  const queryParams = ListIssuesQueryParams.safeParse(req.query);
  let issues;
  if (queryParams.success) {
    const { imageId, phaseId, severity, resolved } = queryParams.data;
    const conditions: SQL[] = [];
    if (imageId) {
      conditions.push(eq(issuesTable.imageId, imageId));
    } else if (phaseId) {
      const images = await db.select({ id: imagesTable.id }).from(imagesTable).where(eq(imagesTable.phaseId, phaseId));
      const imageIds = images.map((i) => i.id);
      if (imageIds.length === 0) {
        res.json(ListIssuesResponse.parse([]));
        return;
      }
      conditions.push(inArray(issuesTable.imageId, imageIds));
    }
    if (severity) conditions.push(eq(issuesTable.severity, severity));
    if (resolved !== undefined) conditions.push(eq(issuesTable.resolved, resolved));
    issues = conditions.length > 0
      ? await db.select().from(issuesTable).where(and(...conditions))
      : await db.select().from(issuesTable);
  } else {
    issues = await db.select().from(issuesTable);
  }
  res.json(ListIssuesResponse.parse(serialize(issues)));
});

router.post("/issues", async (req, res): Promise<void> => {
  const parsed = CreateIssueBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [issue] = await db.insert(issuesTable).values(parsed.data).returning();
  res.status(201).json(GetIssueResponse.parse(serialize(issue)));
});

router.get("/issues/:id", async (req, res): Promise<void> => {
  const params = GetIssueParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [issue] = await db.select().from(issuesTable).where(eq(issuesTable.id, params.data.id));
  if (!issue) {
    res.status(404).json({ error: "Issue not found" });
    return;
  }
  res.json(GetIssueResponse.parse(serialize(issue)));
});

router.patch("/issues/:id", async (req, res): Promise<void> => {
  const params = UpdateIssueParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateIssueBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.resolved && !updateData.resolvedAt) {
    updateData.resolvedAt = new Date();
  }
  const [issue] = await db.update(issuesTable).set(updateData).where(eq(issuesTable.id, params.data.id)).returning();
  if (!issue) {
    res.status(404).json({ error: "Issue not found" });
    return;
  }
  res.json(UpdateIssueResponse.parse(serialize(issue)));
});

router.delete("/issues/:id", async (req, res): Promise<void> => {
  const params = DeleteIssueParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [issue] = await db.delete(issuesTable).where(eq(issuesTable.id, params.data.id)).returning();
  if (!issue) {
    res.status(404).json({ error: "Issue not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
