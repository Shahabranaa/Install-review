import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { phasesTable } from "./phases";

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  phaseId: integer("phase_id").references(() => phasesTable.id, { onDelete: "set null" }),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  generatedBy: text("generated_by").notNull(),
  title: text("title").notNull(),
  content: text("content"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  packType: text("pack_type").default("phase"),
  stringName: text("string_name"),
  wasabiKey: text("wasabi_key"),
  photoCount: integer("photo_count"),
  reportCount: integer("report_count"),
});

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({ id: true, createdAt: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documentsTable.$inferSelect;
