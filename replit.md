# Workspace

## Overview

pnpm workspace monorepo using TypeScript. This project contains two frontend web apps + a shared API server + database.

## Apps

### Image Review (`artifacts/image-review`) — served at `/`
Installation Image Review Platform. A web app for reviewing installation photos: project/site/location/phase management, image approval/rejection, issue flagging, field reports, and compliance tracking. Uses auth (session-based) with username/password login.

### Workforce Compliance (`artifacts/workforce`) — served at `/workforce/`
Workforce compliance management app: worker profiles, certifications, mob sites, site assignments, and compliance reporting.

### API Server (`artifacts/api-server`) — served at `/api`
Express 5 backend serving both frontend apps. Includes auth (bcrypt + express-session), Google Sheets/Drive integration, Wasabi S3 integration, PDF generation, and comprehensive REST API.

**Default admin credentials**: username=`admin`, password=`admin123`

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **Frontend**: React + Vite + Tailwind CSS v4 + shadcn/ui + wouter (routing)
- **Backend**: Express 5 + pino logging
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (API server), Vite (frontend)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Database Schema (Key Tables)

- `users` — auth users with access levels (admin/reviewer/viewer)
- `projects`, `sites`, `locations`, `towers`, `strings` — project hierarchy
- `phases` — installation phases per location
- `images`, `sheet_photos` — image records and Google Sheets photo sync
- `issues` — image issue flags
- `decisions` — review decisions (audit trail)
- `documents` — generated PDF documents
- `field_reports` — field report records
- `workers`, `certifications`, `workforce_roles`, `mob_sites`, `site_assignments` — workforce data
- `wasabi_mirror_tasks` — Wasabi S3 mirroring task queue
- `app_settings` — global application settings

## Environment Variables Required

- `NEON_DATABASE_URL` — Primary Neon PostgreSQL connection string (EU West 2 / London). Currently active.
- `DATABASE_URL` — Fallback PostgreSQL connection string (Replit local Helium DB, empty)
- Aurora IAM path (future): set `NEON_DATABASE_PGHOST`, `NEON_DATABASE_PGPORT`, `NEON_DATABASE_PGUSER`, `NEON_DATABASE_PGDATABASE`, `NEON_DATABASE_AWS_REGION`, `NEON_DATABASE_PGSSLMODE` — the server will automatically use IAM auth via `@aws-sdk/rds-signer` when `NEON_DATABASE_URL` is absent
- `SESSION_SECRET` — express-session secret
- `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY` — Google Sheets/Drive API
- `WASABI_ACCESS_KEY_ID`, `WASABI_SECRET_ACCESS_KEY`, `WASABI_BUCKET`, `WASABI_ENDPOINT` — Wasabi S3
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` — (optional) Google OAuth login

### DB Connection Priority (lib/db/src/index.ts + artifacts/api-server/src/app.ts)
1. `NEON_DATABASE_URL` present → Neon (current, EU West 2)
2. `NEON_DATABASE_PGHOST` present → Aurora IAM auth via RDS Signer (future)
3. `DATABASE_URL` present → connection string fallback
4. Error if none found

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Vercel Deployment

Vercel is the production hosting target. Key files:

- `vercel.json` — build command, output directory, rewrite rules, function config
- `scripts/build.sh` — full production build (API server + both frontends; copies workforce into image-review dist)
- `api/index.mjs` — Vercel serverless function entry point (re-exports Express app from `artifacts/api-server/dist/app.mjs`)

Build output structure (all under `artifacts/image-review/dist/public/`):
- `/` → image-review SPA
- `/workforce/` → workforce SPA (built with `BASE_PATH=/workforce/`, then copied in)
- `/api` → Vercel serverless function (served from `api/index.mjs`)

To deploy: push to the connected Git branch; Vercel auto-builds using `scripts/build.sh`.
