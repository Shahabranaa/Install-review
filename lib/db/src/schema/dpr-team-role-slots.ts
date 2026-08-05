import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { dprTeamsTable } from "./dpr-teams";

export const dprTeamRoleSlotsTable = pgTable("dpr_team_role_slots", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id")
    .notNull()
    .references(() => dprTeamsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
});

export const insertDprTeamRoleSlotSchema = createInsertSchema(dprTeamRoleSlotsTable).omit({ id: true });
export type InsertDprTeamRoleSlot = z.infer<typeof insertDprTeamRoleSlotSchema>;
export type DprTeamRoleSlotRow = typeof dprTeamRoleSlotsTable.$inferSelect;
