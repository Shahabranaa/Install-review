---
name: PostgreSQL rate limit store
description: Custom express-rate-limit Store backed by Neon, replacing in-memory default.
---

## Rule
The login rate limiter uses `PostgresRateLimitStore` (src/lib/rate-limit-store.ts) backed by Neon.
It creates `rate_limit_attempts` table via `init()` on first request.
`dbUrl` must be declared before the rate limiter block in `app.ts` — it's consumed at module load time.

**Why:** In-memory store resets on every cold start. Vercel serverless invocations each get their own process, so the counter was effectively 0 on every request.

**How to apply:** If rate limiting is added to new route groups, pass the same `rateLimitPool` + `PostgresRateLimitStore` so the fix applies there too.
