import { timingSafeEqual } from "node:crypto";

import type { FastifyRequest } from "fastify";

// Служебный токен владельца (OPS_TOKEN): отчёт /v1/ops/report и пометка
// запросов репетиции (auto-tasks-metrics-1 M01).

// Заголовок репетиции и дымового теста: x-swipeit-rehearsal: <OPS_TOKEN>.
// Профиль, созданный с ним, сразу «свой» — воронка его не считает. Неверный
// токен или OPS_TOKEN не задан — заголовок молча не действует.
export const REHEARSAL_HEADER = "x-swipeit-rehearsal";

// Сравнение за одно и то же время, как бы ни совпадало начало.
export const sameToken = (given: string, expected: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export const isRehearsal = (
  request: Pick<FastifyRequest, "headers">,
  token: string | undefined,
): boolean => {
  const given = request.headers[REHEARSAL_HEADER];
  return (
    Boolean(token) &&
    typeof given === "string" &&
    given.length > 0 &&
    sameToken(given, token ?? "")
  );
};
