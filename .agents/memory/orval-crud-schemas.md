---
name: Orval CRUD response schema reuse
description: Why a new POST endpoint's response schema may not generate a distinct Create*Response export
---

When adding a new `POST` endpoint to `lib/api-spec/openapi.yaml` whose response body `$ref`s the same component schema as an existing `GET`/`PATCH` endpoint for that resource (e.g. `DprActivityType`), orval's zod generator does not always emit a separate `Create<Resource>Response` export — it may only emit `Update<Resource>Response` (or whichever operation was defined first with that shape).

**Why:** orval names generated zod schemas after the first operation it encounters that produces a given shape, then reuses that schema for structurally identical responses rather than duplicating it.

**How to apply:** After running codegen for new CRUD routes, grep `lib/api-zod/src/generated/api.ts` for the actual exported names (e.g. `grep "export const.*<Resource>"`) instead of assuming `Create<Resource>Response` exists. Reuse whatever `Update<Resource>Response` (or similar) schema was generated for `.parse()` calls on the create route's response.
