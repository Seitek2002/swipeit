import type { Handler } from "./context";
import { validation } from "./errors";
import { createCustomActivity, listActivities } from "./handlers/activities";
import {
  getCatalogMeta,
  getCatalogStores,
  getCount,
  getFeed,
  getProduct,
} from "./handlers/catalog";
import {
  createDate,
  deleteDate,
  dismissReminder,
  jumpToReminder,
  listDates,
  listReminders,
  updateDate,
} from "./handlers/dates";
import {
  getSettings,
  listDemoUsers,
  loadNewYearScenario,
  resetDemo,
  updateSettings,
} from "./handlers/demo";
import {
  createReservation,
  deleteReservation,
  dismissGivenHint,
  getMyReservations,
  getReservations,
  getUserWishlist,
  importExternalWishlist,
  shareWishlist,
  updateMeta,
} from "./handlers/guest";
import {
  answerPickRequest,
  createPickRequest,
  getMyPicks,
  importPickAnswer,
} from "./handlers/pick";
import {
  addPlanActivities,
  cancelPlanDecision,
  createPlan,
  decidePlan,
  expirePlans,
  finishPlan,
  getPlan,
  joinPlan,
  listPlans,
  setPlanRule,
  setReady,
  startPlan,
  swipePlan,
  undoPlanSwipe,
  votePlan,
} from "./handlers/plans";
import {
  createSantaGame,
  drawSantaGame,
  getSantaGame,
  joinSantaGame,
  listSantaGames,
  openSantaEnvelope,
  setSantaBought,
  tickSanta,
  updateSantaGame,
} from "./handlers/santa";
import { createSwipe, restartSwipes, undoSwipe } from "./handlers/swipes";
import {
  createUser,
  getMe,
  getUser,
  listFriends,
  loginDemo,
  markHintSeen,
  resetHints,
  updateMe,
} from "./handlers/users";
import {
  createCustomWish,
  deleteItem,
  getMyWishlist,
  markGiven,
  reorderItems,
  restoreItem,
  undeleteItem,
  updateItem,
} from "./handlers/wishlist";

export type HttpMethod = "DELETE" | "GET" | "PATCH" | "POST";

type Route = { handler: Handler; method: HttpMethod; pattern: string };

// Таблица маршрутов — она же контракт будущего REST API (TECH_SPEC §6).
// Одна на mockTransport в браузере и на LAN-сервер (T12b). Остальные
// маршруты добавляются вместе со своими задачами.
export const ROUTE_TABLE: Route[] = [
  { method: "POST", pattern: "/auth/demo", handler: loginDemo },
  { method: "POST", pattern: "/users", handler: createUser },
  { method: "GET", pattern: "/me", handler: getMe },
  { method: "PATCH", pattern: "/me", handler: updateMe },
  { method: "POST", pattern: "/me/hints", handler: markHintSeen },
  { method: "GET", pattern: "/me/dates", handler: listDates },
  { method: "POST", pattern: "/me/dates", handler: createDate },
  { method: "PATCH", pattern: "/me/dates/:id", handler: updateDate },
  { method: "DELETE", pattern: "/me/dates/:id", handler: deleteDate },
  { method: "GET", pattern: "/me/reminders", handler: listReminders },
  {
    method: "POST",
    pattern: "/me/reminders/:id/dismiss",
    handler: dismissReminder,
  },
  { method: "GET", pattern: "/users/:id", handler: getUser },
  { method: "GET", pattern: "/friends", handler: listFriends },
  { method: "GET", pattern: "/catalog/feed", handler: getFeed },
  { method: "GET", pattern: "/catalog/count", handler: getCount },
  { method: "GET", pattern: "/catalog/products/:id", handler: getProduct },
  { method: "GET", pattern: "/catalog/meta", handler: getCatalogMeta },
  { method: "GET", pattern: "/catalog/stores", handler: getCatalogStores },
  { method: "POST", pattern: "/swipes", handler: createSwipe },
  { method: "POST", pattern: "/swipes/undo", handler: undoSwipe },
  { method: "POST", pattern: "/swipes/restart", handler: restartSwipes },
  { method: "GET", pattern: "/wishlist", handler: getMyWishlist },
  { method: "POST", pattern: "/wishlist/items", handler: createCustomWish },
  { method: "PATCH", pattern: "/wishlist/items/:id", handler: updateItem },
  { method: "DELETE", pattern: "/wishlist/items/:id", handler: deleteItem },
  {
    method: "POST",
    pattern: "/wishlist/items/:id/undelete",
    handler: undeleteItem,
  },
  { method: "POST", pattern: "/wishlist/reorder", handler: reorderItems },
  { method: "POST", pattern: "/wishlist/items/:id/given", handler: markGiven },
  {
    method: "POST",
    pattern: "/wishlist/items/:id/restore",
    handler: restoreItem,
  },
  { method: "PATCH", pattern: "/wishlist/meta", handler: updateMeta },
  { method: "POST", pattern: "/wishlist/share", handler: shareWishlist },
  {
    method: "POST",
    pattern: "/wishlist/given-hint/dismiss",
    handler: dismissGivenHint,
  },
  { method: "GET", pattern: "/users/:id/wishlist", handler: getUserWishlist },
  {
    method: "POST",
    pattern: "/external-wishlists",
    handler: importExternalWishlist,
  },
  { method: "GET", pattern: "/reservations", handler: getReservations },
  { method: "GET", pattern: "/me/reservations", handler: getMyReservations },
  { method: "POST", pattern: "/reservations", handler: createReservation },
  {
    method: "DELETE",
    pattern: "/reservations/:id",
    handler: deleteReservation,
  },
  { method: "POST", pattern: "/pick-requests", handler: createPickRequest },
  { method: "GET", pattern: "/pick-requests/:id/picks", handler: getMyPicks },
  {
    method: "POST",
    pattern: "/pick-requests/:id/answer",
    handler: answerPickRequest,
  },
  { method: "POST", pattern: "/pick-answers", handler: importPickAnswer },
  { method: "GET", pattern: "/plans", handler: listPlans },
  { method: "POST", pattern: "/plans", handler: createPlan },
  // До /plans/:id/* — чтобы "expire" не читался как id плана.
  { method: "POST", pattern: "/plans/expire", handler: expirePlans },
  { method: "GET", pattern: "/plans/:id", handler: getPlan },
  { method: "POST", pattern: "/plans/:id/join", handler: joinPlan },
  { method: "POST", pattern: "/plans/:id/ready", handler: setReady },
  { method: "POST", pattern: "/plans/:id/start", handler: startPlan },
  { method: "POST", pattern: "/plans/:id/swipes", handler: swipePlan },
  {
    method: "POST",
    pattern: "/plans/:id/swipes/undo",
    handler: undoPlanSwipe,
  },
  { method: "POST", pattern: "/plans/:id/finish", handler: finishPlan },
  { method: "POST", pattern: "/plans/:id/votes", handler: votePlan },
  { method: "POST", pattern: "/plans/:id/decide", handler: decidePlan },
  {
    method: "POST",
    pattern: "/plans/:id/decide/cancel",
    handler: cancelPlanDecision,
  },
  { method: "POST", pattern: "/plans/:id/rule", handler: setPlanRule },
  {
    method: "POST",
    pattern: "/plans/:id/activities",
    handler: addPlanActivities,
  },
  { method: "GET", pattern: "/santa", handler: listSantaGames },
  { method: "POST", pattern: "/santa", handler: createSantaGame },
  // Планировщик жеребьёвки по дате — расширение TECH_SPEC §6.
  { method: "POST", pattern: "/santa/tick", handler: tickSanta },
  { method: "GET", pattern: "/santa/:id", handler: getSantaGame },
  { method: "PATCH", pattern: "/santa/:id", handler: updateSantaGame },
  { method: "POST", pattern: "/santa/:id/join", handler: joinSantaGame },
  { method: "POST", pattern: "/santa/:id/draw", handler: drawSantaGame },
  { method: "POST", pattern: "/santa/:id/open", handler: openSantaEnvelope },
  { method: "POST", pattern: "/santa/:id/bought", handler: setSantaBought },
  { method: "GET", pattern: "/activities", handler: listActivities },
  { method: "POST", pattern: "/activities", handler: createCustomActivity },
  { method: "POST", pattern: "/demo/reset", handler: resetDemo },
  { method: "POST", pattern: "/demo/hints/reset", handler: resetHints },
  {
    method: "POST",
    pattern: "/demo/clock/to-reminder",
    handler: jumpToReminder,
  },
  {
    method: "POST",
    pattern: "/demo/scenario/new-year",
    handler: loadNewYearScenario,
  },
  { method: "GET", pattern: "/demo/settings", handler: getSettings },
  { method: "GET", pattern: "/demo/users", handler: listDemoUsers },
  { method: "PATCH", pattern: "/demo/settings", handler: updateSettings },
];

const splitPath = (path: string) =>
  path.split("?")[0]?.split("/").filter(Boolean) ?? [];

export const matchRoute = (method: HttpMethod, path: string) => {
  const parts = splitPath(path);
  for (const route of ROUTE_TABLE) {
    if (route.method !== method) continue;
    const pattern = splitPath(route.pattern);
    if (pattern.length !== parts.length) continue;
    const params: Record<string, string> = {};
    const matched = pattern.every((segment, index) => {
      const part = parts[index] ?? "";
      if (segment.startsWith(":")) {
        try {
          params[segment.slice(1)] = decodeURIComponent(part);
        } catch {
          throw validation("Адрес повреждён");
        }
        return true;
      }
      return segment === part;
    });
    if (matched) return { handler: route.handler, params };
  }
  return null;
};
