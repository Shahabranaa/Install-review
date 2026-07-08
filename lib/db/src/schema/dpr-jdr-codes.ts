import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { dprActivitiesTable } from "./dpr-activities";

export const dprJdrCodesTable = pgTable("dpr_jdr_codes", {
  id: serial("id").primaryKey(),
  lautecActivity: text("lautec_activity").notNull(),
  lautecActivityGroup: text("lautec_activity_group").notNull(),
  jdrWorkActivity: text("jdr_work_activity").notNull(),
  contractualCode: text("contractual_code").notNull(),
  genericComment: text("generic_comment").notNull(),
  activityId: integer("activity_id").references(() => dprActivitiesTable.id, { onDelete: "set null" }),
});

export const insertDprJdrCodeSchema = createInsertSchema(dprJdrCodesTable).omit({ id: true });
export type InsertDprJdrCode = z.infer<typeof insertDprJdrCodeSchema>;
export type DprJdrCodeRow = typeof dprJdrCodesTable.$inferSelect;
