-- Task #17: Workforce Compliance — Mobilisation Readiness Engine
-- Applied to Neon DB (NEON_DATABASE_URL) via psql

CREATE TABLE IF NOT EXISTS roles (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mob_sites (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  location     TEXT,
  description  TEXT,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS certifications (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL UNIQUE,
  description      TEXT,
  validity_months  INTEGER,
  category         TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workers (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT UNIQUE,
  company     TEXT,
  winda_id    TEXT UNIQUE,
  role_id     INTEGER REFERENCES roles(id) ON DELETE SET NULL,
  notes       TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS worker_certifications (
  id                SERIAL PRIMARY KEY,
  worker_id         INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  certification_id  INTEGER NOT NULL REFERENCES certifications(id) ON DELETE CASCADE,
  date_achieved     DATE,
  expiry_date       DATE,
  verified          BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at       TIMESTAMPTZ,
  file_url          TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (worker_id, certification_id)
);

CREATE TABLE IF NOT EXISTS site_cert_requirements (
  id                SERIAL PRIMARY KEY,
  site_id           INTEGER NOT NULL REFERENCES mob_sites(id) ON DELETE CASCADE,
  certification_id  INTEGER NOT NULL REFERENCES certifications(id) ON DELETE CASCADE,
  required          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, certification_id)
);

CREATE TABLE IF NOT EXISTS role_cert_requirements (
  id                SERIAL PRIMARY KEY,
  role_id           INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  certification_id  INTEGER NOT NULL REFERENCES certifications(id) ON DELETE CASCADE,
  required          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (role_id, certification_id)
);

CREATE TABLE IF NOT EXISTS worker_cert_overrides (
  id                SERIAL PRIMARY KEY,
  worker_id         INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  certification_id  INTEGER NOT NULL REFERENCES certifications(id) ON DELETE CASCADE,
  required          BOOLEAN NOT NULL,
  reason            TEXT,
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (worker_id, certification_id)
);

CREATE TABLE IF NOT EXISTS site_assignments (
  id                  SERIAL PRIMARY KEY,
  worker_id           INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  site_id             INTEGER NOT NULL REFERENCES mob_sites(id) ON DELETE CASCADE,
  assigned_date       DATE,
  mobilisation_date   DATE,
  status              TEXT NOT NULL DEFAULT 'active',
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (worker_id, site_id)
);

-- Note: workforce_roles was renamed to roles after initial creation:
-- ALTER TABLE workforce_roles RENAME TO roles;
