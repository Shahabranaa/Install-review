import { pgTable, text, serial, timestamp, integer, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { stringsTable } from "./strings";

export const towersTable = pgTable("towers", {
  id: serial("id").primaryKey(),
  stringId: integer("string_id").notNull().references(() => stringsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  progressStatus: text("progress_status").notNull().default(""),
  locationType: text("location_type").notNull().default("Tower"),
  connectedTo: text("connected_to"),
  countOnString: integer("count_on_string"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTowerSchema = createInsertSchema(towersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTower = z.infer<typeof insertTowerSchema>;
export type Tower = typeof towersTable.$inferSelect;
