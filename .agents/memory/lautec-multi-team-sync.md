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

## Confirmation token (stale-bundle guard)

Real duplicates happened when a browser tab kept running a stale bundle (Vite HMR "Failed to reload capture.tsx" leaves the old code live) that still auto-ticked confirmations. Client-side fixes never reach a stale tab, so the server now requires re-send/uncertain confirmations to carry a `confirmationToken` minted by the matching preview: HMAC(SESSION_SECRET) over the snapshot hash + latest run id for the date/team. Missing/outdated token → 409 `stale_confirmation` before any run is created; an intervening run invalidates older tokens. Concurrent double-starts are blocked by the partial unique index `dpr_lautec_import_runs_one_active_team` (declared in migrate.mjs, not the Drizzle schema — reviewers reading only the schema will miss it).

**How to apply:** any new dangerous confirmation flag on Lautec endpoints must be preview-token-bound the same way; never trust a bare boolean from the client.
