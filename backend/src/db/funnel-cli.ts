import path from "node:path";

import { loadCatalog } from "../catalog/load";
import { applyTimeZone, loadConfig } from "../config";
import { formatLive, readLive } from "../domains/funnel/live";
import {
  formatFunnel,
  readCompanies,
  readFunnel,
  readProfilesByVia,
} from "../domains/funnel/report";
import { createDb } from "./client";

// npm run funnel -w backend -- --days 14 [--since 2026-12-01] [--live]
// В образе: node dist/funnel.js --days 7 (R02). --since — считать с этого
// дня (прогоны команды до живой группы не в счёт), --live — раздел «Сейчас».
const args = process.argv.slice(2);
const valueOf = (flag: string) => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};
const days = Number(valueOf("--days") ?? 14);
if (!Number.isInteger(days) || days < 1 || days > 366) {
  console.error("--days: целое число от 1 до 366");
  process.exit(1);
}
const since = valueOf("--since");
if (since !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
  console.error("--since: дата ГГГГ-ММ-ДД");
  process.exit(1);
}

const config = loadConfig();
// День и граница --since — по Бишкеку, где бы ни запускали (M11).
applyTimeZone(config.TZ);
const database = createDb(config.DATABASE_URL, 1);
try {
  const now = Date.now();
  console.log(
    formatFunnel(
      await readFunnel(database.db, days, now, since),
      days,
      await readProfilesByVia(database.db, days, now, since),
      { companies: await readCompanies(database.db, days, now, since) },
    ),
  );
  if (args.includes("--live")) {
    const catalog = await loadCatalog(
      path.resolve(process.cwd(), config.CATALOG_DIR),
      { warn: () => undefined },
    );
    console.log("");
    console.log(
      formatLive(
        await readLive(database.db, catalog, now, {
          botEnabled: Boolean(config.TELEGRAM_BOT_TOKEN),
        }),
      ),
    );
  }
} finally {
  await database.close();
}
