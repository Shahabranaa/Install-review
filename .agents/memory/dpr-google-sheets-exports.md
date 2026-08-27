---
name: DPR Google Sheets exports
description: The approved integration approach for exporting DPR Capture rows to Google Sheets.
---

Use the project's existing server-side Google Sheets service-account integration for DPR Capture exports. Do not replace it with, or add, a Replit Google Sheets connector.

**Why:** The user already maintains a Google Sheets API setup and explicitly declined the Replit connector flow.

**How to apply:** Keep credentials server-side, use the existing Sheets helper for any related read or write features, and obtain sheet sharing permissions through the established service-account setup.

Full reconciliations must include the union of existing date-named tabs and
effective dates in the database, clearing and rewriting the managed `A:G`
range with the current header and rows.

**Why:** A tab can be missing, have an older header without Team ID, or retain
rows after the database source changes. Rebuilding only currently selected
dates cannot repair the entire mirror.

**How to apply:** Route a complete rebuild through the same serialized queue
as automatic mutation syncs. Preserve date tabs with no current rows as
header-only tabs, and use `RAW` values so user-entered comments are never
interpreted as formulas.

The Google Sheet keeps the original Lautec source columns first, then appends
PAX, the selected Clarify code, and Clarify notes. The Comment column remains
the final user-facing comment.

**Why:** The Lautec importer depends on the established leading columns and
Team ID position, while operations also need the newer DPR fields visible in
the same export.

**How to apply:** Keep the sheet schema in the exact order: Activity Group,
Activity, Location, Start, Finish, Comment, Team ID, PAX, Code, Notes. Export
the selected JDR work-activity label as Code and the generic Clarify comment as
Notes.