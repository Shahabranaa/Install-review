import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { seedAdminUser, auditDefaultAdminCredential, syncAdminSeedPassword } from "./routes/auth";
import { PostgresRateLimitStore } from "./lib/rate-limit-store";

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// ── CORS ─────────────────────────────────────────────────────────────────────
// Allowlist only known origins. Set ALLOWED_ORIGINS (comma-separated) in env
// to add production/Vercel domains.
const envOrigins = (process.env["ALLOWED_ORIGINS"] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const isDev = process.env["NODE_ENV"] !== "production";

app.use(
  cors({
    origin(origin, cb) {
      // Same-origin / server-to-server requests have no Origin header
      if (!origin) return cb(null, true);
      // Explicit env allowlist
      if (envOrigins.includes(origin)) return cb(null, true);
      // Replit preview and deployment domains
      if (origin.endsWith(".replit.dev") || origin.endsWith(".replit.app")) return cb(null, true);
      // SPX production domains
      if (origin.endsWith(".spx.site") || origin === "https://spx.site") return cb(null, true);
      // Vercel deployment domains
      if (origin.endsWith(".vercel.app")) return cb(null, true);
      // Development: allow any localhost port
      if (isDev && /^https?:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true);
      logger.warn({ origin }, "CORS: rejected request from unlisted origin");
      cb(new Error(`CORS: origin not allowed`));
    },
    credentials: true,
  }),
);

// ── Shared database URL ───────────────────────────────────────────────────────
const dbUrl = process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"];

function makePool(): Pool {
  const p = new Pool({ connectionString: dbUrl });
  p.on("connect", (client) => { client.query("SET search_path TO public").catch(() => {}); });
  return p;
}

// ── Rate limiting on auth routes ──────────────────────────────────────────────
// Use a PostgreSQL-backed store so limits persist across server restarts and
// are shared across all Vercel function instances (in-memory resets every cold start).
const rateLimitWindowMs = 15 * 60 * 1000; // 15 minutes

const rateLimitPool = dbUrl ? makePool() : null;
if (!rateLimitPool) {
  logger.warn("NEON_DATABASE_URL not set — rate limiter falling back to in-memory store");
}

const loginLimiter = rateLimit({
  windowMs: rateLimitWindowMs,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many login attempts — please try again later." },
  ...(rateLimitPool
    ? { store: new PostgresRateLimitStore(rateLimitPool, rateLimitWindowMs) }
    : {}),
});

app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/unified-login", loginLimiter);
app.use("/api/worker-portal/login", loginLimiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Session store ─────────────────────────────────────────────────────────────
const PgSession = connectPgSimple(session);
const sessionStore = dbUrl
  ? new PgSession({
      pool: makePool(),
      createTableIfMissing: false,
    })
  : undefined;

app.use(
  session({
    store: sessionStore,
    secret: (() => {
      const secret = process.env["SESSION_SECRET"];
      if (!secret) {
        if (process.env["NODE_ENV"] === "production") {
          throw new Error("SESSION_SECRET environment variable is required in production");
        }
        logger.warn("SESSION_SECRET not set — using insecure fallback (development only)");
        return "fallback-dev-secret-change-me";
      }
      return secret;
    })(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
    },
  }),
);

// Strip any base-path prefix forwarded by the proxy (e.g. /workforce/api/... → /api/...)
app.use((req, _res, next) => {
  req.url = req.url
    .replace(/^\/workforce\/api\//, "/api/")
    .replace(/^\/worker-portal\/api\//, "/api/");
  next();
});

app.use("/api", router);

// ── Global JSON error handler ─────────────────────────────────────────────────
// Must have 4 parameters so Express treats it as an error handler.
// Catches any error thrown (or passed via next(err)) from route handlers,
// including async throws caught by express-async-errors.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = (err as { status?: number; statusCode?: number }).status
    ?? (err as { status?: number; statusCode?: number }).statusCode
    ?? 500;
  const message =
    err instanceof Error ? err.message : "Internal server error";
  logger.error({ err }, "Unhandled route error");
  res.status(status).json({ error: message });
});

// ── Startup security tasks ────────────────────────────────────────────────────
// Audit for compromised default credentials in all environments
auditDefaultAdminCredential().catch((err) =>
  logger.error({ err }, "Failed to audit default admin credential"),
);

// Seed a dev admin only outside production
if (process.env["NODE_ENV"] !== "production") {
  seedAdminUser().catch((err) => logger.error({ err }, "Failed to seed admin user"));
}

// Keep the "admin" account's password synced to ADMIN_SEED_PASSWORD in all
// environments (dev and production) — this makes the secret the single
// source of truth for that account, no manual DB patching required.
syncAdminSeedPassword().catch((err) =>
  logger.error({ err }, "Failed to sync admin seed password"),
);

export default app;
