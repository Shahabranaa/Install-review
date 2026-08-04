import { pgTable, integer, unique } from "drizzle-orm/pg-core";
import { dprTeamsTable } from "./dpr-teams";
import { dprWorkersTable } from "./dpr-workers";

export const dprTeamWorkersTable = pgTable(
  "dpr_team_workers",
  {
    teamId: integer("team_id")
      .notNull()
      .references(() => dprTeamsTable.id, { onDelete: "cascade" }),
    workerId: integer("worker_id")
      .notNull()
      .references(() => dprWorkersTable.id, { onDelete: "cascade" }),
  },
  (t) => [unique("dpr_team_workers_team_worker_uniq").on(t.teamId, t.workerId)],
);

export type DprTeamWorkerRow = typeof dprTeamWorkersTable.$inferSelect;
