import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, appSettingsTable } from "@workspace/db";
import { invalidateCredsCache } from "../lib/wasabi.js";

const router: IRouter = Router();

const KEY_ACCESS_KEY_ID     = "wasabi_access_key_id";
const KEY_SECRET_ACCESS_KEY = "wasabi_secret_access_key";
const KEY_BUCKET            = "wasabi_bucket_name";
const KEY_REGION            = "wasabi_region";
const ALL_KEYS              = [KEY_ACCESS_KEY_ID, KEY_SECRET_ACCESS_KEY, KEY_BUCKET, KEY_REGION] as const;

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.accessLevel !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

function maskSecret(value: string): string {
  if (!value) return "";
  const visible = value.slice(0, 4);
  return `${visible}${"•".repeat(Math.max(8, value.length - 4))}`;
}

// ---------------------------------------------------------------------------
// GET /api/settings/wasabi — return current credentials (secret masked)
// ---------------------------------------------------------------------------
router.get("/settings/wasabi", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(appSettingsTable)
      .where(inArray(appSettingsTable.key, ALL_KEYS as unknown as string[]));

    const m: Record<string, string> = {};
    for (const r of rows) m[r.key] = r.value;

    const secret = m[KEY_SECRET_ACCESS_KEY] ?? "";
    const source = Object.keys(m).length > 0 ? "db" : "env";

    res.json({
      accessKeyId:  m[KEY_ACCESS_KEY_ID]  ?? process.env["WASABI_ACCESS_KEY_ID"]  ?? "",
      secretMasked: secret ? maskSecret(secret) : (process.env["WASABI_SECRET_ACCESS_KEY"] ? maskSecret(process.env["WASABI_SECRET_ACCESS_KEY"]!) : ""),
      bucket:       m[KEY_BUCKET]         ?? process.env["WASABI_BUCKET_NAME"]     ?? "",
      region:       m[KEY_REGION]         ?? process.env["WASABI_REGION"]           ?? "eu-west-1",
      source,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ---------------------------------------------------------------------------
// GET /api/settings/wasabi/reveal — return full secret (admin only, on demand)
// ---------------------------------------------------------------------------
router.get("/settings/wasabi/reveal", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, KEY_SECRET_ACCESS_KEY));

    const secret = rows[0]?.value ?? process.env["WASABI_SECRET_ACCESS_KEY"] ?? null;
    res.json({ secretAccessKey: secret });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/settings/wasabi — upsert credentials (admin only)
// ---------------------------------------------------------------------------
router.post("/settings/wasabi", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { accessKeyId, secretAccessKey, bucket, region } = req.body as Record<string, string>;

    const toUpsert: { key: string; value: string }[] = [];
    if (accessKeyId?.trim())     toUpsert.push({ key: KEY_ACCESS_KEY_ID,     value: accessKeyId.trim() });
    if (secretAccessKey?.trim()) toUpsert.push({ key: KEY_SECRET_ACCESS_KEY, value: secretAccessKey.trim() });
    if (bucket?.trim())          toUpsert.push({ key: KEY_BUCKET,            value: bucket.trim() });
    if (region?.trim())          toUpsert.push({ key: KEY_REGION,            value: region.trim() });

    for (const { key, value } of toUpsert) {
      await db
        .insert(appSettingsTable)
        .values({ key, value })
        .onConflictDoUpdate({ target: appSettingsTable.key, set: { value, updatedAt: new Date() } });
    }

    invalidateCredsCache();
    res.json({ ok: true, updated: toUpsert.map((r) => r.key) });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
