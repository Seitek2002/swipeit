import type { ApiMode } from "@swipeit/core/contract";
import Fastify, { type FastifyInstance } from "fastify";

import type { Config } from "./config.js";
import type { Db } from "./db/client.js";

// Режим API сервера — общий тип с фронтом (@swipeit/core, BACKEND.md §9.1).
const MODE: ApiMode = "remote";

export type AppOptions = {
  config: Config;
  // База (B03). Без неё — только /v1/health без проверки базы (тесты каркаса).
  db?: Db;
  // Часы сервера (BACKEND.md §2.5): в тестах — подставные.
  now?: () => number;
};

// Fastify-приложение без запуска: тесты зовут его через app.inject, а
// server.ts — слушает порт. Маршруты API — под /v1 (BACKEND.md §4.5).
export const buildApp = ({
  config,
  db,
  now = Date.now,
}: AppOptions): FastifyInstance => {
  const app = Fastify({
    logger: config.LOG_LEVEL === "silent" ? false : { level: config.LOG_LEVEL },
    // Лимит JSON — 100 КБ (BACKEND.md §10).
    bodyLimit: 100 * 1024,
  });

  // Мягкая остановка (SIGTERM): начатые запросы доотвечают, но с
  // «Connection: close». Иначе keep-alive соединение, занятое в момент
  // остановки, оставалось бы открытым, и app.close() ждал бы его тайм-аута.
  let closing = false;
  app.addHook("preClose", async () => {
    closing = true;
  });
  app.addHook("onSend", async (_request, reply) => {
    if (closing) reply.header("connection", "close");
  });

  // База не ответила — 503 OFFLINE (BACKEND.md §4.5): мониторинг видит, что
  // сервер жив, но работать не может.
  app.get("/v1/health", async (_request, reply) => {
    if (db && !(await db.ping())) {
      return reply.status(503).send({
        code: "OFFLINE",
        message: "База данных недоступна",
      });
    }
    return {
      app: "swipeit",
      mode: MODE,
      apiVersion: 1,
      now: now(),
      commit: config.COMMIT,
    };
  });

  return app;
};
