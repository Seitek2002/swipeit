import type { ApiMode } from "@swipeit/core/contract";
import { createCryptoRandom, type Random } from "@swipeit/core/logic/random";
import Fastify, {
  type FastifyInstance,
  type FastifyRequest,
  LogController,
} from "fastify";
import { randomUUID } from "node:crypto";
import type { Writable } from "node:stream";

import type { ServerCatalog } from "./catalog/load";
import { type Config, multiWishlistsEnabled } from "./config";
import type { Clock } from "./context";
import type { Db } from "./db/client";
import {
  createErrorLog,
  HEALTH_503,
  registerErrors,
  routeOf,
  writeErrorsDaily,
} from "./errors";
import { resolveSession } from "./auth/sessions";
import {
  createTelegramAuth,
  fetchJwks,
  type JwksSource,
} from "./auth/telegram";
import {
  createLogSender,
  createTelegramSender,
} from "./domains/notifications/sender";
import { createDiskStorage } from "./domains/uploads/storage";
import { registerHttpGuards } from "./http-guards";
import { REHEARSAL_HEADER } from "./ops-auth";
import { createLimiter, limitConfigFrom } from "./limits";
import { registerOps } from "./routes-ops";
import { registerPreview } from "./routes-preview";
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
  // Ключи Telegram для проверки id_token (S03): в тестах — свои, без сети.
  // По умолчанию — TELEGRAM_JWKS_URL.
  telegramJwks?: JwksSource;
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
  telegramJwks,
}: AppOptions): FastifyInstance => {
  const app = Fastify({
    // За прокси IP человека — из X-Forwarded-For (§10, R01).
    ...(config.TRUST_PROXY
      ? {
          trustProxy:
            config.TRUST_PROXY === "true"
              ? true
              : config.TRUST_PROXY.split(",").map((entry) => entry.trim()),
        }
      : {}),
    logger:
      config.LOG_LEVEL === "silent"
        ? false
        : {
            level: config.LOG_LEVEL,
            ...(logStream ? { stream: logStream } : {}),
            // Журнал читает администратор — коллега из того же офиса
            // (auto-tasks-metrics-1 M12). Вместо адреса — шаблон маршрута:
            // в адресе коды коротких ссылок и приглашений (/v1/share/<код>,
            // /s/<код>), а по коду можно открыть чужой вишлист. Неизвестный
            // маршрут — без адреса. Заголовков Fastify в журнал не пишет;
            // токены всё равно закрыты — на случай, если кто-то залогирует
            // запрос целиком.
            serializers: {
              req: (request: FastifyRequest) => ({
                method: request.method,
                url: routeOf(request),
                host: request.host,
                remoteAddress: request.ip,
              }),
            },
            redact: {
              paths: [
                "req.headers.authorization",
                `req.headers["${REHEARSAL_HEADER}"]`,
                "headers.authorization",
                `headers["${REHEARSAL_HEADER}"]`,
              ],
              censor: "[скрыто]",
            },
          },
    // Лимит JSON — 100 КБ (BACKEND.md §10).
    bodyLimit: 100 * 1024,
    // requestId — в каждой строке лога и в ответе с ошибкой (§4.5, §12).
    genReqId: () => randomUUID(),
    logController: new LogController({ requestIdLogLabel: "requestId" }),
  });

  // Ответы с ошибкой: в памяти процесса и по дням в базе (M05).
  const errorLog = createErrorLog({
    clock,
    ...(db ? { write: writeErrorsDaily(db.db) } : {}),
  });
  registerErrors(app, errorLog, { opsToken: config.OPS_TOKEN });
  // Остановка: дописать в базу то, что ещё ждёт в очереди, — но не дольше
  // 2 с: база без ответа не держит остановку.
  app.addHook("onClose", async () => {
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      errorLog.flush(),
      new Promise((resolve) => {
        timer = setTimeout(resolve, 2_000);
      }),
    ]);
    clearTimeout(timer);
  });

  // Без TRUST_PROXY в production все люди за прокси — один IP, и лимит
  // ляжет на сам прокси (R01).
  if (config.NODE_ENV === "production" && !config.TRUST_PROXY) {
    app.log.warn(
      "TRUST_PROXY не задан: если перед сервером прокси, лимиты запросов посчитают всех одним адресом",
    );
  }

  registerHttpGuards(app, { corsOrigins: config.CORS_ORIGINS });

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
  // сервер жив, но работать не может. Каждый такой ответ — +1 к «/health
  // отвечал 503» (M05): в базу уйдёт, когда она вернётся.
  app.get("/v1/health", async (request, reply) => {
    if (db && !(await db.ping())) {
      errorLog.count(HEALTH_503, false);
      return reply.status(503).send({
        code: "OFFLINE",
        message: "База данных недоступна",
        requestId: request.id,
      });
    }
    // База снова отвечает — дослать счётчики, что ждали в памяти.
    if (db && errorLog.hasPending()) void errorLog.flush();
    return {
      app: "swipeit",
      mode: MODE,
      apiVersion: 1,
      now: clock.now(),
      commit: config.COMMIT,
      // Запуск процесса (S08): по нему видно перезапуски.
      startedAt: errorLog.startedAt.toISOString(),
      // Старее этой сборки фронт показывает «Обнови приложение» (B17).
      minClientBuild: config.MIN_CLIENT_BUILD,
      ...(catalog ? { catalogVersion: catalog.version } : {}),
    };
  });

  if (db && catalog) {
    // WebSocket /v1/ws (B12): вход — hello { token }, дальше события только
    // адресатам. В тестах можно подставить свой хаб.
    let events: EventHub;
    let online: (() => { people: number; sockets: number }) | undefined;
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
      online = sockets.stats;
    }
    // Вход через Telegram (S03) — только с Client ID бота.
    const telegram = config.TELEGRAM_CLIENT_ID
      ? createTelegramAuth({
          clientId: config.TELEGRAM_CLIENT_ID,
          jwks: telegramJwks ?? fetchJwks(config.TELEGRAM_JWKS_URL),
          now: clock.now,
        })
      : null;
    registerRoutes(app, {
      ...(telegram ? { extraHandlers: telegram.handlers } : {}),
      db,
      catalog,
      clock,
      random,
      hub: events,
      limiter: createLimiter(clock.now),
      limits: limitConfigFrom(config),
      multiWishlists: multiWishlistsEnabled(config),
      opsToken: config.OPS_TOKEN,
      publicShareUrl: config.PUBLIC_SHARE_URL,
    });
    registerPreview(app, {
      db,
      clock,
      frontUrl: config.PUBLIC_APP_URL,
      publicShareUrl: config.PUBLIC_SHARE_URL,
    });
    registerOps(app, {
      db,
      catalog,
      clock,
      errorLog,
      online,
      token: config.OPS_TOKEN,
      // Без токена бота сообщения только в журнале (S10, M09).
      botEnabled: Boolean(config.TELEGRAM_BOT_TOKEN),
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
        // Без токена бот никому не пишет — сообщения только в логе (S10).
        notifications: {
          appUrl: config.PUBLIC_APP_URL,
          sender: config.TELEGRAM_BOT_TOKEN
            ? createTelegramSender({
                apiUrl: config.TELEGRAM_API_URL,
                token: config.TELEGRAM_BOT_TOKEN,
              })
            : createLogSender(app.log),
        },
      });
      app.addHook("onClose", async () => stop());
    }
  }

  return app;
};
