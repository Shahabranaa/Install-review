import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const mobSitesTable = pgTable("mob_sites", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location"),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMobSiteSchema = createInsertSchema(mobSitesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMobSite = z.infer<typeof insertMobSiteSchema>;
export type MobSite = typeof mobSitesTable.$inferSelect;
