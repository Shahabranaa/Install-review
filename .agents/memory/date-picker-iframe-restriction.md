---
name: Date picker iframe restriction
description: Native date-picker invocation behaves differently in the embedded Replit preview.
---

Treat a programmatic native date picker as optional: a date field must remain usable through its visible typed entry control when the picker cannot be opened.

**Why:** In Replit’s cross-origin preview iframe, `HTMLInputElement.showPicker()` throws a `SecurityError`. Leaving that exception uncaught crashes the DPR frontend when a user clicks the calendar button.

**How to apply:** Guard programmatic picker calls with `try`/`catch` and return focus to the typed date field on failure. Keep the chosen text format independent of the browser’s native date-control locale.