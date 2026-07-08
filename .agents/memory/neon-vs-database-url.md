---
name: NEON_DATABASE_URL vs DATABASE_URL
description: This project has two DB connection secrets; app code prefers NEON_DATABASE_URL, so editing via psql "$DATABASE_URL" can silently target the wrong database.
---

Several places in this codebase (`lib/db/src/index.ts`, `lib/db/drizzle.config.ts`, `lib/db/migrate.mjs`, `artifacts/api-server/src/app.ts`) resolve the connection string as:

```
process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL
```

So whenever both secrets are present, the running app (and migrations) talk to `NEON_DATABASE_URL`, not the Replit-managed `DATABASE_URL`.

**Why:** Directly running `psql "$DATABASE_URL" -c "UPDATE ..."` to fix data (e.g. resetting a password hash) can succeed with no error, but silently write to a database the app never reads from — the app keeps showing old/unchanged data with no exception raised, which looks like a bug in unrelated code (e.g. login failing with correct credentials).

**How to apply:** Before any manual `psql` write intended to affect app-visible behavior, check `echo $NEON_DATABASE_URL` is set (existence only, never print the value) and target `psql "$NEON_DATABASE_URL"` first when both secrets exist. If a manual fix doesn't seem to take effect, verify which connection string actually resolves in the app code before assuming the write path was correct.
