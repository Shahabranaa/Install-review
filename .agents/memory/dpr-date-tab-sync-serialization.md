---
name: DPR date-tab sync serialization
description: Prevent stale Google Sheets snapshots when Capture updates and manual sync overlap.
---

All automatic and manual DPR date-tab refreshes must go through one serialized queue. A mutation that arrives during a Google Sheets write must remain pending for a subsequent rebuild from the newer database snapshot. Managed date-tab values must use Google Sheets `RAW` parsing, and failed automatic rebuilds must retry with bounded backoff.

**Why:** Two overlapping clear-and-rewrite operations can finish out of order, leaving a date tab with stale rows even when both operations individually use the full database snapshot. User comments can begin with formula syntax, and a transient Sheets outage must not leave the mirror stale forever.

**How to apply:** Keep manual refreshes on the same awaited coordinator as mutation-triggered refreshes, retain dates queued while another rebuild is active, write Capture data with `RAW`, and keep regression coverage for ordering, literal formula-looking text, and retry recovery.

Capture-to-Clarify and completed-clarification stage transitions must start the serialized sync immediately rather than using the normal mutation debounce. The exported clarification marker remains affirmative after a row advances from the Clarify queue to completed history.

**Why:** These transitions directly change the operational `Is Clarified` signal; delaying them—or letting completion reset the marker—leaves the shared sheet misleading.

**How to apply:** Use the queue's immediate path for stage changes while keeping ordinary field edits coalesced, and keep coverage for both in-queue and completed clarification states.