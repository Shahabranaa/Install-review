---
name: Date picker iframe restriction
description: Native date-picker invocation behaves differently in the embedded Replit preview.
---

Do not make the DPR calendar button depend on a programmatic native date picker. Use an app-owned calendar popover and keep the visible typed entry control as the format-safe fallback.

**Why:** In Replit’s cross-origin preview iframe, `HTMLInputElement.showPicker()` throws a `SecurityError`. Leaving that exception uncaught crashes the DPR frontend when a user clicks the calendar button.

**How to apply:** Prefer the shared calendar component in a popover for DPR date buttons. Keep date text as `DD-MM-YYYY` and convert only the selected value to internal `YYYY-MM-DD`; avoid exposing a visible native `input[type="date"]`.