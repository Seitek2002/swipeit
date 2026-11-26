import { nanoid } from "nanoid";
import { z } from "zod";

import {
  CustomWishSchema,
  type WishlistItem,
  WishlistItemSchema,
  type WishlistResponse,
} from "../../wishlist/types";
import { type Handler, type HandlerContext, nowIso } from "../context";
import type { Db } from "../db";
import { ApiError, notFound } from "../errors";
import { parseInput, requireUser } from "./common";
import { countSelfLikes } from "./swipes";

const listOf = (db: Db, userId: string) => (db.wishlistItems[userId] ??= []);

const findItem = (db: Db, userId: string, id: string): WishlistItem => {
  const item = listOf(db, userId).find((entry) => entry.id === id);
  if (!item) throw notFound("Желание не найдено");
  return item;
};

const nextOrder = (items: WishlistItem[]) =>
  Math.max(-1, ...items.map((item) => item.order)) + 1;

const changed = (
  ctx: HandlerContext,
  scope: Array<"reservations" | "wishlist">,
) => ctx.realtime.publish({ type: "db:changed", scope, by: ctx.userId ?? "" });

// GET /wishlist — свой вишлист с мета-данными. Подсказка «Возможно, тебе
// подарили это» и счётчик броней добавятся в T09.
export const getMyWishlist: Handler = async (ctx) => {
  const db = await ctx.db.read();
  const user = requireUser(ctx, db);
  const response: WishlistResponse = {
    items: [...listOf(db, user.id)].sort((a, b) => a.order - b.order),
    meta: db.wishlistMeta[user.id] ?? {
      ownerId: user.id,
      hideReservationCount: false,
    },
    likeCount: countSelfLikes(db, user.id),
  };
  return response;
};

// POST /wishlist/items — своё желание: название, цена, ссылка, фото.
export const createCustomWish: Handler = async (ctx, { body }) => {
  const custom = parseInput(
    CustomWishSchema.extend({
      title: z.string().trim().min(1, "Напиши, что хочешь").max(80),
    }),
    body,
  );
  if (
    custom.priceMin !== undefined &&
    custom.priceMax !== undefined &&
    custom.priceMin > custom.priceMax
  ) {
    throw new ApiError(400, "VALIDATION", "Цена «от» больше цены «до»");
  }
  const item = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const items = listOf(db, user.id);
    const created: WishlistItem = {
      id: `wi_${nanoid(10)}`,
      ownerId: user.id,
      source: { kind: "custom", custom },
      priority: "normal",
      order: nextOrder(items),
      status: "active",
      addedAt: nowIso(ctx.clock),
    };
    items.push(created);
    return created;
  });
  changed(ctx, ["wishlist"]);
  return item;
};

const PatchItemSchema = z.object({
  priority: z.enum(["normal", "top"]).optional(),
  variantChoice: z.record(z.string(), z.string()).optional(),
  // Пустая строка — убрать заметку.
  note: z.string().max(140, "Заметка — до 140 символов").optional(),
});

// PATCH /wishlist/items/:id — вариант, заметка, «Очень хочу».
export const updateItem: Handler = async (ctx, { params, body }) => {
  const patch = parseInput(PatchItemSchema, body);
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
  });
  changed(ctx, ["wishlist"]);
  return item;
};

// POST /wishlist/reorder { ids } — новый ручной порядок (ids — все желания
// в нужном порядке; не упомянутые встают в конец).
export const reorderItems: Handler = async (ctx, { body }) => {
  const { ids } = parseInput(z.object({ ids: z.array(z.string()) }), body);
  await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const items = listOf(db, user.id);
    const position = new Map(ids.map((id, index) => [id, index]));
    const tail = ids.length;
    [...items]
      .sort(
        (a, b) =>
          (position.get(a.id) ?? tail + a.order) -
          (position.get(b.id) ?? tail + b.order),
      )
      .forEach((item, index) => {
        item.order = index;
      });
  });
  changed(ctx, ["wishlist"]);
  return { ok: true };
};

const GivenSchema = z.object({
  fromUserId: z.string().optional(),
  fromName: z.string().trim().max(40).optional(),
  at: z.string().min(1),
});

// itemKey брони: productId или "custom:<title>" (TECH_SPEC §5 Reservation).
export const itemKeyOf = (item: WishlistItem) =>
  item.source.kind === "product"
    ? item.source.productId
    : `custom:${item.source.custom.title}`;

// POST /wishlist/items/:id/given — «Мне это подарили»: желание уходит во
// вкладку «Подарили», брони на него закрываются (гость видит «Уже подарено»).
export const markGiven: Handler = async (ctx, { params, body }) => {
  const given = parseInput(GivenSchema, body);
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

// POST /wishlist/items/:id/restore — вернуть из «Подарили» в конец вишлиста,
// брони не восстанавливаются (TECH_SPEC §6). { undo: true } — «Отменить» в
// тосте сразу после «Мне это подарили»: желание встаёт на прежнее место, а
// закрытые этим действием брони снова открыты — будто ничего не было.
export const restoreItem: Handler = async (ctx, { params, body }) => {
  const { undo = false } = parseInput(
    z.object({ undo: z.boolean().optional() }),
    body ?? {},
  );
  const item = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const target = findItem(db, user.id, params.id ?? "");
    if (target.status !== "given") return target;
    if (undo) {
      const key = itemKeyOf(target);
      // Брони, закрытые этим «подарили» (только что, а не давно).
      const closedAfter = new Date(ctx.clock.now() - 10 * 60_000).toISOString();
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
    return target;
  });
  changed(ctx, ["wishlist", "reservations"]);
  return item;
};
