import { pgTable, text, serial, timestamp, boolean, integer, date, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workersTable } from "./workers";
import { certificationsTable } from "./certifications";

export const workerCertificationsTable = pgTable("worker_certifications", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => workersTable.id, { onDelete: "cascade" }),
  certificationId: integer("certification_id").notNull().references(() => certificationsTable.id, { onDelete: "cascade" }),
  dateAchieved: date("date_achieved"),
  expiryDate: date("expiry_date"),
  verified: boolean("verified").notNull().default(false),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  rejected: boolean("rejected").notNull().default(false),
  rejectionComment: text("rejection_comment"),
  fileUrl: text("file_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("worker_cert_unique").on(t.workerId, t.certificationId),
]);

export const insertWorkerCertificationSchema = createInsertSchema(workerCertificationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWorkerCertification = z.infer<typeof insertWorkerCertificationSchema>;
export type WorkerCertification = typeof workerCertificationsTable.$inferSelect;
