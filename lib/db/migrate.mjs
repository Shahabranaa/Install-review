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
  {
    name: "workers_setup_token",
    sql: `ALTER TABLE workers ADD COLUMN IF NOT EXISTS setup_token text UNIQUE`,
    check: `SELECT 1 FROM information_schema.columns WHERE table_name = 'workers' AND column_name = 'setup_token'`,
  },
  {
    name: "workers_setup_token_expires_at",
    sql: `ALTER TABLE workers ADD COLUMN IF NOT EXISTS setup_token_expires_at timestamptz`,
    check: `SELECT 1 FROM information_schema.columns WHERE table_name = 'workers' AND column_name = 'setup_token_expires_at'`,
  },
  {
    name: "worker_push_tokens",
    sql: `
      CREATE TABLE worker_push_tokens (
        id            serial PRIMARY KEY,
        worker_id     integer NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
        token         text NOT NULL UNIQUE,
        platform      text,
        created_at    timestamptz NOT NULL DEFAULT now(),
        last_seen_at  timestamptz NOT NULL DEFAULT now()
      )
    `,
    check: `SELECT 1 FROM information_schema.tables WHERE table_name = 'worker_push_tokens'`,
  },
  {
    name: "push_logs",
    sql: `
      CREATE TABLE push_logs (
        id            serial PRIMARY KEY,
        worker_id     integer REFERENCES workers(id) ON DELETE SET NULL,
        sent_by       integer REFERENCES users(id) ON DELETE SET NULL,
        batch_id      text,
        title         text NOT NULL,
        body          text NOT NULL,
        message_type  text NOT NULL,
        status        text NOT NULL DEFAULT 'sent',
        error         text,
        sent_at       timestamptz NOT NULL DEFAULT now()
      )
    `,
    check: `SELECT 1 FROM information_schema.tables WHERE table_name = 'push_logs'`,
  },
  {
    name: "email_logs_batch_id",
    sql: `ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS batch_id text`,
    check: `SELECT 1 FROM information_schema.columns WHERE table_name = 'email_logs' AND column_name = 'batch_id'`,
  },
  {
    name: "email_logs_tracking_id_unique",
    sql: `ALTER TABLE email_logs ADD CONSTRAINT email_logs_tracking_id_unique UNIQUE (tracking_id)`,
    check: `SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'email_logs' AND constraint_name = 'email_logs_tracking_id_unique'`,
  },

  {
    name: "dpr_locations",
    sql: `CREATE TABLE IF NOT EXISTS dpr_locations (
      id serial PRIMARY KEY,
      name text NOT NULL UNIQUE
    )`,
    check: "SELECT 1 FROM information_schema.tables WHERE table_name = 'dpr_locations'",
  },
  {
    name: "dpr_teams",
    sql: `CREATE TABLE IF NOT EXISTS dpr_teams (
      id serial PRIMARY KEY,
      name text NOT NULL UNIQUE
    )`,
    check: "SELECT 1 FROM information_schema.tables WHERE table_name = 'dpr_teams'",
  },
  {
    name: "dpr_activity_types",
    sql: `CREATE TABLE IF NOT EXISTS dpr_activity_types (
      id serial PRIMARY KEY,
      name text NOT NULL UNIQUE
    )`,
    check: "SELECT 1 FROM information_schema.tables WHERE table_name = 'dpr_activity_types'",
  },
  {
    name: "dpr_activity_groups",
    sql: `CREATE TABLE IF NOT EXISTS dpr_activity_groups (
      id serial PRIMARY KEY,
      name text NOT NULL,
      activity_type_id integer REFERENCES dpr_activity_types(id) ON DELETE SET NULL
    )`,
    check: "SELECT 1 FROM information_schema.tables WHERE table_name = 'dpr_activity_groups'",
  },
  {
    name: "dpr_activities",
    sql: `CREATE TABLE IF NOT EXISTS dpr_activities (
      id serial PRIMARY KEY,
      name text NOT NULL,
      activity_group_id integer NOT NULL REFERENCES dpr_activity_groups(id) ON DELETE CASCADE
    )`,
    check: "SELECT 1 FROM information_schema.tables WHERE table_name = 'dpr_activities'",
  },
  {
    name: "dpr_jdr_codes",
    sql: `CREATE TABLE IF NOT EXISTS dpr_jdr_codes (
      id serial PRIMARY KEY,
      lautec_activity text NOT NULL,
      lautec_activity_group text NOT NULL,
      jdr_work_activity text NOT NULL,
      contractual_code text NOT NULL,
      generic_comment text NOT NULL,
      activity_id integer REFERENCES dpr_activities(id) ON DELETE SET NULL
    )`,
    check: "SELECT 1 FROM information_schema.tables WHERE table_name = 'dpr_jdr_codes'",
  },
  {
    name: "dpr_timesheet_entries",
    sql: `CREATE TABLE IF NOT EXISTS dpr_timesheet_entries (
      id serial PRIMARY KEY,
      date text NOT NULL,
      team_id integer REFERENCES dpr_teams(id) ON DELETE SET NULL,
      start_time text,
      end_time text,
      location_id integer REFERENCES dpr_locations(id) ON DELETE SET NULL,
      notes text,
      activity_type_id integer REFERENCES dpr_activity_types(id) ON DELETE SET NULL,
      activity_group_id integer REFERENCES dpr_activity_groups(id) ON DELETE SET NULL,
      activity_id integer REFERENCES dpr_activities(id) ON DELETE SET NULL,
      jdr_code_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      generic_comment text,
      combined_comment text,
      stage text NOT NULL DEFAULT 'captured',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    check: "SELECT 1 FROM information_schema.tables WHERE table_name = 'dpr_timesheet_entries'",
  },
  {
    name: "dpr_timesheet_entries_draft_default",
    sql: `ALTER TABLE dpr_timesheet_entries ALTER COLUMN stage SET DEFAULT 'draft'`,
    check: "SELECT 1 FROM pg_attrdef ad JOIN pg_attribute a ON a.attnum = ad.adnum AND a.attrelid = ad.adrelid WHERE a.attrelid = 'dpr_timesheet_entries'::regclass AND a.attname = 'stage' AND pg_get_expr(ad.adbin, ad.adrelid) = '''draft''::text'",
  },
  {
    // One-time backfill: before the "draft" stage existed, every not-yet-clarified
    // row was stored as "captured" and shown on the Capture page. Now that Capture
    // only shows "draft" rows and "captured" means "approved, awaiting Clarify",
    // any pre-existing "captured" rows must be reclassified as "draft" so they
    // don't silently jump into the Clarify queue as if already approved.
    name: "dpr_timesheet_entries_backfill_draft_stage",
    sql: `
      UPDATE dpr_timesheet_entries SET stage = 'draft' WHERE stage = 'captured';
      COMMENT ON TABLE dpr_timesheet_entries IS 'draft_stage_backfill_v1_applied';
    `,
    check: `
      SELECT 1 FROM pg_description d
      JOIN pg_class c ON c.oid = d.objoid
      WHERE c.relname = 'dpr_timesheet_entries' AND d.description = 'draft_stage_backfill_v1_applied'
    `,
  },
  {
    // The per-entry "Generic Comment" field was auto-filled from the JDR code's
    // own genericComment and was never a distinct editable field in the UI, so
    // it's dropped entirely. The JDR code's own generic_comment column (on
    // dpr_jdr_codes) is untouched — it's admin reference data still used to
    // seed the entry's Billing/combined comment on selection.
    name: "dpr_timesheet_entries_drop_generic_comment",
    sql: `ALTER TABLE dpr_timesheet_entries DROP COLUMN IF EXISTS generic_comment`,
    check: "SELECT 1 FROM information_schema.columns WHERE table_name = 'dpr_timesheet_entries' AND column_name = 'generic_comment' HAVING COUNT(*) = 0",
  },
  {
    // Client asked for a simple JDR vs Orsted classification to be made at
    // the Capture stage (replacing the need to pick Activity Type manually
    // during Clarify).
    name: "dpr_timesheet_entries_add_billing_party",
    sql: `ALTER TABLE dpr_timesheet_entries ADD COLUMN IF NOT EXISTS billing_party text`,
    check: "SELECT 1 FROM information_schema.columns WHERE table_name = 'dpr_timesheet_entries' AND column_name = 'billing_party'",
  },
  {
    // The "allstead" billing party value was a misspelling of "orsted" (the
    // client's actual name) — rename any existing stored rows to match.
    name: "dpr_timesheet_entries_rename_allstead_to_orsted",
    sql: `UPDATE dpr_timesheet_entries SET billing_party = 'orsted' WHERE billing_party = 'allstead'`,
    check: "SELECT 1 FROM dpr_timesheet_entries WHERE billing_party = 'allstead' HAVING COUNT(*) = 0",
  },
  {
    name: "dpr_seed_locations",
    sql: `
      INSERT INTO dpr_locations (id, name) VALUES
  (1, 'Port of Hull'),
  (2, 'Port of Immingham'),
  (3, 'Vessel'),
  (4, 'A01'),
  (5, 'A02'),
  (6, 'A03'),
  (7, 'A04'),
  (8, 'A06'),
  (9, 'A07'),
  (10, 'A08'),
  (11, 'A09'),
  (12, 'A10'),
  (13, 'A11'),
  (14, 'A12'),
  (15, 'A13'),
  (16, 'A14'),
  (17, 'A15'),
  (18, 'A16'),
  (19, 'A17'),
  (20, 'A19'),
  (21, 'A21'),
  (22, 'A22'),
  (23, 'A23'),
  (24, 'A24'),
  (25, 'B01'),
  (26, 'B03'),
  (27, 'B05'),
  (28, 'B07'),
  (29, 'B17'),
  (30, 'B19'),
  (31, 'B21'),
  (32, 'B22'),
  (33, 'B23'),
  (34, 'B24'),
  (35, 'C01'),
  (36, 'C03'),
  (37, 'C05'),
  (38, 'C07'),
  (39, 'C09'),
  (40, 'C11'),
  (41, 'C13'),
  (42, 'C15'),
  (43, 'C17'),
  (44, 'C19'),
  (45, 'C21'),
  (46, 'C22'),
  (47, 'C23'),
  (48, 'C24'),
  (49, 'D01'),
  (50, 'D05'),
  (51, 'D07'),
  (52, 'D09'),
  (53, 'D11'),
  (54, 'D13'),
  (55, 'D15'),
  (56, 'D17'),
  (57, 'D19'),
  (58, 'D21'),
  (59, 'D22'),
  (60, 'D23'),
  (61, 'E01'),
  (62, 'E03'),
  (63, 'E05'),
  (64, 'E07'),
  (65, 'E09'),
  (66, 'E11'),
  (67, 'E13'),
  (68, 'E15'),
  (69, 'E17'),
  (70, 'E19'),
  (71, 'E21'),
  (72, 'E22'),
  (73, 'E23'),
  (74, 'F01'),
  (75, 'F03'),
  (76, 'F05'),
  (77, 'F07'),
  (78, 'F09'),
  (79, 'F11'),
  (80, 'F13'),
  (81, 'F15'),
  (82, 'F17'),
  (83, 'F19'),
  (84, 'F21'),
  (85, 'F22'),
  (86, 'F23'),
  (87, 'G01'),
  (88, 'G03'),
  (89, 'G05'),
  (90, 'G07'),
  (91, 'G09'),
  (92, 'G11'),
  (93, 'G13'),
  (94, 'G15'),
  (95, 'G17'),
  (96, 'G19'),
  (97, 'G21'),
  (98, 'G22'),
  (99, 'H01'),
  (100, 'H03'),
  (101, 'H05'),
  (102, 'H07'),
  (103, 'H11'),
  (104, 'H13'),
  (105, 'H15'),
  (106, 'H17'),
  (107, 'H19'),
  (108, 'H21'),
  (109, 'H22'),
  (110, 'J01'),
  (111, 'J03'),
  (112, 'J05'),
  (113, 'J07'),
  (114, 'J09'),
  (115, 'J11'),
  (116, 'J13'),
  (117, 'J15'),
  (118, 'J17'),
  (119, 'J19'),
  (120, 'J21'),
  (121, 'J22'),
  (122, 'K01'),
  (123, 'K03'),
  (124, 'K05'),
  (125, 'K07'),
  (126, 'K09'),
  (127, 'K11'),
  (128, 'K13'),
  (129, 'K15'),
  (130, 'K17'),
  (131, 'K19'),
  (132, 'K21'),
  (133, 'L01'),
  (134, 'L03'),
  (135, 'L05'),
  (136, 'L07'),
  (137, 'L09'),
  (138, 'L11'),
  (139, 'L13'),
  (140, 'L15'),
  (141, 'L17'),
  (142, 'L19'),
  (143, 'L21'),
  (144, 'M01'),
  (145, 'M03'),
  (146, 'M05'),
  (147, 'M07'),
  (148, 'M11'),
  (149, 'M15'),
  (150, 'M17'),
  (151, 'M19'),
  (152, 'N01'),
  (153, 'N03'),
  (154, 'N05'),
  (155, 'N07'),
  (156, 'N09'),
  (157, 'N11'),
  (158, 'N13'),
  (159, 'N15'),
  (160, 'N17'),
  (161, 'N19'),
  (162, 'P01'),
  (163, 'P03'),
  (164, 'P04'),
  (165, 'P05'),
  (166, 'P07'),
  (167, 'P09'),
  (168, 'P11'),
  (169, 'P13'),
  (170, 'P15'),
  (171, 'P17'),
  (172, 'P19'),
  (173, 'P20'),
  (174, 'Q01'),
  (175, 'Q05'),
  (176, 'Q06'),
  (177, 'Q07'),
  (178, 'Q08'),
  (179, 'Q09'),
  (180, 'Q11'),
  (181, 'Q13'),
  (182, 'Q15'),
  (183, 'Q17'),
  (184, 'Q18'),
  (185, 'R01'),
  (186, 'R02'),
  (187, 'R09'),
  (188, 'R11'),
  (189, 'R13'),
  (190, 'R15'),
  (191, 'S11'),
  (192, 'S13'),
  (193, 'S15'),
  (194, 'T10'),
  (195, 'T11'),
  (196, 'T12'),
  (197, 'T13'),
  (198, 'T14'),
  (199, 'T15'),
  (200, 'T16'),
  (201, 'Z01'),
  (202, 'Z02')
      ON CONFLICT (id) DO NOTHING;
      SELECT setval(pg_get_serial_sequence('dpr_locations', 'id'), (SELECT COALESCE(MAX(id), 1) FROM dpr_locations));
    `,
    check: "SELECT 1 FROM dpr_locations LIMIT 1",
  },
  {
    name: "dpr_seed_teams",
    sql: `
      INSERT INTO dpr_teams (id, name) VALUES
  (1, 'Team 1'),
  (2, 'Team 2'),
  (3, 'Team 3'),
  (4, 'Team 4'),
  (5, 'Team 5'),
  (6, 'Team 6'),
  (7, 'Team 7'),
  (8, 'Team 8'),
  (9, 'Team 9'),
  (10, 'Team 10'),
  (11, 'Team 11'),
  (12, 'Team 12')
      ON CONFLICT (id) DO NOTHING;
      SELECT setval(pg_get_serial_sequence('dpr_teams', 'id'), (SELECT COALESCE(MAX(id), 1) FROM dpr_teams));
    `,
    check: "SELECT 1 FROM dpr_teams LIMIT 1",
  },
  {
    name: "dpr_seed_activity_types",
    sql: `
      INSERT INTO dpr_activity_types (id, name) VALUES
  (1, 'Effective Working Time'),
  (2, 'Non-Working Time'),
  (3, 'Weather Down Time')
      ON CONFLICT (id) DO NOTHING;
      SELECT setval(pg_get_serial_sequence('dpr_activity_types', 'id'), (SELECT COALESCE(MAX(id), 1) FROM dpr_activity_types));
    `,
    check: "SELECT 1 FROM dpr_activity_types LIMIT 1",
  },
  {
    name: "dpr_seed_activity_groups",
    sql: `
      INSERT INTO dpr_activity_groups (id, name, activity_type_id) VALUES
  (1, 'Effective Working Time', 1),
  (2, 'Non-Working Time', 2),
  (3, 'Re-Work', 1),
  (4, 'Extra Work', 1)
      ON CONFLICT (id) DO NOTHING;
      SELECT setval(pg_get_serial_sequence('dpr_activity_groups', 'id'), (SELECT COALESCE(MAX(id), 1) FROM dpr_activity_groups));
    `,
    check: "SELECT 1 FROM dpr_activity_groups LIMIT 1",
  },
  {
    name: "dpr_seed_activities",
    sql: `
      INSERT INTO dpr_activities (id, name, activity_group_id) VALUES
  (1, 'Mobilisation', 1),
  (2, 'Pre-Termination Testing', 1),
  (3, 'Pre-Works SIP Set up / Asset protection', 1),
  (4, 'Mechanical - Cable stripping', 1),
  (5, 'Mechanical - Hang-off', 1),
  (6, 'Electrical - Cable routing', 1),
  (7, 'Electrical - Termination', 1),
  (8, 'Fibre Optic', 1),
  (9, 'General husbandry', 1),
  (10, 'Post-Termination Testing', 1),
  (11, 'Resonance Testing', 1),
  (12, 'Demobilisation', 1),
  (13, 'TBT / POWRA', 1),
  (14, 'Welfare break on location', 1),
  (15, 'Transit to/from field', 2),
  (16, 'HSE - Toolbox Talk on SOV', 2),
  (17, 'HSE - Other (PPE check, time out for safety, etc.)', 2),
  (18, 'Standby (EDT) - Waiting on Transfer / No Work Location Available', 2),
  (19, 'Standby (EDT) - Waiting on Transfer / Transfer of other Scopes', 2),
  (20, 'Standby (EDT) - Other', 2),
  (21, 'Standby (LT) - Transfer to / from Location', 2),
  (22, 'Standby (WDT) - Weather downtime', 2),
  (23, 'Waiting on material, equipment or documentation (CDT)', 2),
  (24, 'Other (CDT)', 2),
  (25, 'Mobilisation', 3),
  (26, 'Pre-Termination Testing', 3),
  (27, 'Pre-Works SIP Set up / Asset protection', 3),
  (28, 'Mechanical - Cable stripping', 3),
  (29, 'Mechanical - Hang-off', 3),
  (30, 'Electrical - Cable routing', 3),
  (31, 'Electrical - Termination', 3),
  (32, 'Fibre Optic', 3),
  (33, 'General husbandry', 3),
  (34, 'Post-Termination Testing', 3),
  (35, 'Resonance Testing', 3),
  (36, 'Variation', 3),
  (37, 'Demobilisation', 3),
  (38, 'Mobilisation', 4),
  (39, 'Pre-Works Testing', 4),
  (40, 'Mechanical - Cable handling (before Hang-off)', 4),
  (41, 'Mechanical - Cable handling (after Hang-off)', 4),
  (42, 'Mechanical - Cable stripping', 4),
  (43, 'Electrical - Cable routing', 4),
  (44, 'Electrical - Termination', 4),
  (45, 'General husbandry', 4),
  (46, 'Post-Works Testing', 4),
  (47, 'Hang-off Repair', 4),
  (48, 'Variation', 4),
  (49, 'Demobilisation', 4)
      ON CONFLICT (id) DO NOTHING;
      SELECT setval(pg_get_serial_sequence('dpr_activities', 'id'), (SELECT COALESCE(MAX(id), 1) FROM dpr_activities));
    `,
    check: "SELECT 1 FROM dpr_activities LIMIT 1",
  },
  {
    name: "dpr_seed_jdr_codes",
    sql: `
      INSERT INTO dpr_jdr_codes (id, lautec_activity, lautec_activity_group, jdr_work_activity, contractual_code, generic_comment, activity_id) VALUES
  (1, 'Mobilisation', 'Effective Working Time', 'Mobilisation', 'EWT', '- Initial Tower setup', 1),
  (2, 'Pre-Termination Testing', 'Effective Working Time', 'Testing - Pre-Termination', 'EWT', '-Phase ID', 2),
  (3, 'Pre-Termination Testing', 'Effective Working Time', 'Testing - Pre-Termination', 'EWT', '-TDR Uni-Directional', 2),
  (4, 'Pre-Termination Testing', 'Effective Working Time', 'Testing - Pre-Termination', 'EWT', '-OTDR', 2),
  (5, 'Pre-Termination Testing', 'Effective Working Time', 'Testing - Pre-Termination', 'EWT', '-Sheath Test 10KV', 2),
  (6, 'Pre-Works SIP Set up / Asset protection', 'Effective Working Time', 'Setup', 'EWT', '- As-Found', 3),
  (7, 'Pre-Works SIP Set up / Asset protection', 'Effective Working Time', 'Setup', 'EWT', '- Asset Protection', 3),
  (8, 'Pre-Works SIP Set up / Asset protection', 'Effective Working Time', 'Setup', 'EWT', '-Removal of waste and sheeting', 3),
  (9, 'Mechanical - Cable stripping', 'Effective Working Time', 'Cable Prep / Stripping', 'EWT', '-Cable Stripping', 4),
  (10, 'Mechanical - Cable stripping', 'Effective Working Time', 'Cable Prep / Stripping', 'EWT', '-Housekeeping', 4),
  (11, 'Mechanical - Hang-off', 'Effective Working Time', 'Hang-off', 'EWT', '-Hang Off Installation', 5),
  (12, 'Mechanical - Hang-off', 'Effective Working Time', 'Hang-off', 'EWT', '-Resin Pour (Not Applicable for SIPs)', 5),
  (13, 'Electrical - Cable routing', 'Effective Working Time', 'Cable heating/straightening', 'EWT', '-Heating Power Core', 6),
  (14, 'Electrical - Cable routing', 'Effective Working Time', 'Cable heating/straightening', 'EWT', '-Applying Straightening Channels/Cooling', 6),
  (15, 'Electrical - Cable routing', 'Effective Working Time', 'Cable Routing - HV & Cleating', 'EWT', '-Soft Routing', 6),
  (16, 'Electrical - Cable routing', 'Effective Working Time', 'Cable Routing - HV & Cleating', 'EWT', '-Routing', 6),
  (17, 'Electrical - Cable routing', 'Effective Working Time', 'Cable Routing - HV & Cleating', 'EWT', '-Cleating', 6),
  (18, 'Electrical - Termination', 'Effective Working Time', 'Open/Close 8VM1', 'EWT', '-Open Environmental Bag', 7),
  (19, 'Electrical - Termination', 'Effective Working Time', 'Open/Close 8VM1', 'EWT', '-Reseal Environmental Bag', 7),
  (20, 'Electrical - Termination', 'Effective Working Time', 'HV Termination', 'EWT', '-L1 Prep', 7),
  (21, 'Electrical - Termination', 'Effective Working Time', 'HV Termination', 'EWT', '-L1 Install Product', 7),
  (22, 'Electrical - Termination', 'Effective Working Time', 'HV Termination', 'EWT', '-L1 Plug in / Connection', 7),
  (23, 'Electrical - Termination', 'Effective Working Time', 'HV Termination', 'EWT', '', 7),
  (24, 'Electrical - Termination', 'Effective Working Time', 'HV Termination', 'EWT', '-L2 Prep', 7),
  (25, 'Electrical - Termination', 'Effective Working Time', 'HV Termination', 'EWT', '-L2 Install Product', 7),
  (26, 'Electrical - Termination', 'Effective Working Time', 'HV Termination', 'EWT', '-L2 Plug in / Connection', 7),
  (27, 'Electrical - Termination', 'Effective Working Time', 'HV Termination', 'EWT', '', 7),
  (28, 'Electrical - Termination', 'Effective Working Time', 'HV Termination', 'EWT', '-L3 Prep', 7),
  (29, 'Electrical - Termination', 'Effective Working Time', 'HV Termination', 'EWT', '-L3 Install Product', 7),
  (30, 'Electrical - Termination', 'Effective Working Time', 'HV Termination', 'EWT', '-L3 Plug in / Connection', 7),
  (31, 'Electrical - Termination', 'Effective Working Time', 'HV Termination', 'EWT', '', 7),
  (32, 'Electrical - Termination', 'Effective Working Time', 'HV Termination', 'EWT', '-Temporary Caps Installed ready for Plug-In', 7),
  (33, 'Electrical - Termination', 'Effective Working Time', 'HV Termination', 'EWT', '', 7),
  (34, 'Electrical - Termination', 'Effective Working Time', 'HV Termination', 'EWT', '-Earthing', 7),
  (35, 'Fibre Optic', 'Effective Working Time', 'FO installation / routing', 'EWT', '-FO Routing (inc Service loop)', 8),
  (36, 'Fibre Optic', 'Effective Working Time', 'FO installation / routing', 'EWT', '-Gland Installation', 8),
  (37, 'Fibre Optic', 'Effective Working Time', 'FO termination', 'EWT', '-Dressing Fibres', 8),
  (38, 'Fibre Optic', 'Effective Working Time', 'FO termination', 'EWT', '-Splicing', 8),
  (39, 'Fibre Optic', 'Effective Working Time', 'FO termination', 'EWT', '-Earthing', 8),
  (40, 'General husbandry', 'Effective Working Time', 'General Husbandry', 'EWT', '-Tidying up the position during the completion of other works to maintain a suitable working environment', 9),
  (41, 'ORS TBC', 'Effective Working Time', 'Labelling Cables', 'EWT', '- Application of RDS-PP Labelling', NULL),
  (42, 'Post-Termination Testing', 'Effective Working Time', 'Testing - Post-Termination (FO)', 'EWT', '-SIP to SIP OTDR/iOLM', 10),
  (43, 'Post-Termination Testing', 'Effective Working Time', 'Testing - Post-Termination (FO)', 'EWT', '-String Testing OTDR/iOLM', 10),
  (44, 'Post-Termination Testing', 'Effective Working Time', 'Testing - Post-Termination (FO)', 'EWT', '-Testing of Splices prior to SAT', 10),
  (45, 'Post-Termination Testing', 'Effective Working Time', 'Testing - Post-Termination (HV)', 'EWT', '- Earth Verification', 10),
  (46, 'ORS TBC', 'Effective Working Time', 'Hand back', 'EWT', '-JDR QC', NULL),
  (47, 'ORS TBC', 'Effective Working Time', 'Hand back', 'EWT', '- As-Left', NULL),
  (48, 'Resonance Testing', 'Effective Working Time', 'RTS Setup Commissioning/Decommissioning', 'EWT', '-Initial first setup of equipment on OCS', 11),
  (49, 'Resonance Testing', 'Effective Working Time', 'RTS Setup Commissioning/Decommissioning', 'EWT', '-Final or additionla pack up and storage of equipment on OCS', 11),
  (50, 'Resonance Testing', 'Effective Working Time', 'RTS Test Lead Route/Re-Route', 'EWT', '-Iniitial RTS test lead setup', 11),
  (51, 'Resonance Testing', 'Effective Working Time', 'RTS Test Lead Route/Re-Route', 'EWT', '-Re-Route RTS test lead', 11),
  (52, 'Resonance Testing', 'Effective Working Time', 'RTS Testing', 'EWT', '-RTS Setup', 11),
  (53, 'Resonance Testing', 'Effective Working Time', 'RTS Testing', 'EWT', '- RTS Testing', 11),
  (54, 'Demobilisation', 'Effective Working Time', 'Demobilisation', 'EWT', '- Packing of Equipment ready for removal from location and final clean up', 12),
  (55, 'TBT / POWRA', 'Effective Working Time', 'HSE - Toolbox Talk', 'EWT', '', 13),
  (56, 'Welfare break on location', 'Effective Working Time', 'Welfare Break', 'EWT', '- Welfare Break', 14),
  (57, 'ORS TBC', 'Effective Working Time', 'Waiting on Technical Information', 'EWT', '- Waiting on JDR technical feedback', NULL),
  (58, 'ORS TBC', 'Effective Working Time', 'Other - (Refer to Comments)', 'EWT', '', NULL),
  (59, 'Other (CDT)', 'Effective Working Time', 'Waiting on Team Member/s', 'EWT', '', NULL),
  (60, 'Waiting on material, equipment or documentation (CDT)', 'Non-Working Time', 'Waiting on Material/Equipment', 'EWT', '', 23),
  (61, 'Transit to/from field', 'Non-Working Time', 'Campaign Mobilisation', 'NWT', '- Onshore/Port activities to prepare for offshore campaign', 15),
  (62, 'Transit to/from field', 'Non-Working Time', 'Standby - Crew Change Related Activities', 'NWT', '-Heli crew Change', 15),
  (63, 'Transit to/from field', 'Non-Working Time', 'Standby - Crew Change Related Activities', 'NWT', '-Onboarding', 15),
  (64, 'Transit to/from field', 'Non-Working Time', 'Port Call (Excluding Transit)', 'NWT', '', 15),
  (65, 'Transit to/from field', 'Non-Working Time', 'Transit to / from Field', 'NWT', '- Transit to port', 15),
  (66, 'Transit to/from field', 'Non-Working Time', 'Transit to / from Field', 'NWT', '- Transit to field', 15),
  (67, 'Transit to/from field', 'Non-Working Time', 'Transit – Offshore Personnel Transfer', 'NWT', '', 15),
  (68, 'HSE - Other (PPE check, time out for safety, etc.)', 'Non-Working Time', 'HSE - Time out for Safety', 'NWT', '-Contractor HSE standby', 17),
  (69, 'HSE - Other (PPE check, time out for safety, etc.)', 'Non-Working Time', 'HSE - Time out for Safety', 'NWT', '-Client HSE standby', 17),
  (70, 'Standby (EDT) - Waiting on Transfer / No Work Location Available', 'Non-Working Time', 'Work Location Not Available', 'NWT', '', 18),
  (71, 'Standby (EDT) - Waiting on Transfer / No Work Location Available', 'Non-Working Time', 'RTS Delay', 'NWT', '- Client unable to facilitate RTS test following JDR official communication on readiness', 18),
  (72, 'Standby (EDT) - Waiting on Transfer / Transfer of other Scopes', 'Non-Working Time', 'Waiting on Transfer (Offshore)', 'NWT', '- Waiting on Transfer to Asset', 19),
  (73, 'Standby (EDT) - Waiting on Transfer / Transfer of other Scopes', 'Non-Working Time', 'Waiting on Transfer (Offshore)', 'NWT', '- Waiting on Transfer to Vessel', 19),
  (74, 'Standby (EDT) - Other', 'Non-Working Time', 'Other - (Refer to Comments)', 'NWT', '', 20),
  (75, 'Standby (EDT) - Other', 'Non-Working Time', 'Delay - Other Vessel Scopes', 'NWT', '- Delays caused by other scopes operating from same vessel as JDR', 20),
  (76, 'Standby (EDT) - Other', 'Non-Working Time', 'Technical Breakdown', 'NWT', '-SOV Technical Breakdown', 20),
  (77, 'Standby (EDT) - Other', 'Non-Working Time', 'Technical Breakdown', 'NWT', '-CTV Technical Breakdown', 20),
  (78, 'Standby (EDT) - Other', 'Non-Working Time', 'Waiting on Access', 'NWT', '', 20),
  (79, 'Standby (EDT) - Other', 'Non-Working Time', 'Waiting on Site Services / Infrastructure', 'NWT', '', 20),
  (80, 'Standby (EDT) - Other', 'Non-Working Time', 'Waiting on SAPs / Electrical Safety Docs', 'NWT', '', 20),
  (81, 'Standby (EDT) - Other', 'Non-Working Time', 'Waiting on OCS SWG De-Gassing', 'NWT', '', 20),
  (82, 'Standby (EDT) - Other', 'Non-Working Time', 'Waiting on scaffolding', 'NWT', '-Awaiting errection', 20),
  (83, 'Standby (EDT) - Other', 'Non-Working Time', 'Waiting on scaffolding', 'NWT', '-Awaiting modifications', 20),
  (84, 'Standby (EDT) - Other', 'Non-Working Time', 'Waiting on scaffolding', 'NWT', '-Awaiting striking', 20),
  (85, 'Standby (EDT) - Other', 'Non-Working Time', 'Waiting on scaffolding', 'NWT', '-Awaiting certification', 20),
  (86, 'Standby (EDT) - Other', 'Non-Working Time', 'Waiting on Technical Information', 'NWT', '- Waiting on Employer technical feedback', 20),
  (87, 'Waiting on material, equipment or documentation (EDT)', 'Non-Working Time', 'Waiting on Material/Equipment', 'NWT', '', NULL),
  (88, 'Standby (EDT) - Other', 'Non-Working Time', 'Other - (Refer to Comments)', 'NWT', '', 20),
  (89, 'ORS TBC', 'Non-Working Time', 'Client Downtime', 'NWT', '', NULL),
  (90, 'Standby (LT) - Transfer to / from Location', 'Non-Working Time', 'Lifting Operations - Offshore', 'NWT', '- SOV Lifting Ops', 21),
  (91, 'Standby (LT) - Transfer to / from Location', 'Non-Working Time', 'Lifting Operations - Offshore', 'NWT', '- CTV Lifting Ops', 21),
  (92, 'Standby (LT) - Transfer to / from Location', 'Non-Working Time', 'Personnel Transfer - Offshore', 'NWT', '- Personnel Transfer to Asset', 21),
  (93, 'Standby (LT) - Transfer to / from Location', 'Non-Working Time', 'Personnel Transfer - Offshore', 'NWT', '- Personnel Transfer to Vessel', 21),
  (94, 'Standby (LT) - Transfer to / from Location', 'Non-Working Time', 'Transfer by CTV', 'NWT', '- Transit to SIP', 21),
  (95, 'Standby (LT) - Transfer to / from Location', 'Non-Working Time', 'Transfer by CTV', 'NWT', '- Transit to OCS', 21),
  (96, 'Standby (LT) - Transfer to / from Location', 'Non-Working Time', 'Transfer by CTV', 'NWT', '- Transit to SOV', 21),
  (97, 'ORS TBC', 'Non-Working Time', 'Delay - Late Collection by Previous Shift', 'NWT', '- Team completed previous shift late and suitable rest required', NULL),
  (98, 'Standby (WDT) - Weather downtime', 'Non-Working Time', 'Waiting on Weather', 'WDT', '-Standby on location due to weather', 22),
  (99, 'Standby (WDT) - Weather downtime', 'Non-Working Time', 'Waiting on Weather', 'WDT', '-Standby on vessel due to weather', 22),
  (100, 'Mobilisation', 'Re-Work', 'Re-Work', 'EWT', 'Mobilisation', 25),
  (101, 'Pre-Termination Testing', 'Re-Work', 'Re-Work', 'EWT', 'Pre-Termination Testing', 26),
  (102, 'Pre-Works SIP Set up / Asset protection', 'Re-Work', 'Re-Work', 'EWT', 'Pre-Works SIP Set up / Asset protection', 27),
  (103, 'Mechanical - Cable stripping', 'Re-Work', 'Re-Work', 'EWT', 'Mechanical - Cable stripping', 28),
  (104, 'Mechanical - Hang-off', 'Re-Work', 'Re-Work', 'EWT', 'Mechanical - Hang-off', 29),
  (105, 'Electrical - Cable routing', 'Re-Work', 'Re-Work', 'EWT', 'Electrical - Cable routing', 30),
  (106, 'Electrical - Termination', 'Re-Work', 'Re-Work', 'EWT', 'Electrical - Termination', 31),
  (107, 'Fibre Optic', 'Re-Work', 'Re-Work', 'EWT', 'Fibre Optic', 32),
  (108, 'General husbandry', 'Re-Work', 'Re-Work', 'EWT', 'General husbandry', 33),
  (109, 'Post-Termination Testing', 'Re-Work', 'Re-Work', 'EWT', 'Post-Termination Testing', 34),
  (110, 'Resonance Testing', 'Re-Work', 'Re-Work', 'EWT', 'Resonance Testing', 35),
  (111, 'Variation', 'Re-Work', 'Re-Work', 'EWT', 'Variation', 36),
  (112, 'Demobilisation', 'Re-Work', 'Re-Work', 'EWT', 'Demobilisation', 37),
  (113, 'Mobilisation', 'Extra Work', 'Additional Mobilization Setup', 'NWT', '- Additional mobilization of asset - contractor unable to finalize location on previous visit, due to factors outside their control', 38),
  (114, 'Electrical - Termination', 'Extra Work', 'Additional 8VM1 Works', 'NWT', '- Additional open or close of seal bags not connected as part of T&T scope of work', 44),
  (115, 'Electrical - Termination', 'Extra Work', 'Additional 8VM1 Works', 'NWT', '- Reconfigure GIS Gland Plates', 44),
  (116, 'General husbandry', 'Extra Work', 'Interruption for Weather', 'NWT', '-Housekeeping before/after a period of weather downtime', 45),
  (117, 'Demobilisation', 'Extra Work', 'Additional Demobilization Setup', 'NWT', '- Additional de-mobilization of asset - contractor unable to finalize location on previous visit, due to factors outside their control', 49),
  (118, 'ORS TBC', 'Extra Work', 'CMS Removal, Storage & Reinstallation (VO)', 'NWT (VO)', '- Removal and Storage of CMS', NULL),
  (119, 'ORS TBC', 'Extra Work', 'CMS Removal, Storage & Reinstallation (VO)', 'NWT (VO)', '- Reinstallation of CMS', NULL),
  (120, 'ORS TBC', 'Extra Work', 'CMS MBR Rectification Works (VO)', 'NWT (VO)', '- Rectify pre-installed CMS MBR issues', NULL),
  (121, 'ORS TBC', 'Extra Work', 'PT100 Sensor Installation (VO)', 'NWT (VO)', '- Installation of PT100 Sensors', NULL)
      ON CONFLICT (id) DO NOTHING;
      SELECT setval(pg_get_serial_sequence('dpr_jdr_codes', 'id'), (SELECT COALESCE(MAX(id), 1) FROM dpr_jdr_codes));
    `,
    check: "SELECT 1 FROM dpr_jdr_codes LIMIT 1",
  },
  {
    name: "dpr_timesheet_entries_shift_date",
    sql: `ALTER TABLE dpr_timesheet_entries ADD COLUMN IF NOT EXISTS shift_date text`,
    check: `SELECT 1 FROM information_schema.columns WHERE table_name = 'dpr_timesheet_entries' AND column_name = 'shift_date'`,
  },
  {
    name: "dpr_team_date_exceptions",
    sql: `CREATE TABLE IF NOT EXISTS dpr_team_date_exceptions (
      id serial PRIMARY KEY,
      team_id integer NOT NULL REFERENCES dpr_teams(id) ON DELETE CASCADE,
      date date NOT NULL,
      status text NOT NULL DEFAULT 'not_working',
      UNIQUE(team_id, date)
    )`,
    check: "SELECT 1 FROM information_schema.tables WHERE table_name = 'dpr_team_date_exceptions'",
  },
  {
    name: "dpr_timesheet_entries_date_idx",
    sql: `CREATE INDEX IF NOT EXISTS dpr_timesheet_entries_date_idx ON dpr_timesheet_entries (date)`,
    check: `SELECT 1 FROM pg_indexes WHERE tablename = 'dpr_timesheet_entries' AND indexname = 'dpr_timesheet_entries_date_idx'`,
  },
  {
    name: "dpr_timesheet_entries_shift_date_idx",
    sql: `CREATE INDEX IF NOT EXISTS dpr_timesheet_entries_shift_date_idx ON dpr_timesheet_entries (shift_date) WHERE shift_date IS NOT NULL`,
    check: `SELECT 1 FROM pg_indexes WHERE tablename = 'dpr_timesheet_entries' AND indexname = 'dpr_timesheet_entries_shift_date_idx'`,
  },
  {
    name: "dpr_timesheet_entries_stage_idx",
    sql: `CREATE INDEX IF NOT EXISTS dpr_timesheet_entries_stage_idx ON dpr_timesheet_entries (stage)`,
    check: `SELECT 1 FROM pg_indexes WHERE tablename = 'dpr_timesheet_entries' AND indexname = 'dpr_timesheet_entries_stage_idx'`,
  },
  {
    name: "dpr_timesheet_entries_team_id_idx",
    sql: `CREATE INDEX IF NOT EXISTS dpr_timesheet_entries_team_id_idx ON dpr_timesheet_entries (team_id)`,
    check: `SELECT 1 FROM pg_indexes WHERE tablename = 'dpr_timesheet_entries' AND indexname = 'dpr_timesheet_entries_team_id_idx'`,
  },
  {
    name: "dpr_workers",
    sql: `CREATE TABLE IF NOT EXISTS dpr_workers (
      id serial PRIMARY KEY,
      first_name text NOT NULL,
      last_name text NOT NULL,
      role text,
      company text,
      active boolean NOT NULL DEFAULT true
    )`,
    check: `SELECT 1 FROM information_schema.tables WHERE table_name = 'dpr_workers'`,
  },
  {
    name: "dpr_team_workers",
    sql: `CREATE TABLE IF NOT EXISTS dpr_team_workers (
      team_id integer NOT NULL REFERENCES dpr_teams(id) ON DELETE CASCADE,
      worker_id integer NOT NULL REFERENCES dpr_workers(id) ON DELETE CASCADE,
      CONSTRAINT dpr_team_workers_team_worker_uniq UNIQUE (team_id, worker_id)
    )`,
    check: `SELECT 1 FROM information_schema.tables WHERE table_name = 'dpr_team_workers'`,
  },
  {
    name: "dpr_team_role_slots",
    sql: `CREATE TABLE IF NOT EXISTS dpr_team_role_slots (
      id serial PRIMARY KEY,
      team_id integer NOT NULL REFERENCES dpr_teams(id) ON DELETE CASCADE,
      role text NOT NULL,
      display_order integer NOT NULL DEFAULT 0
    )`,
    check: `SELECT 1 FROM information_schema.tables WHERE table_name = 'dpr_team_role_slots'`,
  },
  {
    name: "dpr_roster_visible_teams",
    sql: `CREATE TABLE IF NOT EXISTS dpr_roster_visible_teams (
      date text NOT NULL,
      team_id integer NOT NULL REFERENCES dpr_teams(id) ON DELETE CASCADE,
      PRIMARY KEY (date, team_id)
    )`,
    check: `SELECT 1 FROM information_schema.tables WHERE table_name = 'dpr_roster_visible_teams'`,
  },
  {
    name: "dpr_daily_assignments",
    sql: `CREATE TABLE IF NOT EXISTS dpr_daily_assignments (
      id serial PRIMARY KEY,
      date text NOT NULL,
      slot_id integer NOT NULL REFERENCES dpr_team_role_slots(id) ON DELETE CASCADE,
      worker_id integer NOT NULL REFERENCES dpr_workers(id) ON DELETE CASCADE,
      CONSTRAINT dpr_daily_assignments_date_slot_uniq UNIQUE (date, slot_id)
    )`,
    check: `SELECT 1 FROM information_schema.tables WHERE table_name = 'dpr_daily_assignments'`,
  },
  {
    name: "dpr_worker_shift_status",
    sql: `CREATE TABLE IF NOT EXISTS dpr_worker_shift_status (
      id serial PRIMARY KEY,
      worker_id integer NOT NULL REFERENCES dpr_workers(id) ON DELETE CASCADE,
      date text NOT NULL,
      status text NOT NULL,
      sign_on_time text,
      sign_off_time text
    )`,
    check: `SELECT 1 FROM information_schema.tables WHERE table_name = 'dpr_worker_shift_status'`,
  },
  {
    name: "dpr_worker_shift_status_worker_date_idx",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS dpr_worker_shift_status_worker_date_idx
          ON dpr_worker_shift_status (worker_id, date)`,
    check: `SELECT 1 FROM pg_indexes WHERE indexname = 'dpr_worker_shift_status_worker_date_idx'`,
  },
  {
    name: "dpr_shift_session",
    sql: `CREATE TABLE IF NOT EXISTS dpr_shift_session (
      id serial PRIMARY KEY,
      date text NOT NULL UNIQUE,
      saved_at text NOT NULL
    )`,
    check: `SELECT 1 FROM information_schema.tables WHERE table_name = 'dpr_shift_session'`,
  },
  {
    // Re-adds the generic_comment column to timesheet entries (was previously dropped)
    // so users can record the specific Generic Comment phrase chosen during Clarify.
    name: "dpr_timesheet_entries_add_generic_comment_v2",
    sql: `ALTER TABLE dpr_timesheet_entries ADD COLUMN IF NOT EXISTS generic_comment text`,
    check: `SELECT 1 FROM information_schema.columns WHERE table_name = 'dpr_timesheet_entries' AND column_name = 'generic_comment'`,
  },
  {
    // Update dpr_jdr_codes.generic_comment with clean phrases (no leading dash prefixes)
    // so the Clarify combobox shows human-readable values.
    name: "dpr_jdr_codes_clean_generic_comments",
    sql: `
      BEGIN;
      UPDATE dpr_jdr_codes AS j SET generic_comment = v.comment
      FROM (VALUES
        (1, 'Initial Tower setup'),
        (2, 'Phase ID'),
        (3, 'TDR Uni-Directional'),
        (4, 'OTDR'),
        (5, 'Sheath Test 10KV'),
        (6, 'As-Found'),
        (7, 'Asset Protection'),
        (8, 'Removal of waste and sheeting'),
        (9, 'Cable Stripping'),
        (10, 'Housekeeping'),
        (11, 'Hang Off Installation'),
        (12, 'Resin Pour (Not Applicable for SIPs)'),
        (13, 'Heating Power Core'),
        (14, 'Applying Straightening Channels/Cooling'),
        (15, 'Soft Routing'),
        (16, 'Routing'),
        (17, 'Cleating'),
        (18, 'Open Environmental Bag'),
        (19, 'Reseal Environmental Bag'),
        (20, 'L1 Prep'),
        (21, 'L1 Install Product'),
        (22, 'L1 Plug in / Connection'),
        (24, 'L2 Prep'),
        (25, 'L2 Install Product'),
        (26, 'L2 Plug in / Connection'),
        (28, 'L3 Prep'),
        (29, 'L3 Install Product'),
        (30, 'L3 Plug in / Connection'),
        (32, 'Temporary Caps Installed ready for Plug-In'),
        (34, 'Earthing'),
        (35, 'FO Routing (inc Service loop)'),
        (36, 'Gland Installation'),
        (37, 'Dressing Fibres'),
        (38, 'Splicing'),
        (39, 'Earthing'),
        (40, 'Tidying up the position during the completion of other works to maintain a suitable working environment'),
        (41, 'Application of RDS-PP Labelling'),
        (42, 'SIP to SIP OTDR/iOLM'),
        (43, 'String Testing OTDR/iOLM'),
        (44, 'Testing of Splices prior to SAT'),
        (45, 'Earth Verification'),
        (46, 'JDR QC'),
        (47, 'As-Left'),
        (48, 'Initial first setup of equipment on OCS'),
        (49, 'Final or additional pack up and storage of equipment on OCS'),
        (50, 'Initial RTS test lead setup'),
        (51, 'Re-Route RTS test lead'),
        (52, 'RTS Setup'),
        (53, 'RTS Testing'),
        (54, 'Packing of Equipment ready for removal from location and final clean up'),
        (56, 'Welfare Break'),
        (57, 'Waiting on JDR technical feedback'),
        (61, 'Onshore/Port activities to prepare for offshore campaign'),
        (62, 'Heli crew Change'),
        (63, 'Onboarding'),
        (65, 'Transit to port'),
        (66, 'Transit to field'),
        (68, 'Contractor HSE standby'),
        (69, 'Client HSE standby'),
        (71, 'Client unable to facilitate RTS test following JDR official communication on readiness'),
        (72, 'Waiting on Transfer to Asset'),
        (73, 'Waiting on Transfer to Vessel'),
        (75, 'Delays caused by other scopes operating from same vessel as JDR'),
        (76, 'SOV Technical Breakdown'),
        (77, 'CTV Technical Breakdown'),
        (82, 'Awaiting erection'),
        (83, 'Awaiting modifications'),
        (84, 'Awaiting striking'),
        (85, 'Awaiting certification'),
        (86, 'Waiting on Employer technical feedback'),
        (90, 'SOV Lifting Ops'),
        (91, 'CTV Lifting Ops'),
        (92, 'Personnel Transfer to Asset'),
        (93, 'Personnel Transfer to Vessel'),
        (94, 'Transit to SIP'),
        (95, 'Transit to OCS'),
        (96, 'Transit to SOV'),
        (97, 'Team completed previous shift late and suitable rest required'),
        (98, 'Standby on location due to weather'),
        (99, 'Standby on vessel due to weather'),
        (100, 'Mobilisation'),
        (101, 'Pre-Termination Testing'),
        (102, 'Pre-Works SIP Set up / Asset protection'),
        (103, 'Mechanical - Cable stripping'),
        (104, 'Mechanical - Hang-off'),
        (105, 'Electrical - Cable routing'),
        (106, 'Electrical - Termination'),
        (107, 'Fibre Optic'),
        (108, 'General husbandry'),
        (109, 'Post-Termination Testing'),
        (110, 'Resonance Testing'),
        (111, 'Variation'),
        (112, 'Demobilisation'),
        (113, 'Additional mobilization of asset - contractor unable to finalize location on previous visit, due to factors outside their control'),
        (114, 'Additional open or close of seal bags not connected as part of T&T scope of work'),
        (115, 'Reconfigure GIS Gland Plates'),
        (116, 'Housekeeping before/after a period of weather downtime'),
        (117, 'Additional de-mobilization of asset - contractor unable to finalize location on previous visit, due to factors outside their control'),
        (118, 'Removal and Storage of CMS'),
        (119, 'Reinstallation of CMS'),
        (120, 'Rectify pre-installed CMS MBR issues'),
        (121, 'Installation of PT100 Sensors')
      ) AS v(id, comment)
      WHERE j.id = v.id;
      COMMENT ON TABLE dpr_jdr_codes IS 'generic_comment_cleaned_v1';
      COMMIT;
    `,
    check: `SELECT 1 FROM pg_description d JOIN pg_class c ON c.oid = d.objoid WHERE c.relname = 'dpr_jdr_codes' AND d.description = 'generic_comment_cleaned_v1'`,
  },
  {
    name: "users_password_hash_nullable",
    sql: `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`,
    check: `SELECT 1 FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'password_hash' AND is_nullable = 'YES'`,
  },
  {
    name: "users_invite_token_columns",
    sql: `ALTER TABLE users
            ADD COLUMN IF NOT EXISTS invite_token text UNIQUE,
            ADD COLUMN IF NOT EXISTS invite_token_expires_at timestamptz`,
    check: `SELECT 1 FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'invite_token'`,
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
