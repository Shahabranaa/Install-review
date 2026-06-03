---
name: Session regenerate breaks Replit proxy cookies
description: express-session's session.regenerate() causes 401 loops in Replit because the proxy doesn't reliably forward the updated Set-Cookie header.
---

## Rule
Do NOT use `req.session.regenerate()` in the API server. Update session fields directly and call `req.session.save()` explicitly.

**Why:** Replit's preview proxy does not reliably forward the `Set-Cookie` response header when a login handler calls `session.regenerate()`. The new session ID is stored in Neon but the browser never receives the updated cookie, so it keeps sending the old (now-destroyed) session ID. Every subsequent auth check (`GET /api/auth/me`) returns 401 even though the session is in the DB.

**How to apply:** On any login route, replace:
```js
await req.session.regenerate(...)
req.session.userId = ...
await req.session.save(...)
```
with:
```js
req.session.userId = ...   // overwrite in place
await req.session.save(...)
```

This keeps the session ID stable; the browser's existing cookie continues to match the DB record.
