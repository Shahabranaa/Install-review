import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workersTable } from "./workers";

export const workerActivityLogsTable = pgTable("worker_activity_logs", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => workersTable.id, { onDelete: "cascade" }),
  action: text("action").notNull(), // DB CHECK: login | logout | cert_added | cert_edited | cert_deleted | credentials_set
  detail: text("detail"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWorkerActivityLogSchema = createInsertSchema(workerActivityLogsTable).omit({ id: true, createdAt: true });
export type InsertWorkerActivityLog = z.infer<typeof insertWorkerActivityLogSchema>;
export type WorkerActivityLog = typeof workerActivityLogsTable.$inferSelect;
