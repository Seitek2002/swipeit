import { applyTimeZone, loadConfig } from "../config";
import { buildPilotReport } from "../domains/funnel/pilot";
import { createDb } from "./client";

// Отчёт пилота одной командой (auto-tasks-metrics-1 M03):
//   npm run funnel:pilot -w backend -- --since 2026-12-11 [--game <код>]
//   В образе: node dist/funnel-pilot.js --since 2026-12-11
// --game — код приглашения в игру (из ссылки /s/<код>); без него — самая
// большая игра периода с не своими участниками. --include-internal — со
// своими профилями и репетицией, только для проверки.
const HELP = `Отчёт пилота: люди, Санта, что было вокруг, цели PRD, сбои.

  npm run funnel:pilot -- --since 2026-12-11 [--game <код приглашения>]
  В образе: node dist/funnel-pilot.js --since 2026-12-11

  --since              первый день пилота (ГГГГ-ММ-ДД, по Бишкеку)
  --game               код из ссылки-приглашения в игру (…/s/<код>); без
                       него — самая большая игра периода
  --include-internal   считать и свои профили с репетицией (для проверки)

Текст влезает в одно сообщение Telegram — пересылай как есть.`;

const args = process.argv.slice(2);
const valueOf = (flag: string) => {
  const index = args.indexOf(flag);
  const value = index === -1 ? undefined : args[index + 1];
  return value?.startsWith("--") ? undefined : value;
};
if (args.includes("--help") || args.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}
const since = valueOf("--since");
if (!since || !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
  console.error(
    "Нужен --since ГГГГ-ММ-ДД — первый день пилота. Справка: --help",
  );
  process.exit(1);
}
const gameCode = valueOf("--game");
if (args.includes("--game") && !gameCode) {
  console.error("--game: нужен код приглашения");
  process.exit(1);
}

const config = loadConfig();
// День и граница --since — по Бишкеку, где бы ни запускали (M11).
applyTimeZone(config.TZ);
const database = createDb(config.DATABASE_URL, 1);
try {
  const result = await buildPilotReport(database.db, {
    since,
    ...(gameCode ? { gameCode } : {}),
    includeInternal: args.includes("--include-internal"),
    botEnabled: Boolean(config.TELEGRAM_BOT_TOKEN),
    now: Date.now(),
    timeZone: config.TZ,
  });
  if (result.ok) {
    console.log(result.text);
  } else {
    console.error(result.message);
    process.exitCode = 1;
  }
} finally {
  await database.close();
}
