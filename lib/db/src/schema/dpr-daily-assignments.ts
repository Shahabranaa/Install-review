import { pgTable, text, integer, serial, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { dprTeamRoleSlotsTable } from "./dpr-team-role-slots";
import { dprWorkersTable } from "./dpr-workers";

export const dprDailyAssignmentsTable = pgTable(
  "dpr_daily_assignments",
  {
    id: serial("id").primaryKey(),
    date: text("date").notNull(),
    slotId: integer("slot_id")
      .notNull()
      .references(() => dprTeamRoleSlotsTable.id, { onDelete: "cascade" }),
    workerId: integer("worker_id")
      .notNull()
      .references(() => dprWorkersTable.id, { onDelete: "cascade" }),
  },
  (t) => [unique("dpr_daily_assignments_date_slot_uniq").on(t.date, t.slotId)],
);

export const insertDprDailyAssignmentSchema = createInsertSchema(dprDailyAssignmentsTable).omit({ id: true });
export type InsertDprDailyAssignment = z.infer<typeof insertDprDailyAssignmentSchema>;
export type DprDailyAssignmentRow = typeof dprDailyAssignmentsTable.$inferSelect;
