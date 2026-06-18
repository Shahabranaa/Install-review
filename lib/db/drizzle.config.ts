import { defineConfig } from "drizzle-kit";
import path from "path";

const dbUrl = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error("DATABASE_URL or NEON_DATABASE_URL must be set. Did you forget to provision a database?");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: {
    url: dbUrl,
  },
});
