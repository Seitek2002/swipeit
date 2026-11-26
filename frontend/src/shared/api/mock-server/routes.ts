import type { Handler } from "./context";
import { validation } from "./errors";
import { getCount, getFeed, getProduct } from "./handlers/catalog";
import { getSettings, resetDemo, updateSettings } from "./handlers/demo";
import {
  createReservation,
  deleteReservation,
  dismissGivenHint,
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
import { createSwipe, restartSwipes, undoSwipe } from "./handlers/swipes";
import {
  createUser,
  getMe,
  getUser,
  listFriends,
  loginDemo,
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
  { method: "GET", pattern: "/users/:id", handler: getUser },
  { method: "GET", pattern: "/friends", handler: listFriends },
  { method: "GET", pattern: "/catalog/feed", handler: getFeed },
  { method: "GET", pattern: "/catalog/count", handler: getCount },
  { method: "GET", pattern: "/catalog/products/:id", handler: getProduct },
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
  { method: "POST", pattern: "/demo/reset", handler: resetDemo },
  { method: "GET", pattern: "/demo/settings", handler: getSettings },
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
