import { loadConfig } from "../config";
import {
  formatFunnel,
  readFunnel,
  readProfilesByVia,
} from "../domains/funnel/report";
import { createDb } from "./client";

// npm run funnel -w backend -- --days 14 — воронка за N дней (P09).
const daysArg = process.argv.indexOf("--days");
const days = daysArg === -1 ? 14 : Number(process.argv[daysArg + 1]);
if (!Number.isInteger(days) || days < 1 || days > 366) {
  console.error("--days: целое число от 1 до 366");
  process.exit(1);
}

const config = loadConfig();
const database = createDb(config.DATABASE_URL, 1);
try {
  console.log(
    formatFunnel(
      await readFunnel(database.db, days, Date.now()),
      days,
      await readProfilesByVia(database.db, days, Date.now()),
    ),
  );
} finally {
  await database.close();
}
