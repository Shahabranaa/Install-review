import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dprTeamActivityPlansTable = pgTable("dpr_team_activity_plans", {
  id:           serial("id").primaryKey(),
  date:         text("date").notNull(),               // yyyy-MM-dd
  teamId:       integer("team_id").notNull(),
  locationName: text("location_name").notNull(),      // free-form location label
  activityCode: text("activity_code").notNull(),      // WF103630, SERV33650, etc.
  activityName: text("activity_name").notNull(),
  section:      text("section").notNull(),            // OCS | 2Cable | 1Cable | String
  stage:        text("stage").notNull().default("draft"), // draft | captured | clarified
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDprTeamActivityPlanSchema = createInsertSchema(dprTeamActivityPlansTable)
  .omit({ id: true, createdAt: true });
export type InsertDprTeamActivityPlan = z.infer<typeof insertDprTeamActivityPlanSchema>;
export type DprTeamActivityPlanRow = typeof dprTeamActivityPlansTable.$inferSelect;
