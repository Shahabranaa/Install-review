---
name: DPR timesheet entry stage lifecycle
description: How the three-stage draft/captured/clarified pipeline maps to the Capture and Clarify pages in the DPR Timesheets app.
---

The `dpr_timesheet_entries.stage` column has three values: `draft`, `captured`, `clarified`.

- **draft**: newly entered rows on the Capture page. Default stage for all new entries.
- **captured**: rows the user has explicitly approved/locked from Capture. These appear in the Clarify page's pending queue.
- **clarified**: rows that have been fully clarified (JDR-coded) on the Clarify page.

**Why:** Originally there were only two stages (`captured`, `clarified`), and Clarify's queue simply showed everything not yet clarified — meaning every row typed into Capture immediately appeared in Clarify with no explicit handoff. A three-stage pipeline was introduced so Capture can group rows by team and require an explicit "Approve"/"Lock" action (per-row or per-team-block) before a row leaves Capture and becomes visible in Clarify.

**How to apply:** Capture page queries/filters on `stage: "draft"`. The Approve action is just a PATCH updating `stage` to `"captured"` (no other field changes) — reuse the existing `useUpdateDprTimesheetEntry` mutation instead of adding new endpoints. Clarify's queue/history filtering by `captured`/`clarified` needs no changes. The `/dpr/timesheet-entries/summary` endpoint's `capturedCount` field counts `draft` rows (badge for Capture nav) and `clarifiedCount` counts `captured` rows (badge for Clarify nav) — these field names are now slightly misleading relative to their DB-stage meaning, kept as-is to avoid an API contract change.
