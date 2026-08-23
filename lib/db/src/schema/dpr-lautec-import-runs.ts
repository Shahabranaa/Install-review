import { integer, jsonb, pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { dprTeamsTable } from "./dpr-teams";
import { usersTable } from "./users";

export type DprLautecSnapshotRow = {
  activityGroup: string;
  activity: string;
  location: string;
  start: string;
  finish: string;
  comment: string;
};

export type DprLautecRejectedRow = {
  rowNumber: number;
  reason: string;
};

/**
 * An immutable record of every manual browser import attempt. Source values are
 * retained as an ordered JSON snapshot so later Sheet edits cannot change the
 * evidence of what was submitted.
 */
export const dprLautecImportRunsTable = pgTable("dpr_lautec_import_runs", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  teamId: integer("team_id").notNull().references(() => dprTeamsTable.id, { onDelete: "restrict" }),
  snapshotHash: text("snapshot_hash").notNull(),
  snapshotJson: jsonb("snapshot_json").$type<DprLautecSnapshotRow[]>().notNull(),
  status: text("status", { enum: ["running", "submitting", "success", "failed", "uncertain", "interrupted"] }).notNull().default("running"),
  rowCount: integer("row_count").notNull(),
  rowsSubmitted: integer("rows_submitted").notNull().default(0),
  rejectedRows: jsonb("rejected_rows").$type<DprLautecRejectedRow[]>().notNull().default([]),
  errorDetail: text("error_detail"),
  requestedResend: boolean("requested_resend").notNull().default(false),
  confirmedUncertainRetry: boolean("confirmed_uncertain_retry").notNull().default(false),
  actorId: integer("actor_id").references(() => usersTable.id, { onDelete: "set null" }),
  actorName: text("actor_name").notNull().default("Unknown"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export type DprLautecImportRun = typeof dprLautecImportRunsTable.$inferSelect;