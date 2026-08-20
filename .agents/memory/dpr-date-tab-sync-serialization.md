---
name: DPR date-tab sync serialization
description: Prevent stale Google Sheets snapshots when Capture updates and manual sync overlap.
---

All automatic and manual DPR date-tab refreshes must go through one serialized queue. A mutation that arrives during a Google Sheets write must remain pending for a subsequent rebuild from the newer database snapshot. Managed date-tab values must use Google Sheets `RAW` parsing, and failed automatic rebuilds must retry with bounded backoff.

**Why:** Two overlapping clear-and-rewrite operations can finish out of order, leaving a date tab with stale rows even when both operations individually use the full database snapshot. User comments can begin with formula syntax, and a transient Sheets outage must not leave the mirror stale forever.

**How to apply:** Keep manual refreshes on the same awaited coordinator as mutation-triggered refreshes, retain dates queued while another rebuild is active, write Capture data with `RAW`, and keep regression coverage for ordering, literal formula-looking text, and retry recovery.