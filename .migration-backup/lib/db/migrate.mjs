/**
 * Non-interactive schema migration script.
 * Applies all DDL changes idempotently — safe to run multiple times.
 *
 * Run manually:    pnpm migrate
 * Runs automatically on every Vercel build (via scripts/build.sh)
 * and on every task merge (via scripts/post-merge.sh).
 *
 * HOW TO ADD A NEW MIGRATION
 * ──────────────────────────
 * When you add a column, table, index, or constraint to the Drizzle schema,
 * append a new entry to the `migrations` array below.  Each entry needs:
 *
 *   name  — unique, descriptive snake_case label (used only for logging)
 *   sql   — the DDL to run (use IF NOT EXISTS where possible)
 *   check — a query that returns ≥1 row if the change is already applied;
 *            the migration is skipped when this check finds rows
 *
 * Example — adding a new column:
 *   {
 *     name: "workers_preferred_name",
 *     sql: `ALTER TABLE workers ADD COLUMN IF NOT EXISTS preferred_name text`,
 *     check: `SELECT 1 FROM information_schema.columns
 *             WHERE table_name = 'workers' AND column_name = 'preferred_name'`,
 *   },
 *
 * Example — creating a new table:
 *   {
 *     name: "worker_notes",
 *     sql: `CREATE TABLE IF NOT EXISTS worker_notes (
 *             id serial PRIMARY KEY,
 *             worker_id integer NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
 *             body text NOT NULL,
 *             created_at timestamptz NOT NULL DEFAULT now()
 *           )`,
 *     check: `SELECT 1 FROM information_schema.tables WHERE table_name = 'worker_notes'`,
 *   },
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
  {
    name: "mob_sites_expected_completion_date",
    sql: `ALTER TABLE mob_sites ADD COLUMN expected_completion_date date`,
    check: `
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'mob_sites'
        AND column_name = 'expected_completion_date'
    `,
  },
  {
    name: "mob_sites_client_id",
    sql: `ALTER TABLE mob_sites ADD COLUMN client_id integer REFERENCES clients(id) ON DELETE SET NULL`,
    check: `
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'mob_sites'
        AND column_name = 'client_id'
    `,
  },
  {
    name: "mob_sites_mobilisation_date",
    sql: `ALTER TABLE mob_sites ADD COLUMN mobilisation_date date`,
    check: `
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'mob_sites'
        AND column_name = 'mobilisation_date'
    `,
  },
  {
    name: "ppe_types",
    sql: `
      CREATE TABLE ppe_types (
        id          serial PRIMARY KEY,
        name        text   NOT NULL UNIQUE,
        description text,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      )
    `,
    check: `SELECT 1 FROM information_schema.tables WHERE table_name = 'ppe_types'`,
  },
  {
    name: "ppe_allocations",
    sql: `
      CREATE TABLE ppe_allocations (
        id                  serial PRIMARY KEY,
        worker_id           integer NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
        ppe_type_id         integer NOT NULL REFERENCES ppe_types(id),
        site_id             integer REFERENCES mob_sites(id) ON DELETE SET NULL,
        issued_at           date    NOT NULL,
        issued_by_user_id   integer REFERENCES users(id) ON DELETE SET NULL,
        size_spec           text,
        returned_at         date,
        notes               text,
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now()
      )
    `,
    check: `SELECT 1 FROM information_schema.tables WHERE table_name = 'ppe_allocations'`,
  },
  {
    name: "add_cv_uploaded_at_to_workers",
    sql: `ALTER TABLE workers ADD COLUMN IF NOT EXISTS cv_uploaded_at TIMESTAMPTZ`,
    check: `SELECT 1 FROM information_schema.columns WHERE table_name = 'workers' AND column_name = 'cv_uploaded_at'`,
  },
  {
    name: "worker_role_history_source",
    sql: `ALTER TABLE worker_role_history ADD COLUMN IF NOT EXISTS source text`,
    check: `SELECT 1 FROM information_schema.columns WHERE table_name = 'worker_role_history' AND column_name = 'source'`,
  },
  {
    name: "worker_role_history_sort_order",
    sql: `ALTER TABLE worker_role_history ADD COLUMN IF NOT EXISTS sort_order integer`,
    check: `SELECT 1 FROM information_schema.columns WHERE table_name = 'worker_role_history' AND column_name = 'sort_order'`,
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
