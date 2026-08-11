import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const dprCustomRolesTable = pgTable("dpr_custom_roles", {
  id: serial("id").primaryKey(),
  abbr: text("abbr").notNull().unique(),
  name: text("name").notNull(),
  color: text("color"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DprCustomRoleRow = typeof dprCustomRolesTable.$inferSelect;
