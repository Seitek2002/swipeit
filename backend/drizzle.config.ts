import { defineConfig } from "drizzle-kit";

// drizzle-kit generate → SQL-миграции в src/db/migrations (BACKEND.md B03).
// Схема — src/db/schema.ts. База нужна только для `drizzle-kit studio`.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://swipeit:swipeit@127.0.0.1:5433/swipeit",
  },
  strict: true,
  verbose: true,
});
