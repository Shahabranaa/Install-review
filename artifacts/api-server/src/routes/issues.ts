import { Router, type IRouter } from "express";
import { eq, and, or, inArray, type SQL } from "drizzle-orm";
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

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function deriveStatus(row: { status?: string | null; resolved: boolean }): "open" | "in_progress" | "resolved" {
  const s = (row.status ?? "").toLowerCase();
  if (s === "in_progress" || s === "resolved" || s === "open") return s;
  return row.resolved ? "resolved" : "open";
}

function parseManualPhotoId(pid: string | null | undefined): { tower: string | null; cable: string | null } {
  if (!pid) return { tower: null, cable: null };
  const m = /^manual:(tower|cable):(.+)$/.exec(pid);
  if (!m) return { tower: null, cable: null };
  return m[1] === "tower" ? { tower: m[2]!, cable: null } : { tower: null, cable: m[2]! };
}

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
    const manual = parseManualPhotoId(pid);
    // Precedence: explicit column on row > sheet_photos lookup > synthetic photoId
    const explicitTower = (serialized.tower as string | null | undefined) ?? null;
    const explicitString = (serialized.string as string | null | undefined) ?? null;
    const explicitCable = (serialized.cable as string | null | undefined) ?? null;
    return {
      ...serialized,
      tower: explicitTower ?? (pid ? towerMap.get(pid) ?? null : null) ?? manual.tower,
      string: explicitString ?? (pid ? stringMap.get(pid) ?? null : null),
      cable: explicitCable ?? manual.cable,
      status: deriveStatus({ status: serialized.status as string | null | undefined, resolved: !!serialized.resolved }),
    };
  });
}

router.get("/issues", async (req, res): Promise<void> => {
  const queryParams = ListIssuesQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const { imageId, phaseId, photoId, tower, string: stringName, severity, resolved, status } = queryParams.data;
  const conditions: SQL[] = [];

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
    conditions.push(eq(issuesTable.photoId, photoId));
  } else {
    let toweredPhotoIds: string[] | null = null;
    let stringedPhotoIds: string[] | null = null;

    if (tower) {
      const rows = await db
        .select({ photoId: sheetPhotosTable.photoId })
        .from(sheetPhotosTable)
        .where(eq(sheetPhotosTable.cableLink, tower));
      toweredPhotoIds = rows.map(r => r.photoId).filter((id): id is string => id !== null);
      // Also include manually-created issues addressed to this tower via synthetic photoId
      toweredPhotoIds.push(`manual:tower:${tower}`);
    }

    if (stringName) {
      const rows = await db
        .select({ photoId: sheetPhotosTable.photoId })
        .from(sheetPhotosTable)
        .where(eq(sheetPhotosTable.photoString, stringName));
      stringedPhotoIds = rows.map(r => r.photoId).filter((id): id is string => id !== null);
    }

    // Build OR predicates that include the explicit columns (first-class source
    // of truth) alongside the photoId-derived sets, so manual tasks created
    // with explicit tower/string but unrelated photoIds are still included.
    const towerPredicate: SQL | undefined = tower
      ? (toweredPhotoIds && toweredPhotoIds.length > 0
          ? or(eq(issuesTable.tower, tower), inArray(issuesTable.photoId, toweredPhotoIds))
          : eq(issuesTable.tower, tower))
      : undefined;
    const stringPredicate: SQL | undefined = stringName
      ? (stringedPhotoIds && stringedPhotoIds.length > 0
          ? or(eq(issuesTable.string, stringName), inArray(issuesTable.photoId, stringedPhotoIds))
          : eq(issuesTable.string, stringName))
      : undefined;

    if (towerPredicate) conditions.push(towerPredicate);
    if (stringPredicate) conditions.push(stringPredicate);
  }

  if (severity) conditions.push(eq(issuesTable.severity, severity));
  if (resolved !== undefined) conditions.push(eq(issuesTable.resolved, resolved));
  if (status) conditions.push(eq(issuesTable.status, status));

  const issues = conditions.length > 0
    ? await db.select().from(issuesTable).where(and(...conditions))
    : await db.select().from(issuesTable);

  res.json(ListIssuesResponse.parse(await enrichIssues(issues)));
});

// Lightweight rollup of open-issue counts + worst severity, grouped by tower / string / cable.
router.get("/issues/rollup", async (_req, res): Promise<void> => {
  const issues = await db.select().from(issuesTable);

  // Resolve photoId -> tower/string for issues that don't carry an explicit cable column.
  const photoIds = issues.map(i => i.photoId).filter((id): id is string => id !== null);
  const photoTower = new Map<string, string | null>();
  const photoString = new Map<string, string | null>();
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
        photoTower.set(p.photoId, p.cableLink ?? null);
        photoString.set(p.photoId, p.photoString ?? null);
      }
    }
  }

  type Bucket = { open: number; in_progress: number; resolved: number; total: number; worstSeverity: string | null };
  const empty = (): Bucket => ({ open: 0, in_progress: 0, resolved: 0, total: 0, worstSeverity: null });
  const towers = new Map<string, Bucket>();
  const strings = new Map<string, Bucket>();
  const cables = new Map<string, Bucket>();

  const bumpWorst = (bucket: Bucket, severity: string) => {
    const rank = SEVERITY_RANK[severity] ?? 9;
    const currentRank = bucket.worstSeverity ? (SEVERITY_RANK[bucket.worstSeverity] ?? 9) : 99;
    if (rank < currentRank) bucket.worstSeverity = severity;
  };

  const addTo = (map: Map<string, Bucket>, key: string | null | undefined, status: string, severity: string) => {
    if (!key) return;
    const bucket = map.get(key) ?? empty();
    if (status === "open") bucket.open += 1;
    else if (status === "in_progress") bucket.in_progress += 1;
    else if (status === "resolved") bucket.resolved += 1;
    bucket.total += 1;
    if (status !== "resolved") bumpWorst(bucket, severity);
    map.set(key, bucket);
  };

  // Fallback: parse synthetic photoIds like "manual:tower:NAME" / "manual:cable:ID"
  const parseManual = (pid: string | null) => {
    if (!pid) return { tower: null, cable: null };
    const m = /^manual:(tower|cable):(.+)$/.exec(pid);
    if (!m) return { tower: null, cable: null };
    return m[1] === "tower" ? { tower: m[2], cable: null } : { tower: null, cable: m[2] };
  };

  for (const i of issues) {
    const status = deriveStatus(i);
    const manual = parseManual(i.photoId);
    // Precedence: explicit columns > sheet_photos lookup > synthetic photoId.
    const tower = i.tower ?? (i.photoId ? photoTower.get(i.photoId) ?? null : null) ?? manual.tower;
    const stringName = i.string ?? (i.photoId ? photoString.get(i.photoId) ?? null : null);
    const cable = i.cable ?? manual.cable;
    addTo(towers, tower, status, i.severity);
    addTo(strings, stringName, status, i.severity);
    addTo(cables, cable, status, i.severity);
  }

  const toObj = (m: Map<string, Bucket>) => Object.fromEntries(m);
  res.json({ towers: toObj(towers), strings: toObj(strings), cables: toObj(cables) });
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
  const status = parsed.data.status ?? "open";
  const [issue] = await db
    .insert(issuesTable)
    .values({
      ...parsed.data,
      status,
      resolved: status === "resolved",
    })
    .returning();
  const [enriched] = await enrichIssues([issue]);
  res.status(201).json(GetIssueResponse.parse(enriched));
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
  const [enriched] = await enrichIssues([issue]);
  res.json(GetIssueResponse.parse(enriched));
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
    .set({ resolved: true, status: "resolved", resolvedBy, resolvedAt: new Date(), updatedAt: new Date() })
    .where(eq(issuesTable.id, params.data.id))
    .returning();
  if (!issue) {
    res.status(404).json({ error: "Issue not found" });
    return;
  }
  const [enriched] = await enrichIssues([issue]);
  res.json(UpdateIssueResponse.parse(enriched));
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

  // Status drives `resolved` / `resolvedAt` to keep things in lockstep.
  if (parsed.data.status) {
    if (parsed.data.status === "resolved") {
      updateData.resolved = true;
      if (!updateData.resolvedAt) updateData.resolvedAt = new Date();
    } else {
      updateData.resolved = false;
      updateData.resolvedAt = null;
      updateData.resolvedBy = null;
    }
  } else if (parsed.data.resolved !== undefined) {
    updateData.status = parsed.data.resolved ? "resolved" : "open";
    if (parsed.data.resolved && !updateData.resolvedAt) updateData.resolvedAt = new Date();
    if (!parsed.data.resolved) {
      updateData.resolvedAt = null;
      updateData.resolvedBy = null;
    }
  }

  const [issue] = await db.update(issuesTable).set(updateData).where(eq(issuesTable.id, params.data.id)).returning();
  if (!issue) {
    res.status(404).json({ error: "Issue not found" });
    return;
  }
  const [enriched] = await enrichIssues([issue]);
  res.json(UpdateIssueResponse.parse(enriched));
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
