---
name: DPR Google Sheets exports
description: The approved integration approach for exporting DPR Capture rows to Google Sheets.
---

Use the project's existing server-side Google Sheets service-account integration for DPR Capture exports. Do not replace it with, or add, a Replit Google Sheets connector.

**Why:** The user already maintains a Google Sheets API setup and explicitly declined the Replit connector flow.

**How to apply:** Keep credentials server-side, use the existing Sheets helper for any related read or write features, and obtain sheet sharing permissions through the established service-account setup.