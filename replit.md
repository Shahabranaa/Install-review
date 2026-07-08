# Install Review — Workforce & Installation Management System

A pnpm monorepo for managing worker certifications, site assignments, scheduling, compliance review, and field installation photo review for an industrial/construction contractor.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/workforce run dev` — admin/back-office web app
- `pnpm --filter @workspace/worker-portal run dev` — worker-facing web app
- `pnpm --filter @workspace/image-review run dev` — field photo review web app
- `pnpm --filter @workspace/worker-mobile run dev` — worker mobile app (Expo)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

**Hosting split:** Replit is used for **development only**. Production is hosted on **Vercel**. Do not suggest Replit's own publish/deploy flow for production — help with local dev/testing here, deployment happens on Vercel separately.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL (Neon) + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend web artifacts: React + Vite, Tailwind CSS, shadcn/ui (Radix), TanStack Query
- Mobile: Expo + Expo Router, React Native

## Where things live

- `artifacts/api-server` — central Express backend: auth, all REST APIs, AI-assisted OCR/document extraction (OpenAI/Azure), Wasabi object storage, SendGrid/Mailjet email, Google Drive/Sheets sync
- `artifacts/workforce` — admin web app: manage workers, roles, certifications, scheduling, site compliance
- `artifacts/worker-portal` — worker-facing web app: schedules, profile, certification uploads
- `artifacts/image-review` — admin web app for reviewing field installation photos, punch lists, project progress (Leaflet maps)
- `artifacts/worker-mobile` — Expo app, mobile equivalent of worker-portal for workers
- `standalone/admin-mobile` — **independent** Expo project (not a registered artifact, not part of the pnpm workspace, has its own pinned `package.json`). Admin-facing mobile app (login, dashboard, review queue, messages, worker lookup), built via EAS, talks to the deployed API server over HTTPS. Kept separate because only one Expo artifact slot exists and `worker-mobile` occupies it.
- `lib/db` — shared Drizzle schema, source of truth for all DB tables
- `lib/api-spec` — OpenAPI contract (source of truth for the API)
- `lib/api-client-react` — generated React Query hooks (via Orval) used by all frontend artifacts
- `lib/api-zod` — generated Zod schemas for runtime validation

## Architecture decisions

- Contract-first API: `lib/api-spec`'s OpenAPI definition drives both frontend client generation and backend validation, keeping the stack type-safe end to end.
- Centralized DB schema in `lib/db` — never define tables ad hoc per artifact; prevents schema drift.
- Auth has two account types sharing one login flow: `users` table (admin/staff, `access_level` field) and a separate workers table. `/api/auth/unified-login` authenticates both and returns a `type` field to distinguish them. Sessions are cookie-based.
- `standalone/admin-mobile` deliberately lives outside the pnpm workspace with pinned dependency versions (not `catalog:`/`workspace:*`) since it's built independently via EAS outside this monorepo's toolchain.

## Product

- **Admins** (workforce app + admin-mobile): manage the workforce roster, certifications/compliance, scheduling, review submitted field reports/photos, message workers.
- **Workers** (worker-portal + worker-mobile): view schedules, manage their profile, upload certifications, submit field/installation reports and photos.

## User preferences

- Replit is dev-only; Vercel is the production host. Don't propose Replit deployment for going live.
- Git workflow: repo is connected to GitHub (`github.com/Shahabranaa/Install-review`); prefer `git clone`/`git pull` over re-downloading zips for local dev syncs.

## Gotchas

- The default `admin` user's password is bcrypt-hashed and unrecoverable once set — it's either `ADMIN_SEED_PASSWORD` (if set as a secret) or a random value printed once to console on first seed. If lost, reset it directly in the DB rather than trying to recover it.
- `standalone/admin-mobile` needs `babel-preset-expo` in devDependencies and a valid `app.json` icon/splash config, or EAS builds fail.
- Google Sheets photo sync will log recurring warnings if its credentials aren't configured — this is expected/non-fatal in environments without that integration set up.

## Environment variables / secrets

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` / `NEON_DATABASE_URL` | api-server, lib/db | Postgres connection string (Neon-hosted) |
| `SESSION_SECRET` | api-server | Express session cookie signing key |
| `ADMIN_SEED_PASSWORD` | api-server | Password used when auto-seeding the default `admin` user in dev |
| `ALLOWED_ORIGINS` | api-server | CORS allowlist for frontend origins |
| `WASABI_ACCESS_KEY_ID` / `WASABI_SECRET_ACCESS_KEY` | api-server | Wasabi (S3-compatible) object storage credentials |
| `WASABI_BUCKET_NAME` / `WASABI_REGION` | api-server | Wasabi storage configuration |
| `GOOGLE_DRIVE_CLIENT_EMAIL` / `GOOGLE_DRIVE_PRIVATE_KEY` | api-server | Google service account for Drive/Sheets sync |
| `OPENAI_API_KEY` | api-server | OpenAI for document/OCR extraction |
| `OPENROUTER_API_KEY` | api-server | Alternate LLM provider |
| `AZURE_DOCUMENT_INTELLIGENCE_KEY` / `_ENDPOINT` | api-server | Azure Document Intelligence (OCR) |
| `SENDGRID_API_KEY` | api-server | Transactional email via SendGrid |
| `MAILJET_API_KEY` / `MAILJET_SECRET_KEY` | api-server | Transactional email via Mailjet |
| `EMAIL_FROM_ADDRESS` / `EMAIL_FROM_NAME` | api-server | Sender identity for automated emails |
| `WORKER_PORTAL_URL` | api-server | Base URL used when generating links in emails |
| `EXPO_PUBLIC_DOMAIN` | worker-mobile | Public API domain the mobile app connects to |
| `PHOTO_SYNC_INTERVAL_MS` | api-server | Frequency of background photo sync |
| `LOG_LEVEL` | api-server | Pino logger verbosity |
| `PORT` | all services | Local dev server bind port (Replit-assigned) |

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
