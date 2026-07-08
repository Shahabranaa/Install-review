import { pgTable, text, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dprTeamsTable = pgTable("dpr_teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const insertDprTeamSchema = createInsertSchema(dprTeamsTable).omit({ id: true });
export type InsertDprTeam = z.infer<typeof insertDprTeamSchema>;
export type DprTeamRow = typeof dprTeamsTable.$inferSelect;
