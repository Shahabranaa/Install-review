import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { workersTable } from "./workers";
import { usersTable } from "./users";

export const emailLogsTable = pgTable("email_logs", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").references(() => workersTable.id, { onDelete: "set null" }),
  sentBy: integer("sent_by").references(() => usersTable.id, { onDelete: "set null" }),
  batchId: text("batch_id"), // groups an email entry with its sibling push entry from the same admin send action
  toEmail: text("to_email").notNull(),
  toName: text("to_name").notNull(),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  emailType: text("email_type").notNull(), // "expiry_notification" | "login_info" | "custom"
  status: text("status").notNull().default("sent"), // "sent" | "failed"
  error: text("error"),
  trackingId: text("tracking_id").unique().notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  seenAt: timestamp("seen_at", { withTimezone: true }),
  seenIp: text("seen_ip"),
});

export type EmailLog = typeof emailLogsTable.$inferSelect;
