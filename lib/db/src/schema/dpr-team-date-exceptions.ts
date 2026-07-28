import { pgTable, serial, integer, date, text, unique } from "drizzle-orm/pg-core";
import { dprTeamsTable } from "./dpr-teams";

export const dprTeamDateExceptionsTable = pgTable(
  "dpr_team_date_exceptions",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => dprTeamsTable.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    status: text("status").notNull().default("not_working"),
  },
  (t) => [unique("dpr_team_date_exceptions_team_date_uniq").on(t.teamId, t.date)],
);

export type DprTeamDateExceptionRow = typeof dprTeamDateExceptionsTable.$inferSelect;
