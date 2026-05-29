import { pgTable, serial, integer, date, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workersTable } from "./workers";

export const workerUnavailabilityPeriodsTable = pgTable("worker_unavailability_periods", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => workersTable.id, { onDelete: "cascade" }),
  label: text("label"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWorkerUnavailabilityPeriodSchema = createInsertSchema(workerUnavailabilityPeriodsTable).omit({ id: true, createdAt: true });
export type InsertWorkerUnavailabilityPeriod = z.infer<typeof insertWorkerUnavailabilityPeriodSchema>;
export type WorkerUnavailabilityPeriod = typeof workerUnavailabilityPeriodsTable.$inferSelect;
