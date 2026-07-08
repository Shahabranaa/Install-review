import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { dprTeamsTable } from "./dpr-teams";
import { dprLocationsTable } from "./dpr-locations";
import { dprActivityTypesTable } from "./dpr-activity-types";
import { dprActivityGroupsTable } from "./dpr-activity-groups";
import { dprActivitiesTable } from "./dpr-activities";

export const dprTimesheetEntriesTable = pgTable("dpr_timesheet_entries", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  teamId: integer("team_id").references(() => dprTeamsTable.id, { onDelete: "set null" }),
  startTime: text("start_time"),
  endTime: text("end_time"),
  locationId: integer("location_id").references(() => dprLocationsTable.id, { onDelete: "set null" }),
  notes: text("notes"),
  activityTypeId: integer("activity_type_id").references(() => dprActivityTypesTable.id, { onDelete: "set null" }),
  activityGroupId: integer("activity_group_id").references(() => dprActivityGroupsTable.id, { onDelete: "set null" }),
  activityId: integer("activity_id").references(() => dprActivitiesTable.id, { onDelete: "set null" }),
  jdrCodeIds: jsonb("jdr_code_ids").$type<number[]>().notNull().default([]),
  genericComment: text("generic_comment"),
  combinedComment: text("combined_comment"),
  stage: text("stage", { enum: ["captured", "clarified"] }).notNull().default("captured"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDprTimesheetEntrySchema = createInsertSchema(dprTimesheetEntriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDprTimesheetEntry = z.infer<typeof insertDprTimesheetEntrySchema>;
export type DprTimesheetEntryRow = typeof dprTimesheetEntriesTable.$inferSelect;
