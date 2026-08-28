import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useApplyDprLautecReconcile,
  useCancelDprLautecReconcile,
  useGetDprLautecReconcile,
  useGetLatestDprLautecReconcile,
  useStartDprLautecReconcile,
} from "@workspace/api-client-react";
import type { LautecReconcileRun, LautecReconcileTeamPlan } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, Eraser, Loader2, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";

function formatDateAsDmy(date: string): string {
  const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? `${iso[3]}-${iso[2]}-${iso[1]}` : date;
}

const ACTIVE_STATUSES = new Set(["scanning", "applying", "saving"]);

function reconcileErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const apiError = error as { data?: { error?: string }; message?: string };
    return apiError.data?.error ?? apiError.message ?? "The Lautec cleanup request failed.";
  }
  return "The Lautec cleanup request failed.";
}

/** Column indexes worth showing: named headers only (drops checkbox/menu columns). */
function displayColumns(headers: string[]): number[] {
  return headers
    .map((header, index) => ({ header: header.trim(), index }))
    .filter(({ header }) => header !== "")
    .map(({ index }) => index);
}

function RowsTable({ headers, rows, tone }: { headers: string[]; rows: string[][]; tone?: "delete" | "plain" }) {
  const columns = displayColumns(headers);
  return (
    <div className={cn("overflow-x-auto rounded-md border", tone === "delete" && "border-destructive/40")}>
      <Table>
        <TableHeader className="bg-muted">
          <TableRow>
            {columns.map((columnIndex) => (
              <TableHead key={columnIndex} className="whitespace-nowrap text-xs">{headers[columnIndex]}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow key={rowIndex} className={tone === "delete" ? "bg-destructive/5" : undefined}>
              {columns.map((columnIndex) => (
                <TableCell key={columnIndex} className="whitespace-nowrap text-xs">
                  {(row[columnIndex] ?? "").trim() || <span className="text-muted-foreground">—</span>}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TeamPlanCard({ plan }: { plan: LautecReconcileTeamPlan }) {
  const hasWork = plan.deletions.length > 0 || plan.unattributed.length > 0 || plan.missingRows.length > 0;
  return (
    <div className={cn("rounded-md border p-3 text-sm", !hasWork && "opacity-70")}> 
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          {plan.deletions.length > 0
            ? <Eraser className="h-4 w-4 shrink-0 text-destructive" />
            : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />}
          {plan.teamName}
          <Badge variant="outline">{plan.keeps.length} kept</Badge>
          {plan.deletions.length > 0 && (
            <Badge variant="destructive">{plan.deletions.length} to delete</Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {plan.deletions.length === 0 && plan.missingRows.length === 0 && "Already matches the sheet"}
          {plan.deletions.length === 0 && plan.missingRows.length > 0 && `${plan.missingRows.length} row${plan.missingRows.length === 1 ? "" : "s"} missing — add with a normal sync`}
          {plan.deletions.length > 0 && plan.missingRows.length > 0 && `${plan.missingRows.length} row${plan.missingRows.length === 1 ? "" : "s"} still missing after cleanup`}
        </span>
      </div>
      {plan.deletions.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-xs font-medium text-destructive">These rows will be deleted from Lautec:</p>
          <RowsTable headers={plan.headers} rows={plan.deletions} tone="delete" />
        </div>
      )}
      {plan.unattributed.length > 0 && (
        <div className="mt-2 space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
            <ShieldQuestion className="h-3.5 w-3.5 shrink-0" />
            {plan.unattributed.length} row{plan.unattributed.length === 1 ? "" : "s"} in Lautec did not come from this system. They will NOT be touched — review them by hand if they look wrong.
          </p>
          <RowsTable headers={plan.headers} rows={plan.unattributed} />
        </div>
      )}
    </div>
  );
}

export function LautecReconcileDialog({
  open,
  onOpenChange,
  date,
  onCleanupFinished,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  /** Called once after a cleanup finishes successfully, so the sync preview can refresh. */
  onCleanupFinished: () => void;
}) {
  const [reconcileId, setReconcileId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const finishedNotifiedFor = useRef<number | null>(null);
  const queryClient = useQueryClient();

  // Seed the run query's cache with a mutation response so the dialog leaves
  // the approval screen immediately and polling resumes for active statuses.
  const seedRunCache = (updated: LautecReconcileRun) => {
    queryClient.setQueryData(["dpr", "lautec-reconcile-run", updated.id], updated);
  };

  const latestQuery = useGetLatestDprLautecReconcile(
    { date },
    { query: { queryKey: ["dpr", "lautec-reconcile-latest", date], enabled: open && reconcileId === null } },
  );
  const startMutation = useStartDprLautecReconcile();
  const applyMutation = useApplyDprLautecReconcile();
  const cancelMutation = useCancelDprLautecReconcile();

  const runQuery = useGetDprLautecReconcile(reconcileId ?? 0, {
    query: {
      queryKey: ["dpr", "lautec-reconcile-run", reconcileId ?? 0],
      enabled: open && reconcileId !== null,
      refetchInterval: (query) => {
        const status = (query.state.data as LautecReconcileRun | undefined)?.status;
        return status === undefined || ACTIVE_STATUSES.has(status) ? 2000 : false;
      },
      refetchOnWindowFocus: true,
    },
  });
  const run = reconcileId !== null ? runQuery.data : undefined;

  // Adopt an in-flight or awaiting-approval run for this date when reopening,
  // so a scan started earlier (or by a colleague) is never restarted blindly.
  useEffect(() => {
    if (!open || reconcileId !== null) return;
    const latest = latestQuery.data?.reconcile;
    if (latest && (ACTIVE_STATUSES.has(latest.status) || latest.status === "awaiting_approval")) {
      setReconcileId(latest.id);
    }
  }, [open, reconcileId, latestQuery.data]);

  useEffect(() => {
    if (!open) {
      setReconcileId(null);
      setError(null);
      setApproveOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (run?.status === "success" && finishedNotifiedFor.current !== run.id) {
      finishedNotifiedFor.current = run.id;
      onCleanupFinished();
    }
  }, [run, onCleanupFinished]);

  const startScan = () => {
    setError(null);
    setReconcileId(null);
    startMutation.mutate(
      { data: { date } },
      {
        onSuccess: (created) => setReconcileId(created.id),
        onError: (startError) => setError(reconcileErrorMessage(startError)),
      },
    );
  };

  const deletionTotal = run?.plan.reduce((sum, plan) => sum + plan.deletions.length, 0) ?? 0;
  const missingTotal = run?.plan.reduce((sum, plan) => sum + plan.missingRows.length, 0) ?? 0;
  const unattributedTotal = run?.plan.reduce((sum, plan) => sum + plan.unattributed.length, 0) ?? 0;
  const isBusy = startMutation.isPending || applyMutation.isPending || cancelMutation.isPending
    || (run !== undefined && ACTIVE_STATUSES.has(run.status));

  const applyPlan = () => {
    if (!run || run.approvalToken === null) return;
    setError(null);
    applyMutation.mutate(
      { reconcileId: run.id, data: { approvalToken: run.approvalToken } },
      {
        onSuccess: seedRunCache,
        onError: (applyError) => setError(reconcileErrorMessage(applyError)),
      },
    );
  };

  const cancelPlan = () => {
    if (!run) return;
    setError(null);
    cancelMutation.mutate(
      { reconcileId: run.id },
      {
        onSuccess: seedRunCache,
        onError: (cancelError) => setError(reconcileErrorMessage(cancelError)),
      },
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!next && isBusy && run?.status !== "awaiting_approval") return; onOpenChange(next); }}>
        <DialogContent className="max-w-[95vw] w-full sm:max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Clean up Lautec for {formatDateAsDmy(date)}</DialogTitle>
            <DialogDescription>
              Makes Lautec match the Capture sheet by deleting outdated or duplicate rows this system created earlier.
              Nothing is deleted until you approve the exact list. Rows typed into Lautec by hand are never touched.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
            )}

            {reconcileId === null && !startMutation.isPending && (
              <div className="rounded-md border p-4 text-sm text-muted-foreground space-y-2">
                <p>The cleanup runs in two steps:</p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li><span className="text-foreground font-medium">Scan (read-only):</span> opens Lautec and reads every team's rows for this date. Nothing is changed.</li>
                  <li><span className="text-foreground font-medium">Approve &amp; delete:</span> you see the exact rows that will be deleted and must approve them before anything happens.</li>
                </ol>
                <p>After the cleanup, use the normal "Sync to Lautec" to add any rows that are missing.</p>
              </div>
            )}

            {(startMutation.isPending || run?.status === "scanning") && (
              <div className="flex flex-1 min-h-[160px] items-center justify-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                Scanning Lautec (read-only) — reading every team's rows for this date…
              </div>
            )}

            {run?.status === "awaiting_approval" && (
              <>
                <div className={cn(
                  "rounded-md border p-3 text-sm",
                  deletionTotal > 0 ? "border-destructive/40 bg-destructive/5" : "border-emerald-500/30 bg-emerald-500/5",
                )}>
                  {deletionTotal > 0 ? (
                    <p>
                      <span className="font-medium text-destructive">{deletionTotal} row{deletionTotal === 1 ? "" : "s"} will be deleted from Lautec.</span>{" "}
                      Only rows this system created earlier — now outdated or duplicated — are on the list.
                      {missingTotal > 0 && <> After the cleanup, run a normal sync to add the {missingTotal} missing row{missingTotal === 1 ? "" : "s"}.</>}
                    </p>
                  ) : (
                    <p>
                      Nothing to delete — Lautec already matches the sheet for every scanned team.
                      {missingTotal > 0 && <> {missingTotal} row{missingTotal === 1 ? "" : "s"} are missing; add them with a normal "Sync to Lautec".</>}
                    </p>
                  )}
                  {unattributedTotal > 0 && (
                    <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                      {unattributedTotal} row{unattributedTotal === 1 ? "" : "s"} not created by this system were found and will be left untouched (highlighted below).
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  {run.plan.map((plan) => <TeamPlanCard key={plan.teamId} plan={plan} />)}
                </div>
              </>
            )}

            {(run?.status === "applying" || run?.status === "saving") && (
              <div className="flex flex-1 min-h-[160px] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {run.status === "applying"
                    ? "Deleting the approved rows in Lautec (nothing is saved until the final step)…"
                    : "Saving the changes in Lautec and verifying the result…"}
                </div>
                <p className="text-xs">Leave this open. Do not start a sync while the cleanup is running.</p>
              </div>
            )}

            {run?.status === "success" && (
              <div className="space-y-3">
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Cleanup complete — Lautec was verified after saving.
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {run.result.map((teamResult) => (
                      <li key={teamResult.teamId}>
                        {teamResult.teamName}: {teamResult.deletedCount} row{teamResult.deletedCount === 1 ? "" : "s"} deleted
                        {teamResult.uncertainResolved > 0 && <>, {teamResult.uncertainResolved} earlier unverified send{teamResult.uncertainResolved === 1 ? "" : "s"} resolved</>}
                      </li>
                    ))}
                  </ul>
                </div>
                {missingTotal > 0 && (
                  <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
                    {missingTotal} row{missingTotal === 1 ? " is" : "s are"} still missing in Lautec. Close this and use
                    {" "}<span className="font-medium">Sync to Lautec</span> to add {missingTotal === 1 ? "it" : "them"}.
                  </div>
                )}
              </div>
            )}

            {(run?.status === "failed" || run?.status === "interrupted" || run?.status === "cancelled" || run?.status === "uncertain") && (
              <div className={cn(
                "rounded-md border p-3 text-sm",
                run.status === "uncertain" ? "border-amber-500/40 bg-amber-500/10" : "border-destructive/40 bg-destructive/5",
              )}>
                <p className="flex items-center gap-2 font-medium">
                  <AlertTriangle className={cn("h-4 w-4", run.status === "uncertain" ? "text-amber-600" : "text-destructive")} />
                  {run.status === "cancelled" && "Cleanup plan cancelled — nothing was deleted."}
                  {run.status === "failed" && "Cleanup stopped — nothing was saved in Lautec."}
                  {run.status === "interrupted" && "Cleanup was interrupted — nothing was saved in Lautec."}
                  {run.status === "uncertain" && "Cleanup result could not be verified."}
                </p>
                {run.errorDetail && <p className="mt-1 text-xs">{run.errorDetail}</p>}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isBusy && run?.status !== "awaiting_approval"}
            >
              Close
            </Button>
            {reconcileId === null && (
              <Button onClick={startScan} disabled={startMutation.isPending || latestQuery.isLoading} className="gap-2">
                {startMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eraser className="w-4 h-4" />}
                Scan Lautec (read-only)
              </Button>
            )}
            {run?.status === "awaiting_approval" && (
              <>
                <Button variant="ghost" onClick={cancelPlan} disabled={cancelMutation.isPending}>
                  Discard plan
                </Button>
                {deletionTotal > 0 && (
                  <Button
                    variant="destructive"
                    className="gap-2"
                    onClick={() => setApproveOpen(true)}
                    disabled={applyMutation.isPending}
                  >
                    {applyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eraser className="w-4 h-4" />}
                    Delete {deletionTotal} row{deletionTotal === 1 ? "" : "s"}…
                  </Button>
                )}
              </>
            )}
            {(run?.status === "failed" || run?.status === "interrupted" || run?.status === "cancelled" || run?.status === "uncertain") && (
              <Button onClick={startScan} disabled={startMutation.isPending} className="gap-2">
                {startMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eraser className="w-4 h-4" />}
                Scan again
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deletionTotal} row{deletionTotal === 1 ? "" : "s"} from Lautec?</AlertDialogTitle>
            <AlertDialogDescription>
              Exactly the rows listed in the plan will be deleted — no others. Before saving, every team's table is
              re-checked against the scan; if anything changed in the meantime, the whole cleanup stops and nothing is
              deleted. This cannot be undone from here once saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep everything</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setApproveOpen(false); applyPlan(); }}
            >
              Yes, delete {deletionTotal} row{deletionTotal === 1 ? "" : "s"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
