---
name: Lautec cleanup (reconcile) feature
description: Design invariants for the scan → approve → delete flow that makes Lautec match the Capture sheet.
---

# Lautec cleanup (reconcile)

Because Lautec imports only ever ADD rows, a separate reconcile flow deletes outdated/duplicate rows. Core invariants — keep these when touching any of it:

- **Two phases.** Scan is read-only (login → per-team table readback → plan → `awaiting_approval`). Apply requires an HMAC approval token (SESSION_SECRET, bound to run id + sha256 of the stored plan JSON), so the operator approves the exact reviewed plan.
- **Attribution safety.** Expected sheet rows are claimed first as keeps (multiset, one visible row per expected row); leftovers matching any historic import-run snapshot become deletions; everything else is `unattributed` and NEVER touched. Blank/absent PAX in a snapshot matches only a blank or `*` cell, so legacy pre-PAX rows attribute correctly.
- **Verify everything at apply time.** Every planned team — including zero-deletion teams — is re-read and must match the scan exactly before any deletion is staged, because the post-apply ledger reconciliation treats those tables as verified ground truth. Any mismatch aborts the whole run before Save; browser closes without saving → nothing persisted.
- **Ledger after success.** Success runs whose snapshot rows are gone from the final table get `rows_removed_by_reconcile_id` set; preview-all `successHashes` and the start-import duplicate guard both filter on that column being NULL. Uncertain runs are resolved by verified content presence.
- **Mutual exclusion is insert-then-recheck.** One active reconcile globally (partial unique index on `((true))` WHERE status in scanning/applying/saving). Import↔reconcile exclusion per date is racy if done as check-then-insert; both sides insert their ledger row first, then re-check the other and back out (delete row / revert to awaiting_approval) — nothing is dispatched before that re-check.
- **Staleness uses the phase start.** The 15-min stale-interrupt window measures from `COALESCE(approvedAt, startedAt)` — measuring from scan start falsely interrupts any plan approved later than 15 min after its scan.
- **Client polling.** The dialog polls only for active statuses; `awaiting_approval` does not poll, so apply/cancel mutations must seed the run query cache with their response or the UI sticks on the approval screen.
- Reconcile never adds rows; after a successful cleanup the user runs the normal sync to add missing rows.
