import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { syncCablesFromSheet } from "./routes/cables";

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
      // Pass 1: match by drive_file_id (exact, fastest)
      const r1 = await db.execute(sql`
        UPDATE sheet_photos
        SET wasabi_key = wmt.wasabi_key
        FROM wasabi_mirror_tasks wmt
        WHERE sheet_photos.drive_file_id = wmt.drive_file_id
          AND wmt.status = 'done'
          AND sheet_photos.wasabi_key IS NULL
      `);
      const linked = (r1 as unknown as { rowCount?: number }).rowCount ?? 0;
      logger.info({ linked }, "Startup: linked sheet_photos to Wasabi mirror keys (drive_file_id)");

      // Pass 2: match remaining photos by photo_id prefix in mirror filename
      // Files are named "{photo_id}.{type}.{timestamp}.{ext}" — extract the 8-char hex prefix
      const r2 = await db.execute(sql`
        UPDATE sheet_photos
        SET wasabi_key = best.wasabi_key
        FROM (
          SELECT DISTINCT ON (photo_id_prefix)
            substring(file_name FROM '^([0-9a-f]{8})\\.') AS photo_id_prefix,
            wasabi_key
          FROM wasabi_mirror_tasks
          WHERE status = 'done'
            AND lower(file_name) ~ '\\.(jpg|jpeg|png|webp|heic)$'
            AND file_name ~ '^[0-9a-f]{8}\\.'
          ORDER BY photo_id_prefix,
            CASE
              WHEN lower(file_name) LIKE '%.jpg'  THEN 1
              WHEN lower(file_name) LIKE '%.jpeg' THEN 2
              WHEN lower(file_name) LIKE '%.png'  THEN 3
              WHEN lower(file_name) LIKE '%.webp' THEN 4
              ELSE 5
            END,
            file_name
        ) best
        WHERE sheet_photos.photo_id = best.photo_id_prefix
          AND sheet_photos.wasabi_key IS NULL
      `);
      const linked_by_prefix = (r2 as unknown as { rowCount?: number }).rowCount ?? 0;
      logger.info({ linked_by_prefix }, "Startup: linked additional photos via photo_id filename match");
    } catch (err: unknown) {
      logger.warn({ err }, "Startup: wasabi auto-link skipped (table may not exist yet)");
    }
  })();

  // Pass 3: sync cable IDs from Cable sheet into towers.connected_to
  void (async () => {
    try {
      const updated = await syncCablesFromSheet();
      logger.info({ updated }, "Startup: synced cable IDs from Cable sheet");
    } catch (err: unknown) {
      logger.warn({ err }, "Startup: cable sync skipped");
    }
  })();
});
