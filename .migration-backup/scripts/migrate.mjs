/**
 * Non-interactive schema migration script.
 * Applies all DDL changes idempotently using IF NOT EXISTS / DO-NOTHING guards.
 * Run via: node scripts/migrate.mjs
 */
import pg from "pg";

const { Client } = pg;

const url = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("ERROR: DATABASE_URL or NEON_DATABASE_URL must be set.");
  process.exit(1);
}

const client = new Client({ connectionString: url });
await client.connect();

const migrations = [
  {
    name: "wasabi_mirror_tasks_drive_file_id_unique",
    sql: `
      ALTER TABLE wasabi_mirror_tasks
      ADD CONSTRAINT wasabi_mirror_tasks_drive_file_id_unique UNIQUE (drive_file_id)
    `,
    check: `
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = 'wasabi_mirror_tasks'
        AND constraint_name = 'wasabi_mirror_tasks_drive_file_id_unique'
    `,
  },
];

for (const migration of migrations) {
  const { rows } = await client.query(migration.check);
  if (rows.length > 0) {
    console.log(`[skip] ${migration.name} — already applied`);
  } else {
    await client.query(migration.sql);
    console.log(`[done] ${migration.name} — applied`);
  }
}

await client.end();
console.log("Migration complete.");
