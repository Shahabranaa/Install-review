import { eq, or, sql } from "drizzle-orm";
import {
  db,
  dprActivitiesTable,
  dprActivityGroupsTable,
  dprActivityTypesTable,
  dprLocationsTable,
  dprTimesheetEntriesTable,
} from "@workspace/db";
import { replaceSheetRowsByTab } from "../googleSheets.js";
import { logger } from "./logger";

const CAPTURE_SHEET_ID = "1UWXflQzf1m1MAtnUfNE7dEq7C9YARoFq-TjykDhMQQo";
const CAPTURE_SHEET_HEADERS = ["Activity Group", "Activity", "Location", "Start", "Finish", "Comment"];
const SYNC_DEBOUNCE_MS = 1_000;

const pendingDates = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function dprEffectiveDate(entry: { date: unknown; shiftDate?: unknown | null }): string {
  return String(entry.shiftDate ?? entry.date).substring(0, 10);
}

async function rebuildDateTabs(dates: string[]): Promise<void> {
  const dateCondition = or(
    ...dates.map((date) =>
      sql`COALESCE(${dprTimesheetEntriesTable.shiftDate}, ${dprTimesheetEntriesTable.date}) = ${date}`,
    ),
  );
  const [rows, activityTypes, activityGroups, activities] = await Promise.all([
    db
      .select({
        entry: dprTimesheetEntriesTable,
        location: dprLocationsTable,
      })
      .from(dprTimesheetEntriesTable)
      .leftJoin(dprLocationsTable, eq(dprTimesheetEntriesTable.locationId, dprLocationsTable.id))
      .where(dateCondition)
      .orderBy(
        sql`COALESCE(${dprTimesheetEntriesTable.shiftDate}, ${dprTimesheetEntriesTable.date})`,
        dprTimesheetEntriesTable.startTime,
        dprTimesheetEntriesTable.id,
      ),
    db.select().from(dprActivityTypesTable),
    db.select().from(dprActivityGroupsTable),
    db.select().from(dprActivitiesTable),
  ]);

  const activityTypeById = new Map(activityTypes.map((item) => [item.id, item.name]));
  const activityGroupById = new Map(activityGroups.map((item) => [item.id, item.name]));
  const activityById = new Map(activities.map((item) => [item.id, item.name]));
  const valuesByDate = new Map(dates.map((date) => [date, [] as string[][]]));

  for (const { entry, location } of rows) {
    const date = dprEffectiveDate(entry);
    const values = valuesByDate.get(date);
    if (!values) continue;
    values.push([
      activityTypeById.get(entry.activityTypeId ?? -1) ?? "",
      activityById.get(entry.activityId ?? -1)
        ?? activityGroupById.get(entry.activityGroupId ?? -1)
        ?? "",
      location?.name ?? "",
      entry.startTime ?? "",
      entry.endTime ?? "",
      entry.notes ?? "",
    ]);
  }

  const syncedRows = await replaceSheetRowsByTab(
    CAPTURE_SHEET_ID,
    [...valuesByDate].map(([title, values]) => ({ title, values })),
    CAPTURE_SHEET_HEADERS,
  );
  logger.info({ dates, syncedRows }, "Synced DPR date tabs to Google Sheets");
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const dates = [...pendingDates];
    pendingDates.clear();
    if (dates.length === 0) return;
    void rebuildDateTabs(dates).catch((err) => {
      logger.error({ err, dates }, "Failed to automatically sync DPR date tabs to Google Sheets");
    });
  }, SYNC_DEBOUNCE_MS);
  flushTimer.unref?.();
}

/**
 * Coalesces nearby timesheet mutations into one Google Sheets rebuild.
 * The mutation is already committed to PostgreSQL before this is scheduled,
 * so a temporary Sheets outage never prevents users from saving their work.
 */
export function scheduleDprDateSheetSync(...dates: string[]): void {
  for (const date of dates) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) pendingDates.add(date);
  }
  scheduleFlush();
}