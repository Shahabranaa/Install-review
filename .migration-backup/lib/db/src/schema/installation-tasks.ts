import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";

export const installationTasksTable = pgTable("installation_tasks", {
  id: serial("id").primaryKey(),
  taskId: text("task_id").notNull().unique(),
  taskName: text("task_name").notNull(),
  taskType: text("task_type").notNull(),
  sequence: integer("sequence"),
  durationHours: numeric("duration_hours", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type InstallationTask = typeof installationTasksTable.$inferSelect;
