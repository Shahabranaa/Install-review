import { pgTable, serial, integer, date, text, timestamp } from "drizzle-orm/pg-core";
import { workersTable } from "./workers";
import { workerRotationPeriodsTable } from "./worker-rotation-periods";

export const workerScheduleChangeRequestsTable = pgTable("worker_schedule_change_requests", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => workersTable.id, { onDelete: "cascade" }),
  rotationPeriodId: integer("rotation_period_id").notNull().references(() => workerRotationPeriodsTable.id, { onDelete: "cascade" }),
  requestedStart: date("requested_start"),
  requestedEnd: date("requested_end"),
  reason: text("reason"),
  status: text("status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type WorkerScheduleChangeRequest = typeof workerScheduleChangeRequestsTable.$inferSelect;
