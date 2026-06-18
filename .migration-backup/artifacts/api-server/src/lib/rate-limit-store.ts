import type { Pool } from "pg";
import type { Store, ClientRateLimitInfo } from "express-rate-limit";

/**
 * PostgreSQL-backed store for express-rate-limit.
 *
 * Persists attempt counts in Neon so that the limit survives server restarts
 * and is shared across all Vercel function instances.
 *
 * Each row: (key TEXT PK, hits INT, reset_time TIMESTAMPTZ)
 * The UPSERT logic resets the counter automatically once reset_time has passed,
 * so no background cleanup job is needed.
 */
export class PostgresRateLimitStore implements Store {
  private readonly pool: Pool;
  private readonly windowMs: number;
  private readonly table: string;

  constructor(pool: Pool, windowMs: number, table = "rate_limit_attempts") {
    this.pool = pool;
    this.windowMs = windowMs;
    this.table = table;
  }

  /** Called once by express-rate-limit on startup — create the table if needed. */
  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${this.table} (
        key        TEXT        NOT NULL PRIMARY KEY,
        hits       INTEGER     NOT NULL DEFAULT 1,
        reset_time TIMESTAMPTZ NOT NULL
      )
    `);
  }

  /**
   * Atomically increment the hit count for a key.
   * If the stored window has already expired, reset to 1 and start a fresh window.
   */
  async increment(key: string): Promise<ClientRateLimitInfo> {
    const resetTime = new Date(Date.now() + this.windowMs);

    const { rows } = await this.pool.query<{ hits: number; reset_time: Date }>(
      `INSERT INTO ${this.table} (key, hits, reset_time)
       VALUES ($1, 1, $2)
       ON CONFLICT (key) DO UPDATE
         SET
           hits       = CASE WHEN ${this.table}.reset_time < NOW() THEN 1
                             ELSE ${this.table}.hits + 1
                        END,
           reset_time = CASE WHEN ${this.table}.reset_time < NOW() THEN $2
                             ELSE ${this.table}.reset_time
                        END
       RETURNING hits, reset_time`,
      [key, resetTime],
    );

    return {
      totalHits: rows[0]!.hits,
      resetTime: new Date(rows[0]!.reset_time),
    };
  }

  /** Undo one hit (used when skipSuccessfulRequests = true). */
  async decrement(key: string): Promise<void> {
    await this.pool.query(
      `UPDATE ${this.table}
       SET hits = GREATEST(0, hits - 1)
       WHERE key = $1 AND reset_time > NOW()`,
      [key],
    );
  }

  /** Clear the counter for a single key. */
  async resetKey(key: string): Promise<void> {
    await this.pool.query(`DELETE FROM ${this.table} WHERE key = $1`, [key]);
  }

  /** Clear all counters (used by express-rate-limit in tests). */
  async resetAll(): Promise<void> {
    await this.pool.query(`DELETE FROM ${this.table}`);
  }
}
