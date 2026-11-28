import { applyTimeZone, ConfigError, timeZoneOf } from "../config";
import { normalizeBase } from "../rehearsal/client";
import { runRehearsal } from "../rehearsal/run";

// Репетиция офиса и дымовой тест staging (auto-tasks-pm-4 S06). Только HTTP
// и WebSocket, к базе не ходит — в папке db/ по соседству с остальными
// командами владельца (funnel, funnel-team).
//
//   npm run rehearsal -w backend -- --api http://localhost:4100 --people 25
//   node dist/rehearsal.js --api https://… --people 10 [--ops-token …] [--keep]
//
// --ops-token — проверить шаг 10 (отчёт GET /v1/ops/report); можно и через
// переменную OPS_TOKEN. --keep — не удалять профили после прогона.
// --inject-leak — проверка проверки: подложить чужого подопечного в ответ,
// шаг 7 обязан упасть. Выход: 0 — всё прошло, 1 — упала проверка, 2 —
// неверные аргументы.
// Время в выводе — по Бишкеку, где бы ни запускали (M11).
try {
  applyTimeZone(timeZoneOf());
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  console.error(error.message);
  process.exit(2);
}

const args = process.argv.slice(2);
const valueOf = (...flags: string[]) => {
  for (const flag of flags) {
    const index = args.indexOf(flag);
    if (index !== -1) return args[index + 1];
  }
  return undefined;
};
const fail = (message: string) => {
  console.error(message);
  process.exit(2);
};

const api = valueOf("--api", "--base-url");
if (!api || !/^https?:\/\//.test(api)) {
  fail("Нужен --api http(s)://адрес-сервера (например http://localhost:4100)");
}
const people = Number(valueOf("--people") ?? 25);
if (!Number.isInteger(people) || people < 5 || people > 30) {
  fail("--people: целое число от 5 до 30");
}
const usersPerMinute = Number(valueOf("--users-per-minute") ?? 20);
if (!Number.isInteger(usersPerMinute) || usersPerMinute < 1) {
  fail("--users-per-minute: целое число больше 0");
}

const result = await runRehearsal({
  base: normalizeBase(api ?? ""),
  people,
  usersPerMinute,
  opsToken: valueOf("--ops-token") ?? process.env.OPS_TOKEN,
  keep: args.includes("--keep"),
  injectLeak: args.includes("--inject-leak"),
  log: (line) => console.log(line),
});
console.log(result.summary);
// Явный выход: открытые keep-alive соединения не держат процесс.
process.exit(result.ok ? 0 : 1);
