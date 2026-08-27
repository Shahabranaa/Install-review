---
name: DPR Google Sheets exports
description: The approved integration approach and durable policies for exporting DPR Capture rows to Google Sheets.
---

Use the project's existing server-side Google Sheets service-account integration for DPR Capture exports. Do not replace it with, or add, a Replit Google Sheets connector.

**Why:** The user already maintains a Google Sheets API setup and explicitly declined the Replit connector flow.

**How to apply:** Keep credentials server-side, use the existing Sheets helper for any related read or write features, and obtain sheet sharing permissions through the established service-account setup.

Full reconciliations must cover the union of existing date-named tabs and effective dates in the database, not just currently selected dates, and full rebuilds are destructive administrative operations — gate them behind verified admin access and audit the actor.

**Why:** A tab can be missing, carry an older header, or retain stale rows, so partial rebuilds cannot repair the whole mirror; and a full rebuild rewrites the shared spreadsheet that other people rely on.

**How to apply:** Route complete rebuilds through the same serialized queue as automatic mutation syncs, preserve empty date tabs as header-only, and write with `RAW` values so user-entered comments are never interpreted as formulas.

Column policy: the original Lautec destination columns stay first and in order (with Team ID in its established position); newer DPR-only fields are appended after them, never inserted or reordered.

**Why:** The Lautec importer depends on the leading columns and the Team ID position; operations need the extra DPR fields visible in the same export without breaking that contract.
