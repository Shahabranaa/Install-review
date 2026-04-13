import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Auto-link sheet_photos to Wasabi keys from mirror table on startup (idempotent)
  void (async () => {
    try {
      const result = await db.execute(sql`
        UPDATE sheet_photos
        SET wasabi_key = wmt.wasabi_key
        FROM wasabi_mirror_tasks wmt
        WHERE sheet_photos.drive_file_id = wmt.drive_file_id
          AND wmt.status = 'done'
          AND sheet_photos.wasabi_key IS NULL
      `);
      const linked = (result as unknown as { rowCount?: number }).rowCount ?? 0;
      logger.info({ linked }, "Startup: linked sheet_photos to Wasabi mirror keys");
    } catch (err: unknown) {
      logger.warn({ err }, "Startup: wasabi auto-link skipped (table may not exist yet)");
    }
  })();
});
