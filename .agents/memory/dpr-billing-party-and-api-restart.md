---
name: DPR billing party field & api-server restart requirement
description: JDR vs Allstead classification lives on dpr_timesheet_entries; api-server must be restarted after schema/openapi changes to pick up new columns.
---

The `dpr_timesheet_entries.billing_party` column (`jdr` | `allstead`, nullable) is a standalone classification set at Capture — it is NOT derived from `contractual_code` (EWT/WDT/NWT/NWT(VO)) or `activity_type`. Treat it as independent client-facing metadata.

Clarify's Activity Type dropdown was removed per client request ("superseded" by JDR/Allstead); `activityTypeId` is now derived server-side from the selected Activity Group when saving a clarified entry, not chosen directly by the user.

**Why:** After adding a new drizzle column + regenerating the OpenAPI/orval client, the already-running `api-server` process kept using its old build and silently omitted the new field from responses (insert/select worked at the DB level, but the running Node process's cached schema/zod inference didn't include it) even though `tsc` and codegen succeeded.

**How to apply:** Any time you add/rename a column in `lib/db/src/schema`, after running the migration and `pnpm run codegen`, restart the `api-server` workflow before verifying via API calls — otherwise new fields will appear to "not save" even though the code is correct.
