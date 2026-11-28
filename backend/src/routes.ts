import { contractFor, routeKey } from "@swipeit/core/contract";
import type { Random } from "@swipeit/core/logic/random";
import { unauthorized } from "@swipeit/core/errors";
import type { FastifyInstance, FastifyRequest } from "fastify";

import { resolveSession } from "./auth/sessions";
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
import {
  createReservation,
  createShareLink,
  deleteReservation,
  getMyReservations,
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
};

export type RouteDeps = {
  catalog: ServerCatalog;
  clock: Clock;
  db: Db;
  hub: EventHub;
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
