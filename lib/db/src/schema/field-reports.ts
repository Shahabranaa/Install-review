import { pgTable, serial, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core";

export const fieldReportsTable = pgTable("field_reports", {
  id:           serial("id").primaryKey(),
  templateId:   text("template_id").notNull(),
  ospName:      text("osp_name").notNull(),
  stringName:   text("string_name").notNull(),
  cableName:    text("cable_name"),
  formData:     jsonb("form_data").notNull(),
  images:       jsonb("images").notNull().default({}),
  status:       text("status").notNull().default("draft"),
  createdBy:    text("created_by").notNull(),
  finalizedAt:  timestamp("finalized_at", { withTimezone: true }),
  wasabiKey:    text("wasabi_key"),
  mirrorTaskId: integer("mirror_task_id"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FieldReport = typeof fieldReportsTable.$inferSelect;
export type InsertFieldReport = typeof fieldReportsTable.$inferInsert;
