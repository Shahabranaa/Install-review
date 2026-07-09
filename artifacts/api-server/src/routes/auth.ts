import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { eq, or } from "drizzle-orm";
import { db, usersTable, workersTable } from "@workspace/db";
import { serialize } from "../lib/serialize";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Seed the default admin user — development only, never production.
// Uses ADMIN_SEED_PASSWORD env var when set; otherwise generates a random
// credential and prints it once to stdout.
export async function seedAdminUser() {
  const existing = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
  if (existing.length > 0) return;

  const seedPassword = process.env["ADMIN_SEED_PASSWORD"] ?? crypto.randomBytes(18).toString("base64url");
  const passwordHash = await bcrypt.hash(seedPassword, 12);
  await db.insert(usersTable).values({
    username: "admin",
    passwordHash,
    displayName: "Administrator",
    email: "",
    title: "System Administrator",
    accessLevel: "admin",
    active: true,
  });
  // Print credential once — deliberately to stdout so it appears in dev logs only
  console.log(`[SEED] Default admin created — username: admin  password: ${seedPassword}`);
}

// Keep the "admin" account's password in sync with ADMIN_SEED_PASSWORD on
// every startup, so updating the secret is the single source of truth for
// that account's credential (no manual DB patching required). No-op if the
// secret isn't set, or if there's no "admin" user yet (seedAdminUser handles
// that case).
export async function syncAdminSeedPassword() {
  const seedPassword = process.env["ADMIN_SEED_PASSWORD"];
  if (!seedPassword) return;

  const [admin] = await db
    .select({ id: usersTable.id, passwordHash: usersTable.passwordHash })
    .from(usersTable)
    .where(eq(usersTable.username, "admin"));
  if (!admin) return;

  const alreadyMatches = await bcrypt.compare(seedPassword, admin.passwordHash).catch(() => false);
  if (alreadyMatches) return;

  const passwordHash = await bcrypt.hash(seedPassword, 12);
  await db
    .update(usersTable)
    .set({ passwordHash, active: true })
    .where(eq(usersTable.id, admin.id));
  logger.info({ userId: admin.id }, "Synced 'admin' account password from ADMIN_SEED_PASSWORD");
}

// Detect any admin account still using the compromised default credential and
// deactivate it immediately. Runs at startup in all environments.
export async function auditDefaultAdminCredential() {
  const COMPROMISED = "admin123";
  const admins = await db
    .select({ id: usersTable.id, username: usersTable.username })
    .from(usersTable)
    .where(eq(usersTable.active, true));

  for (const user of admins) {
    const rows = await db
      .select({ hash: usersTable.passwordHash })
      .from(usersTable)
      .where(eq(usersTable.id, user.id));
    const hash = rows[0]?.hash ?? "";
    const isCompromised = await bcrypt.compare(COMPROMISED, hash).catch(() => false);
    if (isCompromised) {
      await db.update(usersTable).set({ active: false }).where(eq(usersTable.id, user.id));
      logger.error(
        { username: user.username },
        "SECURITY: deactivated account — it was still using the default credential 'admin123'. " +
        "Log in as another admin and create a new secure password.",
      );
    }
  }
}

// POST /api/auth/unified-login
// Accepts email or username + password. Checks admin users first, then workers.
// Returns { type: "admin", user: {...} } or { type: "worker", worker: {...} }.
router.post("/auth/unified-login", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const { identifier, password, appContext } = req.body as { identifier?: string; password?: string; appContext?: string };

  if (!identifier?.trim() || !password) {
    res.status(400).json({ error: "Email/username and password are required" });
    return;
  }

  const trimmed = identifier.trim();

  // 1. Check admin/staff users table (match by username — usernames are not emails)
  const [adminUser] = await db.select().from(usersTable).where(eq(usersTable.username, trimmed));

  if (adminUser && adminUser.active) {
    const valid = await bcrypt.compare(password, adminUser.passwordHash);
    if (valid) {
      req.session.userId = adminUser.id;
      req.session.username = adminUser.username;
      req.session.displayName = adminUser.displayName;
      req.session.accessLevel = adminUser.accessLevel;
      delete req.session.sessionType;
      delete req.session.workerId;
      delete req.session.workerName;

      await new Promise<void>((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve()))
      );

      res.json({
        type: "admin" as const,
        user: {
          id: adminUser.id,
          username: adminUser.username,
          displayName: adminUser.displayName,
          email: adminUser.email,
          title: adminUser.title,
          accessLevel: adminUser.accessLevel,
          active: adminUser.active,
        },
      });
      return;
    }
  }

  // 2. Check workers table (match by email or portalUsername)
  const lower = trimmed.toLowerCase();
  const [worker] = await db
    .select()
    .from(workersTable)
    .where(or(eq(workersTable.email, lower), eq(workersTable.portalUsername, trimmed)));

  if (worker && worker.active && worker.portalPasswordHash) {
    const valid = await bcrypt.compare(password, worker.portalPasswordHash);
    if (valid) {
      // If logging in via InstallReview, worker must have explicit access granted
      if (appContext === "installreview" && !worker.installReviewAccess) {
        res.status(403).json({ error: "You do not have access to InstallReview. Contact your administrator." });
        return;
      }

      req.session.sessionType = "worker";
      req.session.workerId = worker.id;
      req.session.workerName = worker.name;
      delete req.session.userId;
      delete req.session.username;
      delete req.session.displayName;
      delete req.session.accessLevel;

      await new Promise<void>((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve()))
      );

      res.json({
        type: "worker" as const,
        worker: {
          id: worker.id,
          name: worker.name,
          email: worker.email,
          company: worker.company,
          portalUsername: worker.portalUsername,
        },
      });
      return;
    }
  }

  res.status(401).json({ error: "Invalid credentials" });
});

// POST /api/auth/login (kept for backward compatibility)
router.post("/auth/login", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));

  if (!user || !user.active) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  await new Promise<void>((resolve, reject) =>
    req.session.regenerate((err) => (err ? reject(err) : resolve()))
  );
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.displayName = user.displayName;
  req.session.accessLevel = user.accessLevel;
  delete req.session.sessionType;
  delete req.session.workerId;
  delete req.session.workerName;

  res.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    title: user.title,
    accessLevel: user.accessLevel,
  });
});

// POST /api/auth/logout
router.post("/auth/logout", (req, res): void => {
  res.setHeader("Cache-Control", "no-store");
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// GET /api/auth/me
router.get("/auth/me", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId));
  if (!user || !user.active) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "User not found or inactive" });
    return;
  }

  res.json(serialize({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    title: user.title,
    accessLevel: user.accessLevel,
    active: user.active,
  }));
});

export default router;
