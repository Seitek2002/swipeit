import { timingSafeEqual } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ServerCatalog } from "./catalog/load";
import type { Clock } from "./context";
import type { Db } from "./db/client";
import { formatLive, readLive } from "./domains/funnel/live";
import {
  formatFunnel,
  readFunnel,
  readProfilesByVia,
} from "./domains/funnel/report";
import { errorStats } from "./errors";

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(366).default(7),
  since: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const LIMIT_PER_MINUTE = 10;

const sameToken = (given: string, expected: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

// GET /v1/ops/report (auto-tasks-pm-3 R02): отчёт живого прогона владельцу со
// staging по HTTPS, без SSH и доступа к базе. Текст: воронка, «Сейчас»,
// кто на связи и ответы с ошибкой. Не в контракте. Нет OPS_TOKEN или токен
// неверный — 404, как будто маршрута нет.
export const registerOps = (
  app: FastifyInstance,
  deps: {
    catalog: ServerCatalog;
    clock: Clock;
    db: Db;
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
    const { days, since } = query.data;
    const funnel = formatFunnel(
      await readFunnel(deps.db.db, days, now, since),
      days,
      await readProfilesByVia(deps.db.db, days, now, since),
    );
    const live = formatLive(await readLive(deps.db.db, deps.catalog, now));
    const online = deps.online?.();
    const { counts, startedAt } = errorStats();
    const errors = [
      "RATE_LIMITED",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "CONFLICT",
      "VALIDATION",
      "INTERNAL",
      "OFFLINE",
    ].map((code) => `  ${code}: ${counts[code] ?? 0}`);
    const text = [
      funnel,
      "",
      live,
      "",
      `Сейчас на связи: ${online?.people ?? 0} чел., сокетов ${online?.sockets ?? 0}`,
      "",
      `Ответы с ошибкой с запуска процесса (${startedAt.toISOString()}):`,
      ...errors,
    ].join("\n");
    return reply.type("text/plain; charset=utf-8").send(text);
  });
};
