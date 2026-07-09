---
name: Admin password compromised-credential lockout
description: This codebase auto-deactivates any admin account using the literal password "admin123", as a security safeguard — not a bug.
---

`artifacts/api-server/src/routes/auth.ts` has `auditDefaultAdminCredential()`, which runs at startup in all environments. It bcrypt-compares every active admin's password hash against the literal string `"admin123"` and, if it matches, sets `active: false` on that account and logs a security warning.

**Why:** Deliberate safeguard against a known weak/default credential ending up in production.

**How to apply:** If a login starts failing with "Invalid credentials" right after a password reset/seed, check whether the new password is literally `admin123` before assuming the reset logic is broken — the account was likely auto-deactivated by this audit, not left with a stale hash. Also relevant: `syncAdminSeedPassword()` (added to keep the `admin` account's password in sync with the `ADMIN_SEED_PASSWORD` secret on every startup, in all environments) will happily re-activate + rehash to `admin123` if that's the secret's value, and then the audit will immediately deactivate it again on the same boot — so the fix is always to change the secret to something else, not to touch the code.
