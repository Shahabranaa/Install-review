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
- 177 towers with GPS coordinates and progress status (T2G07 OSP is also position 1 on string B02, counted as a tower)
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
- Photos from sheet: `GET /api/photos/sheet`, `GET /api/photos/resolve/:photoId`, `GET /api/photos/db/:photoId`, `PATCH /api/photos/db/:photoId`, `POST /api/photos/cache-clear`

### Google Sheets / Drive Photo Integration
- Spreadsheet: `1qcr0jZEH7pwBmUlr6XS7YK4sa-Kqk2zvXFpBTJ5velw` — `Photo` tab (48 columns)
- Drive root: `CVOWSmartBuild-5695074` (ID: `1Fe5rOXrcgw1lJnYUC4c9jlZe2j5Ukp52`)
- Signature/drawing files: `Photo_Images/` (ID: `1xWO8A2fXJ7ztpzpt-iqUNg8Xjq6vX7a0`)
- Stamped photo uploads: `Photo_Images_2_Stamped_v2/` (ID: `18dMOuEuKFu_prnx9FW_FW1y2nFUebW6C`) → `{OSP}/{Tower}/{String}/filename`
- Global Drive search does NOT find files; must search within specific parent folder
- `sheet_photos` DB table stores all 48 spreadsheet columns + resolved `drive_file_id`
- Sheet cache TTL: 5 minutes; file ID cache: permanent per server lifetime

### Frontend Pages (image-review)
Dashboard, Projects, Strings, Towers, Phases, Images, Drive Photos, Google Drive, Documents, Settings

### New Files (CVOW task)
- `lib/db/src/schema/strings.ts` — stringsTable schema
- `lib/db/src/schema/towers.ts` — towersTable schema
- `artifacts/api-server/src/routes/strings.ts` — GET /strings, POST /strings, GET /strings/:id
- `artifacts/api-server/src/routes/towers.ts` — GET /towers (supports stringId + locationId filters), POST /towers, GET /towers/:id
- `artifacts/api-server/src/seed-cvow.ts` — TypeScript seed script (tsx; supports GOOGLE_DRIVE_ACCESS_TOKEN env fallback)
- `lib/api-client-react/src/generated/strings-towers.ts` — React Query hooks for strings/towers
- `artifacts/image-review/src/pages/strings.tsx` — Strings browse page (grouped by OSP)
- `artifacts/image-review/src/pages/towers.tsx` — Towers browse page with OSP/string filter and search
