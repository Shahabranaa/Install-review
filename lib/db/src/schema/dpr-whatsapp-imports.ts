import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { dprTimesheetEntriesTable } from "./dpr-timesheet-entries";

export const dprWhatsappImportsTable = pgTable("dpr_whatsapp_imports", {
  id:         serial("id").primaryKey(),
  rowHash:    text("row_hash").notNull().unique(),
  entryId:    integer("entry_id").references(() => dprTimesheetEntriesTable.id, { onDelete: "set null" }),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
});
