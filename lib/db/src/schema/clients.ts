import { pgTable, text, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { certificationsTable } from "./certifications";

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const clientCertRequirementsTable = pgTable("client_cert_requirements", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  certificationId: integer("certification_id").notNull().references(() => certificationsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("client_cert_req_unique").on(t.clientId, t.certificationId),
]);

export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;

export const insertClientCertRequirementSchema = createInsertSchema(clientCertRequirementsTable).omit({ id: true, createdAt: true });
export type InsertClientCertRequirement = z.infer<typeof insertClientCertRequirementSchema>;
export type ClientCertRequirement = typeof clientCertRequirementsTable.$inferSelect;
