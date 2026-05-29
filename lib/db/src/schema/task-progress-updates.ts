import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";

export const taskProgressUpdatesTable = pgTable("task_progress_updates", {
  id: serial("id").primaryKey(),
  taskProgressId: text("task_progress_id").notNull().unique(),
  linkedTaskId: text("linked_task_id").notNull(),
  location: text("location").notNull(),
  progressPct: integer("progress_pct").notNull().default(0),
  completedAt: text("completed_at"),
  durationActual: numeric("duration_actual", { precision: 10, scale: 2 }),
  workActivity: text("work_activity"),
  createdBy: text("created_by"),
  creationDatetime: text("creation_datetime"),
  creationLocation: text("creation_location"),
  editDatetime: text("edit_datetime"),
  editUser: text("edit_user"),
  editLocation: text("edit_location"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type TaskProgressUpdate = typeof taskProgressUpdatesTable.$inferSelect;
