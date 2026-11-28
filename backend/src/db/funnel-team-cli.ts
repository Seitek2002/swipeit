import { applyTimeZone, loadConfig } from "../config";
import { runTeamCommand } from "../domains/funnel/team";
import { createDb } from "./client";

// npm run funnel:team -w backend -- --help
// В образе: node dist/funnel-team.js --recent, затем --pick 1.
// Пометить свой профиль команды (Q03, M08): его шаги воронка не считает.
// Что умеет и чего не делать — в справке (domains/funnel/team.ts).
const args = process.argv.slice(2);

const config = loadConfig();
// Время создания в выводе — по Бишкеку, где бы ни запускали (M11).
applyTimeZone(config.TZ);
const database = createDb(config.DATABASE_URL, 1);
try {
  const result = await runTeamCommand(database.db, args, Date.now());
  if (result.exitCode === 0) console.log(result.text);
  else console.error(result.text);
  process.exitCode = result.exitCode;
} finally {
  await database.close();
}
