import { contractFor, routeKey } from "@swipeit/core/contract";
import type { Random } from "@swipeit/core/logic/random";
import type { RealtimeEvent } from "@swipeit/core/realtime/types";
import { unauthorized } from "@swipeit/core/errors";
import type { FastifyInstance, FastifyRequest } from "fastify";

import { resolveSession } from "./auth/sessions";
import type { ServerCatalog } from "./catalog/load";
import type { Clock, ServerHandler } from "./context";
import type { Db } from "./db/client";
import {
  createUser,
  getMe,
  logout,
  markHintSeen,
  updateMe,
} from "./domains/users/handlers";
import type { EventHub } from "./realtime/hub";

// Обработчики сервера по ключу «МЕТОД /путь» контракта. Маршрут контракта
// без обработчика не регистрируется — до своей задачи (B05–B13) он 404.
export const HANDLERS: Readonly<Record<string, ServerHandler>> = {
  "POST /users": createUser,
  "GET /me": getMe,
  "PATCH /me": updateMe,
  "POST /me/hints": markHintSeen,
  "POST /auth/logout": logout,
};

export type RouteDeps = {
  catalog: ServerCatalog;
  clock: Clock;
  db: Db;
  hub: EventHub;
  random: Random;
};

const bearer = (request: FastifyRequest): null | string => {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
};

// Маршруты API — из контракта @swipeit/core для режима remote, под /v1
// (BACKEND.md §4.4, §4.5). Каждый запрос — одна транзакция (§2.6); события
// уходят в хаб только после commit.
export const registerRoutes = (app: FastifyInstance, deps: RouteDeps) => {
  for (const route of contractFor("remote")) {
    const handler = HANDLERS[routeKey(route.method, route.path)];
    if (!handler) continue;
    app.route({
      method: route.method,
      url: `/v1${route.path}`,
      handler: async (request, reply) => {
        const token = bearer(request);
        const session = token
          ? await resolveSession(deps.db.db, token, deps.clock)
          : null;
        // Токена нет там, где он нужен, или он неверный — 401 (§3.2). На
        // открытых маршрутах неверный токен просто не даёт пользователя.
        if (route.access === "user" && !session) throw unauthorized();

        const events: RealtimeEvent[] = [];
        const result = await deps.db.db.transaction((tx) =>
          handler(
            {
              tx,
              userId: session?.userId ?? null,
              sessionId: session?.sessionId ?? null,
              userAgent: request.headers["user-agent"] ?? null,
              clock: deps.clock,
              random: deps.random,
              catalog: deps.catalog,
              events: { publish: (event) => events.push(event) },
              log: request.log,
            },
            {
              body: request.body,
              params: (request.params ?? {}) as Record<string, string>,
              query: (request.query ?? {}) as Record<string, unknown>,
            },
          ),
        );
        deps.hub.deliver(events);
        return reply.send(result ?? { ok: true });
      },
    });
  }
};
