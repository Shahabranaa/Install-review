import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const workforceRolesTable = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWorkforceRoleSchema = createInsertSchema(workforceRolesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWorkforceRole = z.infer<typeof insertWorkforceRoleSchema>;
export type WorkforceRole = typeof workforceRolesTable.$inferSelect;
