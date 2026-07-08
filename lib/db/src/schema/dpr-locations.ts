import { pgTable, text, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dprLocationsTable = pgTable("dpr_locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const insertDprLocationSchema = createInsertSchema(dprLocationsTable).omit({ id: true });
export type InsertDprLocation = z.infer<typeof insertDprLocationSchema>;
export type DprLocationRow = typeof dprLocationsTable.$inferSelect;
