import { pgTable, text, serial, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const requiredImageDefinitionsTable = pgTable("required_image_definitions", {
  id: serial("id").primaryKey(),
  phaseType:    text("phase_type").notNull(),
  reqImgType:   text("req_img_type").notNull(),
  reqImgOrder:  text("req_img_order"),
  description:  text("description"),
  locationType: text("location_type").notNull().default("both"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("required_image_definitions_phase_type_req_img_type_unique").on(t.phaseType, t.reqImgType),
]);

export const insertRequiredImageDefinitionSchema = createInsertSchema(requiredImageDefinitionsTable)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRequiredImageDefinition = z.infer<typeof insertRequiredImageDefinitionSchema>;
export type RequiredImageDefinition = typeof requiredImageDefinitionsTable.$inferSelect;
