import { isApiError } from "@swipeit/core/errors";
import type { FastifyError, FastifyInstance, FastifyRequest } from "fastify";

// Ошибки по BACKEND.md §4.5: JSON { code, message, requestId } с HTTP-статусом,
// message — по-русски, для экрана. Неизвестная ошибка — INTERNAL без
// подробностей наружу, подробности — в логе по requestId.
// Ответы с ошибкой с запуска процесса — по кодам (R02, отчёт владельцу):
// только счётчики в памяти, без маршрутов и id.
const errorCounts = new Map<string, number>();
const startedAt = new Date();
const countError = (code: string) =>
  errorCounts.set(code, (errorCounts.get(code) ?? 0) + 1);

export const errorStats = () => ({
  startedAt,
  counts: Object.fromEntries(errorCounts) as Record<string, number>,
});

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
const recentFailures: RecentFailure[] = [];

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
const routeOf = (request: FastifyRequest) =>
  request.routeOptions.url ?? "(маршрут не найден)";

const rememberFailure = (request: FastifyRequest, error: unknown) => {
  const dbCode = dbCodeOf(error);
  recentFailures.unshift({
    at: new Date(),
    method: request.method,
    route: routeOf(request),
    requestCode: request.id.slice(0, REQUEST_CODE_LENGTH),
    errorName: errorNameOf(error),
    ...(dbCode ? { dbCode } : {}),
  });
  recentFailures.length = Math.min(recentFailures.length, RECENT_FAILURES_MAX);
};

// Свежие сверху.
export const lastFailures = (limit: number): RecentFailure[] =>
  recentFailures.slice(0, limit);

export const registerErrors = (app: FastifyInstance) => {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const requestId = request.id;
    if (isApiError(error)) {
      countError(error.code);
      return reply
        .status(error.status)
        .send({ code: error.code, message: error.message, requestId });
    }
    if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      countError("VALIDATION");
      return reply.status(413).send({
        code: "VALIDATION",
        message: "Слишком большой запрос",
        requestId,
      });
    }
    // Битый JSON, неверный Content-Type и прочие ошибки разбора запроса.
    if (error.statusCode !== undefined && error.statusCode < 500) {
      countError("VALIDATION");
      return reply.status(400).send({
        code: "VALIDATION",
        message: "Неверные данные",
        requestId,
      });
    }
    request.log.error({ err: error }, "Необработанная ошибка");
    countError("INTERNAL");
    rememberFailure(request, error);
    return reply.status(500).send({
      code: "INTERNAL",
      message: "Что-то сломалось у нас. Попробуй ещё раз через минуту",
      requestId,
    });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      code: "NOT_FOUND",
      message: "Нет такого адреса",
      requestId: request.id,
    }),
  );
};
