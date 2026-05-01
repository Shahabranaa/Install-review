import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const campaignsTable = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  campaignId: text("campaign_id").notNull().unique(),
  name: text("name").notNull(),
  startDate: text("start_date"),
  endDate: text("end_date"),
  completedToolingSet: text("completed_tooling_set"),
  vlfTestSet: text("vlf_test_set"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Campaign = typeof campaignsTable.$inferSelect;
