import pg from "pg";
const { Pool } = pg;

const OLD_URL = process.env.NEON_DATABASE_URL;
const NEW_URL = "postgresql://neondb_owner:npg_TfVkq6cmhKo2@ep-sparkling-field-abzweqe3-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require";

if (!OLD_URL) throw new Error("NEON_DATABASE_URL not set");

const oldPool = new Pool({ connectionString: OLD_URL, ssl: { rejectUnauthorized: false } });
const newPool = new Pool({ connectionString: NEW_URL, ssl: { rejectUnauthorized: false } });

// Tables in dependency order (parents before children)
const TABLES = [
  "users",
  "app_settings",
  "projects",
  "campaigns",
  "workforce_roles",
  "mob_sites",
  "workers",
  "certifications",
  "cert_requirements",
  "worker_certifications",
  "site_assignments",
  "sites",
  "locations",
  "towers",
  "strings",
  "phases",
  "installation_tasks",
  "required_image_definitions",
  "images",
  "sheet_photos",
  "issues",
  "decisions",
  "documents",
  "field_reports",
  "wasabi_mirror_tasks",
  "location_task_progress",
  "task_progress_updates",
];

async function copyTable(oldClient, newClient, table) {
  const { rows } = await oldClient.query(`SELECT * FROM "${table}"`);
  if (rows.length === 0) {
    console.log(`  ${table}: empty, skipping`);
    return 0;
  }

  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `"${c}"`).join(", ");

  let copied = 0;
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const placeholders = batch
      .map((_, ri) => `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(", ")})`)
      .join(", ");
    const values = batch.flatMap((row) => cols.map((c) => row[c]));
    await newClient.query(
      `INSERT INTO "${table}" (${colList}) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
      values,
    );
    copied += batch.length;
  }
  console.log(`  ${table}: ${copied} rows copied`);
  return copied;
}

async function main() {
  console.log("Connecting to both databases...");
  const oldClient = await oldPool.connect();
  const newClient = await newPool.connect();

  try {
    // Disable FK checks on target
    await newClient.query("SET session_replication_role = replica");
  } catch {
    console.log("  (session_replication_role not available, proceeding in order)");
  }

  let totalRows = 0;
  console.log("\nCopying tables...");
  for (const table of TABLES) {
    try {
      totalRows += await copyTable(oldClient, newClient, table);
    } catch (e) {
      console.log(`  ${table}: SKIPPED (${e.message})`);
    }
  }

  // Also catch any tables in old DB not in our list
  const { rows: extraTables } = await oldClient.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename NOT IN (${TABLES.map((_, i) => `$${i + 1}`).join(",")})
  `, TABLES);

  if (extraTables.length > 0) {
    console.log("\nExtra tables found in old DB:");
    for (const { tablename } of extraTables) {
      try {
        totalRows += await copyTable(oldClient, newClient, tablename);
      } catch (e) {
        console.log(`  ${tablename}: SKIPPED (${e.message})`);
      }
    }
  }

  try {
    await newClient.query("SET session_replication_role = DEFAULT");
  } catch {}

  // Re-sync sequences
  console.log("\nSyncing sequences...");
  const { rows: seqs } = await newClient.query(`
    SELECT sequence_name FROM information_schema.sequences
    WHERE sequence_schema = 'public'
  `);
  for (const { sequence_name } of seqs) {
    const tableName = sequence_name.replace(/_id_seq$/, "");
    try {
      await newClient.query(`SELECT setval('${sequence_name}', COALESCE((SELECT MAX(id) FROM "${tableName}"), 1))`);
    } catch {}
  }

  console.log(`\nDone! Total rows migrated: ${totalRows}`);
  oldClient.release();
  newClient.release();
  await oldPool.end();
  await newPool.end();
}

main().catch((e) => { console.error("Migration failed:", e.message); process.exit(1); });
