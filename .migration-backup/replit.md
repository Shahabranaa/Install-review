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

## Replit Setup

### Workflows
- **Start application** — React/Vite frontend on `PORT=5000` (`cd artifacts/image-review && PORT=5000 pnpm run dev`)
- **API Server** — Express backend on `PORT=8080` (`cd artifacts/api-server && PORT=8080 pnpm run dev`)

### Required Secrets
- `NEON_DATABASE_URL` — Neon PostgreSQL connection string (preferred; falls back to `DATABASE_URL`)
- `SESSION_SECRET` — Express session secret

### Optional Secrets (for full feature access)
- `GOOGLE_DRIVE_CLIENT_EMAIL` + `GOOGLE_DRIVE_PRIVATE_KEY` — Google Drive/Sheets service account
- `WASABI_ACCESS_KEY_ID`, `WASABI_SECRET_ACCESS_KEY`, `WASABI_BUCKET_NAME`, `WASABI_REGION` — Wasabi object storage

### Database Setup
Run `pnpm --filter @workspace/db run push` to apply schema to a fresh database.

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
- Handover packs: `POST /api/documents/generate-handover`, `GET /api/documents/handover`

### Handover Package Generator (Task #4)
- `POST /api/documents/generate-handover` — generates a PDF pack for a string (all approved photos + field reports), uploads to Wasabi under `[Output] Handover Packs/{string}/{string}-{date}.pdf`, records in DB
- `GET /api/documents/handover` — lists all handover packs (packType='handover' rows from documents table)
- PDF rendered with pdfkit (externalized in esbuild build.mjs); includes cover page, photo manifest table, reports section
- `documents` table extended: `phase_id` is now nullable; added `pack_type`, `string_name`, `wasabi_key`, `photo_count`, `report_count`
- "Generate Handover Pack" button visible on Towers page when a string is selected
- "Handover Packs" nav item added to sidebar → `/documents`
- Key files: `artifacts/api-server/src/lib/pdf-handover.ts`, `artifacts/api-server/src/routes/documents.ts`

### Google Sheets / Drive Photo Integration
- Spreadsheet: `1qcr0jZEH7pwBmUlr6XS7YK4sa-Kqk2zvXFpBTJ5velw` — `Photo` tab (48 columns)
- Drive root: `CVOWSmartBuild-5695074` (ID: `1Fe5rOXrcgw1lJnYUC4c9jlZe2j5Ukp52`)
- Signature/drawing files: `Photo_Images/` (ID: `1xWO8A2fXJ7ztpzpt-iqUNg8Xjq6vX7a0`)
- Stamped photo uploads: `Photo_Images_2_Stamped_v2/` (ID: `18dMOuEuKFu_prnx9FW_FW1y2nFUebW6C`) → `{OSP}/{Tower}/{String}/filename`
- Global Drive search does NOT find files; must search within specific parent folder
- `sheet_photos` DB table stores all 48 spreadsheet columns + resolved `drive_file_id`
- Sheet cache TTL: 5 minutes; file ID cache: permanent per server lifetime

### Frontend Pages (image-review)
Dashboard, Projects, Strings, Towers, Phases, Images, Drive Photos, Google Drive, Documents, Reports, Field Reports, Settings

### Manual Field Reports (in-app authoring)
- `GET /api/field-reports/templates` — returns the template registry (10 templates: As-Found, As-Left, Pull-in Preparation, Cable Pull-in, Temporary/Permanent Hang Off, Termination Activities L1/L2/L3, Termination Completion, FO Termination, ICCP, Completion Check)
- `GET /api/field-reports`, `GET/PATCH/DELETE /api/field-reports/:id`, `POST /api/field-reports`, `POST /api/field-reports/:id/finalize`, `GET /api/field-reports/:id/pdf`
- `field_reports` table stores drafts (`status='draft'`); finalize renders PDF (PDFKit), uploads to Wasabi at `[Output] Field Reports/{osp}/{string}[/{cable}]/<filename>.pdf`, and inserts a `wasabi_mirror_tasks` row (`drive_file_id='manual:<id>'`, `status='done'`) so the file appears in `/api/reports` and is automatically pulled into Handover Packs.
- `field_reports.images` (jsonb, default `{}`) stores per-slot image metadata keyed by Required Image index: `{ wasabiKey, contentType, originalName, size, uploadedAt }`. Files live alongside the PDF at `[Output] Field Reports/{osp}/{string}[/{cable}]/_images/{reportId}-{index}-img-{index}.{ext}`.
- Image upload routes: `POST/GET/DELETE /api/field-reports/:id/images/:index` (`field-report-images.ts`). 12 MB cap, jpeg/png/webp/gif only. Mutating endpoints return `409` once the report is finalized. PDF generation embeds each slot image in a 2-column grid with caption beneath.
- UI: `/field-reports` (list, draft/finalized badges) and `/field-reports/new` + `/field-reports/:id/edit` (template-driven dynamic form). Sidebar entry `Field Reports` (ClipboardEdit icon) sits next to Reports.
- Templates capture: header fields, optional document references, optional per-phase serial number tables (Termination Activities/Completion), Yes/No/N-A + comments checklists, optional numeric fields (Cable Pull-in tensions/times), required-image captions, and remarks.
- Key files: `lib/db/src/schema/field-reports.ts`, `artifacts/api-server/src/lib/report-templates.ts`, `artifacts/api-server/src/lib/pdf-field-report.ts`, `artifacts/api-server/src/routes/field-reports.ts`, `artifacts/api-server/src/routes/field-report-images.ts`, `artifacts/image-review/src/pages/field-reports/{index,edit}.tsx`

## Project: Workforce Compliance Manager (`/workforce/`)

Separate React/Vite artifact at `artifacts/workforce/` (port 21728), served under `/workforce/`.

### Pages
- **Dashboard** — stat cards (total/ready/expiring/non-compliant/unassigned) + expiring-in-30-days table + cert issues table
- **Workers** — searchable/filterable table; add worker dialog (admin only); links to profile
- **Worker Profile** — details, certifications with VALID/EXPIRING_SOON/EXPIRED/NOT_VERIFIED/MISSING badges, site assignments; add/remove certs (admin)
- **Certifications** — cert catalogue with holder count; create/edit/delete (admin)
- **Sites** — site cards with location; create/edit/deactivate (admin); compliance button
- **Site Compliance** — select a site, see all assigned workers' status sorted by severity (NOT_COMPLIANT → READY); expandable cert details per worker
- **Roles** — role list with worker count and required certs; create/edit/delete (admin)

### Key Files
- `artifacts/workforce/src/App.tsx` — routing (wouter), auth guard, `QueryClient`
- `artifacts/workforce/src/contexts/AuthContext.tsx` — auth state, login/logout/refresh
- `artifacts/workforce/src/lib/api.ts` — `apiFetch` / `apiPost` / `apiPatch` / `apiDelete` helpers
- `artifacts/workforce/src/components/layout/sidebar.tsx` — sidebar nav
- `artifacts/workforce/src/pages/` — all 7 pages

### API Endpoints (api-server)
- Workers: `GET/POST /api/workforce/workers`, `GET/PATCH /api/workforce/workers/:id`, `POST/DELETE /api/workforce/workers/:id/certifications`
- Roles: `GET/POST /api/workforce/roles`, `PATCH/DELETE /api/workforce/roles/:id`
- Sites: `GET/POST /api/workforce/sites`, `PATCH /api/workforce/sites/:id`
- Certifications: `GET/POST /api/workforce/certifications`, `PATCH/DELETE /api/workforce/certifications/:id`
- Compliance: `GET /api/workforce/compliance/site/:siteId`, `GET /api/workforce/compliance/worker/:workerId`
- Dashboard: `GET /api/workforce/dashboard`

### Progress Tracking (`/progress` on image-review)
- 4 DB tables: `installation_tasks`, `campaigns`, `location_task_progress`, `task_progress_updates`
- Sync endpoint: `POST /api/progress/sync` (upserts from Google Sheets)
- Frontend page: `artifacts/image-review/src/pages/progress.tsx`

### New Files (CVOW task)
- `lib/db/src/schema/strings.ts` — stringsTable schema
- `lib/db/src/schema/towers.ts` — towersTable schema
- `artifacts/api-server/src/routes/strings.ts` — GET /strings, POST /strings, GET /strings/:id
- `artifacts/api-server/src/routes/towers.ts` — GET /towers (supports stringId + locationId filters), POST /towers, GET /towers/:id
- `artifacts/api-server/src/seed-cvow.ts` — TypeScript seed script (tsx; supports GOOGLE_DRIVE_ACCESS_TOKEN env fallback)
- `lib/api-client-react/src/generated/strings-towers.ts` — React Query hooks for strings/towers
- `artifacts/image-review/src/pages/strings.tsx` — Strings browse page (grouped by OSP)
- `artifacts/image-review/src/pages/towers.tsx` — Towers browse page with OSP/string filter and search
