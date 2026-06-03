---
name: executeSql vs Neon DB
description: executeSql sandbox targets Replit's built-in DB, not the Neon database the API server uses.
---

## Rule
Never use `executeSql` to mutate data that the API server (or any service using `NEON_DATABASE_URL`) will read. The sandbox connects to Replit's built-in PostgreSQL, which is a completely separate instance from Neon.

**Why:** Discovered during admin account recovery — `executeSql` UPDATEs appeared to succeed (rowCount: 1) but the API server kept returning "Invalid credentials" because it reads from Neon via `NEON_DATABASE_URL`, not from Replit's built-in DB.

**How to apply:** For any DB operation that must affect what the running API server sees, use Node.js + the `pg` driver directly with `process.env.NEON_DATABASE_URL`, e.g.:
```bash
node -e "
const { Pool } = require('/home/runner/workspace/artifacts/api-server/node_modules/pg');
const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });
pool.query('UPDATE ...', [...]).then(r => { console.log(r.rowCount); pool.end(); });
"
```
`executeSql` is safe for read-only inspection of Replit's built-in DB (e.g. session table), but those results won't match Neon data.
