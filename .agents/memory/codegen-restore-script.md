---
name: Codegen restore-handwritten.mjs pattern
description: How hand-written Zod schemas survive orval --clean codegens; where to add new ones.
---

## Rule
`lib/api-spec/restore-handwritten.mjs` contains a **hardcoded string literal** (`extraContent`) that it writes to `lib/api-zod/src/generated/extra.ts` whenever that file doesn't exist (i.e. after every codegen wipe).

Editing `extra.ts` directly is NOT enough — the next `pnpm run codegen` will overwrite it from the hardcoded template.

**To add a permanent hand-written Zod schema:**
1. Add it to the `extraContent` template string inside `restore-handwritten.mjs` (around line 289, before the closing backtick).
2. Re-run `cd lib/api-spec && pnpm run codegen` to verify it survives.

**Why:** orval uses `clean: true` which deletes the entire generated output directory before regenerating. The restore script re-creates `extra.ts` only if it's absent, using the hardcoded content — not by reading whatever was there before.

## Schemas currently in extra.ts (hand-written)
- Issues: `ResolveIssueBody`
- Strings/Towers: list/get params and responses
- DPR date summary: `GetDprDateSummaryResponse`
- DPR lock: `LockDprTimesheetEntriesBody`, `LockDprTimesheetEntriesResponse`
- DPR team-date exceptions: `DprTeamDateException`, `GetDprTeamDateExceptionsQueryParams`, `GetDprTeamDateExceptionsResponse`, `CreateDprTeamDateExceptionBody`, `DeleteDprTeamDateExceptionParams`
