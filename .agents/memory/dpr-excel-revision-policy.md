---
name: DPR Excel revision policy
description: The confirmed policy for filtering historical revisions during DPR workbook imports.
---

Only import DPRExport rows whose `Is Current Revision` value is `Y`; exclude `N` rows and fail the upload for any other non-empty marker. From those current rows, keep only records dated exactly on the selected DPR date; exclude all other workbook dates.

**Why:** Importing historical revisions can duplicate or supersede the latest timesheet record, and an uploaded workbook can contain several reporting days. The confirmed choice is to import only the current revision for the DPR currently being captured.

**How to apply:** Preserve both filters whenever the DPR Excel import changes, make excluded-row counts visible during review, and reject edits that move an Excel row away from the selected DPR date. The normal pasted-row flow may still accept the following overnight date.