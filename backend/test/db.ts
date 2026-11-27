import { sql } from "drizzle-orm";

import { DEV_DATABASE_URL } from "../src/config";
import { createDb, type Db } from "../src/db/client";

// Тестовая база: TEST_DATABASE_URL, иначе DATABASE_URL (в CI — service
// container), иначе база из docker-compose. Имя базы — с суффиксом _test,
// чтобы тесты не стёрли данные разработки.
export const testDatabaseUrl = (): string => {
  const raw =
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    DEV_DATABASE_URL;
  const url = new URL(raw);
  if (!url.pathname.endsWith("_test")) url.pathname = `${url.pathname}_test`;
  return url.toString();
};

export const createTestDb = (): Db => createDb(testDatabaseUrl(), 5);

// Между тестами — пустые таблицы (миграции остаются).
export const resetDb = async (database: Db) => {
  const { rows } = await database.pool.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public'",
  );
  const tables = rows.map((row) => `"${row.tablename}"`);
  if (tables.length > 0) {
    await database.db.execute(
      sql.raw(`truncate ${tables.join(", ")} restart identity cascade`),
    );
  }
};
