import { pgTable, serial, timestamp, boolean, integer, text, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mobSitesTable } from "./mob-sites";
import { workforceRolesTable } from "./workforce-roles";
import { certificationsTable } from "./certifications";
import { workersTable } from "./workers";

export const siteCertRequirementsTable = pgTable("site_cert_requirements", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").notNull().references(() => mobSitesTable.id, { onDelete: "cascade" }),
  certificationId: integer("certification_id").notNull().references(() => certificationsTable.id, { onDelete: "cascade" }),
  required: boolean("required").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("site_cert_req_unique").on(t.siteId, t.certificationId),
]);

export const roleCertRequirementsTable = pgTable("role_cert_requirements", {
  id: serial("id").primaryKey(),
  roleId: integer("role_id").notNull().references(() => workforceRolesTable.id, { onDelete: "cascade" }),
  certificationId: integer("certification_id").notNull().references(() => certificationsTable.id, { onDelete: "cascade" }),
  required: boolean("required").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("role_cert_req_unique").on(t.roleId, t.certificationId),
]);

export const workerCertOverridesTable = pgTable("worker_cert_overrides", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => workersTable.id, { onDelete: "cascade" }),
  certificationId: integer("certification_id").notNull().references(() => certificationsTable.id, { onDelete: "cascade" }),
  required: boolean("required").notNull(),
  reason: text("reason"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("worker_cert_override_unique").on(t.workerId, t.certificationId),
]);

export const insertSiteCertRequirementSchema = createInsertSchema(siteCertRequirementsTable).omit({ id: true, createdAt: true });
export type InsertSiteCertRequirement = z.infer<typeof insertSiteCertRequirementSchema>;
export type SiteCertRequirement = typeof siteCertRequirementsTable.$inferSelect;

export const insertRoleCertRequirementSchema = createInsertSchema(roleCertRequirementsTable).omit({ id: true, createdAt: true });
export type InsertRoleCertRequirement = z.infer<typeof insertRoleCertRequirementSchema>;
export type RoleCertRequirement = typeof roleCertRequirementsTable.$inferSelect;

export const insertWorkerCertOverrideSchema = createInsertSchema(workerCertOverridesTable).omit({ id: true, createdAt: true });
export type InsertWorkerCertOverride = z.infer<typeof insertWorkerCertOverrideSchema>;
export type WorkerCertOverride = typeof workerCertOverridesTable.$inferSelect;
