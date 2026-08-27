import { eq, or, sql } from "drizzle-orm";
import {
  db,
  dprActivitiesTable,
  dprActivityGroupsTable,
  dprActivityTypesTable,
  dprLocationsTable,
  dprTimesheetEntriesTable,
} from "@workspace/db";
import { listSheetTabs, replaceSheetRowsByTab } from "../googleSheets.js";
import { logger } from "./logger";
import { createDateTabSyncQueue } from "./dpr-sheet-sync-queue.js";

const CAPTURE_SHEET_ID = "1UWXflQzf1m1MAtnUfNE7dEq7C9YARoFq-TjykDhMQQo";
export const CAPTURE_SHEET_HEADERS = ["Activity Group", "Activity", "Location", "Start", "Finish", "Comment", "Team ID"];
const DATE_TAB_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export function dprEffectiveDate(entry: { date: unknown; shiftDate?: unknown | null }): string {
  return String(entry.shiftDate ?? entry.date).substring(0, 10);
}

export function buildCaptureSheetRow(
  entry: {
    activityTypeId?: number | null;
    activityGroupId: number | null;
    activityId: number | null;
    startTime: string | null;
    endTime: string | null;
    notes: string | null;
    teamId: number | null;
  },
  locationName: string | null | undefined,
  activityGroupById: Map<number, string>,
  activityById: Map<number, string>,
  activityTypeById = new Map<number, string>(),
): string[] {
  const activityType = activityTypeById.get(entry.activityTypeId ?? -1);
  const activityGroup = activityGroupById.get(entry.activityGroupId ?? -1) ?? activityType ?? "";
  return [
    activityGroup,
    activityById.get(entry.activityId ?? -1)
      ?? activityGroup
      ?? "",
    locationName ?? "",
    entry.startTime ?? "",
    entry.endTime ?? "",
    entry.notes ?? "",
    String(entry.teamId ?? ""),
  ];
}

/**
 * Date-named Capture tabs are application-managed: columns A:G always mirror
 * the Capture database. Any user-maintained notes or formulas belong outside
 * those seven columns (or on a separate tab).
 */
export async function syncDprDateTabs(dates: string[]): Promise<number> {
  const uniqueDates = [...new Set(dates)].filter((date) => DATE_TAB_PATTERN.test(date));
  if (uniqueDates.length === 0) return 0;

  const dateCondition = or(
    ...uniqueDates.map((date) =>
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
  const valuesByDate = new Map(uniqueDates.map((date) => [date, [] as string[][]]));

  for (const { entry, location } of rows) {
    const date = dprEffectiveDate(entry);
    const values = valuesByDate.get(date);
    if (!values) continue;
    values.push(buildCaptureSheetRow(
      entry,
      location?.name,
      activityGroupById,
      activityById,
      activityTypeById,
    ));
  }

  const syncedRows = await replaceSheetRowsByTab(
    CAPTURE_SHEET_ID,
    [...valuesByDate].map(([title, values]) => ({ title, values })),
    CAPTURE_SHEET_HEADERS,
  );
  logger.info({ dates: uniqueDates, syncedRows }, "Synced DPR date tabs to Google Sheets");
  return syncedRows;
}

/**
 * Returns every date that should be represented in the Capture spreadsheet:
 * existing date tabs are retained and cleared, while dates present in the
 * database but missing a tab are created during the rebuild.
 */
export async function getAllDprDateTabDates(): Promise<string[]> {
  const [sheetTabs, databaseDates] = await Promise.all([
    listSheetTabs(CAPTURE_SHEET_ID),
    db
      .select({
        date: sql<string>`COALESCE(${dprTimesheetEntriesTable.shiftDate}, ${dprTimesheetEntriesTable.date})`,
      })
      .from(dprTimesheetEntriesTable)
      .groupBy(sql`COALESCE(${dprTimesheetEntriesTable.shiftDate}, ${dprTimesheetEntriesTable.date})`),
  ]);

  return [...new Set([
    ...sheetTabs.map((tab) => tab.title).filter((title) => DATE_TAB_PATTERN.test(title)),
    ...databaseDates
      .map((row) => String(row.date).substring(0, 10))
      .filter((date) => DATE_TAB_PATTERN.test(date)),
  ])];
}

const dprDateTabSyncQueue = createDateTabSyncQueue(syncDprDateTabs, {
  onError: (err) => logger.error({ err }, "Failed to automatically sync DPR date tabs to Google Sheets"),
});

/**
 * Coalesces nearby timesheet mutations into one Google Sheets rebuild.
 * The mutation is already committed to PostgreSQL before this is scheduled,
 * so a temporary Sheets outage never prevents users from saving their work.
 */
export function scheduleDprDateSheetSync(...dates: string[]): void {
  dprDateTabSyncQueue.schedule(...dates);
}

/**
 * Queues an immediate date-tab rebuild and resolves only after all queued
 * snapshots—including ones that arrived during an in-flight Sheets write—have
 * been applied. This keeps the manual Save action consistent with auto-sync.
 */
export async function syncDprDateTabsNow(...dates: string[]): Promise<number> {
  return dprDateTabSyncQueue.syncNow(...dates);
}

/**
 * Fully reconciles all date-named Capture tabs with the database. This is
 * intentionally routed through the same queue as automatic and targeted
 * manual syncs so a concurrent mutation is not lost.
 */
export async function syncAllDprDateTabsNow(): Promise<{ syncedRows: number; tabs: string[] }> {
  const tabs = await getAllDprDateTabDates();
  const syncedRows = await dprDateTabSyncQueue.syncNow(...tabs);
  return { syncedRows, tabs };
}