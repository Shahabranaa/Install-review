import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function buildPool(): InstanceType<typeof Pool> {
  const connStr = process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"];
  if (!connStr) {
    throw new Error("No database configuration found. Set NEON_DATABASE_URL or DATABASE_URL.");
  }
  return new Pool({ connectionString: connStr });
}

export const pool = buildPool();
export const db = drizzle(pool, { schema });

export * from "./schema";
