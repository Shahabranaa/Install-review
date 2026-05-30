import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { workersTable } from "./workers";
import { workforceRolesTable } from "./workforce-roles";

export const workerRoleHistoryTable = pgTable("worker_role_history", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id")
    .notNull()
    .references(() => workersTable.id, { onDelete: "cascade" }),
  roleId: integer("role_id").references(() => workforceRolesTable.id, {
    onDelete: "set null",
  }),
  roleNameSnapshot: text("role_name_snapshot").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  notes: text("notes"),
  source: text("source"),
  sortOrder: integer("sort_order"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type WorkerRoleHistory = typeof workerRoleHistoryTable.$inferSelect;
