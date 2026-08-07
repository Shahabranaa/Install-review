import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash"),          // nullable until invite is accepted
  displayName: text("display_name").notNull(),
  email: text("email"),
  title: text("title"),
  accessLevel: text("access_level").notNull().default("viewer"),
  active: boolean("active").notNull().default(true),
  inviteToken: text("invite_token").unique(),   // SHA-256 hash of the raw token
  inviteTokenExpiresAt: timestamp("invite_token_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
