import { ConfigError, loadConfig } from "../config";
import { createDb } from "./client";
import { runMigrations } from "./migrate";

// npm run db:migrate — применить миграции к DATABASE_URL. В образе (B18) —
// одноразовый контейнер migrate: node dist/migrate.js. Ошибка — код выхода 1,
// и compose не запускает api на недомигрированной базе.
let config;
try {
  config = loadConfig();
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
const database = createDb(config.DATABASE_URL, 1);
try {
  await runMigrations(database.db);
  const { rows } = await database.pool.query<{ applied: number }>(
    "select count(*)::int as applied from drizzle.__drizzle_migrations",
  );
  console.log(`Миграции применены (всего в базе: ${rows[0]?.applied ?? 0})`);
} finally {
  await database.close();
}
