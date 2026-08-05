import { pgTable, serial, text } from "drizzle-orm/pg-core";

export const dprShiftSessionTable = pgTable("dpr_shift_session", {
  id: serial("id").primaryKey(),
  date: text("date").notNull().unique(),
  savedAt: text("saved_at").notNull(),
});
