import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  db,
  installationTasksTable,
  campaignsTable,
  locationTaskProgressTable,
  taskProgressUpdatesTable,
} from "@workspace/db";
import { sheetsRequest, isSheetsConfigured, SPREADSHEET_ID } from "../lib/google-sheets";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** Parse a CSV line respecting quoted fields */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let inQuote = false;
  let current = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === "," && !inQuote) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/** Fetch a sheet by name using the public CSV export (no auth required if sheet is public) */
async function fetchSheetPublicCSV(sheetName: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CSV export error for "${sheetName}" (${res.status})`);
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return lines.map(parseCSVLine);
}

/** Fetch via authenticated Sheets API, fall back to public CSV */
async function fetchSheet(sheetName: string): Promise<string[][]> {
  if (isSheetsConfigured()) {
    try {
      const response = await sheetsRequest(
        `/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetName + "!A:Z")}`,
      );
      if (response.ok) {
        const data = (await response.json()) as { values?: string[][] };
        return data.values ?? [];
      }
    } catch {
      // fall through to public CSV
    }
  }
  return fetchSheetPublicCSV(sheetName);
}

function colIdx(headers: string[], ...names: string[]): number {
  for (const name of names) {
    const i = headers.findIndex((h) => h?.trim().toLowerCase() === name.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

function get(row: string[], i: number): string {
  return i >= 0 ? (row[i] ?? "").trim() : "";
}

interface SyncResult {
  tasks: { upserted: number };
  campaigns: { upserted: number };
  progress: { upserted: number };
  taskProgress: { upserted: number };
}

async function syncAllSheets(): Promise<SyncResult> {
  const result: SyncResult = {
    tasks: { upserted: 0 },
    campaigns: { upserted: 0 },
    progress: { upserted: 0 },
    taskProgress: { upserted: 0 },
  };

  const CHUNK = 500;

  async function batchUpsert<T>(
    items: T[],
    keyFn: (item: T) => string,
    doInsert: (chunk: T[]) => Promise<number>,
  ): Promise<number> {
    // Deduplicate globally by key (last wins), preserving order
    const seen = new Map<string, T>();
    for (const item of items) seen.set(keyFn(item), item);
    const deduped = Array.from(seen.values());

    let total = 0;
    for (let i = 0; i < deduped.length; i += CHUNK) {
      const chunk = deduped.slice(i, i + CHUNK);
      if (chunk.length === 0) continue;
      total += await doInsert(chunk);
    }
    return total;
  }

  // ── tasks ────────────────────────────────────────────────────────────────
  try {
    const rows = await fetchSheet("tasks");
    const h = rows[0] ?? [];
    const taskIdx = colIdx(h, "Task", "task_name", "task");
    const durIdx = colIdx(h, "Duration", "duration");
    const typeIdx = colIdx(h, "Type", "type");
    const idIdx = colIdx(h, "ID", "id", "task_id");
    const seqIdx = colIdx(h, "Sequence", "sequence");

    type TaskInsert = typeof installationTasksTable.$inferInsert;
    const items: TaskInsert[] = rows.slice(1).flatMap((row) => {
      const taskId = get(row, idIdx);
      const taskName = get(row, taskIdx);
      if (!taskId || !taskName) return [];
      const duration = parseFloat(get(row, durIdx)) || null;
      const seqNum = parseInt(get(row, seqIdx)) || null;
      return [{
        taskId, taskName,
        taskType: get(row, typeIdx) || "unknown",
        sequence: seqNum,
        durationHours: duration != null ? String(duration) : null,
      }];
    });

    result.tasks.upserted = await batchUpsert(items, (i) => i.taskId, async (chunk) => {
      await db.insert(installationTasksTable).values(chunk).onConflictDoUpdate({
        target: installationTasksTable.taskId,
        set: {
          taskName: sql`excluded.task_name`,
          taskType: sql`excluded.task_type`,
          sequence: sql`excluded.sequence`,
          durationHours: sql`excluded.duration_hours`,
          updatedAt: sql`NOW()`,
        },
      });
      return chunk.length;
    });
  } catch (err) {
    logger.warn({ err }, "[progress/sync] tasks sheet error");
  }

  // ── site_tasks (campaigns) ───────────────────────────────────────────────
  try {
    const rows = await fetchSheet("site_tasks");
    const h = rows[0] ?? [];
    const nameIdx = colIdx(h, "Name", "name");
    const startIdx = colIdx(h, "Start Date", "start_date", "startdate");
    const endIdx = colIdx(h, "End Date", "end_date", "enddate");
    const campaignIdIdx = colIdx(h, "campaign_ID", "campaign_id", "campaignid", "id");
    const toolingIdx = colIdx(h, "Completed Tooling Set", "completed_tooling_set", "tooling");
    const vlfIdx = colIdx(h, "VLF Test Set", "vlf_test_set", "vlf");

    type CampaignInsert = typeof campaignsTable.$inferInsert;
    const items: CampaignInsert[] = rows.slice(1).flatMap((row) => {
      const campaignId = get(row, campaignIdIdx);
      const name = get(row, nameIdx);
      if (!campaignId || !name) return [];
      return [{
        campaignId, name,
        startDate: get(row, startIdx) || null,
        endDate: get(row, endIdx) || null,
        completedToolingSet: get(row, toolingIdx) || null,
        vlfTestSet: get(row, vlfIdx) || null,
      }];
    });

    result.campaigns.upserted = await batchUpsert(items, (i) => i.campaignId, async (chunk) => {
      await db.insert(campaignsTable).values(chunk).onConflictDoUpdate({
        target: campaignsTable.campaignId,
        set: {
          name: sql`excluded.name`,
          startDate: sql`excluded.start_date`,
          endDate: sql`excluded.end_date`,
          completedToolingSet: sql`excluded.completed_tooling_set`,
          vlfTestSet: sql`excluded.vlf_test_set`,
          updatedAt: sql`NOW()`,
        },
      });
      return chunk.length;
    });
  } catch (err) {
    logger.warn({ err }, "[progress/sync] site_tasks sheet error");
  }

  // ── progress ─────────────────────────────────────────────────────────────
  try {
    const rows = await fetchSheet("progress");
    const h = rows[0] ?? [];
    const idIdx = colIdx(h, "ID", "id");
    const taskIdx = colIdx(h, "Task", "task", "task_id");
    const completedIdx = colIdx(h, "Completed", "completed");
    const startIdx = colIdx(h, "Start Date", "start_date");
    const finishIdx = colIdx(h, "Finish Date", "finish_date");
    const locIdx = colIdx(h, "Location", "location");
    const strIdx = colIdx(h, "String", "string", "string_name");
    const userIdx = colIdx(h, "CreationUser", "creation_user", "created_by");

    type ProgInsert = typeof locationTaskProgressTable.$inferInsert;
    const items: ProgInsert[] = rows.slice(1).flatMap((row) => {
      const progressSheetId = get(row, idIdx);
      const taskId = get(row, taskIdx);
      const location = get(row, locIdx);
      if (!progressSheetId || !taskId || !location) return [];
      const completedVal = get(row, completedIdx);
      const completed = completedVal === "1" || completedVal.toLowerCase() === "true";
      return [{
        progressSheetId, taskId, location,
        stringName: get(row, strIdx) || null,
        completed,
        startDate: get(row, startIdx) || null,
        finishDate: get(row, finishIdx) || null,
        createdBy: get(row, userIdx) || null,
      }];
    });

    result.progress.upserted = await batchUpsert(items, (i) => i.progressSheetId, async (chunk) => {
      await db.insert(locationTaskProgressTable).values(chunk).onConflictDoUpdate({
        target: locationTaskProgressTable.progressSheetId,
        set: {
          taskId: sql`excluded.task_id`,
          location: sql`excluded.location`,
          stringName: sql`excluded.string_name`,
          completed: sql`excluded.completed`,
          startDate: sql`excluded.start_date`,
          finishDate: sql`excluded.finish_date`,
          createdBy: sql`excluded.created_by`,
          updatedAt: sql`NOW()`,
        },
      });
      return chunk.length;
    });
  } catch (err) {
    const cause = (err as { cause?: unknown })?.cause;
    logger.warn({ err, cause }, "[progress/sync] progress sheet error");
  }

  // ── task_progress ─────────────────────────────────────────────────────────
  try {
    const rows = await fetchSheet("task_progress");
    const h = rows[0] ?? [];
    const linkedIdIdx = colIdx(h, "Linked_Progress_Update_ID", "linked_progress_update_id", "linked_task_id");
    const locIdx = colIdx(h, "Location", "location");
    const progressIdx = colIdx(h, "Progress", "progress", "progress_pct");
    const completedAtIdx = colIdx(h, "Date_Time_Completed", "date_time_completed", "completed_at");
    const durationIdx = colIdx(h, "Duration_Against_Task", "duration_against_task", "duration_actual");
    const tpIdIdx = colIdx(h, "Task_Progress_ID", "task_progress_id");
    const activityIdx = colIdx(h, "Work_Activity", "work_activity");
    const userIdx = colIdx(h, "CreationUser", "creation_user", "created_by");
    const creationDtIdx = colIdx(h, "CreationDateTime", "creation_datetime");
    const creationLocIdx = colIdx(h, "CreationLocation", "creation_location");
    const editDtIdx = colIdx(h, "EditDateTime", "edit_datetime");
    const editUserIdx = colIdx(h, "EditUser", "edit_user");
    const editLocIdx = colIdx(h, "EditLocation", "edit_location");

    type TpInsert = typeof taskProgressUpdatesTable.$inferInsert;
    const items: TpInsert[] = rows.slice(1).flatMap((row) => {
      const taskProgressId = get(row, tpIdIdx);
      const linkedTaskId = get(row, linkedIdIdx);
      const location = get(row, locIdx);
      if (!taskProgressId || !linkedTaskId || !location) return [];
      const pct = parseInt(get(row, progressIdx)) || 0;
      const dur = parseFloat(get(row, durationIdx)) || null;
      return [{
        taskProgressId, linkedTaskId, location,
        progressPct: pct,
        completedAt: get(row, completedAtIdx) || null,
        durationActual: dur != null ? String(dur) : null,
        workActivity: get(row, activityIdx) || null,
        createdBy: get(row, userIdx) || null,
        creationDatetime: get(row, creationDtIdx) || null,
        creationLocation: get(row, creationLocIdx) || null,
        editDatetime: get(row, editDtIdx) || null,
        editUser: get(row, editUserIdx) || null,
        editLocation: get(row, editLocIdx) || null,
      }];
    });

    result.taskProgress.upserted = await batchUpsert(items, (i) => i.taskProgressId, async (chunk) => {
      await db.insert(taskProgressUpdatesTable).values(chunk).onConflictDoUpdate({
        target: taskProgressUpdatesTable.taskProgressId,
        set: {
          linkedTaskId: sql`excluded.linked_task_id`,
          location: sql`excluded.location`,
          progressPct: sql`excluded.progress_pct`,
          completedAt: sql`excluded.completed_at`,
          durationActual: sql`excluded.duration_actual`,
          workActivity: sql`excluded.work_activity`,
          createdBy: sql`excluded.created_by`,
          creationDatetime: sql`excluded.creation_datetime`,
          creationLocation: sql`excluded.creation_location`,
          editDatetime: sql`excluded.edit_datetime`,
          editUser: sql`excluded.edit_user`,
          editLocation: sql`excluded.edit_location`,
          updatedAt: sql`NOW()`,
        },
      });
      return chunk.length;
    });
  } catch (err) {
    logger.warn({ err }, "[progress/sync] task_progress sheet error");
  }

  return result;
}

// ── POST /api/progress/sync ─────────────────────────────────────────────────
router.post("/progress/sync", async (_req, res): Promise<void> => {
  try {
    const result = await syncAllSheets();
    logger.info({ result }, "[progress/sync] complete");
    res.json({ ok: true, result });
  } catch (err: unknown) {
    logger.error({ err }, "[progress/sync] error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── GET /api/progress/campaigns ─────────────────────────────────────────────
router.get("/progress/campaigns", async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(campaignsTable)
      .orderBy(campaignsTable.startDate, campaignsTable.name);
    res.json(rows);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── GET /api/progress/tasks?type= ───────────────────────────────────────────
router.get("/progress/tasks", async (req, res): Promise<void> => {
  try {
    const type = typeof req.query.type === "string" ? req.query.type : null;
    const rows = await db
      .select()
      .from(installationTasksTable)
      .where(type ? eq(installationTasksTable.taskType, type) : sql`1=1`)
      .orderBy(installationTasksTable.taskType, installationTasksTable.sequence);
    res.json(rows);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── GET /api/progress/task-types ─────────────────────────────────────────────
router.get("/progress/task-types", async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .selectDistinct({ taskType: installationTasksTable.taskType })
      .from(installationTasksTable)
      .orderBy(installationTasksTable.taskType);
    res.json(rows.map((r) => r.taskType));
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── GET /api/progress/summary ────────────────────────────────────────────────
// Returns completion % per (location, string_name) pair
router.get("/progress/summary", async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        location: locationTaskProgressTable.location,
        stringName: locationTaskProgressTable.stringName,
        total: sql<number>`COUNT(*)::int`,
        completed: sql<number>`SUM(CASE WHEN ${locationTaskProgressTable.completed} THEN 1 ELSE 0 END)::int`,
      })
      .from(locationTaskProgressTable)
      .groupBy(locationTaskProgressTable.location, locationTaskProgressTable.stringName)
      .orderBy(locationTaskProgressTable.location, locationTaskProgressTable.stringName);

    const summary = rows.map((r) => ({
      location: r.location,
      stringName: r.stringName,
      total: r.total,
      completed: r.completed,
      pct: r.total > 0 ? Math.round((r.completed / r.total) * 100) : 0,
    }));
    res.json(summary);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── GET /api/progress/location-progress?location=&string= ───────────────────
// Returns task rows for a specific location, enriched with latest progress update
router.get("/progress/location-progress", async (req, res): Promise<void> => {
  const location = typeof req.query.location === "string" ? req.query.location : null;
  const stringName = typeof req.query.string === "string" ? req.query.string : null;

  if (!location) {
    res.status(400).json({ error: "location query param required" });
    return;
  }

  try {
    const whereClause = stringName
      ? and(
          eq(locationTaskProgressTable.location, location),
          eq(locationTaskProgressTable.stringName, stringName),
        )
      : eq(locationTaskProgressTable.location, location);

    const progressRows = await db
      .select()
      .from(locationTaskProgressTable)
      .where(whereClause)
      .orderBy(locationTaskProgressTable.taskId);

    // Fetch latest update for each task at this location
    const updatesRaw = await db
      .select()
      .from(taskProgressUpdatesTable)
      .where(eq(taskProgressUpdatesTable.location, location))
      .orderBy(taskProgressUpdatesTable.completedAt);

    // Index updates by linkedTaskId (keep the last / highest pct)
    const updatesByTask = new Map<string, typeof updatesRaw[number]>();
    for (const u of updatesRaw) {
      const prev = updatesByTask.get(u.linkedTaskId);
      if (!prev || (u.progressPct ?? 0) >= (prev.progressPct ?? 0)) {
        updatesByTask.set(u.linkedTaskId, u);
      }
    }

    // Fetch task definitions for name + duration
    const taskIds = [...new Set(progressRows.map((r) => r.taskId))];
    const taskDefs = taskIds.length
      ? await db
          .select()
          .from(installationTasksTable)
          .where(inArray(installationTasksTable.taskId, taskIds))
      : [];
    const taskDefMap = new Map(taskDefs.map((t) => [t.taskId, t]));

    const enriched = progressRows.map((row) => {
      const update = updatesByTask.get(row.taskId);
      const def = taskDefMap.get(row.taskId);
      return {
        ...row,
        taskName: def?.taskName ?? row.taskId,
        taskType: def?.taskType ?? null,
        sequence: def?.sequence ?? null,
        durationPlanned: def?.durationHours ?? null,
        latestProgressPct: update?.progressPct ?? (row.completed ? 100 : 0),
        latestCompletedAt: update?.completedAt ?? null,
        durationActual: update?.durationActual ?? null,
        workActivity: update?.workActivity ?? null,
        loggedBy: update?.createdBy ?? null,
        creationDatetime: update?.creationDatetime ?? null,
        creationLocation: update?.creationLocation ?? null,
        editDatetime: update?.editDatetime ?? null,
        editUser: update?.editUser ?? null,
        editLocation: update?.editLocation ?? null,
      };
    });

    res.json(enriched);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── GET /api/progress/locations ──────────────────────────────────────────────
// Returns distinct (location, stringName) pairs that have progress data
router.get("/progress/locations", async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .selectDistinct({
        location: locationTaskProgressTable.location,
        stringName: locationTaskProgressTable.stringName,
      })
      .from(locationTaskProgressTable)
      .orderBy(locationTaskProgressTable.location, locationTaskProgressTable.stringName);
    res.json(rows);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
