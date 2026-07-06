---
name: api-server dev workflow quirks
description: Non-obvious behaviors of the api-server dev workflow that affect testing new routes and admin/worker auth in this workspace.
---

## New Express routes may need an explicit workflow restart
The `artifacts/api-server` dev workflow runs `pnpm run build && pnpm run start` (esbuild bundle, not a live tsx watcher). Adding a new route handler to an existing router file is not guaranteed to be picked up automatically — a request to a brand-new route can 404 ("Cannot POST ...") even though the code is correct and other routes in the same file work fine.

**Why:** The dev command rebuilds the bundle on workflow start but does not necessarily hot-reload on every file save; a stale bundle can keep serving old route tables.

**How to apply:** If a newly-added endpoint returns "Cannot POST/GET ..." (Express's default 404) while sibling routes in the same file work, restart the `artifacts/api-server: API Server` workflow before debugging further — don't assume the route registration is broken.

## No default admin/worker credentials in dev DB
By default in this project's dev database, no worker has `portal_password_hash` set, and the admin user's password is a randomly-generated seed password only printed to stdout at server startup (`seedAdminUser` in `auth.ts`) — it is not recoverable from the DB or from retained logs after the fact.

**Why:** `seedAdminUser()` only seeds a fresh random bcrypt hash when no admin exists; it never re-logs the plaintext on subsequent restarts.

**How to apply:** To test authenticated admin/worker flows (curl or Playwright), generate a bcrypt hash locally (`bcryptjs`, cost 12, matching `auth.ts`) and `UPDATE users.password_hash` / `workers.portal_password_hash` directly via psql for a known test password, rather than trying to recover the seeded one.
