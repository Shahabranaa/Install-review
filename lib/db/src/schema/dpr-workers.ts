import { pgTable, text, serial, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dprWorkersTable = pgTable("dpr_workers", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  roles: text("roles").array().notNull().default([]),
  company: text("company"),
  active: boolean("active").notNull().default(true),
});

export const insertDprWorkerSchema = createInsertSchema(dprWorkersTable).omit({ id: true });
export type InsertDprWorker = z.infer<typeof insertDprWorkerSchema>;
export type DprWorkerRow = typeof dprWorkersTable.$inferSelect;
