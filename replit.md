# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Project: Installation Image Review App

### Hierarchy
Projects → Sites → Locations (OSPs) → Strings → Towers → Phases → Images → Issues/Decisions/Documents

### CVOW Data
- Project: CVOW (Coastal Virginia Offshore Wind)
- 3 OSPs: T1L11, T2G07, T3G15
- 36 strings (A01–L03, 12 per OSP)
- 176 towers with GPS coordinates and progress status (177th location in source sheet is an OSP-type, correctly excluded)
- Google Sheets source: `1qcr0jZEH7pwBmUlr6XS7YK4sa-Kqk2zvXFpBTJ5velw`
- Seeded via `seed-cvow.ts` (TypeScript; run via tsx); data fetched from Google Sheets API using OAuth token from Replit Google Drive connector

### Auth
- Default admin: `admin` / `admin123` (seeded on server startup)
- Access levels: `admin` (full), `reviewer` (review submissions), `viewer` (read-only)

### API Routes (api-server)
- Standard CRUD: `/api/projects`, `/api/sites`, `/api/locations`, `/api/phases`, `/api/images`, `/api/issues`, `/api/decisions`, `/api/documents`, `/api/users`
- CVOW data: `GET /api/strings`, `GET /api/strings/:id`, `GET /api/towers`, `GET /api/towers/:id`
- Auth: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- Drive: `/api/drive/*`

### Frontend Pages (image-review)
Dashboard, Projects, Strings, Towers, Phases, Images, Google Drive, Documents, Settings

### New Files (CVOW task)
- `lib/db/src/schema/strings.ts` — stringsTable schema
- `lib/db/src/schema/towers.ts` — towersTable schema
- `artifacts/api-server/src/routes/strings.ts` — GET /strings, POST /strings, GET /strings/:id
- `artifacts/api-server/src/routes/towers.ts` — GET /towers (supports stringId + locationId filters), POST /towers, GET /towers/:id
- `artifacts/api-server/src/seed-cvow.ts` — TypeScript seed script (tsx; supports GOOGLE_DRIVE_ACCESS_TOKEN env fallback)
- `lib/api-client-react/src/generated/strings-towers.ts` — React Query hooks for strings/towers
- `artifacts/image-review/src/pages/strings.tsx` — Strings browse page (grouped by OSP)
- `artifacts/image-review/src/pages/towers.tsx` — Towers browse page with OSP/string filter and search
