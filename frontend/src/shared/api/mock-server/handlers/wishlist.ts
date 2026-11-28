import {
  CustomWishInputSchema,
  GivenInputSchema,
  PatchItemInputSchema,
  ReorderInputSchema,
  RestoreInputSchema,
  UNDELETE_WINDOW_MS,
  WishlistQueryInputSchema,
  WishlistTargetInputSchema,
} from "@swipeit/core/api/wishlist/inputs";
import { itemKeyOf } from "@swipeit/core/logic/wishlists";
import { nanoid } from "nanoid";

import {
  type WishlistItem,
  WishlistItemSchema,
  type WishlistResponse,
} from "../../wishlist/types";
import { type Handler, type HandlerContext, nowIso } from "../context";
import type { Db } from "../db";
import { ApiError, notFound } from "../errors";
import { checkShareUnlock, countActiveWishes } from "../share-threshold";
import {
  defaultListOf,
  ensureLists,
  listItemsOf,
  listMetaOf,
  listsOf,
  resolveListOf,
} from "../wishlists";
import { parseInput, requireUser } from "./common";
import { ownerReservationInfo } from "./guest";

const listOf = (db: Db, userId: string) => (db.wishlistItems[userId] ??= []);

const findItem = (db: Db, userId: string, id: string): WishlistItem => {
  const item = listOf(db, userId).find((entry) => entry.id === id);
  if (!item) throw notFound("Желание не найдено");
  return item;
};

// Номер нового желания — «в начало списка» (просьба владельца: новые
// желания первыми), как nextOrderFor сервера: на единицу меньше самого
// верхнего, в пустом — 0. Его же берут свайпы и «Вернуть» из «Подарили».
export const nextOrder = (items: readonly WishlistItem[]) =>
  Math.min(1, ...items.map((item) => item.order)) - 1;

const changed = (
  ctx: HandlerContext,
  scope: Array<"reservations" | "wishlist">,
) => ctx.realtime.publish({ type: "db:changed", scope, by: ctx.userId ?? "" });

// GET /wishlist?list — свой вишлист с мета-данными, счётчиком броней и
// подсказкой «Возможно, тебе подарили это». Без list — главный
// (spec-multi-wishlists §2.3); повод, сообщение и подсказка — его.
export const getMyWishlist: Handler = async (ctx, { query }) => {
  const { list: listId } = parseInput(WishlistQueryInputSchema, query ?? {});
  const db = await ctx.db.read();
  const user = requireUser(ctx, db);
  const lists = listsOf(db, user.id);
  const list = resolveListOf(db, lists, user.id, listId);
  const fallback = defaultListOf(lists).id;
  // У старых строк вишлиста нет — в ответе он есть всегда, как у сервера.
  const items = listItemsOf(db, lists, user.id, list)
    .map((item) => ({ ...item, wishlistId: item.wishlistId ?? fallback }))
    .sort((a, b) => a.order - b.order);
  const meta = listMetaOf(db, user.id, list);
  const response: WishlistResponse = {
    items,
    meta,
    wishlist: list,
    wishCount: countActiveWishes(db, user.id),
    ...ownerReservationInfo(db, user.id, ctx.clock.now(), items, meta),
  };
  return response;
};

// POST /wishlist/items — своё желание: название, цена, ссылка, фото.
// Вишлист — wishlistId из тела (открытый на экране), без него — главный.
export const createCustomWish: Handler = async (ctx, { body }) => {
  const custom = parseInput(CustomWishInputSchema, body);
  const { wishlistId } = parseInput(WishlistTargetInputSchema, body);
  const result = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const list = resolveListOf(
      db,
      ensureLists(db, user.id),
      user.id,
      wishlistId,
    );
    const items = listOf(db, user.id);
    const created: WishlistItem = {
      id: `wi_${nanoid(10)}`,
      ownerId: user.id,
      source: { kind: "custom", custom },
      priority: "normal",
      order: nextOrder(items),
      status: "active",
      wishlistId: list.id,
      addedAt: nowIso(ctx.clock),
    };
    items.push(created);
    // Своё желание считается в порог отправки наравне с «Хочу» из ленты.
    const shareJustUnlocked = checkShareUnlock(db, user.id, created.addedAt);
    return {
      ...created,
      wishCount: countActiveWishes(db, user.id),
      shareJustUnlocked,
    };
  });
  changed(ctx, ["wishlist"]);
  return result;
};

// PATCH /wishlist/items/:id — вариант, заметка, «Очень хочу».
export const updateItem: Handler = async (ctx, { params, body }) => {
  const patch = parseInput(PatchItemInputSchema, body);
  const item = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const target = findItem(db, user.id, params.id ?? "");
    if (patch.priority) target.priority = patch.priority;
    if (patch.variantChoice) target.variantChoice = patch.variantChoice;
    if (patch.note !== undefined) target.note = patch.note.trim() || undefined;
    return target;
  });
  changed(ctx, ["wishlist"]);
  return item;
};

// DELETE /wishlist/items/:id — возвращает удалённое желание целиком, чтобы
// «Отменить» в тосте могло вернуть его на то же место.
export const deleteItem: Handler = async (ctx, { params }) => {
  const removed = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const target = findItem(db, user.id, params.id ?? "");
    db.wishlistItems[user.id] = listOf(db, user.id).filter(
      (item) => item.id !== target.id,
    );
    return target;
  });
  changed(ctx, ["wishlist"]);
  return removed;
};

// POST /wishlist/items/:id/undelete — «Отменить» удаление из тоста. Своё
// расширение контракта: в TECH_SPEC отмена удаления есть, маршрута нет.
export const undeleteItem: Handler = async (ctx, { params, body }) => {
  const item = parseInput(WishlistItemSchema, body);
  if (item.id !== params.id)
    throw new ApiError(400, "VALIDATION", "Не то желание");
  await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    if (item.ownerId !== user.id)
      throw new ApiError(403, "FORBIDDEN", "Чужое желание");
    const items = listOf(db, user.id);
    if (items.some((entry) => entry.id === item.id)) return;
    // На его место: тех, кто встал на этот номер позже, сдвигаем вниз.
    items.forEach((entry) => {
      if (entry.order >= item.order) entry.order += 1;
    });
    items.push(item);
    checkShareUnlock(db, user.id, nowIso(ctx.clock));
  });
  changed(ctx, ["wishlist"]);
  return item;
};

// POST /wishlist/reorder { ids } — новый ручной порядок (ids — все желания
// в нужном порядке; не упомянутые встают в конец в своём порядке). Номера
// новых желаний бывают отрицательными — сравниваем парой ключей.
export const reorderItems: Handler = async (ctx, { body }) => {
  const { ids } = parseInput(ReorderInputSchema, body);
  await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const items = listOf(db, user.id);
    const position = new Map(ids.map((id, index) => [id, index]));
    const rank = (item: WishlistItem) => position.get(item.id) ?? ids.length;
    [...items]
      .sort((a, b) => rank(a) - rank(b) || a.order - b.order)
      .forEach((item, index) => {
        item.order = index;
      });
  });
  changed(ctx, ["wishlist"]);
  return { ok: true };
};

// itemKey брони: productId или "custom:<title>" (TECH_SPEC §5 Reservation).
// Ключ брони — общий с сервером (core): у копии своего желания — ключ оригинала.
export { itemKeyOf };

// POST /wishlist/items/:id/given — «Мне это подарили»: желание уходит во
// вкладку «Подарили», брони на него закрываются (гость видит «Уже подарено»).
export const markGiven: Handler = async (ctx, { params, body }) => {
  const given = parseInput(GivenInputSchema, body);
  const item = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const target = findItem(db, user.id, params.id ?? "");
    target.status = "given";
    target.given = {
      fromUserId: given.fromUserId,
      fromName: given.fromName || undefined,
      at: given.at,
    };
    const key = itemKeyOf(target);
    const closedAt = nowIso(ctx.clock);
    db.reservations.forEach((reservation) => {
      if (
        reservation.ownerId === user.id &&
        reservation.itemKey === key &&
        !reservation.closedAt
      ) {
        reservation.closedAt = closedAt;
      }
    });
    return target;
  });
  changed(ctx, ["wishlist", "reservations"]);
  return item;
};

// POST /wishlist/items/:id/restore — вернуть из «Подарили» в начало
// вишлиста, как новое желание; брони не восстанавливаются (TECH_SPEC §6). { undo: true } — «Отменить» в
// тосте сразу после «Мне это подарили»: желание встаёт на прежнее место, а
// закрытые этим действием брони снова открыты — будто ничего не было.
export const restoreItem: Handler = async (ctx, { params, body }) => {
  const { undo = false } = parseInput(RestoreInputSchema, body ?? {});
  const item = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const target = findItem(db, user.id, params.id ?? "");
    if (target.status !== "given") return target;
    if (undo) {
      const key = itemKeyOf(target);
      // Брони, закрытые этим «подарили» (только что, а не давно).
      const closedAfter = new Date(
        ctx.clock.now() - UNDELETE_WINDOW_MS,
      ).toISOString();
      db.reservations.forEach((reservation) => {
        if (
          reservation.ownerId === user.id &&
          reservation.itemKey === key &&
          reservation.closedAt &&
          reservation.closedAt >= closedAfter
        ) {
          delete reservation.closedAt;
        }
      });
    } else {
      target.order = nextOrder(listOf(db, user.id));
    }
    target.status = "active";
    delete target.given;
    checkShareUnlock(db, user.id, nowIso(ctx.clock));
    return target;
  });
  changed(ctx, ["wishlist", "reservations"]);
  return item;
};
