---
name: Lautec visible import grid quirks
description: Non-obvious browser-session and spreadsheet behaviors in Lautec's visible DPR import flow.
---

Wait for Lautec's full identity-provider redirect chain to return to the DPR host and remain stable before clicking a DPR action. Lautec's Angular controls require real browser/ElementHandle clicks; synthetic DOM `element.click()` can be ignored. In Import Data, treat Activity Group and Activity as separate reference values and validate the destination Activity against the visible dropdown rather than assuming the group name is also an activity.

Pasted dropdown values can appear in a cell while still carrying an invalid warning. The location dropdown may internally mark that pasted value as selected; choosing the same option toggles it off and clears the cell. Commit it by selecting another valid option first, then selecting the intended option, and verify the warning is gone.

Browser-realm predicates and DOM lookups must be self-contained JavaScript expressions/IIFEs. Build-runtime helpers are not available inside Lautec's page context.

**Why:** Clicking during the final sign-in redirects returns to login, synthetic Angular clicks can do nothing, and spreadsheet cells can look correct while Lautec still considers them invalid. A same-option click can silently clear a location. Serialized callbacks can also fail only at browser runtime.

**How to apply:** Use the visible DPR list as the authenticated-session checkpoint. Discover visible controls in the page, click their Puppeteer handles, and keep page-executed code free of build-runtime helpers. Verify every cell and warning class, explicitly settle dependent dropdowns, leave PAX blank, and only submit after the grid reads back exactly.