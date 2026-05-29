import { pgTable, serial, integer, date, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { siteAssignmentsTable } from "./site-assignments";

export const workerRotationPeriodsTable = pgTable("worker_rotation_periods", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignment_id").notNull().references(() => siteAssignmentsTable.id, { onDelete: "cascade" }),
  plannedStart: date("planned_start").notNull(),
  plannedEnd: date("planned_end"),
  status: text("status").notNull().default("planned"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWorkerRotationPeriodSchema = createInsertSchema(workerRotationPeriodsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWorkerRotationPeriod = z.infer<typeof insertWorkerRotationPeriodSchema>;
export type WorkerRotationPeriod = typeof workerRotationPeriodsTable.$inferSelect;
