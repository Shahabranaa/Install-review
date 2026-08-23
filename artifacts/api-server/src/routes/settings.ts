import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, appSettingsTable } from "@workspace/db";
import { invalidateCredsCache } from "../lib/wasabi.js";
import { validateLautecUrl } from "../lib/lautec-url-policy.js";

const router: IRouter = Router();

const KEY_ACCESS_KEY_ID     = "wasabi_access_key_id";
const KEY_SECRET_ACCESS_KEY = "wasabi_secret_access_key";
const KEY_BUCKET            = "wasabi_bucket_name";
const KEY_REGION            = "wasabi_region";
const ALL_KEYS              = [KEY_ACCESS_KEY_ID, KEY_SECRET_ACCESS_KEY, KEY_BUCKET, KEY_REGION] as const;

const KEY_SHEET_ID  = "google_sheet_id";
const KEY_SHEET_GID = "google_sheet_gid";
const KEY_LAUTEC_LOGIN_URL = "lautec_login_url";
const KEY_LAUTEC_UI_SELECTORS = "lautec_ui_selectors";
const LAUTEC_DEFAULT_LOGIN_URL = "https://dpr.lautec.com/";
const LAUTEC_LOGIN_SELECTOR_KEYS = ["username", "continueSubmit", "password", "loginSubmit", "loginComplete"] as const;

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.sessionType === "worker" || req.session?.accessLevel !== "admin") {
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

// ---------------------------------------------------------------------------
// GET /api/settings/google-sheet — return current Sheet ID + GID (admin only)
// ---------------------------------------------------------------------------
router.get("/settings/google-sheet", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(appSettingsTable)
      .where(inArray(appSettingsTable.key, [KEY_SHEET_ID, KEY_SHEET_GID]));
    const m: Record<string, string> = {};
    for (const r of rows) m[r.key] = r.value;
    res.json({
      sheetId:  m[KEY_SHEET_ID]  ?? process.env["GOOGLE_SHEET_ID"]  ?? "",
      sheetGid: m[KEY_SHEET_GID] ?? process.env["GOOGLE_SHEET_GID"] ?? "",
      source: Object.keys(m).length > 0 ? "db" : "env",
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/settings/google-sheet — upsert Sheet ID + GID (admin only)
// ---------------------------------------------------------------------------
router.post("/settings/google-sheet", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { sheetId, sheetGid } = req.body as Record<string, string>;
    const toUpsert: { key: string; value: string }[] = [];
    if (sheetId?.trim())  toUpsert.push({ key: KEY_SHEET_ID,  value: sheetId.trim() });
    if (sheetGid?.trim()) toUpsert.push({ key: KEY_SHEET_GID, value: sheetGid.trim() });
    for (const { key, value } of toUpsert) {
      await db.insert(appSettingsTable).values({ key, value })
        .onConflictDoUpdate({ target: appSettingsTable.key, set: { value, updatedAt: new Date() } });
    }
    res.json({ ok: true, updated: toUpsert.map((r) => r.key) });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ---------------------------------------------------------------------------
// GET /api/settings/lautec — connection configuration and secret status
// ---------------------------------------------------------------------------
router.get("/settings/lautec", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(appSettingsTable)
      .where(inArray(appSettingsTable.key, [KEY_LAUTEC_LOGIN_URL, KEY_LAUTEC_UI_SELECTORS]));
    const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    let savedSelectors: Record<string, string> = {};
    try {
      savedSelectors = settings[KEY_LAUTEC_UI_SELECTORS] ? JSON.parse(settings[KEY_LAUTEC_UI_SELECTORS]) : {};
    } catch {
      // The import endpoint reports malformed configuration with actionable detail.
    }
    let environmentSelectors: Record<string, string> = {};
    try {
      environmentSelectors = process.env.LAUTEC_UI_SELECTORS_JSON ? JSON.parse(process.env.LAUTEC_UI_SELECTORS_JSON) : {};
    } catch {
      // The import endpoint reports malformed configuration with actionable detail.
    }
    const selectors = { ...environmentSelectors, ...savedSelectors };
    res.json({
      loginUrl: settings[KEY_LAUTEC_LOGIN_URL] ?? process.env.LAUTEC_LOGIN_URL ?? LAUTEC_DEFAULT_LOGIN_URL,
      usernameConfigured: Boolean(process.env.LAUTEC_USERNAME),
      passwordConfigured: Boolean(process.env.LAUTEC_PASSWORD),
      selectorsConfigured: Boolean(
        selectors.username && selectors.continueSubmit && selectors.password && selectors.loginSubmit
        && selectors.resetRows && selectors.addRow && selectors.row
        && selectors.activityGroup && selectors.activity
        && selectors.location && selectors.start && selectors.finish && selectors.comment
        && selectors.pax && selectors.submit && selectors.success,
      ),
      loginSelectors: {
        username: selectors.username ?? 'input[type="email"]',
        continueSubmit: selectors.continueSubmit ?? selectors.loginSubmit ?? "button[type=submit]",
        password: selectors.password ?? 'input[type="password"]',
        loginSubmit: selectors.loginSubmit ?? "button[type=submit]",
        loginComplete: selectors.loginComplete ?? "",
      },
      source: rows.length > 0 ? "db" : "env",
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/settings/lautec — persist non-secret browser destinations
// ---------------------------------------------------------------------------
router.post("/settings/lautec", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { loginUrl, loginSelectors } = req.body as {
      loginUrl?: string;
      loginSelectors?: Record<string, unknown>;
    };
    const value = loginUrl?.trim();
    if (value) {
      const urlError = validateLautecUrl(value);
      if (urlError) {
        res.status(400).json({ error: `Login URL ${urlError}` });
        return;
      }
      await db.insert(appSettingsTable).values({ key: KEY_LAUTEC_LOGIN_URL, value })
        .onConflictDoUpdate({ target: appSettingsTable.key, set: { value, updatedAt: new Date() } });
    }
    if (loginSelectors) {
      const [existing] = await db.select().from(appSettingsTable)
        .where(eq(appSettingsTable.key, KEY_LAUTEC_UI_SELECTORS));
      let selectors: Record<string, string> = {};
      try {
        selectors = existing?.value ? JSON.parse(existing.value) : {};
      } catch {
        res.status(400).json({ error: "Saved Lautec selectors are invalid. Contact a technical administrator." });
        return;
      }
      for (const key of LAUTEC_LOGIN_SELECTOR_KEYS) {
        const value = loginSelectors[key];
        if (typeof value !== "string") continue;
        const trimmed = value.trim();
        if (trimmed.length > 500) {
          res.status(400).json({ error: "A Lautec selector is too long." });
          return;
        }
        if (trimmed) selectors[key] = trimmed;
        else delete selectors[key];
      }
      await db.insert(appSettingsTable).values({ key: KEY_LAUTEC_UI_SELECTORS, value: JSON.stringify(selectors) })
        .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: JSON.stringify(selectors), updatedAt: new Date() } });
    }
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
