/**
 * One-time worker import script.
 * Reads the worker TSV file and upserts workers, roles, certifications,
 * and worker_certifications into the Neon DB.
 * Run: node scripts/import-workers.mjs
 */
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = new pg.Pool({ connectionString: process.env.NEON_DATABASE_URL });

// ── Parse TSV ───────────────────────────────────────────────────────────────

const FILE = path.join(
  __dirname,
  "../../attached_assets/Pasted-Unique-ID-Number-Supplier-Preferred-Airport-DOB-Passpor_1777592364404.txt",
);
const raw = fs.readFileSync(FILE, "utf8");

// Data rows begin at lines with "S_" prefix; ignore multi-line header
const dataLines = raw.split(/\r?\n/).filter((l) => /^S_\d+\t/.test(l));

// Column indices (0-based in split-by-tab row)
const COL = {
  uniqueId: 0,
  name: 2,
  airport: 3,
  dob: 4,
  passport: 5,
  role: 6,
  email: 7,
  phone: 8,
  qualifications: 9,
  windaId: 10,
  // Certification columns ──
  wah: 11,
  mh: 12,
  firstAid: 13,
  enhancedFirstAid: 14,
  fireAwareness: 15,
  seaSurvival: 16,
  medical: 17,
  chesterStep: 18,
  gwoSlinger: 19,
  opitoBanksman: 20,
  pasma: 21,
  ipaf: 22,
  confinedSpace: 23,
  huet: 24,
  eightVM1: 25,
  connexSize4: 26,
  teRstf72kv: 27,
  euromould72kv: 28,
  hvTesting: 29,
  foCertification: 30,
  foTesting: 31,
  hseCertification: 32,
  olf: 33,
  // Admin cols ──
  comments: 40,
};

// Human-readable cert names mapped to column index
const CERT_COLS = [
  { idx: COL.wah,             name: "WAH" },
  { idx: COL.mh,              name: "Manual Handling" },
  { idx: COL.firstAid,        name: "First Aid" },
  { idx: COL.enhancedFirstAid,name: "Enhanced First Aid" },
  { idx: COL.fireAwareness,   name: "Fire Awareness" },
  { idx: COL.seaSurvival,     name: "Sea Survival" },
  { idx: COL.medical,         name: "Medical" },
  { idx: COL.chesterStep,     name: "Chester Step" },
  { idx: COL.gwoSlinger,      name: "GWO Slingers Signaller" },
  { idx: COL.opitoBanksman,   name: "OPITO Banksman & Slinger" },
  { idx: COL.pasma,           name: "PASMA" },
  { idx: COL.ipaf,            name: "IPAF" },
  { idx: COL.confinedSpace,   name: "Confined Space (Med Risk)" },
  { idx: COL.huet,            name: "HUET" },
  { idx: COL.eightVM1,        name: "8VM1 Mod 3/4" },
  { idx: COL.connexSize4,     name: "Connex Size 4" },
  { idx: COL.teRstf72kv,      name: "TE RSTF 72KV Termination" },
  { idx: COL.euromould72kv,   name: "Euromould R909TB 72KV Termination" },
  { idx: COL.hvTesting,       name: "HV Testing" },
  { idx: COL.foCertification, name: "FO Certification" },
  { idx: COL.foTesting,       name: "FO Testing" },
  { idx: COL.hseCertification,name: "HSE Certification" },
  { idx: COL.olf,             name: "OLF" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Parse a date value from the spreadsheet into a YYYY-MM-DD string, or null */
function parseDate(val) {
  if (!val) return null;
  const v = val.trim().toLowerCase().replace(/\s+/g, " ");
  if (!v || v === "n/a" || v === "n" || v === "y" || v === "yes" || v === "no") return null;

  // "feb-28" or "feb 28"
  let m = v.match(/^([a-z]{3})[-\s](\d{2})$/);
  if (m) {
    const mon = MONTHS[m[1]];
    if (!mon) return null;
    const year = 2000 + parseInt(m[2]);
    const lastDay = new Date(year, mon, 0).getDate();
    return `${year}-${String(mon).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }

  // "5-may-23" or "31-mar-26" or "24-jan-27"
  m = v.match(/^(\d{1,2})[-\s]([a-z]{3})[-\s](\d{2})$/);
  if (m) {
    const mon = MONTHS[m[2]];
    if (!mon) return null;
    const year = 2000 + parseInt(m[3]);
    const day = Math.min(parseInt(m[1]), new Date(year, mon, 0).getDate());
    return `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // "29 feb 29" (three-word: day mon year)
  m = v.match(/^(\d{1,2}) ([a-z]{3}) (\d{2})$/);
  if (m) {
    const mon = MONTHS[m[2]];
    if (!mon) return null;
    const year = 2000 + parseInt(m[3]);
    const day = Math.min(parseInt(m[1]), new Date(year, mon, 0).getDate());
    return `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

function isYes(val) {
  if (!val) return false;
  const v = val.trim().toLowerCase();
  return v === "y" || v === "yes";
}

function clean(val) {
  return val ? val.trim() : "";
}

function nullIfEmpty(val) {
  const v = clean(val);
  return v === "" || v === "N/A" || v === "n/a" ? null : v;
}

// ── Parse all rows ────────────────────────────────────────────────────────────

const workers = dataLines.map((line) => {
  const cols = line.split("\t");
  const g = (i) => clean(cols[i] ?? "");

  const noteParts = [];
  if (g(COL.phone))     noteParts.push(`Phone: ${g(COL.phone)}`);
  if (g(COL.dob))       noteParts.push(`DOB: ${g(COL.dob)}`);
  if (g(COL.passport))  noteParts.push(`Passport: ${g(COL.passport)}`);
  if (g(COL.airport))   noteParts.push(`Airport: ${g(COL.airport)}`);
  if (g(COL.qualifications)) noteParts.push(`Qualifications: ${g(COL.qualifications)}`);
  if (g(COL.comments))  noteParts.push(`Notes: ${g(COL.comments)}`);

  return {
    uniqueId:  g(COL.uniqueId),
    name:      g(COL.name),
    email:     nullIfEmpty(g(COL.email)),
    windaId:   nullIfEmpty(g(COL.windaId)),
    roleName:  nullIfEmpty(g(COL.role)),
    notes:     noteParts.length ? noteParts.join(" | ") : null,
    certs: CERT_COLS.map(({ idx, name }) => {
      const raw = g(idx);
      const date = parseDate(raw);
      const present = date !== null || isYes(raw);
      return { name, date, present };
    }),
  };
});

console.log(`Parsed ${workers.length} worker rows.`);

// ── Main import ───────────────────────────────────────────────────────────────

async function run() {
  const client = await pool.connect();
  try {
    // 1. Upsert roles
    const roleNames = [...new Set(workers.map((w) => w.roleName).filter(Boolean))].sort();
    console.log(`\nUpserting ${roleNames.length} roles...`);
    for (const name of roleNames) {
      await client.query(
        `INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
        [name],
      );
    }

    // Fetch role id map
    const { rows: roleRows } = await client.query(`SELECT id, name FROM roles`);
    const roleMap = new Map(roleRows.map((r) => [r.name, r.id]));

    // 2. Upsert cert types (including GWO BST which already exists)
    const certNames = CERT_COLS.map((c) => c.name);
    console.log(`\nUpserting ${certNames.length} certification types...`);
    for (const name of certNames) {
      await client.query(
        `INSERT INTO certifications (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
        [name],
      );
    }

    // Fetch cert id map
    const { rows: certRows } = await client.query(`SELECT id, name FROM certifications`);
    const certMap = new Map(certRows.map((r) => [r.name, r.id]));

    // 3. Upsert workers
    console.log(`\nUpserting ${workers.length} workers...`);
    let inserted = 0, updated = 0, skipped = 0;

    for (const w of workers) {
      if (!w.name) { skipped++; continue; }

      const roleId = w.roleName ? (roleMap.get(w.roleName) ?? null) : null;

      // Try insert, on conflict on email update; on conflict on winda_id update
      // Strategy: upsert by winda_id if present, else by email, else by name
      let workerId = null;

      if (w.windaId) {
        const res = await client.query(
          `INSERT INTO workers (name, email, winda_id, role_id, notes)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (winda_id) DO UPDATE
             SET name=$1, email=COALESCE(EXCLUDED.email, workers.email),
                 role_id=COALESCE($4, workers.role_id),
                 notes=COALESCE($5, workers.notes),
                 updated_at=NOW()
           RETURNING id`,
          [w.name, w.email, w.windaId, roleId, w.notes],
        );
        workerId = res.rows[0].id;
        updated++;
      } else if (w.email) {
        const res = await client.query(
          `INSERT INTO workers (name, email, role_id, notes)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (email) DO UPDATE
             SET name=$1, role_id=COALESCE($3, workers.role_id),
                 notes=COALESCE($4, workers.notes),
                 updated_at=NOW()
           RETURNING id`,
          [w.name, w.email, roleId, w.notes],
        );
        workerId = res.rows[0].id;
        updated++;
      } else {
        // No unique key — try by name match or insert fresh
        const existing = await client.query(
          `SELECT id FROM workers WHERE name=$1 LIMIT 1`,
          [w.name],
        );
        if (existing.rows.length) {
          workerId = existing.rows[0].id;
          await client.query(
            `UPDATE workers SET role_id=COALESCE($2, role_id), notes=COALESCE($3, notes), updated_at=NOW() WHERE id=$1`,
            [workerId, roleId, w.notes],
          );
          updated++;
        } else {
          const res = await client.query(
            `INSERT INTO workers (name, role_id, notes) VALUES ($1, $2, $3) RETURNING id`,
            [w.name, roleId, w.notes],
          );
          workerId = res.rows[0].id;
          inserted++;
        }
      }

      // 4. Insert worker_certifications
      for (const cert of w.certs) {
        if (!cert.present) continue;
        const certId = certMap.get(cert.name);
        if (!certId) continue;

        await client.query(
          `INSERT INTO worker_certifications (worker_id, certification_id, expiry_date)
           VALUES ($1, $2, $3)
           ON CONFLICT (worker_id, certification_id) DO UPDATE
             SET expiry_date=COALESCE($3, worker_certifications.expiry_date),
                 updated_at=NOW()`,
          [workerId, certId, cert.date],
        );
      }
    }

    console.log(`  Inserted: ${inserted}, Updated/merged: ${updated}, Skipped: ${skipped}`);

    // Summary
    const { rows: [wCount] } = await client.query(`SELECT COUNT(*) FROM workers`);
    const { rows: [cCount] } = await client.query(`SELECT COUNT(*) FROM worker_certifications`);
    const { rows: [rCount] } = await client.query(`SELECT COUNT(*) FROM roles`);
    console.log(`\n✓ Done.`);
    console.log(`  Workers total: ${wCount.count}`);
    console.log(`  Roles total:   ${rCount.count}`);
    console.log(`  Cert records:  ${cCount.count}`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
