---
name: DPR JDR code has two genericComment columns
description: Two different genericComment columns exist in the DPR schema — don't confuse them when editing JDR codes or timesheet entries.
---

`dpr_jdr_codes.genericComment` — admin-managed reference data (part of the JDR code master list, edited via the jdr-mapping admin page). Always keep this; it's the source used to seed an entry's Billing/combined comment when a JDR code is selected.

`dpr_timesheet_entries.genericComment` — was a per-entry copy auto-filled from the JDR code's own field, never exposed as an editable UI field. Removed entirely (column dropped, API schema field removed) since it was redundant with `combinedComment` and had no independent purpose.

**Why:** the entry-level copy was dead weight — same value as the JDR code's own field, just duplicated at write time, with no user-facing edit path.

**How to apply:** when working on DPR Clarify/JDR-code features, always seed comments directly from the JDR code's own `genericComment` at select-time rather than reading/writing a stored per-entry copy.
