import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import type { DprLautecSnapshotRow } from "./dpr-lautec-import-runs";

/**
 * Per-team reconciliation plan produced by a read-only Lautec scan.
 * `deletions` contains only visible rows attributable to this system's own
 * import runs; rows this system cannot account for are listed under
 * `unattributed` and are never touched.
 */
export type DprLautecReconcileTeamPlan = {
  teamId: number;
  teamName: string;
  /** Visible table headers at scan time (used to re-verify before deleting). */
  headers: string[];
  /** All visible non-placeholder rows at scan time. */
  scannedRows: string[][];
  /** Visible rows kept because they match the current Capture sheet. */
  keeps: string[][];
  /** Visible rows to delete: ours, but outdated or duplicate copies. */
  deletions: string[][];
  /** Visible rows not created by this system; always left alone. */
  unattributed: string[][];
  /** Capture rows that are missing from Lautec (added later via normal sync). */
  missingRows: DprLautecSnapshotRow[];
  /** Sheet snapshot hash at scan time; apply refuses if the sheet changed. */
  snapshotHash: string;
};

export type DprLautecReconcileTeamResult = {
  teamId: number;
  teamName: string;
  deletedCount: number;
  /** Import runs marked as no longer present in Lautec after this cleanup. */
  runsMarkedRemoved: number;
  /** Uncertain runs resolved (to success or failed) using scan ground truth. */
  uncertainResolved: number;
  detail?: string;
};

/**
 * A ledger of "make Lautec match the sheet" cleanup runs. A run scans Lautec
 * read-only, waits for explicit operator approval of the exact deletion plan,
 * and only then applies the deletions in a browser session that aborts
 * without saving on any mismatch.
 */
export const dprLautecReconcileRunsTable = pgTable("dpr_lautec_reconcile_runs", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  status: text("status", {
    enum: [
      "scanning",
      "awaiting_approval",
      "applying",
      "saving",
      "success",
      "failed",
      "interrupted",
      "uncertain",
      "cancelled",
    ],
  }).notNull().default("scanning"),
  planJson: jsonb("plan_json").$type<DprLautecReconcileTeamPlan[]>().notNull().default([]),
  resultJson: jsonb("result_json").$type<DprLautecReconcileTeamResult[]>().notNull().default([]),
  errorDetail: text("error_detail"),
  actorId: integer("actor_id").references(() => usersTable.id, { onDelete: "set null" }),
  actorName: text("actor_name").notNull().default("Unknown"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export type DprLautecReconcileRun = typeof dprLautecReconcileRunsTable.$inferSelect;
