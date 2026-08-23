---
name: Lautec configuration security boundary
description: Rules for the admin-visible Lautec browser configuration and protected credentials.
---

Administrators may manage non-secret browser settings for Lautec. Saved destinations are limited to HTTPS on the approved Lautec origin and server-controlled path prefixes; the browser verifies the final page again before entering credentials and before submitting.

**Why:** The operator needs to update visible Lautec destinations without a redeployment, but arbitrary URLs or redirects would let an administrator direct the browser to leak a high-privilege automation account.

**How to apply:** Keep Lautec credentials in workspace secrets only. Admin UI and API responses may report whether credentials are configured, but must never display, accept for database storage, or send their values to the client. Adjust approved paths only with trusted server configuration, never through an admin-entered URL.
