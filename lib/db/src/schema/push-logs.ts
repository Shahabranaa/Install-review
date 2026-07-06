import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { workersTable } from "./workers";
import { usersTable } from "./users";

export const pushLogsTable = pgTable("push_logs", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").references(() => workersTable.id, { onDelete: "set null" }),
  sentBy: integer("sent_by").references(() => usersTable.id, { onDelete: "set null" }),
  batchId: text("batch_id"), // groups a push entry with its sibling email entry from the same admin send action
  title: text("title").notNull(),
  body: text("body").notNull(),
  messageType: text("message_type").notNull(), // "expiry_notification" | "login_info" | "custom"
  status: text("status").notNull().default("sent"), // "sent" | "failed" | "skipped"
  error: text("error"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PushLog = typeof pushLogsTable.$inferSelect;
