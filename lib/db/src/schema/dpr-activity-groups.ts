import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { dprActivityTypesTable } from "./dpr-activity-types";

export const dprActivityGroupsTable = pgTable("dpr_activity_groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  activityTypeId: integer("activity_type_id").references(() => dprActivityTypesTable.id, { onDelete: "set null" }),
});

export const insertDprActivityGroupSchema = createInsertSchema(dprActivityGroupsTable).omit({ id: true });
export type InsertDprActivityGroup = z.infer<typeof insertDprActivityGroupSchema>;
export type DprActivityGroupRow = typeof dprActivityGroupsTable.$inferSelect;
