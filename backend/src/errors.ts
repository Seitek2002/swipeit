import { toDateKey } from "@swipeit/core/format";
import { isApiError } from "@swipeit/core/errors";
import { gte, sql } from "drizzle-orm";
import type { FastifyError, FastifyInstance, FastifyRequest } from "fastify";

import type { Clock } from "./context";
import type { Database } from "./db/client";
import { errorsDaily } from "./db/schema";
import { isRehearsal } from "./ops-auth";

// Ошибки по BACKEND.md §4.5: JSON { code, message, requestId } с HTTP-статусом,
// message — по-русски, для экрана. Неизвестная ошибка — INTERNAL без
// подробностей наружу, подробности — в логе по requestId.
//
// Ответы с ошибкой — по кодам (R02, отчёт владельцу), без маршрутов и id:
// - в памяти — с последнего запуска процесса;
// - в базе, по дням (errors_daily, auto-tasks-metrics-1 M05) — переживают
//   обновление. Пишутся вне транзакции запроса и не ломают ответ: база не
//   ответила — счётчик ждёт в памяти и уходит со следующей удачной записью.
// Отдельно — сколько из них у своих профилей и у репетиции (M01): дымовой
// тест после обновления даёт свои CONFLICT, они не тревога.

// Код ответа /v1/health с 503 в errors_daily: «база не отвечала».
export const HEALTH_503 = "HEALTH_503";

// Коды в отчёте — всегда, даже с нулём. Остальные — если встретились.
export const REPORTED_CODES = [
  "RATE_LIMITED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "VALIDATION",
  "INTERNAL",
] as const;

// Код — только «словом»: в базу и отчёт не попадёт ничего, кроме кода.
const CODE = /^[A-Z][A-Z0-9_]{0,39}$/;

export type ErrorCount = { count: number; internal: number };

// Последние сбои INTERNAL (auto-tasks-pm-4 S08) — след ошибки без Sentry:
// человек называет код с экрана (первые 8 символов requestId), владелец
// находит строку в отчёте и полный requestId в логах. Только то, в чём нет
// данных людей: шаблон маршрута (/v1/santa/:id, а не адрес с id), имя
// ошибки и код Postgres. Текста ошибки здесь нет: в нём бывают значения.
export type RecentFailure = {
  at: Date;
  // Код Postgres (23505 и т. п.), если ошибка из базы.
  dbCode?: string;
  errorName: string;
  method: string;
  // Первые 8 символов requestId — то, что видит человек.
  requestCode: string;
  route: string;
};

const RECENT_FAILURES_MAX = 50;

export const REQUEST_CODE_LENGTH = 8;

// Код Postgres — пять символов SQLSTATE. Drizzle заворачивает ошибку pg в
// свою, тогда код — в cause.
const PG_CODE = /^[0-9A-Z]{5}$/;
const dbCodeOf = (error: unknown): string | undefined => {
  for (let current = error, depth = 0; depth < 3; depth += 1) {
    if (typeof current !== "object" || current === null) return undefined;
    const { code, cause } = current as { cause?: unknown; code?: unknown };
    if (typeof code === "string" && PG_CODE.test(code)) return code;
    current = cause;
  }
  return undefined;
};

// Имя класса ошибки — только «словом»: name можно присвоить любой строкой.
const errorNameOf = (error: unknown) => {
  const name = (error as { name?: unknown } | null)?.name;
  return typeof name === "string" && /^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(name)
    ? name
    : "Error";
};

// Шаблон маршрута Fastify; не нашёлся — без адреса: в нём бывают id.
export const routeOf = (request: FastifyRequest) =>
  request.routeOptions.url ?? "(маршрут не найден)";

// Запросы с сессией своего профиля (funnel_internal) — отмечает routes.ts,
// когда нашёл сессию.
const internalRequests = new WeakSet<FastifyRequest>();
export const markInternalRequest = (request: FastifyRequest) => {
  internalRequests.add(request);
};

type PendingRow = {
  code: string;
  count: number;
  day: string;
  internal: number;
};

// Запись счётчиков в базу. В тестах можно подставить свою.
export type ErrorsWriter = (rows: readonly PendingRow[]) => Promise<void>;

export const writeErrorsDaily =
  (db: Database): ErrorsWriter =>
  async (rows) => {
    if (rows.length === 0) return;
    await db
      .insert(errorsDaily)
      .values([...rows])
      .onConflictDoUpdate({
        target: [errorsDaily.day, errorsDaily.code],
        set: {
          count: sql`${errorsDaily.count} + excluded.count`,
          internal: sql`${errorsDaily.internal} + excluded.internal`,
        },
      });
  };

// Счётчики ошибок одного процесса (одного buildApp): в памяти и очередь в
// базу.
export const createErrorLog = ({
  clock,
  write,
}: {
  clock: Clock;
  write?: ErrorsWriter;
}) => {
  const startedAt = new Date(clock.now());
  const counts = new Map<string, ErrorCount>();
  const recentFailures: RecentFailure[] = [];
  // Ещё не записанное в базу: «день|код» → числа.
  const pending = new Map<string, PendingRow>();
  let running: null | Promise<void> = null;
  let again = false;

  const writeOnce = async (): Promise<boolean> => {
    if (!write || pending.size === 0) return true;
    const batch = [...pending.values()];
    pending.clear();
    try {
      await write(batch);
      return true;
    } catch {
      // База не ответила — вернуть в очередь, уйдёт со следующей записью.
      for (const row of batch) {
        const key = `${row.day}|${row.code}`;
        const waiting = pending.get(key);
        pending.set(key, {
          ...row,
          count: row.count + (waiting?.count ?? 0),
          internal: row.internal + (waiting?.internal ?? 0),
        });
      }
      return false;
    }
  };

  // Одна запись за раз; пришло новое, пока писали, — ещё один проход.
  // Отчёт ждёт этот промис, чтобы прочесть уже записанное.
  const flush = (): Promise<void> => {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      let ok = true;
      do {
        again = false;
        ok = await writeOnce();
      } while (ok && again && pending.size > 0);
    })().finally(() => {
      running = null;
    });
    return running;
  };

  const count = (code: string, internal: boolean) => {
    if (!CODE.test(code)) return;
    const now = counts.get(code) ?? { count: 0, internal: 0 };
    counts.set(code, {
      count: now.count + 1,
      internal: now.internal + (internal ? 1 : 0),
    });
    if (!write) return;
    const day = toDateKey(clock.now());
    const key = `${day}|${code}`;
    const waiting = pending.get(key) ?? { day, code, count: 0, internal: 0 };
    pending.set(key, {
      ...waiting,
      count: waiting.count + 1,
      internal: waiting.internal + (internal ? 1 : 0),
    });
    void flush();
  };

  const rememberFailure = (request: FastifyRequest, error: unknown) => {
    const dbCode = dbCodeOf(error);
    recentFailures.unshift({
      at: new Date(clock.now()),
      method: request.method,
      route: routeOf(request),
      requestCode: request.id.slice(0, REQUEST_CODE_LENGTH),
      errorName: errorNameOf(error),
      ...(dbCode ? { dbCode } : {}),
    });
    recentFailures.length = Math.min(
      recentFailures.length,
      RECENT_FAILURES_MAX,
    );
  };

  return {
    startedAt,
    count,
    flush,
    // Есть ли что дописать в базу (после 503 /health — дослать).
    hasPending: () => pending.size > 0,
    counts: (): Record<string, ErrorCount> => Object.fromEntries(counts),
    rememberFailure,
    // Свежие сверху.
    lastFailures: (limit: number): RecentFailure[] =>
      recentFailures.slice(0, limit),
  };
};

export type ErrorLog = ReturnType<typeof createErrorLog>;

// Ответы с ошибкой по дням из базы, начиная с fromDay (ГГГГ-ММ-ДД).
export const readErrorsDaily = async (
  db: Database,
  fromDay: string,
): Promise<Array<{ code: string; day: string } & ErrorCount>> =>
  db
    .select({
      day: errorsDaily.day,
      code: errorsDaily.code,
      count: errorsDaily.count,
      internal: errorsDaily.internal,
    })
    .from(errorsDaily)
    .where(gte(errorsDaily.day, fromDay))
    .orderBy(errorsDaily.day, errorsDaily.code);

const timesWord = (n: number) => {
  const tail = n % 100;
  if (tail >= 11 && tail <= 14) return "раз";
  return n % 10 >= 2 && n % 10 <= 4 ? "раза" : "раз";
};

const codeLine = (code: string, value: ErrorCount | undefined) => {
  const { count = 0, internal = 0 } = value ?? {};
  return `  ${code}: ${count}${internal > 0 ? `, из них свои/репетиция: ${internal}` : ""}`;
};

// Коды отчёта: постоянные, потом встретившиеся (кроме HEALTH_503).
const codesOf = (seen: Iterable<string>) => [
  ...REPORTED_CODES,
  ...[...new Set(seen)]
    .filter(
      (code) =>
        code !== HEALTH_503 &&
        !(REPORTED_CODES as readonly string[]).includes(code),
    )
    .sort(),
];

// Раздел «с последнего запуска»: счётчики в памяти процесса.
export const formatErrorsSinceStart = (
  startedAt: Date,
  counts: Record<string, ErrorCount>,
) => {
  const health = counts[HEALTH_503]?.count ?? 0;
  return [
    `Ответы с ошибкой с последнего запуска (${startedAt.toISOString()}):`,
    ...codesOf(Object.keys(counts)).map((code) => codeLine(code, counts[code])),
    `  /health отвечал 503: ${health} ${timesWord(health)}`,
  ];
};

// Раздел «за период по дням» (M05): итог по кодам и строка на каждый день,
// где что-то было. Без маршрутов и id — только коды и числа.
export const formatErrorsDaily = (
  rows: ReadonlyArray<{ code: string; day: string } & ErrorCount>,
  fromDay: string,
) => {
  const totals = new Map<string, ErrorCount>();
  const byDay = new Map<string, Array<{ code: string } & ErrorCount>>();
  for (const row of rows) {
    const total = totals.get(row.code) ?? { count: 0, internal: 0 };
    totals.set(row.code, {
      count: total.count + row.count,
      internal: total.internal + row.internal,
    });
    byDay.set(row.day, [...(byDay.get(row.day) ?? []), row]);
  }
  const health = totals.get(HEALTH_503)?.count ?? 0;
  const dayLines = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => {
      const parts = list
        .filter((row) => row.count > 0)
        .map((row) => {
          const label = row.code === HEALTH_503 ? "/health 503" : row.code;
          return `${label} ${row.count}${row.internal > 0 ? ` (свои ${row.internal})` : ""}`;
        });
      return `    ${day}: ${parts.join(", ")}`;
    });
  return [
    `Ответы с ошибкой за период с ${fromDay} (из базы, переживают перезапуск):`,
    ...codesOf(totals.keys()).map((code) => codeLine(code, totals.get(code))),
    `  /health отвечал 503: ${health} ${timesWord(health)}`,
    "  По дням:",
    ...(dayLines.length === 0 ? ["    —"] : dayLines),
  ];
};

export const registerErrors = (
  app: FastifyInstance,
  log: ErrorLog,
  { opsToken }: { opsToken?: string } = {},
) => {
  // Свой профиль или репетиция с верным токеном.
  const internalOf = (request: FastifyRequest) =>
    internalRequests.has(request) || isRehearsal(request, opsToken);

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const requestId = request.id;
    const internal = internalOf(request);
    if (isApiError(error)) {
      log.count(error.code, internal);
      // reason — уточнение кода для экрана (MULTI_WISHLISTS_OFF,
      // WISHLIST_DELETED): клиент, который причин не знает, берёт message.
      return reply.status(error.status).send({
        code: error.code,
        message: error.message,
        ...(error.reason ? { reason: error.reason } : {}),
        requestId,
      });
    }
    if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      log.count("VALIDATION", internal);
      return reply.status(413).send({
        code: "VALIDATION",
        message: "Слишком большой запрос",
        requestId,
      });
    }
    // Битый JSON, неверный Content-Type и прочие ошибки разбора запроса.
    if (error.statusCode !== undefined && error.statusCode < 500) {
      log.count("VALIDATION", internal);
      return reply.status(400).send({
        code: "VALIDATION",
        message: "Неверные данные",
        requestId,
      });
    }
    request.log.error({ err: error }, "Необработанная ошибка");
    log.count("INTERNAL", internal);
    log.rememberFailure(request, error);
    return reply.status(500).send({
      code: "INTERNAL",
      message: "Что-то сломалось у нас. Попробуй ещё раз через минуту",
      requestId,
    });
  });

  // Неизвестный адрес не считаем: сканеры интернета стучатся по чужим
  // путям, и счётчик NOT_FOUND про людей потерялся бы в их шуме. NOT_FOUND
  // обработчиков (нет такой игры, ссылки) считается выше.
  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      code: "NOT_FOUND",
      message: "Нет такого адреса",
      requestId: request.id,
    }),
  );
};
