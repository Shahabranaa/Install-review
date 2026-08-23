import { and, eq, lte } from "drizzle-orm";
import { waitUntil } from "@vercel/functions";
import {
  db,
  dprActivityLogsTable,
  dprLautecImportRunsTable,
  dprTeamsTable,
  type DprLautecRejectedRow,
} from "@workspace/db";
import { logger } from "./logger.js";
import { runLautecBrowserImport } from "./lautec-browser-adapter.js";

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "The Lautec browser run failed.";
  // Never accidentally persist a secret if a third-party browser library echoes input.
  return message
    .replaceAll(process.env.LAUTEC_USERNAME ?? "", "[redacted]")
    .replaceAll(process.env.LAUTEC_PASSWORD ?? "", "[redacted]")
    .slice(0, 2_000);
}

async function logRun(run: {
  actorId: number | null;
  actorName: string;
  date: string;
  teamId: number;
}, action: string, detail: string): Promise<void> {
  await db.insert(dprActivityLogsTable).values({
    actorId: run.actorId,
    actorName: run.actorName,
    action,
    page: "capture",
    detail,
    entryDate: run.date,
    teamId: run.teamId,
  }).catch((error) => logger.warn({ error }, "Unable to write Lautec import activity log"));
}

export async function executeLautecImportRun(runId: number): Promise<void> {
  const [run] = await db
    .select()
    .from(dprLautecImportRunsTable)
    .where(eq(dprLautecImportRunsTable.id, runId));
  if (!run || run.status !== "running") return;

  let submissionBegan = false;
  try {
    const [team] = await db.select().from(dprTeamsTable).where(eq(dprTeamsTable.id, run.teamId));
    if (!team) throw new Error("The destination DPR team no longer exists.");

    const result = await runLautecBrowserImport({
      teamName: team.name,
      date: run.date,
      rows: run.snapshotJson,
      beforeSubmit: async () => {
        const updated = await db.update(dprLautecImportRunsTable)
          .set({ status: "submitting" })
          .where(and(
            eq(dprLautecImportRunsTable.id, runId),
            eq(dprLautecImportRunsTable.status, "running"),
          ))
          .returning({ id: dprLautecImportRunsTable.id });
        if (updated.length !== 1) throw new Error("The Lautec import run was no longer active before submission.");
        submissionBegan = true;
      },
    });
    const rejectedRows: DprLautecRejectedRow[] = result.rejectedRows;
    const failed = rejectedRows.length > 0;
    await db.update(dprLautecImportRunsTable)
      .set({
        // A rejection comes from Lautec only after Submit. Some earlier rows
        // may have been accepted, so this is not a safe ordinary failure.
        status: failed ? "uncertain" : "success",
        rowsSubmitted: result.rowsSubmitted,
        rejectedRows,
        errorDetail: failed
          ? "Lautec rejected one or more rows after submission. Other rows may have been accepted; check Lautec before explicitly allowing a retry."
          : null,
        finishedAt: new Date(),
      })
      .where(and(eq(dprLautecImportRunsTable.id, runId), eq(dprLautecImportRunsTable.status, "submitting")));
    await logRun(
      run,
      failed ? "lautec_import_uncertain" : "lautec_import_succeeded",
      failed
        ? `Lautec import #${runId} completed with ${rejectedRows.length} rejected row(s); verify accepted rows in Lautec before retrying.`
        : `Lautec import #${runId} successfully submitted ${result.rowsSubmitted} row(s).`,
    );
  } catch (error) {
    const errorDetail = safeMessage(error);
    const status = submissionBegan ? "uncertain" : "failed";
    const detail = submissionBegan
      ? `Lautec may have received this import, but its visible completion confirmation was not observed. Check Lautec before explicitly allowing a retry. ${errorDetail}`
      : errorDetail;
    await db.update(dprLautecImportRunsTable)
      .set({ status, errorDetail: detail, finishedAt: new Date() })
      .where(and(
        eq(dprLautecImportRunsTable.id, runId),
        eq(dprLautecImportRunsTable.status, submissionBegan ? "submitting" : "running"),
      ));
    await logRun(run, submissionBegan ? "lautec_import_uncertain" : "lautec_import_failed", `Lautec import #${runId} ${submissionBegan ? "requires Lautec verification" : `failed: ${errorDetail}`}`);
    logger.warn({ runId, error: errorDetail }, "Lautec import run failed");
  }
}

export function dispatchLautecImportRun(runId: number): void {
  const work = executeLautecImportRun(runId);
  try {
    // Vercel keeps this promise alive after the 202 response. Local Express
    // keeps the event loop alive naturally, so the same code works in Replit.
    waitUntil(work);
  } catch {
    void work;
  }
}

const STALE_RUN_AFTER_MS = 15 * 60 * 1000;

export async function interruptStaleLautecImports(): Promise<void> {
  const staleBefore = new Date(Date.now() - STALE_RUN_AFTER_MS);
  const interrupted = await db.update(dprLautecImportRunsTable)
    .set({
      status: "interrupted",
      errorDetail: "The Lautec browser run exceeded its recovery window. Check Lautec before retrying.",
      finishedAt: new Date(),
    })
    .where(and(
      eq(dprLautecImportRunsTable.status, "running"),
      lte(dprLautecImportRunsTable.startedAt, staleBefore),
    ))
    .returning({ id: dprLautecImportRunsTable.id });
  if (interrupted.length > 0) {
    logger.warn({ runIds: interrupted.map((run) => run.id) }, "Marked stale Lautec imports as interrupted");
  }
  const uncertain = await db.update(dprLautecImportRunsTable)
    .set({
      status: "uncertain",
      errorDetail: "The Lautec browser run exceeded its recovery window after submission may have begun. Check Lautec before explicitly allowing a retry.",
      finishedAt: new Date(),
    })
    .where(and(
      eq(dprLautecImportRunsTable.status, "submitting"),
      lte(dprLautecImportRunsTable.startedAt, staleBefore),
    ))
    .returning({ id: dprLautecImportRunsTable.id });
  if (uncertain.length > 0) {
    logger.warn({ runIds: uncertain.map((run) => run.id) }, "Marked stale post-submit Lautec imports as uncertain");
  }
}