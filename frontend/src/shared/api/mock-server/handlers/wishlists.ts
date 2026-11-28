import {
  CreateWishlistInputSchema,
  PatchWishlistInputSchema,
} from "@swipeit/core/api/wishlist/inputs";
import {
  assertCanCreateWishlist,
  assertCanDeleteWishlist,
  assertCanRenameWishlist,
  findOwnWishlist,
  mergeOnMove,
  ordersOnTop,
  planListDeletion,
  resolveActiveWishlistId,
  wishlistCounts,
  wishlistCover,
} from "@swipeit/core/logic/wishlists";
import { nanoid } from "nanoid";

import type {
  DeleteWishlistResponse,
  Wishlist,
  WishlistSummary,
  WishlistsResponse,
} from "../../wishlist/types";
import { type Handler, type HandlerContext, nowIso } from "../context";
import type { Db } from "../db";
import { normalizeOccasion } from "../occasion";
import { defaultListOf, ensureLists, itemsOfList, listsOf } from "../wishlists";
import { parseInput, requireUser } from "./common";

// Несколько вишлистов, как плейлисты (spec-multi-wishlists §2, §3.6, L04):
// ряд, создание, переименование, удаление, главный — зеркально серверу
// (backend/src/domains/wishlists/handlers.ts), правила — в core.

const changed = (ctx: HandlerContext) =>
  ctx.realtime.publish({
    type: "db:changed",
    scope: ["wishlist"],
    by: ctx.userId ?? "",
  });

// Ряд вишлистов: «Общий» первым, дальше по созданию (в базе — в порядке
// создания); счётчики и обложка — по строкам каждого вишлиста. Ссылки в
// моке — снимки без кода, поэтому sharedAt нет.
const wishlistsView = (db: Db, ownerId: string): WishlistsResponse => {
  const lists = listsOf(db, ownerId);
  const fallback = defaultListOf(lists);
  const items = db.wishlistItems[ownerId] ?? [];
  const ordered = [fallback, ...lists.filter((list) => !list.isDefault)];
  return {
    activeId:
      resolveActiveWishlistId(lists, db.activeWishlist[ownerId]) ?? fallback.id,
    lists: ordered.map((list): WishlistSummary => {
      const listItems = itemsOfList(items, lists, list);
      return {
        id: list.id,
        name: list.name,
        isDefault: list.isDefault,
        ...(list.occasion ? { occasion: list.occasion } : {}),
        ...wishlistCounts(listItems),
        cover: wishlistCover(listItems),
      };
    }),
  };
};

// GET /wishlists — ряд своих вишлистов и главный.
export const getWishlists: Handler = async (ctx) => {
  const db = await ctx.db.read();
  return wishlistsView(db, requireUser(ctx, db).id);
};

// POST /wishlists { name, occasion?, makeActive? } — новый вишлист в конце
// ряда. Флаг выключен — FORBIDDEN MULTI_WISHLISTS_OFF; лимит 10 и повтор
// названия без учёта регистра — VALIDATION.
export const createWishlist: Handler = async (ctx, { body }) => {
  const input = parseInput(CreateWishlistInputSchema, body);
  const now = ctx.clock.now();
  const created = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const lists = ensureLists(db, user.id);
    assertCanCreateWishlist(lists, input.name, {
      enabled: ctx.multiWishlists !== false,
    });
    const list: Wishlist = {
      id: `wl_${nanoid(10)}`,
      ownerId: user.id,
      name: input.name,
      isDefault: false,
      createdAt: nowIso(ctx.clock),
    };
    if (input.occasion) {
      list.occasion = normalizeOccasion(db, user, input.occasion, now);
    }
    lists.push(list);
    if (input.makeActive) db.activeWishlist[user.id] = list.id;
    return list;
  });
  changed(ctx);
  return created;
};

// PATCH /wishlists/:id { name? } — переименовать («Общий» тоже можно).
export const patchWishlist: Handler = async (ctx, { params, body }) => {
  const input = parseInput(PatchWishlistInputSchema, body ?? {});
  const updated = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const lists = ensureLists(db, user.id);
    const list = findOwnWishlist(lists, params.id ?? "");
    if (input.name !== undefined && input.name !== list.name) {
      assertCanRenameWishlist(lists, list.id, input.name);
      list.name = input.name;
    }
    return list;
  });
  changed(ctx);
  return updated;
};

// DELETE /wishlists/:id — «Общий» не удаляется (FORBIDDEN). Желания — в
// «Общий» (§2.7, решение В2): наверх, в прежнем порядке; активный двойник
// там — слияние. Был главным — главный «Общий».
export const deleteWishlist: Handler = async (ctx, { params }) => {
  const response = await ctx.db.write((db): DeleteWishlistResponse => {
    const user = requireUser(ctx, db);
    const lists = ensureLists(db, user.id);
    const list = findOwnWishlist(lists, params.id ?? "");
    assertCanDeleteWishlist(list);
    const fallback = defaultListOf(lists);
    const items = (db.wishlistItems[user.id] ??= []);
    const deletedItems = itemsOfList(items, lists, list);
    const defaultItems = itemsOfList(items, lists, fallback);
    const { merges, moves } = planListDeletion(deletedItems, defaultItems);
    const byId = new Map(items.map((item) => [item.id, item]));
    const removed = new Set<string>();
    for (const { movingId, targetId } of merges) {
      const target = byId.get(targetId);
      const moving = byId.get(movingId);
      if (!target || !moving) continue;
      Object.assign(target, mergeOnMove(target, moving));
      removed.add(movingId);
    }
    const orders = ordersOnTop(
      defaultItems.map((item) => item.order),
      moves.length,
    );
    moves.forEach((id, index) => {
      const item = byId.get(id);
      if (!item) return;
      item.wishlistId = fallback.id;
      item.order = orders[index] ?? 0;
    });
    db.wishlistItems[user.id] = items.filter((item) => !removed.has(item.id));
    db.wishlists[user.id] = lists.filter((entry) => entry.id !== list.id);
    if (db.activeWishlist[user.id] === list.id) {
      delete db.activeWishlist[user.id];
    }
    return { movedCount: merges.length + moves.length };
  });
  changed(ctx);
  return response;
};

// POST /wishlists/:id/activate — сделать главным: сюда летят «Хочу» из
// ленты (§2.3). Ответ — ряд с новым activeId.
export const activateWishlist: Handler = async (ctx, { params }) => {
  const view = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const list = findOwnWishlist(ensureLists(db, user.id), params.id ?? "");
    db.activeWishlist[user.id] = list.id;
    return wishlistsView(db, user.id);
  });
  changed(ctx);
  return view;
};
