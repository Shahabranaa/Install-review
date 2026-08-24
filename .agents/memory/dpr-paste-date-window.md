---
name: DPR paste date window
description: The business rule that limits pasted Capture rows to a DPR day and its overnight successor.
---

Pasted rows for a selected DPR date may use only that calendar date or the immediately following calendar date. The following date represents overnight work and must remain displayed under the selected DPR date through its shift-date assignment.

**Why:** A date from an unrelated day can otherwise be pasted into the wrong DPR, making the Capture display and downstream reporting misleading.

All user-facing and user-entered DPR dates use `DD-MM-YYYY`; API/database dates remain `YYYY-MM-DD`.

**Why:** The DPR team explicitly standardized on hyphen-separated dates to avoid ambiguity in pasted reports and date displays.

**How to apply:** Keep the two-day DPR validation and shift-date assignment together in normal pasted-row and bot-import paths. The DPR Excel upload is an exception: it imports only rows dated exactly on the selected DPR date. Parse and show `DD-MM-YYYY` in Capture, Clarify, and bot-import guidance; highlight invalid rows and prevent saving until corrected.