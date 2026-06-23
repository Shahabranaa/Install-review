---
name: Wouter routing — explicit route aliases
description: Wouter does not auto-handle sub-path aliases; every path the nav links to must be an explicit Route.
---

## Rule
In the workforce app (and any wouter-based SPA), every path that navigation links or tests hit must be explicitly declared as a `<Route>` in `App.tsx`. Wouter does **not** fall back to the root `/` route for unregistered paths — it renders the catch-all `<Route>` (NotFound) instead.

**Why:** `/workforce/dashboard` was linked from nav but omitted from the router, causing 404s. `/` rendered DashboardPage but `/dashboard` did not.

**How to apply:** Whenever a new nav link or route is added, add a matching `<Route path="/new-path">` to App.tsx even if it re-uses an existing page component.
