import { pgTable, serial, timestamp, integer, text, date, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workersTable } from "./workers";
import { mobSitesTable } from "./mob-sites";

export const siteAssignmentsTable = pgTable("site_assignments", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => workersTable.id, { onDelete: "cascade" }),
  siteId: integer("site_id").notNull().references(() => mobSitesTable.id, { onDelete: "cascade" }),
  assignedDate: date("assigned_date"),
  mobilisationDate: date("mobilisation_date"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("site_assignment_unique").on(t.workerId, t.siteId),
]);

export const insertSiteAssignmentSchema = createInsertSchema(siteAssignmentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSiteAssignment = z.infer<typeof insertSiteAssignmentSchema>;
export type SiteAssignment = typeof siteAssignmentsTable.$inferSelect;
