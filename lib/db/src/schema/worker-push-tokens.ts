import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { workersTable } from "./workers";

export const workerPushTokensTable = pgTable("worker_push_tokens", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => workersTable.id, { onDelete: "cascade" }),
  token: text("token").unique().notNull(),
  platform: text("platform"), // "ios" | "android" | "web"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WorkerPushToken = typeof workerPushTokensTable.$inferSelect;
