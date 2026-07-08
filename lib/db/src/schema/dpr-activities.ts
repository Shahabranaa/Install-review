import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { dprActivityGroupsTable } from "./dpr-activity-groups";

export const dprActivitiesTable = pgTable("dpr_activities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  activityGroupId: integer("activity_group_id").notNull().references(() => dprActivityGroupsTable.id, { onDelete: "cascade" }),
});

export const insertDprActivitySchema = createInsertSchema(dprActivitiesTable).omit({ id: true });
export type InsertDprActivity = z.infer<typeof insertDprActivitySchema>;
export type DprActivityRow = typeof dprActivitiesTable.$inferSelect;
