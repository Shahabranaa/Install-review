---
name: DPR activity selection saves
description: Stable optimistic-save behavior for Capture activity type and group toggles.
---

Keep a row's selected Activity Type and Activity Group visible locally until its save request succeeds or fails, and prevent another activity change for that row while it is saving.

**Why:** Entry PATCH requests can take several seconds. Letting the shared list cache repaint during that interval causes the toggle to flash through stale type/group values, making a successful change appear unreliable.

**How to apply:** Overlay a per-row pending selection over query data, show a small saving state, and only replace it with the matching server response. On a confirmed failure, restore the previous cached entry and clear the pending display.