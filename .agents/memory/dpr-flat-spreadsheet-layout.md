---
name: DPR flat spreadsheet layout
description: Visual rule for the Capture and Clarify timesheet grids.
---

Keep Capture and Clarify as flat, uninterrupted spreadsheet tables with the same compact geometry: 12px body cells, 11px headers, compact cell padding, and consistent row height. Do not add group divider rows, team/date total banners, or locked/clarified section headers between rows.

**Why:** The user explicitly prefers an Excel-like continuous grid over grouped summary cards, which interrupt scanning and make the two workflow stages feel inconsistent. Matching font and spacing makes Capture and Clarify feel like one workflow.

**How to apply:** Preserve useful filters and row actions, but put team, date, status, overnight context, and lock/clarify state inside each row or table column. Show a row’s calendar date in the time cell only when it differs from the selected page/DPR date. Use a compact Teams-button popover for multi-team filtering in copied-row review. Keep the copied-review dialog content-sized with a viewport max-height, not a fixed viewport height. Keep destination date, source date, copy action, and status together in one responsive toolbar while retaining explanatory copy in the dialog description/status tooltip. Use content-driven table sizing rather than fixed column widths so multi-part controls never overlap adjacent cells. Show totals in compact controls outside the row grid when needed.