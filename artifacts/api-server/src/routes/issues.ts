import { Router, type IRouter } from "express";
import { eq, and, inArray, type SQL } from "drizzle-orm";
import { db, issuesTable, imagesTable, sheetPhotosTable } from "@workspace/db";
import {
  ListIssuesQueryParams,
  ListIssuesResponse,
  CreateIssueBody,
  GetIssueParams,
  GetIssueResponse,
  ResolveIssueBody,
  UpdateIssueParams,
  UpdateIssueBody,
  UpdateIssueResponse,
  DeleteIssueParams,
} from "@workspace/api-zod";
import { serialize } from "../lib/serialize";

const router: IRouter = Router();

type IssueRow = typeof issuesTable.$inferSelect;

async function enrichIssues(issues: IssueRow[]): Promise<ReturnType<typeof serialize>[]> {
  const photoIds = issues.map(i => i.photoId).filter((id): id is string => id !== null);
  const towerMap = new Map<string, string>();
  const stringMap = new Map<string, string>();

  if (photoIds.length > 0) {
    const photos = await db
      .select({
        photoId: sheetPhotosTable.photoId,
        cableLink: sheetPhotosTable.cableLink,
        photoString: sheetPhotosTable.photoString,
      })
      .from(sheetPhotosTable)
      .where(inArray(sheetPhotosTable.photoId, photoIds));

    for (const p of photos) {
      if (p.photoId) {
        if (p.cableLink) towerMap.set(p.photoId, p.cableLink);
        if (p.photoString) stringMap.set(p.photoId, p.photoString);
      }
    }
  }

  return (serialize(issues) as ReturnType<typeof serialize>[]).map(row => {
    const serialized = row as Record<string, unknown>;
    const pid = serialized.photoId as string | null | undefined;
    return {
      ...serialized,
      tower: pid ? (towerMap.get(pid) ?? null) : null,
      string: pid ? (stringMap.get(pid) ?? null) : null,
    };
  });
}

router.get("/issues", async (req, res): Promise<void> => {
  const queryParams = ListIssuesQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const { imageId, phaseId, photoId, tower, string: stringName, severity, resolved } = queryParams.data;
  const conditions: SQL[] = [];

  // imageId and phaseId filter on the issues table directly
  if (imageId) {
    conditions.push(eq(issuesTable.imageId, imageId));
  } else if (phaseId) {
    const images = await db.select({ id: imagesTable.id }).from(imagesTable).where(eq(imagesTable.phaseId, phaseId));
    const ids = images.map(i => i.id);
    if (ids.length === 0) {
      res.json(ListIssuesResponse.parse([]));
      return;
    }
    conditions.push(inArray(issuesTable.imageId, ids));
  } else if (photoId) {
    // Single photo lookup — direct equality
    conditions.push(eq(issuesTable.photoId, photoId));
  } else {
    // Tower and/or string: resolve to a set of photoIds, then combine via intersection
    let toweredPhotoIds: string[] | null = null;
    let stringedPhotoIds: string[] | null = null;

    if (tower) {
      const rows = await db
        .select({ photoId: sheetPhotosTable.photoId })
        .from(sheetPhotosTable)
        .where(eq(sheetPhotosTable.cableLink, tower));
      toweredPhotoIds = rows.map(r => r.photoId).filter((id): id is string => id !== null);
    }

    if (stringName) {
      const rows = await db
        .select({ photoId: sheetPhotosTable.photoId })
        .from(sheetPhotosTable)
        .where(eq(sheetPhotosTable.photoString, stringName));
      stringedPhotoIds = rows.map(r => r.photoId).filter((id): id is string => id !== null);
    }

    if (toweredPhotoIds !== null || stringedPhotoIds !== null) {
      // Intersect the two sets if both are provided
      let combined: string[];
      if (toweredPhotoIds !== null && stringedPhotoIds !== null) {
        const tSet = new Set(toweredPhotoIds);
        combined = stringedPhotoIds.filter(id => tSet.has(id));
      } else {
        combined = (toweredPhotoIds ?? stringedPhotoIds) as string[];
      }
      if (combined.length === 0) {
        res.json(ListIssuesResponse.parse([]));
        return;
      }
      conditions.push(inArray(issuesTable.photoId, combined));
    }
  }

  if (severity) conditions.push(eq(issuesTable.severity, severity));
  if (resolved !== undefined) conditions.push(eq(issuesTable.resolved, resolved));

  const issues = conditions.length > 0
    ? await db.select().from(issuesTable).where(and(...conditions))
    : await db.select().from(issuesTable);

  res.json(ListIssuesResponse.parse(await enrichIssues(issues)));
});

router.post("/issues", async (req, res): Promise<void> => {
  const parsed = CreateIssueBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!parsed.data.imageId && !parsed.data.photoId) {
    res.status(400).json({ error: "Either imageId or photoId is required" });
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

router.patch("/issues/:id/resolve", async (req, res): Promise<void> => {
  const params = GetIssueParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = ResolveIssueBody.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const resolvedBy = body.data.resolvedBy ?? null;
  const [issue] = await db
    .update(issuesTable)
    .set({ resolved: true, resolvedBy, resolvedAt: new Date(), updatedAt: new Date() })
    .where(eq(issuesTable.id, params.data.id))
    .returning();
  if (!issue) {
    res.status(404).json({ error: "Issue not found" });
    return;
  }
  res.json(UpdateIssueResponse.parse(serialize(issue)));
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
