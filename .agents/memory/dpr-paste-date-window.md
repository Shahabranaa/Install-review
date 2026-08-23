---
name: DPR paste date window
description: The business rule that limits pasted Capture rows to a DPR day and its overnight successor.
---

Pasted rows for a selected DPR date may use only that calendar date or the immediately following calendar date. The following date represents overnight work and must remain displayed under the selected DPR date through its shift-date assignment.

**Why:** A date from an unrelated day can otherwise be pasted into the wrong DPR, making the Capture display and downstream reporting misleading.

**How to apply:** Keep this validation and the shift-date assignment together in every DPR paste or bulk-import path. Highlight invalid rows and prevent saving until their date is corrected.