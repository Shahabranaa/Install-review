import { pgTable, serial, integer, text, timestamp, date } from "drizzle-orm/pg-core";
import { ppeTypesTable } from "./ppe-types";
import { workersTable } from "./workers";
import { mobSitesTable } from "./mob-sites";
import { usersTable } from "./users";

export const ppeAllocationsTable = pgTable("ppe_allocations", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => workersTable.id, { onDelete: "cascade" }),
  ppeTypeId: integer("ppe_type_id").notNull().references(() => ppeTypesTable.id),
  siteId: integer("site_id").references(() => mobSitesTable.id, { onDelete: "set null" }),
  issuedAt: date("issued_at").notNull(),
  issuedByUserId: integer("issued_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  sizeSpec: text("size_spec"),
  returnedAt: date("returned_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type PPEAllocation = typeof ppeAllocationsTable.$inferSelect;
