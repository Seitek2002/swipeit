import { contractFor, routeKey } from "@swipeit/core/contract";
import type { Random } from "@swipeit/core/logic/random";
import { ApiError, unauthorized } from "@swipeit/core/errors";
import type { FastifyInstance, FastifyRequest } from "fastify";

import { resolveSession } from "./auth/sessions";
import {
  BY_IP_RULES,
  type LimitConfig,
  type Limiter,
  rulesFor,
} from "./limits";
import type { ServerCatalog } from "./catalog/load";
import type { Clock, ServerHandler } from "./context";
import type { Db } from "./db/client";
import {
  getCatalogMeta,
  getCatalogStores,
  getCount,
  getFeed,
  getProduct,
  listActivities,
} from "./domains/catalog/handlers";
import {
  createDate,
  deleteDate,
  dismissReminder,
  listDates,
  listReminders,
  updateDate,
} from "./domains/dates/handlers";
import { getUser, listFriends } from "./domains/friends/handlers";
import { reachClientStep } from "./domains/funnel/handlers";
import {
  createReservation,
  createShareLink,
  deleteReservation,
  getMyReservations,
  getOpenedWishlists,
  getReservations,
  getShare,
  getUserWishlist,
  importExternalWishlist,
  shareWishlist,
} from "./domains/guest/handlers";
import {
  answerPickRequest,
  createPickRequest,
  getMyPicks,
  importPickAnswer,
} from "./domains/pick/handlers";
import {
  createSwipe,
  restartSwipes,
  undoSwipe,
} from "./domains/swipes/handlers";
import {
  addPlanActivities,
  cancelPlanDecision,
  closePlan,
  extendPlan,
  createCustomActivity,
  createPlan,
  decidePlan,
  finishPlan,
  getPlan,
  joinPlan,
  leavePlan,
  listPlans,
  setPlanRule,
  setReady,
  startPlan,
  swipePlan,
  undoPlanSwipe,
  votePlan,
} from "./domains/plans/handlers";
import {
  createSantaGame,
  drawSantaGame,
  getSantaGame,
  handOverSantaGame,
  joinSantaGame,
  leaveSantaGame,
  listSantaGames,
  openSantaEnvelope,
  removeSantaMember,
  setSantaBought,
  updateSantaGame,
} from "./domains/santa/handlers";
import { deleteMe } from "./domains/users/delete";
import {
  createCustomWish,
  deleteItem,
  dismissGivenHint,
  getMyWishlist,
  markGiven,
  reorderItems,
  restoreItem,
  undeleteItem,
  updateItem,
  updateMeta,
} from "./domains/wishlist/handlers";
import {
  createUser,
  getMe,
  logout,
  markHintSeen,
  updateMe,
} from "./domains/users/handlers";
import type { AddressedEvent, EventHub } from "./realtime/hub";

// Обработчики сервера по ключу «МЕТОД /путь» контракта. Маршрут контракта
// без обработчика не регистрируется — до своей задачи (B05–B13) он 404.
export const HANDLERS: Readonly<Record<string, ServerHandler>> = {
  "POST /users": createUser,
  "GET /me": getMe,
  "PATCH /me": updateMe,
  "POST /me/hints": markHintSeen,
  "POST /auth/logout": logout,
  "POST /me/funnel": reachClientStep,
  "DELETE /me": deleteMe,
  "GET /me/dates": listDates,
  "POST /me/dates": createDate,
  "PATCH /me/dates/:id": updateDate,
  "DELETE /me/dates/:id": deleteDate,
  "GET /me/reminders": listReminders,
  "POST /me/reminders/:id/dismiss": dismissReminder,
  "GET /users/:id": getUser,
  "GET /friends": listFriends,
  "GET /catalog/feed": getFeed,
  "GET /catalog/count": getCount,
  "GET /catalog/products/:id": getProduct,
  "GET /catalog/meta": getCatalogMeta,
  "GET /catalog/stores": getCatalogStores,
  "GET /activities": listActivities,
  "POST /swipes": createSwipe,
  "POST /swipes/undo": undoSwipe,
  "POST /swipes/restart": restartSwipes,
  "GET /wishlist": getMyWishlist,
  "POST /wishlist/items": createCustomWish,
  "PATCH /wishlist/items/:id": updateItem,
  "DELETE /wishlist/items/:id": deleteItem,
  "POST /wishlist/items/:id/undelete": undeleteItem,
  "POST /wishlist/reorder": reorderItems,
  "POST /wishlist/items/:id/given": markGiven,
  "POST /wishlist/items/:id/restore": restoreItem,
  "PATCH /wishlist/meta": updateMeta,
  "POST /wishlist/given-hint/dismiss": dismissGivenHint,
  "POST /wishlist/share": shareWishlist,
  "POST /share-links": createShareLink,
  "GET /share/:code": getShare,
  "GET /users/:id/wishlist": getUserWishlist,
  "POST /external-wishlists": importExternalWishlist,
  "GET /reservations": getReservations,
  "POST /reservations": createReservation,
  "DELETE /reservations/:id": deleteReservation,
  "GET /me/reservations": getMyReservations,
  "GET /me/opened-wishlists": getOpenedWishlists,
  "POST /pick-requests": createPickRequest,
  "GET /pick-requests/:id/picks": getMyPicks,
  "POST /pick-requests/:id/answer": answerPickRequest,
  "POST /pick-answers": importPickAnswer,
  "GET /plans": listPlans,
  "POST /plans": createPlan,
  "GET /plans/:id": getPlan,
  "POST /plans/:id/join": joinPlan,
  "POST /plans/:id/ready": setReady,
  "POST /plans/:id/start": startPlan,
  "POST /plans/:id/swipes": swipePlan,
  "POST /plans/:id/swipes/undo": undoPlanSwipe,
  "POST /plans/:id/finish": finishPlan,
  "POST /plans/:id/votes": votePlan,
  "POST /plans/:id/close": closePlan,
  "POST /plans/:id/extend": extendPlan,
  "POST /plans/:id/leave": leavePlan,
  "POST /plans/:id/decide": decidePlan,
  "POST /plans/:id/decide/cancel": cancelPlanDecision,
  "POST /plans/:id/rule": setPlanRule,
  "POST /plans/:id/activities": addPlanActivities,
  "POST /activities": createCustomActivity,
  "GET /santa": listSantaGames,
  "POST /santa": createSantaGame,
  "GET /santa/:id": getSantaGame,
  "PATCH /santa/:id": updateSantaGame,
  "POST /santa/:id/join": joinSantaGame,
  "POST /santa/:id/draw": drawSantaGame,
  "POST /santa/:id/open": openSantaEnvelope,
  "POST /santa/:id/bought": setSantaBought,
  "POST /santa/:id/leave": leaveSantaGame,
  "DELETE /santa/:id/members/:userId": removeSantaMember,
  "POST /santa/:id/owner": handOverSantaGame,
};

export type RouteDeps = {
  // Обработчики, которые есть не всегда: вход через Telegram — только с
  // TELEGRAM_CLIENT_ID (S03). Без них маршрута нет — 404.
  extraHandlers?: Readonly<Record<string, ServerHandler>>;
  catalog: ServerCatalog;
  clock: Clock;
  db: Db;
  hub: EventHub;
  limiter: Limiter;
  limits: LimitConfig;
  publicShareUrl: string;
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
  const handlers = { ...HANDLERS, ...deps.extraHandlers };
  for (const route of contractFor("remote")) {
    const handler = handlers[routeKey(route.method, route.path)];
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

        // Лимиты (R01): с верным токеном — на сессию (брони — на человека),
        // без него — на IP. 429 с Retry-After; клиент сам не повторяет.
        const key = routeKey(route.method, route.path);
        for (const { name, rule } of rulesFor(
          key,
          Boolean(session),
          deps.limits,
        )) {
          const who =
            !session || BY_IP_RULES.has(name)
              ? `ip:${request.ip}`
              : name === "reservations"
                ? `user:${session.userId}`
                : `session:${session.sessionId}`;
          const retryAfter = deps.limiter.hit(`${name}|${who}`, rule);
          if (retryAfter !== null) {
            reply.header("retry-after", String(retryAfter));
            throw new ApiError(
              429,
              "RATE_LIMITED",
              "Слишком часто — попробуй через минуту",
            );
          }
        }

        const events: AddressedEvent[] = [];
        const result = await deps.db.db.transaction((tx) =>
          handler(
            {
              tx,
              userId: session?.userId ?? null,
              sessionId: session?.sessionId ?? null,
              userAgent: request.headers["user-agent"] ?? null,
              isRefetch: request.headers["x-swipeit-refetch"] === "1",
              clock: deps.clock,
              random: deps.random,
              catalog: deps.catalog,
              events: {
                publish: (event, to) => events.push({ event, to }),
              },
              log: request.log,
              publicShareUrl: deps.publicShareUrl,
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
