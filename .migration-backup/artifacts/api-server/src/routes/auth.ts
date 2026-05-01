import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
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

// POST /api/auth/login
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

  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.displayName = user.displayName;
  req.session.accessLevel = user.accessLevel;

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
