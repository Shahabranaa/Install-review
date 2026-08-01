---
name: React Query hooks inside mapped row components
description: Calling useQuery hooks inside every row component causes a blank-screen crash when many rows render simultaneously — hoist shared fetches to the parent.
---

## Rule
Never call `useListDpr*` (or any React Query fetch hook) inside a component that is rendered inside `.map()` when the query parameters are identical across all instances.

**Why:** Each component instance registers its own React Query subscription. When N rows mount simultaneously they all call the same hook, flooding the reconciler with N simultaneous state updates for the same cache key. This crashes the entire React tree (no error boundary → blank page + navbar disappears).

**How to apply:**
- Hoist the shared fetches (`useListDprActivities`, `useListDprJdrCodes`, etc.) to the page-level component.
- Pass the resulting arrays as props to each row component (`ClarifyRow`, etc.).
- The row component becomes purely presentational with respect to those datasets.
- Per-row fetches that genuinely differ per row (e.g. `useListDprJdrCodes({ activityId: entry.activityId })` in `ClarifiedRow`) are fine because they have different query keys and only one or a few instances render at once.
