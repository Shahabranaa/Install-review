import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { imagesTable } from "./images";

export const issuesTable = pgTable("issues", {
  id: serial("id").primaryKey(),
  imageId: integer("image_id").references(() => imagesTable.id, { onDelete: "cascade" }),
  photoId: text("photo_id"),
  type: text("type").notNull(),
  severity: text("severity").notNull(),
  description: text("description").notNull(),
  raisedBy: text("raised_by"),
  resolved: boolean("resolved").notNull().default(false),
  status: text("status").notNull().default("open"),
  tower: text("tower"),
  string: text("string"),
  cable: text("cable"),
  resolvedBy: text("resolved_by"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertIssueSchema = createInsertSchema(issuesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIssue = z.infer<typeof insertIssueSchema>;
export type Issue = typeof issuesTable.$inferSelect;
