import { pgTable, text, integer, primaryKey } from "drizzle-orm/pg-core";
import { dprTeamsTable } from "./dpr-teams";

export const dprRosterVisibleTeamsTable = pgTable(
  "dpr_roster_visible_teams",
  {
    date: text("date").notNull(),
    teamId: integer("team_id")
      .notNull()
      .references(() => dprTeamsTable.id, { onDelete: "cascade" }),
  },
  (table) => ({ pk: primaryKey({ columns: [table.date, table.teamId] }) }),
);
