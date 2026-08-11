import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const dprActivityLogsTable = pgTable("dpr_activity_logs", {
  id: serial("id").primaryKey(),
  /** Who performed the action */
  actorId: integer("actor_id"),
  actorName: text("actor_name").notNull().default("Unknown"),
  /** High-level action type */
  action: text("action").notNull(), // "entry_created" | "entry_updated" | "entry_deleted" | "entries_locked" | "entry_clarified"
  /** Which page the action was performed on */
  page: text("page").notNull(), // "capture" | "clarify" | "jdr_mapping"
  /** Human-readable description */
  detail: text("detail").notNull(),
  /** Optional reference to the affected timesheet entry */
  entryId: integer("entry_id"),
  /** Date of the affected timesheet entry (YYYY-MM-DD) */
  entryDate: text("entry_date"),
  /** Optional reference to the affected team */
  teamId: integer("team_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DprActivityLog = typeof dprActivityLogsTable.$inferSelect;
