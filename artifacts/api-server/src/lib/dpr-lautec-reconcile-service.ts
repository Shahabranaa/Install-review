import { createHash, createHmac } from "node:crypto";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { waitUntil } from "@vercel/functions";
import {
  db,
  dprActivityLogsTable,
  dprLautecImportRunsTable,
  dprLautecReconcileRunsTable,
  dprTeamsTable,
  type DprLautecReconcileTeamPlan,
  type DprLautecReconcileTeamResult,
} from "@workspace/db";
import { logger } from "./logger.js";
import {
  createPuppeteerLautecUi,
  getLautecBrowserConfig,
  type LautecReconcileUi,
  type LautecVisibleTableSnapshot,
} from "./lautec-browser-adapter.js";
import { getLautecSourceSnapshotsForDate } from "./dpr-lautec-source.js";
import {
  computeLautecReconcileTeamPlan,
  tableContainsSnapshotRows,
  visibleRowsMinus,
  visibleTablesMatch,
} from "./dpr-lautec-reconcile.js";

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "The Lautec cleanup browser run failed.";
  return message
    .replaceAll(process.env.LAUTEC_USERNAME ?? "", "[redacted]")
    .replaceAll(process.env.LAUTEC_PASSWORD ?? "", "[redacted]")
    .slice(0, 2_000);
}

/**
 * Binds the operator's approval to the exact deletion plan they reviewed:
 * the token embeds the reconcile id and a hash of the plan JSON, keyed with
 * the server session secret. A plan the server later recomputes differently,
 * or an approval minted for another reconcile, is refused.
 */
export function createLautecReconcileApprovalToken(reconcileId: number, planJson: unknown): string {
  const planHash = createHash("sha256").update(JSON.stringify(planJson)).digest("hex");
  return createHmac("sha256", process.env.SESSION_SECRET ?? "lautec-confirm-dev-key")
    .update(`lautec-reconcile-approve-v1:${reconcileId}:${planHash}`)
    .digest("hex");
}

async function logReconcile(run: {
  actorId: number | null;
  actorName: string;
  date: string;
}, action: string, detail: string): Promise<void> {
  await db.insert(dprActivityLogsTable).values({
    actorId: run.actorId,
    actorName: run.actorName,
    action,
    page: "capture",
    detail,
    entryDate: run.date,
    teamId: null,
  }).catch((error) => logger.warn({ error }, "Unable to write Lautec reconcile activity log"));
}

export async function executeLautecReconcileScan(reconcileId: number): Promise<void> {
  const [run] = await db.select().from(dprLautecReconcileRunsTable)
    .where(eq(dprLautecReconcileRunsTable.id, reconcileId));
  if (!run || run.status !== "scanning") return;

  let ui: LautecReconcileUi | null = null;
  try {
    const snapshots = await getLautecSourceSnapshotsForDate(run.date);
    const teams = await db.select().from(dprTeamsTable)
      .where(inArray(dprTeamsTable.id, snapshots.map((snapshot) => snapshot.teamId)));
    const teamById = new Map(teams.map((team) => [team.id, team]));
    const unknown = snapshots.filter((snapshot) => !teamById.has(snapshot.teamId));
    if (unknown.length > 0) {
      throw new Error(`The Capture tab references unknown Team ID(s): ${unknown.map((s) => s.teamId).join(", ")}.`);
    }

    const historicRuns = await db.select({
      teamId: dprLautecImportRunsTable.teamId,
      status: dprLautecImportRunsTable.status,
      snapshotJson: dprLautecImportRunsTable.snapshotJson,
    })
      .from(dprLautecImportRunsTable)
      .where(and(
        eq(dprLautecImportRunsTable.date, run.date),
        inArray(dprLautecImportRunsTable.status, ["success", "uncertain"]),
      ));

    const config = await getLautecBrowserConfig();
    ui = await createPuppeteerLautecUi(config);
    await ui.login(config.username, config.password);
    await ui.openDprDate(run.date, teamById.get(snapshots[0].teamId)!.name);

    const plans: DprLautecReconcileTeamPlan[] = [];
    for (const snapshot of snapshots) {
      const teamName = teamById.get(snapshot.teamId)!.name;
      const table = await ui.readTeamTable(teamName);
      const historicRows = historicRuns
        .filter((historic) => historic.teamId === snapshot.teamId)
        .flatMap((historic) => historic.snapshotJson);
      const computed = computeLautecReconcileTeamPlan({
        table,
        expectedRows: snapshot.rows,
        historicRows,
      });
      plans.push({
        teamId: snapshot.teamId,
        teamName,
        headers: table.headers,
        scannedRows: table.rows.filter((row) => row.join("").trim() !== ""),
        keeps: computed.keeps,
        deletions: computed.deletions,
        unattributed: computed.unattributed,
        missingRows: computed.missingRows,
        snapshotHash: snapshot.snapshotHash,
      });
    }
    await ui.close();
    ui = null;

    await db.update(dprLautecReconcileRunsTable)
      .set({ planJson: plans, status: "awaiting_approval" })
      .where(and(
        eq(dprLautecReconcileRunsTable.id, reconcileId),
        eq(dprLautecReconcileRunsTable.status, "scanning"),
      ));
    await logReconcile(run, "lautec_reconcile_scanned", `Lautec cleanup #${reconcileId} scanned ${plans.length} team(s) for ${run.date}; awaiting approval.`);
  } catch (error) {
    const detail = safeMessage(error);
    await db.update(dprLautecReconcileRunsTable)
      .set({ status: "failed", errorDetail: detail, finishedAt: new Date() })
      .where(and(
        eq(dprLautecReconcileRunsTable.id, reconcileId),
        eq(dprLautecReconcileRunsTable.status, "scanning"),
      ));
    await logReconcile(run, "lautec_reconcile_failed", `Lautec cleanup #${reconcileId} scan failed: ${detail}`);
    logger.warn({ reconcileId, error: detail }, "Lautec reconcile scan failed");
  } finally {
    await ui?.close().catch(() => undefined);
  }
}

export async function executeLautecReconcileApply(reconcileId: number): Promise<void> {
  const [run] = await db.select().from(dprLautecReconcileRunsTable)
    .where(eq(dprLautecReconcileRunsTable.id, reconcileId));
  if (!run || run.status !== "applying") return;

  let ui: LautecReconcileUi | null = null;
  let savingBegan = false;
  try {
    // The plan was computed against the sheet at scan time. Refuse to delete
    // anything if the sheet changed since: what counts as a "keep" may differ.
    const snapshots = await getLautecSourceSnapshotsForDate(run.date);
    const snapshotByTeam = new Map(snapshots.map((snapshot) => [snapshot.teamId, snapshot]));
    for (const plan of run.planJson) {
      const current = snapshotByTeam.get(plan.teamId);
      if (!current || current.snapshotHash !== plan.snapshotHash) {
        throw new Error(`The Capture sheet changed for ${plan.teamName} after the scan. Nothing was deleted — run the scan again.`);
      }
    }

    const teamsWithDeletions = run.planJson.filter((plan) => plan.deletions.length > 0);
    const config = await getLautecBrowserConfig();
    ui = await createPuppeteerLautecUi(config);
    await ui.login(config.username, config.password);
    await ui.openDprDate(run.date, run.planJson[0].teamName);

    // Re-verify EVERY planned team against the scan — including teams with
    // nothing to delete, because the ledger reconciliation below treats their
    // table as verified ground truth. Any mismatch aborts the whole run with
    // zero rows deleted. Deletions are staged only after their team verifies;
    // nothing is persisted until the single Save Changes at the end.
    const applyTimeTables = new Map<number, LautecVisibleTableSnapshot>();
    for (const plan of run.planJson) {
      const table = await ui.readTeamTable(plan.teamName);
      if (!visibleTablesMatch(plan.headers, table.rows, plan.scannedRows)) {
        throw new Error(`Lautec's rows for ${plan.teamName} changed after the scan. Nothing was deleted — run the scan again.`);
      }
      applyTimeTables.set(plan.teamId, table);
      if (plan.deletions.length === 0) continue;
      for (const targetRow of plan.deletions) {
        await ui.deleteVisibleRow(targetRow);
      }
      const after = await ui.readTeamTable(plan.teamName);
      const expectedRemaining = visibleRowsMinus(plan.headers, plan.scannedRows, plan.deletions);
      if (!visibleTablesMatch(plan.headers, after.rows, expectedRemaining)) {
        throw new Error(`After staging deletions, ${plan.teamName} did not show exactly the expected remaining rows. Nothing was saved.`);
      }
    }

    if (teamsWithDeletions.length > 0) {
      // Checkpoint before the destructive Save: a lost confirmation after
      // this point may still have persisted the deletions.
      const updated = await db.update(dprLautecReconcileRunsTable)
        .set({ status: "saving" })
        .where(and(
          eq(dprLautecReconcileRunsTable.id, reconcileId),
          eq(dprLautecReconcileRunsTable.status, "applying"),
        ))
        .returning({ id: dprLautecReconcileRunsTable.id });
      if (updated.length !== 1) throw new Error("The Lautec cleanup run was no longer active before saving.");
      savingBegan = true;
      await ui.saveDprChanges();
      await ui.reloadDpr(teamsWithDeletions[0].teamName);
    }

    // Verified post-save readback per touched team; untouched teams keep the
    // table verified at apply time (moments ago, matching the scan) as ground
    // truth — the save changed nothing on their tabs.
    const finalTables = new Map<number, LautecVisibleTableSnapshot>();
    for (const plan of run.planJson) {
      if (plan.deletions.length === 0) {
        finalTables.set(plan.teamId, applyTimeTables.get(plan.teamId)!);
        continue;
      }
      const table = await ui.readTeamTable(plan.teamName);
      const expectedRemaining = visibleRowsMinus(plan.headers, plan.scannedRows, plan.deletions);
      if (!visibleTablesMatch(plan.headers, table.rows, expectedRemaining)) {
        throw new Error(`After saving, ${plan.teamName} did not show exactly the expected remaining rows. Check Lautec before running another cleanup or sync.`);
      }
      finalTables.set(plan.teamId, table);
    }
    await ui.close();
    ui = null;

    // Ledger reconciliation: runs whose rows are no longer in Lautec stop
    // counting toward the duplicate guard, and uncertain runs are resolved
    // using the verified readback as ground truth.
    const results: DprLautecReconcileTeamResult[] = [];
    for (const plan of run.planJson) {
      const finalTable = finalTables.get(plan.teamId)!;
      const teamRuns = await db.select().from(dprLautecImportRunsTable)
        .where(and(
          eq(dprLautecImportRunsTable.date, run.date),
          eq(dprLautecImportRunsTable.teamId, plan.teamId),
          inArray(dprLautecImportRunsTable.status, ["success", "uncertain"]),
        ));
      let runsMarkedRemoved = 0;
      let uncertainResolved = 0;
      for (const importRun of teamRuns) {
        const present = tableContainsSnapshotRows(finalTable, importRun.snapshotJson);
        if (importRun.status === "uncertain") {
          uncertainResolved += 1;
          await db.update(dprLautecImportRunsTable)
            .set(present
              ? {
                status: "success",
                errorDetail: `Lautec cleanup #${reconcileId} verified these rows are present in Lautec.`,
              }
              : {
                status: "failed",
                errorDetail: `Lautec cleanup #${reconcileId} verified these rows are NOT in Lautec; the submission never landed.`,
              })
            .where(and(
              eq(dprLautecImportRunsTable.id, importRun.id),
              eq(dprLautecImportRunsTable.status, "uncertain"),
            ));
          if (present) continue;
        }
        if (importRun.status === "success" && !present && importRun.rowsRemovedByReconcileId === null) {
          runsMarkedRemoved += 1;
          await db.update(dprLautecImportRunsTable)
            .set({ rowsRemovedByReconcileId: reconcileId })
            .where(eq(dprLautecImportRunsTable.id, importRun.id));
        }
      }
      results.push({
        teamId: plan.teamId,
        teamName: plan.teamName,
        deletedCount: plan.deletions.length,
        runsMarkedRemoved,
        uncertainResolved,
      });
    }

    await db.update(dprLautecReconcileRunsTable)
      .set({ resultJson: results, status: "success", finishedAt: new Date() })
      .where(and(
        eq(dprLautecReconcileRunsTable.id, reconcileId),
        inArray(dprLautecReconcileRunsTable.status, ["applying", "saving"]),
      ));
    const deletedTotal = results.reduce((sum, result) => sum + result.deletedCount, 0);
    await logReconcile(run, "lautec_reconcile_succeeded", `Lautec cleanup #${reconcileId} deleted ${deletedTotal} row(s) across ${results.filter((r) => r.deletedCount > 0).length} team(s) on ${run.date}.`);
  } catch (error) {
    const detail = safeMessage(error);
    const status = savingBegan ? "uncertain" : "failed";
    await db.update(dprLautecReconcileRunsTable)
      .set({
        status,
        errorDetail: savingBegan
          ? `Lautec may have saved the staged deletions, but the verified readback was not observed. Check Lautec, then run a fresh scan. ${detail}`
          : `Nothing was deleted in Lautec (the run aborted before Save Changes). ${detail}`,
        finishedAt: new Date(),
      })
      .where(and(
        eq(dprLautecReconcileRunsTable.id, reconcileId),
        inArray(dprLautecReconcileRunsTable.status, ["applying", "saving"]),
      ));
    await logReconcile(run, savingBegan ? "lautec_reconcile_uncertain" : "lautec_reconcile_failed", `Lautec cleanup #${reconcileId} ${savingBegan ? "requires Lautec verification" : `failed: ${detail}`}`);
    logger.warn({ reconcileId, error: detail }, "Lautec reconcile apply failed");
  } finally {
    await ui?.close().catch(() => undefined);
  }
}

export function dispatchLautecReconcileScan(reconcileId: number): void {
  const work = executeLautecReconcileScan(reconcileId);
  try {
    waitUntil(work);
  } catch {
    void work;
  }
}

export function dispatchLautecReconcileApply(reconcileId: number): void {
  const work = executeLautecReconcileApply(reconcileId);
  try {
    waitUntil(work);
  } catch {
    void work;
  }
}

const STALE_RECONCILE_AFTER_MS = 15 * 60 * 1000;

export async function interruptStaleLautecReconciles(): Promise<void> {
  const staleBefore = new Date(Date.now() - STALE_RECONCILE_AFTER_MS);
  // The apply phase starts at approval, not at the original scan — measuring
  // from startedAt would falsely interrupt any plan approved a while after
  // its scan while its browser is still working.
  const phaseStartedAt = sql`COALESCE(${dprLautecReconcileRunsTable.approvedAt}, ${dprLautecReconcileRunsTable.startedAt})`;
  const interrupted = await db.update(dprLautecReconcileRunsTable)
    .set({
      status: "interrupted",
      errorDetail: "The Lautec cleanup browser run exceeded its recovery window before saving; nothing was deleted. Run a fresh scan.",
      finishedAt: new Date(),
    })
    .where(and(
      inArray(dprLautecReconcileRunsTable.status, ["scanning", "applying"]),
      lte(phaseStartedAt, staleBefore),
    ))
    .returning({ id: dprLautecReconcileRunsTable.id });
  if (interrupted.length > 0) {
    logger.warn({ reconcileIds: interrupted.map((r) => r.id) }, "Marked stale Lautec reconciles as interrupted");
  }
  const uncertain = await db.update(dprLautecReconcileRunsTable)
    .set({
      status: "uncertain",
      errorDetail: "The Lautec cleanup browser run exceeded its recovery window after Save Changes may have begun. Check Lautec, then run a fresh scan.",
      finishedAt: new Date(),
    })
    .where(and(
      eq(dprLautecReconcileRunsTable.status, "saving"),
      lte(phaseStartedAt, staleBefore),
    ))
    .returning({ id: dprLautecReconcileRunsTable.id });
  if (uncertain.length > 0) {
    logger.warn({ reconcileIds: uncertain.map((r) => r.id) }, "Marked stale post-save Lautec reconciles as uncertain");
  }
}

/** True when a cleanup run is actively using the Lautec browser for a date. */
export async function lautecReconcileActiveForDate(date: string): Promise<number | null> {
  const [active] = await db.select({ id: dprLautecReconcileRunsTable.id })
    .from(dprLautecReconcileRunsTable)
    .where(and(
      eq(dprLautecReconcileRunsTable.date, date),
      inArray(dprLautecReconcileRunsTable.status, ["scanning", "applying", "saving"]),
    ));
  return active?.id ?? null;
}
