import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
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
const dbUrl = process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"];
const sessionStore = dbUrl
  ? new PgSession({
      pool: new Pool({ connectionString: dbUrl }),
      createTableIfMissing: false,
    })
  : undefined;

app.use(
  session({
    store: sessionStore,
    secret: process.env["SESSION_SECRET"] ?? "fallback-dev-secret-change-me",
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

seedAdminUser().catch((err) => logger.error({ err }, "Failed to seed admin user"));

export default app;
