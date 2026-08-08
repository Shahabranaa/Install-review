import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dprTeamsTable = pgTable("dpr_teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  shiftStartTime: text("shift_start_time"),
  shiftEndTime: text("shift_end_time"),
  backTeamId: integer("back_team_id"),
});

export const insertDprTeamSchema = createInsertSchema(dprTeamsTable).omit({ id: true });
export type InsertDprTeam = z.infer<typeof insertDprTeamSchema>;
export type DprTeamRow = typeof dprTeamsTable.$inferSelect;
