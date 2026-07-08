---
name: New web artifact missing API proxy
description: New React+Vite web artifacts in this monorepo need an explicit dev-server proxy for /api, or all backend calls silently 404/fail.
---

When scaffolding a new React+Vite web artifact by hand (not via a script that copies an existing one), `vite.config.ts` must include a `server.proxy` block forwarding `/api` and `${basePrefix}/api` to `http://localhost:8080` (the shared api-server), matching the pattern in other artifacts (e.g. `artifacts/workforce/vite.config.ts`).

**Why:** Without it, the dev server has no proxy at all, so every `fetch("/api/...")` call from the frontend hits the Vite dev server itself and 404s — including login. This surfaces as a generic "Login failed" / network error in the UI even though `curl` against the api-server directly works fine, which is misleading since it looks like an auth or CORS bug rather than a missing proxy config.

**How to apply:** When creating a new artifact's `vite.config.ts` from scratch, diff it against a known-working artifact's config (e.g. workforce) to make sure the proxy rules are present before doing any auth/API testing.
