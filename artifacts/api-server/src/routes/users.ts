import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { serialize } from "../lib/serialize";

const router: IRouter = Router();

function requireAdmin(req: any, res: any, next: any) {
  if (req.session?.accessLevel !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

function safeUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    title: user.title,
    accessLevel: user.accessLevel,
    active: user.active,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// GET /api/users — list all users (admin only)
router.get("/users", requireAdmin, async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  res.json(serialize(users.map(safeUser)));
});

// POST /api/users — create a new user (admin only)
router.post("/users", requireAdmin, async (req, res): Promise<void> => {
  const { username, password, displayName, email, title, accessLevel } = req.body as {
    username?: string;
    password?: string;
    displayName?: string;
    email?: string;
    title?: string;
    accessLevel?: string;
  };

  if (!username?.trim() || !password?.trim() || !displayName?.trim()) {
    res.status(400).json({ error: "username, password, and displayName are required" });
    return;
  }

  if (!["admin", "reviewer", "viewer"].includes(accessLevel ?? "")) {
    res.status(400).json({ error: "accessLevel must be admin, reviewer, or viewer" });
    return;
  }

  // Check username uniqueness
  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, username));
  if (existing.length > 0) {
    res.status(409).json({ error: "Username already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({
    username,
    passwordHash,
    displayName,
    email: email ?? null,
    title: title ?? null,
    accessLevel: accessLevel ?? "viewer",
    active: true,
  }).returning();

  res.status(201).json(serialize(safeUser(user)));
});

// PATCH /api/users/:id — update a user (admin only)
router.patch("/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user id" }); return; }

  const { displayName, email, title, accessLevel, active, password } = req.body as {
    displayName?: string;
    email?: string;
    title?: string;
    accessLevel?: string;
    active?: boolean;
    password?: string;
  };

  if (accessLevel && !["admin", "reviewer", "viewer"].includes(accessLevel)) {
    res.status(400).json({ error: "accessLevel must be admin, reviewer, or viewer" });
    return;
  }

  const updates: Partial<typeof usersTable.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() };
  if (displayName !== undefined) updates.displayName = displayName;
  if (email !== undefined) updates.email = email;
  if (title !== undefined) updates.title = title;
  if (accessLevel !== undefined) updates.accessLevel = accessLevel;
  if (active !== undefined) updates.active = active;
  if (password?.trim()) updates.passwordHash = await bcrypt.hash(password, 10);

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  res.json(serialize(safeUser(user)));
});

// DELETE /api/users/:id — deactivate a user (admin only; can't delete self)
router.delete("/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user id" }); return; }

  if (id === (req as any).session?.userId) {
    res.status(400).json({ error: "Cannot deactivate your own account" });
    return;
  }

  const [user] = await db.update(usersTable)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(usersTable.id, id))
    .returning();

  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(serialize(safeUser(user)));
});

export default router;
