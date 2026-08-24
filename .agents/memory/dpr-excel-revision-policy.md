---
name: DPR Excel revision policy
description: The confirmed policy for filtering historical revisions during DPR workbook imports.
---

Only import DPRExport rows whose `Is Current Revision` value is `Y`; exclude `N` rows and fail the upload for any other non-empty marker.

**Why:** Importing historical revisions can duplicate or supersede the latest timesheet record. The confirmed choice is to import only the current revision.

**How to apply:** Preserve this filter whenever the DPR Excel import changes, and make excluded-row counts visible during review so users understand why the upload has fewer rows than the workbook.