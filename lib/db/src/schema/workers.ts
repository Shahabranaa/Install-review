import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workforceRolesTable } from "./workforce-roles";

export const workersTable = pgTable("workers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").unique(),
  company: text("company"),
  windaId: text("winda_id").unique(),
  roleId: integer("role_id").references(() => workforceRolesTable.id, { onDelete: "set null" }),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  uniqueId: text("unique_id"),
  phone: text("phone"),
  dob: text("dob"),
  passportNo: text("passport_no"),
  preferredAirport: text("preferred_airport").array(),
  qualifications: text("qualifications"),
  // CV file (Wasabi key)
  cvWasabiKey: text("cv_wasabi_key"),
  // Worker portal credentials
  portalUsername: text("portal_username").unique(),
  portalPasswordHash: text("portal_password_hash"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  lastLoginIp: text("last_login_ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWorkerSchema = createInsertSchema(workersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWorker = z.infer<typeof insertWorkerSchema>;
export type Worker = typeof workersTable.$inferSelect;
