---
name: Seed literals must match column nullability
description: A NOT NULL column with any NULL literal in its seed INSERT breaks migrate.mjs on a fresh DB, even though it silently passes on a dev DB where the seed step is already marked applied.
---

When writing a seed migration in `lib/db/migrate.mjs` (bulk `INSERT ... VALUES (...), (...), ...`), every literal value must satisfy the target column's nullability as declared in both the Drizzle schema and the migration's own `CREATE TABLE` DDL.

**Why:** Seed migrations are typically gated by a `check` query like `SELECT 1 FROM <table> LIMIT 1` — once any row exists, the migration is skipped forever on that DB. This means a NOT NULL violation in the seed SQL can go completely undetected in dev (because the table was already populated by an earlier, correct version of the insert) while still being a hard failure the first time the migration runs against a fresh database (new environment, CI, or another developer's DB). `pnpm migrate` succeeding locally is not proof the seed SQL is valid — it only proves the already-applied rows are valid.

**How to apply:** Before trusting a seed migration as complete, grep the INSERT literals for `NULL` and cross-check each NULL's column position against the DDL for that table — if the column is `NOT NULL`, replace the literal with an appropriate non-null default (e.g. `''` for optional text) instead of leaving `NULL` or loosening the constraint, unless nullability is a deliberate, reviewed schema choice. When in doubt, query already-seeded rows in that column to see what placeholder value the "real" data actually uses, and match it.
