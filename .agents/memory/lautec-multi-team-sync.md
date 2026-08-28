---
name: Lautec multi-team sync sequencing
description: Invariants for the all-teams Sync-to-Lautec flow on the Capture page.
---

The "Sync to Lautec" action previews every team with rows on the selected date (one sheet read via preview-all) and starts the existing per-team import runs **sequentially** from the frontend queue.

Rules:
- **One browser run at a time.** A failed start request is NOT proof the server rejected it — the run is dispatched before the 202 response. On an indeterminate start error (network / 5xx other than 503), reconcile against the run list (`GET /dpr/lautec-imports?date&teamId`) and adopt a freshly created run instead of advancing; if reconciliation itself fails, halt the whole sequence. Only definitive rejections (4xx, 503) may advance the queue.
- **Confirmations are per-team, collected up front, never auto-ticked.** Teams flagged `alreadyImported` or `uncertainPending` in preview-all are skipped unless the operator ticks their checkbox before starting; re-sending appends duplicate rows in Lautec.
- Each per-team run keeps all existing server guards (snapshot_changed, uncertain_submission, duplicate_completed_snapshot, one active run per date+team).

**Why:** a lost start response once risked two concurrent Puppeteer sessions appending rows; duplicates in Lautec can only be removed manually by the operator.
