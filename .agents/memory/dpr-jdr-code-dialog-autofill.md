---
name: JDR code dialog autofill
description: How a selected activity prepopulates a new JDR code in the admin dialog.
---

For a new JDR code, treat the selected linked activity as the source of defaults. Derive Lautec Activity and Lautec Activity Group from the activity hierarchy when no code exists yet; when a code is already linked to that activity, use it as the full template for the code-specific fields as well.

**Why:** Activities only hold their name and group, while contractual codes, work activities, and notes belong to JDR codes. This preserves a useful first-code default without guessing code-specific data, while avoiding repetitive entry when adding another code to an activity.

**How to apply:** Autofill only new-code dialogs. Keep existing-code edit dialogs unchanged so an administrator can move a link without unexpectedly overwriting the saved values.

The admin mapping view keeps Generic Comment as a separate fifth column after Code. Each comment row must use the same visible code list and the same code id for its edit action, so the two columns remain aligned.

**Why:** Generic Comment is part of the code mapping, not an unrelated standalone record; showing it separately makes the code-to-comment relationship explicit while preserving one edit form.

**How to apply:** Do not create independent comment records or a second save path. Open the existing JDR Code dialog when adding or editing the linked comment.