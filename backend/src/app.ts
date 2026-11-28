import type { ApiMode } from "@swipeit/core/contract";
import { createCryptoRandom, type Random } from "@swipeit/core/logic/random";
import Fastify, { type FastifyInstance, LogController } from "fastify";
import { randomUUID } from "node:crypto";
import type { Writable } from "node:stream";

import type { ServerCatalog } from "./catalog/load";
import type { Config } from "./config";
import type { Clock } from "./context";
import type { Db } from "./db/client";
import { registerErrors } from "./errors";
import { resolveSession } from "./auth/sessions";
import { createDiskStorage } from "./domains/uploads/storage";
import { registerUploads } from "./routes-uploads";
import { startScheduler } from "./scheduler";
import { createSocketHub, type EventHub } from "./realtime/hub";
import { registerRoutes } from "./routes";

// Режим API сервера — общий тип с фронтом (@swipeit/core, BACKEND.md §9.1).
const MODE: ApiMode = "remote";

export type AppOptions = {
  // Каталог в памяти (B04). Нужен вместе с базой для маршрутов API.
  catalog?: ServerCatalog;
  // Часы сервера (BACKEND.md §2.5): в тестах — подставные. Date.now() в
  // обработчиках запрещён — только ctx.clock.
  clock?: Clock;
  config: Config;
  // База (B03). Без неё — только /v1/health без проверки базы (тесты каркаса).
  db?: Db;
  hub?: EventHub;
  // Поток логов (тест «в логах нет токена»).
  logStream?: Writable;
  random?: Random;
  // Планировщик дедлайнов и жеребьёвки по дате (B13): включает server.ts;
  // тесты зовут runSchedulerOnce сами.
  scheduler?: boolean;
};

// Fastify-приложение без запуска: тесты зовут его через app.inject, а
// server.ts — слушает порт. Маршруты API — под /v1 (BACKEND.md §4.5).
export const buildApp = ({
  config,
  db,
  catalog,
  clock = { now: () => Date.now() },
  random = createCryptoRandom(),
  hub,
  logStream,
  scheduler = false,
}: AppOptions): FastifyInstance => {
  const app = Fastify({
    logger:
      config.LOG_LEVEL === "silent"
        ? false
        : {
            level: config.LOG_LEVEL,
            ...(logStream ? { stream: logStream } : {}),
          },
    // Лимит JSON — 100 КБ (BACKEND.md §10).
    bodyLimit: 100 * 1024,
    // requestId — в каждой строке лога и в ответе с ошибкой (§4.5, §12).
    genReqId: () => randomUUID(),
    logController: new LogController({ requestIdLogLabel: "requestId" }),
  });

  registerErrors(app);

  // Мягкая остановка (SIGTERM): начатые запросы доотвечают, но с
  // «Connection: close». Иначе keep-alive соединение, занятое в момент
  // остановки, оставалось бы открытым, и app.close() ждал бы его тайм-аута.
  let closing = false;
  app.addHook("preClose", async () => {
    closing = true;
  });
  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
    if (closing) reply.header("connection", "close");
  });

  // База не ответила — 503 OFFLINE (BACKEND.md §4.5): мониторинг видит, что
  // сервер жив, но работать не может.
  app.get("/v1/health", async (request, reply) => {
    if (db && !(await db.ping())) {
      return reply.status(503).send({
        code: "OFFLINE",
        message: "База данных недоступна",
        requestId: request.id,
      });
    }
    return {
      app: "swipeit",
      mode: MODE,
      apiVersion: 1,
      now: clock.now(),
      commit: config.COMMIT,
      ...(catalog ? { catalogVersion: catalog.version } : {}),
    };
  });

  if (db && catalog) {
    // WebSocket /v1/ws (B12): вход — hello { token }, дальше события только
    // адресатам. В тестах можно подставить свой хаб.
    let events: EventHub;
    if (hub) {
      events = hub;
    } else {
      const sockets = createSocketHub({
        now: clock.now,
        resolve: async (token) =>
          (await resolveSession(db.db, token, clock))?.userId ?? null,
      });
      app.server.on("upgrade", (request, socket, head) => {
        if (request.url?.split("?")[0] === "/v1/ws") {
          sockets.handleUpgrade(request, socket, head);
        } else {
          socket.destroy();
        }
      });
      app.addHook("onClose", () => sockets.close());
      events = sockets;
    }
    registerRoutes(app, {
      db,
      catalog,
      clock,
      random,
      hub: events,
      publicShareUrl: config.PUBLIC_SHARE_URL,
    });
    registerUploads(app, {
      db,
      catalog,
      clock,
      random,
      storage: createDiskStorage(config.UPLOADS_DIR),
    });
    if (scheduler) {
      const stop = startScheduler({
        db,
        catalog,
        clock,
        random,
        hub: events,
        log: app.log,
      });
      app.addHook("onClose", async () => stop());
    }
  }

  return app;
};
