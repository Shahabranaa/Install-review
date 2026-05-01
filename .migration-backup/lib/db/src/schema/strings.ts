import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { locationsTable } from "./locations";

export const stringsTable = pgTable("strings", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id").notNull().references(() => locationsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  stringNumber: integer("string_number"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStringSchema = createInsertSchema(stringsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertString = z.infer<typeof insertStringSchema>;
export type StringRecord = typeof stringsTable.$inferSelect;
