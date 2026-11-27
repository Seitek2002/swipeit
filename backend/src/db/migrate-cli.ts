import { loadConfig } from "../config";
import { createDb } from "./client";
import { runMigrations } from "./migrate";

// npm run db:migrate — применить миграции к DATABASE_URL.
const config = loadConfig();
const database = createDb(config.DATABASE_URL, 1);
try {
  await runMigrations(database.db);
  console.log("Миграции применены");
} finally {
  await database.close();
}
