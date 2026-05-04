import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
import { Signer } from "@aws-sdk/rds-signer";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { seedAdminUser } from "./routes/auth";

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

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PgSession = connectPgSimple(session);

function buildSessionPool(): InstanceType<typeof Pool> | null {
  if (process.env["NEON_DATABASE_URL"]) {
    return new Pool({ connectionString: process.env["NEON_DATABASE_URL"] });
  }
  const host = process.env["NEON_DATABASE_PGHOST"];
  if (host) {
    const port = parseInt(process.env["NEON_DATABASE_PGPORT"] ?? "5432", 10);
    const user = process.env["NEON_DATABASE_PGUSER"];
    const database = process.env["NEON_DATABASE_PGDATABASE"];
    const region = process.env["NEON_DATABASE_AWS_REGION"];
    const ssl = process.env["NEON_DATABASE_PGSSLMODE"] !== "disable";
    if (!user || !database || !region) {
      throw new Error(
        "Aurora env vars incomplete for session pool: need NEON_DATABASE_PGUSER, NEON_DATABASE_PGDATABASE, NEON_DATABASE_AWS_REGION",
      );
    }
    const signer = new Signer({ hostname: host, port, username: user, region });
    return new Pool({
      host,
      port,
      user,
      database,
      ssl: ssl ? { rejectUnauthorized: true } : false,
      password: () => signer.getAuthToken(),
    });
  }
  if (process.env["DATABASE_URL"]) {
    return new Pool({ connectionString: process.env["DATABASE_URL"] });
  }
  return null;
}

const sessionPool = buildSessionPool();
const sessionStore = sessionPool
  ? new PgSession({
      pool: sessionPool,
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

// Strip any base-path prefix forwarded by the Vercel proxy (e.g. /workforce/api/... → /api/...)
app.use((req, _res, next) => {
  req.url = req.url.replace(/^\/workforce\/api\//, "/api/");
  next();
});

app.use("/api", router);

// Only seed default admin in development with no existing users
if (process.env["NODE_ENV"] !== "production") {
  seedAdminUser().catch((err) => logger.error({ err }, "Failed to seed admin user"));
}

export default app;
