import { pgTable, text, serial, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { dprWorkersTable } from "./dpr-workers";

export const dprWorkerShiftStatusTable = pgTable(
  "dpr_worker_shift_status",
  {
    id: serial("id").primaryKey(),
    workerId: integer("worker_id")
      .notNull()
      .references(() => dprWorkersTable.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD
    status: text("status").notNull(), // signing_on | on_shift | signing_off
    signOnTime: text("sign_on_time"), // HH:MM, set when moved to signing_on
    signOffTime: text("sign_off_time"), // HH:MM, set when moved to signing_off
  },
  (t) => [
    uniqueIndex("dpr_worker_shift_status_worker_date_idx").on(t.workerId, t.date),
  ],
);
