import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq, or } from "drizzle-orm";
import { db, usersTable, workersTable } from "@workspace/db";
import { serialize } from "../lib/serialize";

const router: IRouter = Router();

// Seed the default admin user if no users exist
export async function seedAdminUser() {
  const existing = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
  if (existing.length === 0) {
    const passwordHash = await bcrypt.hash("admin123", 10);
    await db.insert(usersTable).values({
      username: "admin",
      passwordHash,
      displayName: "Administrator",
      email: "",
      title: "System Administrator",
      accessLevel: "admin",
      active: true,
    });
    console.log("✅ Default admin user created: username=admin password=admin123");
  }
}

// POST /api/auth/unified-login
// Accepts email or username + password. Checks admin users first, then workers.
// Returns { type: "admin", user: {...} } or { type: "worker", worker: {...} }.
router.post("/auth/unified-login", async (req, res): Promise<void> => {
  const { identifier, password } = req.body as { identifier?: string; password?: string };

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
      await new Promise<void>((resolve, reject) =>
        req.session.regenerate((err) => (err ? reject(err) : resolve()))
      );
      req.session.userId = adminUser.id;
      req.session.username = adminUser.username;
      req.session.displayName = adminUser.displayName;
      req.session.accessLevel = adminUser.accessLevel;
      delete req.session.sessionType;
      delete req.session.workerId;
      delete req.session.workerName;

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
      await new Promise<void>((resolve, reject) =>
        req.session.regenerate((err) => (err ? reject(err) : resolve()))
      );
      req.session.sessionType = "worker";
      req.session.workerId = worker.id;
      req.session.workerName = worker.name;
      delete req.session.userId;
      delete req.session.username;
      delete req.session.displayName;
      delete req.session.accessLevel;

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
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// GET /api/auth/me
router.get("/auth/me", async (req, res): Promise<void> => {
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
