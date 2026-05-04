import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { Signer } from "@aws-sdk/rds-signer";
import * as schema from "./schema";

const { Pool } = pg;

function buildAuroraPool(): InstanceType<typeof Pool> {
  const host = process.env["NEON_DATABASE_PGHOST"];
  const port = parseInt(process.env["NEON_DATABASE_PGPORT"] ?? "5432", 10);
  const user = process.env["NEON_DATABASE_PGUSER"];
  const database = process.env["NEON_DATABASE_PGDATABASE"];
  const region = process.env["NEON_DATABASE_AWS_REGION"];
  const ssl = process.env["NEON_DATABASE_PGSSLMODE"] !== "disable";

  if (!host || !user || !database || !region) {
    throw new Error(
      "Aurora env vars missing: need NEON_DATABASE_PGHOST, NEON_DATABASE_PGUSER, NEON_DATABASE_PGDATABASE, NEON_DATABASE_AWS_REGION",
    );
  }

  const signer = new Signer({ hostname: host, port, username: user, region });

  return new Pool({
    host,
    port,
    user,
    database,
    ssl: ssl ? { rejectUnauthorized: true } : false,
    password: () => signer.getAuthToken(),
  });
}

function buildPool(): InstanceType<typeof Pool> {
  const connectionString =
    process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"];

  if (connectionString) {
    return new Pool({ connectionString });
  }

  if (process.env["NEON_DATABASE_PGHOST"]) {
    return buildAuroraPool();
  }

  throw new Error(
    "No database configuration found. Set NEON_DATABASE_URL, DATABASE_URL, or NEON_DATABASE_PGHOST.",
  );
}

export const pool = buildPool();
export const db = drizzle(pool, { schema });

export * from "./schema";
