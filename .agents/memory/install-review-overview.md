---
name: Install Review project overview
description: Where the standing project doc lives, hosting split, and where to point future agents for full architecture context.
---

Install Review is a pnpm-monorepo Workforce & Installation Management System (worker certs, scheduling, compliance, field photo review). Full architecture, artifact list, and env var/secret table live in `replit.md` at the repo root — treat that as the source of truth, not this file.

**Hosting split:** Replit is dev-only. Production is hosted on Vercel.
**Why:** User's explicit deployment strategy — they deploy to Vercel themselves, separately from this workspace.
**How to apply:** Never suggest Replit's publish/deploy flow as the path to production for this project. Help with local dev, testing, and code changes here; leave the Vercel deploy step to the user.

If migrating this project to a new Replit account, re-import via the connected GitHub repo (`github.com/Shahabranaa/Install-review`) rather than recreating code from a prompt — secrets must be re-entered manually either way since they can't be exported.
