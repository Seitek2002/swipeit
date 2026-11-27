import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Database } from "./client";

// Папка с SQL-миграциями рядом с исходниками; в образе — копируется туда же
// (B18). drizzle сам ведёт таблицу применённых миграций: повторный запуск
// ничего не меняет.
export const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

export const runMigrations = (db: Database, folder = MIGRATIONS_DIR) =>
  migrate(db, { migrationsFolder: folder });
