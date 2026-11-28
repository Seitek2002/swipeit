import { toDateKey } from "@swipeit/core/format";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ServerCatalog } from "./catalog/load";
import type { Clock } from "./context";
import type { Db } from "./db/client";
import { formatLive, readLive } from "./domains/funnel/live";
import { buildPilotReport } from "./domains/funnel/pilot";
import {
  formatFunnel,
  readCompanies,
  readFunnel,
  readProfilesByVia,
} from "./domains/funnel/report";
import {
  type ErrorLog,
  formatErrorsDaily,
  formatErrorsSinceStart,
  readErrorsDaily,
  type RecentFailure,
} from "./errors";
import { sameToken } from "./ops-auth";

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(366).default(7),
  since: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  // Показать служебные игры и планы (репетиция, свои профили — M01): шаг 10
  // репетиции проверяет по ним свою игру. Только с тем же токеном — как и
  // весь отчёт.
  internal: z.enum(["0", "1"]).optional(),
  // Отчёт пилота (M03) — вместо полного отчёта; game — код приглашения.
  pilot: z.enum(["0", "1"]).optional(),
  game: z
    .string()
    .regex(/^[A-Za-z0-9]{1,32}$/)
    .optional(),
});

const LIMIT_PER_MINUTE = 10;
const FAILURES_IN_REPORT = 20;
const DAY_MS = 24 * 3600_000;

// «Последние сбои» (S08): строка — время, метод, шаблон маршрута, код с
// экрана человека, имя ошибки и код Postgres. По коду владелец ищет полный
// requestId в логах: docker compose logs api --since 24h | grep <код>.
export const formatFailures = (failures: readonly RecentFailure[]) => [
  `Последние сбои INTERNAL (до ${FAILURES_IN_REPORT}, свежие сверху):`,
  ...(failures.length === 0
    ? ["  —"]
    : failures.map(
        (failure) =>
          `  ${failure.at.toISOString()}  ${failure.method} ${failure.route}  код ${failure.requestCode}  ${failure.errorName}${failure.dbCode ? ` pg ${failure.dbCode}` : ""}`,
      )),
];

// Первый день периода — как у воронки: последние days дней, но не раньше
// since.
const firstDayOf = (days: number, now: number, since?: string) => {
  const byDays = toDateKey(now - (days - 1) * DAY_MS);
  return since && since > byDays ? since : byDays;
};

// GET /v1/ops/report (auto-tasks-pm-3 R02): отчёт живого прогона владельцу со
// staging по HTTPS, без SSH и доступа к базе. Текст: воронка, «Сейчас»,
// бот, кто на связи и ответы с ошибкой. Не в контракте. Нет OPS_TOKEN или
// токен неверный — 404, как будто маршрута нет.
export const registerOps = (
  app: FastifyInstance,
  deps: {
    // Задан ли TELEGRAM_BOT_TOKEN (M09).
    botEnabled?: boolean;
    catalog: ServerCatalog;
    clock: Clock;
    db: Db;
    errorLog: ErrorLog;
    online?: () => { people: number; sockets: number };
    token?: string;
  },
) => {
  const hits = new Map<string, number[]>();
  app.get("/v1/ops/report", async (request, reply) => {
    const notFound = () =>
      reply.status(404).send({
        code: "NOT_FOUND",
        message: "Нет такого адреса",
        requestId: request.id,
      });
    const header = request.headers.authorization ?? "";
    const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!deps.token || !given || !sameToken(given, deps.token)) {
      return notFound();
    }
    // 10 в минуту с IP.
    const now = deps.clock.now();
    const recent = (hits.get(request.ip) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= LIMIT_PER_MINUTE) {
      return reply.status(429).send({
        code: "RATE_LIMITED",
        message: "Слишком часто — попробуй через минуту",
        requestId: request.id,
      });
    }
    hits.set(request.ip, [...recent, now]);
    const query = QuerySchema.safeParse(request.query);
    if (!query.success) return notFound();
    const { days, since, internal, pilot, game } = query.data;
    if (pilot === "1") {
      const result = await buildPilotReport(deps.db.db, {
        since: since ?? toDateKey(now - (days - 1) * DAY_MS),
        ...(game ? { gameCode: game } : {}),
        includeInternal: internal === "1",
        botEnabled: deps.botEnabled ?? true,
        now,
        timeZone: process.env.TZ || "Asia/Bishkek",
      });
      return result.ok
        ? reply.type("text/plain; charset=utf-8").send(result.text)
        : reply
            .status(400)
            .type("text/plain; charset=utf-8")
            .send(result.message);
    }
    const funnel = formatFunnel(
      await readFunnel(deps.db.db, days, now, since),
      days,
      await readProfilesByVia(deps.db.db, days, now, since),
      { companies: await readCompanies(deps.db.db, days, now, since) },
    );
    const live = formatLive(
      await readLive(deps.db.db, deps.catalog, now, {
        includeInternal: internal === "1",
        ...(deps.botEnabled === undefined
          ? {}
          : { botEnabled: deps.botEnabled }),
      }),
    );
    const online = deps.online?.();
    // Сначала дописать в базу то, что ещё в очереди: отчёт — с ним.
    await deps.errorLog.flush();
    const fromDay = firstDayOf(days, now, since);
    const text = [
      funnel,
      "",
      live,
      "",
      `Сейчас на связи: ${online?.people ?? 0} чел., сокетов ${online?.sockets ?? 0}`,
      "",
      ...formatErrorsDaily(await readErrorsDaily(deps.db.db, fromDay), fromDay),
      "",
      ...formatErrorsSinceStart(
        deps.errorLog.startedAt,
        deps.errorLog.counts(),
      ),
      "",
      ...formatFailures(deps.errorLog.lastFailures(FAILURES_IN_REPORT)),
    ].join("\n");
    return reply.type("text/plain; charset=utf-8").send(text);
  });
};
