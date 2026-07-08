import { pgTable, text, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dprActivityTypesTable = pgTable("dpr_activity_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const insertDprActivityTypeSchema = createInsertSchema(dprActivityTypesTable).omit({ id: true });
export type InsertDprActivityType = z.infer<typeof insertDprActivityTypeSchema>;
export type DprActivityTypeRow = typeof dprActivityTypesTable.$inferSelect;
