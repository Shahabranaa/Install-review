import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import crypto, { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { serialize } from "../lib/serialize";
import { sendEmail, buildDprInviteHtml } from "../lib/mailjet";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const MIN_PASSWORD_LENGTH = 6;

function passwordValidationError(password: unknown): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (password === "admin123") {
    return "Choose a different password; this password is not allowed";
  }
  return null;
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.sessionType === "worker" || req.session?.accessLevel !== "admin") {
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
    invitePending: !user.passwordHash,   // true = invite sent but not yet accepted
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/** Derive the DPR app base URL from the incoming request headers. */
function getDprBaseUrl(req: Request): string {
  const proto = Array.isArray(req.headers["x-forwarded-proto"])
    ? req.headers["x-forwarded-proto"][0]
    : (req.headers["x-forwarded-proto"] ?? (req.secure ? "https" : "http"));
  const host = Array.isArray(req.headers["x-forwarded-host"])
    ? req.headers["x-forwarded-host"][0]
    : (req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost");
  return `${proto}://${host}/dpr`;
}

async function generateAndSendInvite(
  req: Request,
  user: typeof usersTable.$inferSelect
): Promise<{ success: boolean; error?: string }> {
  // Generate a raw token, store its SHA-256 hash
  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

  await db.update(usersTable).set({
    inviteToken: hashedToken,
    inviteTokenExpiresAt: expiresAt,
    active: false,   // stays inactive until they accept the invite
  }).where(eq(usersTable.id, user.id));

  if (!user.email) {
    return { success: false, error: "No email address on this user — cannot send invite" };
  }

  const setPasswordUrl = `${getDprBaseUrl(req)}/set-password?token=${rawToken}`;
  const result = await sendEmail({
    toEmail: user.email,
    toName: user.displayName,
    subject: "You've been invited to DPR Timesheets",
    htmlBody: buildDprInviteHtml({
      userName: user.displayName,
      setPasswordUrl,
    }),
  });

  if (!result.success) {
    logger.warn({ userId: user.id, error: result.error }, "Invite email failed to send");
  }
  return result;
}

// GET /api/users — list all users (admin only)
router.get("/users", requireAdmin, async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  res.json(serialize(users.map(safeUser)));
});

// POST /api/users — create a new user and send invite email (admin only)
router.post("/users", requireAdmin, async (req, res): Promise<void> => {
  const { username, displayName, email, title, accessLevel, password, active } = req.body as {
    username?: string;
    displayName?: string;
    email?: string;
    title?: string;
    accessLevel?: string;
    password?: string;
    active?: boolean;
  };
  const manualProvisioning = password !== undefined;

  if (!username?.trim() || !displayName?.trim()) {
    res.status(400).json({ error: "username and displayName are required" });
    return;
  }
  if (!manualProvisioning && !email?.trim()) {
    res.status(400).json({ error: "email is required to send the invite" });
    return;
  }
  if (accessLevel && !["admin", "reviewer", "viewer"].includes(accessLevel)) {
    res.status(400).json({ error: "accessLevel must be admin, reviewer, or viewer" });
    return;
  }
  if (active !== undefined && typeof active !== "boolean") {
    res.status(400).json({ error: "active must be true or false" });
    return;
  }
  if (manualProvisioning) {
    const passwordError = passwordValidationError(password);
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }
  }

  // Check username uniqueness
  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, username.trim()));
  if (existing.length > 0) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }

  const [user] = await db.insert(usersTable).values({
    username: username.trim(),
    passwordHash: manualProvisioning ? await bcrypt.hash(password, 10) : null,
    displayName: displayName.trim(),
    email: email?.trim() || null,
    title: title?.trim() ?? null,
    accessLevel: accessLevel ?? "reviewer",
    // Manual accounts activate only when the administrator explicitly asks.
    // Invite accounts stay inactive until the invite is accepted.
    active: manualProvisioning && active === true,
  }).returning();

  const emailResult = manualProvisioning
    ? { success: false }
    : await generateAndSendInvite(req, user);

  const responseUser = safeUser(await db.select().from(usersTable).where(eq(usersTable.id, user.id)).then(r => r[0]));
  res.status(201).json({
    user: serialize(responseUser),
    emailSent: emailResult.success,
    emailError: emailResult.error ?? null,
    manualPasswordSet: manualProvisioning,
  });
});

// POST /api/users/:id/resend-invite — regenerate token and resend email (admin only)
router.post("/users/:id/resend-invite", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user id" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  if (user.passwordHash) {
    res.status(400).json({ error: "User has already accepted their invite" });
    return;
  }
  if (!user.email) {
    res.status(400).json({ error: "User has no email address" });
    return;
  }

  const emailResult = await generateAndSendInvite(req, user);
  if (!emailResult.success) {
    res.status(502).json({ error: emailResult.error ?? "Failed to send email" });
    return;
  }
  res.json({ ok: true });
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
  if (active !== undefined && typeof active !== "boolean") {
    res.status(400).json({ error: "active must be true or false" });
    return;
  }
  if (password !== undefined) {
    const passwordError = passwordValidationError(password);
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }
  }

  const updates: Partial<typeof usersTable.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() };
  if (displayName !== undefined) updates.displayName = displayName;
  if (email !== undefined) updates.email = email;
  if (title !== undefined) updates.title = title;
  if (accessLevel !== undefined) updates.accessLevel = accessLevel;
  if (active !== undefined) updates.active = active;
  if (password !== undefined) {
    updates.passwordHash = await bcrypt.hash(password, 10);
    // A manual password replaces any outstanding email invite. This also
    // makes the account stop appearing as invite-pending in the admin UI.
    updates.inviteToken = null;
    updates.inviteTokenExpiresAt = null;
  }

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  res.json(serialize(safeUser(user)));
});

// DELETE /api/users/:id — deactivate a user (admin only; can't delete self)
router.delete("/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user id" }); return; }

  if (id === req.session?.userId) {
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
