import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const wasabiMirrorTasksTable = pgTable("wasabi_mirror_tasks", {
  id:           serial("id").primaryKey(),
  rootFolderId: text("root_folder_id").notNull(),
  driveFileId:  text("drive_file_id").notNull().unique(),
  fileName:     text("file_name").notNull(),
  drivePath:    text("drive_path").notNull(),
  wasabiKey:    text("wasabi_key"),
  status:       text("status").notNull().default("pending"),
  error:        text("error"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WasabiMirrorTask = typeof wasabiMirrorTasksTable.$inferSelect;
