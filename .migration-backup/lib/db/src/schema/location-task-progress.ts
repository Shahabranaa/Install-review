import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";

export const locationTaskProgressTable = pgTable("location_task_progress", {
  id: serial("id").primaryKey(),
  progressSheetId: text("progress_sheet_id").notNull().unique(),
  taskId: text("task_id").notNull(),
  location: text("location").notNull(),
  stringName: text("string_name"),
  completed: boolean("completed").notNull().default(false),
  startDate: text("start_date"),
  finishDate: text("finish_date"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type LocationTaskProgress = typeof locationTaskProgressTable.$inferSelect;
